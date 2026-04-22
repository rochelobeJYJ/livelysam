#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

from data_proxy_core import DataProxyService, ProxyServiceError
from google_oauth_bridge import GoogleOAuthBridge, is_revoked_token_error


APP_NAME = "LivelySam"
SNAPSHOT_VERSION = 2
DEFAULT_PORT = 58671
STORES = ["memos", "todos", "bookmarks", "schedules", "records", "backups"]
BRIDGE_TOKEN_HEADER = "X-LivelySam-Token"
BRIDGE_ENDPOINT_FILE_NAME = "bridge-endpoint.json"
BRIDGE_MUTEX_NAME = r"Local\LivelySamStorageBridge"
ALLOWED_ORIGIN_RE = re.compile(r"^https?://(127\.0\.0\.1|localhost)(:\d{1,5})?$", re.IGNORECASE)
BLOCKED_SHELL_EXTENSIONS = {
    ".appref-ms",
    ".application",
    ".bat",
    ".cmd",
    ".com",
    ".cpl",
    ".exe",
    ".hta",
    ".jse",
    ".js",
    ".lnk",
    ".msc",
    ".msi",
    ".msp",
    ".ps1",
    ".ps1xml",
    ".ps2",
    ".psc1",
    ".psc2",
    ".psd1",
    ".psm1",
    ".reg",
    ".scr",
    ".vbe",
    ".vbs",
    ".wsf",
    ".wsh",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clone_json(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


def text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    normalized = str(value).strip()
    return normalized or fallback


def normalize_shell_kind(value: Any, allow_auto: bool = False) -> str:
    normalized = text(value, "auto" if allow_auto else "file").lower()
    if allow_auto and normalized in {"auto", ""}:
        return "auto"
    if normalized not in {"file", "folder"}:
        raise ValueError("kind must be either 'file' or 'folder'")
    return normalized


def strip_windows_extended_prefix(path_value: str) -> str:
    if path_value.startswith("\\\\?\\UNC\\"):
        return "\\\\" + path_value[8:]
    if path_value.startswith("\\\\?\\"):
        return path_value[4:]
    return path_value


def normalize_windows_shell_path(path_value: str) -> str:
    if os.name != "nt" or not path_value:
        return path_value

    normalized = strip_windows_extended_prefix(path_value)

    try:
        import ctypes

        buffer_size = 32768
        buffer = ctypes.create_unicode_buffer(buffer_size)
        result = ctypes.windll.kernel32.GetLongPathNameW(normalized, buffer, buffer_size)
        if result and result < buffer_size:
            return strip_windows_extended_prefix(buffer.value)
    except Exception:
        pass

    try:
        real_path = os.path.realpath(normalized)
        if real_path:
            return strip_windows_extended_prefix(real_path)
    except OSError:
        pass

    return normalized


def resolve_shell_target(target: Any) -> Path:
    raw_target = text(target)
    if not raw_target:
        raise ValueError("target is required")

    raw_target = raw_target.strip().strip('"').strip("'")
    if raw_target.startswith("file://"):
        parsed = urlparse(raw_target)
        raw_target = unquote(parsed.path or "")
        if parsed.netloc:
            raw_target = f"//{parsed.netloc}{raw_target}"
        if os.name == "nt" and len(raw_target) >= 3 and raw_target[0] == "/" and raw_target[2] == ":":
            raw_target = raw_target[1:]

    expanded = os.path.expandvars(os.path.expanduser(raw_target))
    expanded = normalize_windows_shell_path(expanded)
    path = Path(expanded)
    resolved = path.resolve(strict=False)
    return Path(normalize_windows_shell_path(str(resolved)))


def inspect_shell_target(target: Any, kind: Any) -> dict[str, Any]:
    normalized_kind = normalize_shell_kind(kind, allow_auto=True)
    path = resolve_shell_target(target)
    exists = path.exists()
    actual_kind = "folder" if exists and path.is_dir() else "file"

    return {
        "target": str(path),
        "kind": actual_kind if exists else normalized_kind,
        "exists": exists,
        "name": path.name or str(path),
    }


def open_shell_target(target: Any, kind: Any) -> dict[str, Any]:
    inspected = inspect_shell_target(target, kind)
    path = Path(inspected["target"])

    if not inspected["exists"]:
        raise FileNotFoundError(f"Target does not exist: {path}")

    if not hasattr(os, "startfile"):
        raise RuntimeError("This platform does not support local shell open")

    if is_blocked_shell_target(path, text(inspected.get("kind"), "file")):
        raise PermissionError("Opening executable, script, shortcut, or network targets is not allowed.")

    os.startfile(str(path))
    return {
        "target": str(path),
        "kind": inspected["kind"],
        "name": path.name or str(path),
    }


def resolve_data_root() -> Path:
    local_appdata = os.environ.get("LOCALAPPDATA")
    if not local_appdata:
        local_appdata = str(Path.home() / "AppData" / "Local")
    return Path(local_appdata) / APP_NAME / "user-data"


def resolve_runtime_root() -> Path:
    local_appdata = os.environ.get("LOCALAPPDATA")
    if not local_appdata:
        local_appdata = str(Path.home() / "AppData" / "Local")
    return Path(local_appdata) / APP_NAME / "runtime"


def resolve_bridge_endpoint_path() -> Path:
    return resolve_runtime_root() / BRIDGE_ENDPOINT_FILE_NAME


def write_json_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(".tmp")
    temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp_path, path)


def read_json_file(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_bridge_endpoint(path: Path, *, port: int, auth_token: str, snapshot_path: Path) -> dict[str, Any]:
    payload = {
        "ok": True,
        "app": APP_NAME,
        "version": SNAPSHOT_VERSION,
        "pid": os.getpid(),
        "port": int(port),
        "origin": f"http://127.0.0.1:{int(port)}",
        "health_url": f"http://127.0.0.1:{int(port)}/__livelysam__/health",
        "api_health_url": f"http://127.0.0.1:{int(port)}/api/health",
        "auth_token": text(auth_token),
        "storage_path": str(snapshot_path),
        "updatedAt": utc_now_iso(),
    }
    write_json_file(path, payload)
    return payload


def clear_bridge_endpoint(path: Path, *, port: int) -> None:
    payload = read_json_file(path)
    if not isinstance(payload, dict):
        return
    if int(payload.get("pid") or 0) != os.getpid():
        return
    if int(payload.get("port") or 0) != int(port):
        return
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    except OSError:
        pass


def acquire_windows_mutex(name: str) -> int | None:
    if os.name != "nt":
        return None
    try:
        import ctypes

        handle = int(ctypes.windll.kernel32.CreateMutexW(None, False, name))
        if not handle:
            raise OSError("CreateMutexW failed")
        if int(ctypes.windll.kernel32.GetLastError()) == 183:
            ctypes.windll.kernel32.CloseHandle(handle)
            return None
        return handle
    except Exception:
        return None


def release_windows_mutex(handle: int | None) -> None:
    if os.name != "nt" or not handle:
        return
    try:
        import ctypes

        ctypes.windll.kernel32.ReleaseMutex(handle)
    except Exception:
        pass
    try:
        import ctypes

        ctypes.windll.kernel32.CloseHandle(handle)
    except Exception:
        pass


def is_allowed_origin(origin: Any) -> bool:
    normalized = text(origin)
    if not normalized:
        return True
    if normalized == "null":
        return True
    return bool(ALLOWED_ORIGIN_RE.match(normalized))


def is_network_shell_path(path: Path) -> bool:
    normalized = str(path).replace("/", "\\")
    return normalized.startswith("\\\\")


def is_blocked_shell_target(path: Path, kind: str) -> bool:
    if kind == "folder":
        return is_network_shell_path(path)
    return is_network_shell_path(path) or path.suffix.lower() in BLOCKED_SHELL_EXTENSIONS


class SnapshotStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def _default_snapshot(self) -> dict[str, Any]:
        return {
            "version": SNAPSHOT_VERSION,
            "updatedAt": utc_now_iso(),
            "values": {},
            "stores": {name: [] for name in STORES},
        }

    def _normalize(self, raw: Any) -> dict[str, Any]:
        snapshot = self._default_snapshot()
        if not isinstance(raw, dict):
            return snapshot

        values = raw.get("values", {})
        if isinstance(values, dict):
            snapshot["values"] = clone_json(values)

        stores = raw.get("stores", {})
        if isinstance(stores, dict):
            normalized_stores: dict[str, list[Any]] = {}
            for store_name in STORES:
                items = stores.get(store_name, [])
                normalized_stores[store_name] = clone_json(items) if isinstance(items, list) else []
            snapshot["stores"] = normalized_stores

        updated_at = raw.get("updatedAt")
        if isinstance(updated_at, str) and updated_at.strip():
            snapshot["updatedAt"] = updated_at

        return snapshot

    def _read_locked(self) -> dict[str, Any]:
        if not self.path.exists():
            snapshot = self._default_snapshot()
            self._write_locked(snapshot)
            return snapshot

        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            raw = None

        return self._normalize(raw)

    def read(self) -> dict[str, Any]:
        with self._lock:
            return self._read_locked()

    def write(self, raw_snapshot: Any) -> dict[str, Any]:
        with self._lock:
            snapshot = self._normalize(raw_snapshot)
            snapshot["updatedAt"] = utc_now_iso()
            self._write_locked(snapshot)
            return snapshot

    def apply_ops(self, raw_ops: Any) -> dict[str, Any]:
        with self._lock:
            snapshot = self._read_locked()
            ops = raw_ops if isinstance(raw_ops, list) else []

            for raw_op in ops:
                if not isinstance(raw_op, dict):
                    continue

                op_type = text(raw_op.get("type")).lower()

                if op_type == "set-value":
                    key = text(raw_op.get("key"))
                    if key:
                        snapshot["values"][key] = clone_json(raw_op.get("value"))
                    continue

                if op_type == "remove-value":
                    key = text(raw_op.get("key"))
                    if key:
                        snapshot["values"].pop(key, None)
                    continue

                if op_type == "put-store-item":
                    store_name = text(raw_op.get("storeName"))
                    item = raw_op.get("item")
                    if store_name not in STORES or not isinstance(item, dict):
                        continue
                    item_id = text(item.get("id"))
                    if not item_id:
                        continue
                    items = list(snapshot["stores"].get(store_name, []))
                    replaced = False
                    for index, existing in enumerate(items):
                        if text(existing.get("id")) == item_id:
                            items[index] = clone_json(item)
                            replaced = True
                            break
                    if not replaced:
                        items.append(clone_json(item))
                    snapshot["stores"][store_name] = items
                    continue

                if op_type == "delete-store-item":
                    store_name = text(raw_op.get("storeName"))
                    item_id = text(raw_op.get("id"))
                    if store_name not in STORES or not item_id:
                        continue
                    items = list(snapshot["stores"].get(store_name, []))
                    snapshot["stores"][store_name] = [
                        item for item in items
                        if text(item.get("id")) != item_id
                    ]
                    continue

                if op_type == "clear-store":
                    store_name = text(raw_op.get("storeName"))
                    if store_name in STORES:
                        snapshot["stores"][store_name] = []

            snapshot["updatedAt"] = utc_now_iso()
            self._write_locked(snapshot)
            return snapshot

    def _write_locked(self, snapshot: dict[str, Any]) -> None:
        temp_path = self.path.with_suffix(".tmp")
        temp_path.write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temp_path, self.path)


class LivelySamStorageHandler(BaseHTTPRequestHandler):
    server_version = "LivelySamStorageBridge/1.0"

    def end_headers(self) -> None:
        origin = self._get_request_origin()
        if origin and is_allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", f"Content-Type, {BRIDGE_TOKEN_HEADER}")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        return

    def do_OPTIONS(self) -> None:
        path = urlparse(self.path).path
        if not self._authorize_request(path, require_token=False):
            return
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query or "")
        if not self._authorize_request(path):
            return
        if path == "/__livelysam__/health":
            self._send_json(
                200,
                {
                    "ok": True,
                    "app": APP_NAME,
                    "version": SNAPSHOT_VERSION,
                    "port": int(getattr(self.server, "server_port", DEFAULT_PORT)),
                    "storage_path": str(self.server.snapshot_path),  # type: ignore[attr-defined]
                    "data_proxy": self.server.data_proxy.health_snapshot(),  # type: ignore[attr-defined]
                },
            )
            return

        if path == "/__livelysam__/storage":
            snapshot = self.server.store.read()  # type: ignore[attr-defined]
            self._send_json(200, snapshot)
            return

        if path.startswith("/api/"):
            self._handle_data_proxy_get(path, query)
            return

        if path == "/__livelysam__/google-auth/status":
            status = self.server.google_oauth.get_status()  # type: ignore[attr-defined]
            self._send_json(200, {"ok": True, "status": status})
            return

        self._send_json(404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if not self._authorize_request(path):
            return
        if path.startswith("/__livelysam__/google-auth/"):
            self._handle_google_auth(path)
            return
        if path == "/__livelysam__/google-api":
            self._handle_google_api()
            return
        if path == "/__livelysam__/storage/ops":
            self._handle_ops_write()
            return
        if path == "/__livelysam__/shell/inspect":
            self._handle_shell_inspect()
            return
        if path == "/__livelysam__/shell/open":
            self._handle_shell_open()
            return
        self._handle_write()

    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        if not self._authorize_request(path):
            return
        self._handle_write()

    def _get_request_origin(self) -> str:
        return text(self.headers.get("Origin"))

    def _requires_auth(self, path: str) -> bool:
        if path in {"/__livelysam__/health", "/api/health"}:
            return False
        if path == "/__livelysam__/google-auth/status":
            return True
        if path.startswith("/api/"):
            return True
        if path.startswith("/__livelysam__/google-auth/"):
            return True
        return path in {
            "/__livelysam__/storage",
            "/__livelysam__/storage/ops",
            "/__livelysam__/google-api",
            "/__livelysam__/shell/inspect",
            "/__livelysam__/shell/open",
        }

    def _has_valid_auth_token(self) -> bool:
        expected = text(getattr(self.server, "auth_token", ""))
        provided = text(self.headers.get(BRIDGE_TOKEN_HEADER))
        if not expected or not provided:
            return False
        try:
            return secrets.compare_digest(provided, expected)
        except Exception:
            return False

    def _authorize_request(self, path: str, *, require_token: bool = True) -> bool:
        origin = self._get_request_origin()
        if origin and not is_allowed_origin(origin):
            self._send_json(403, {"ok": False, "error": "Origin is not allowed."})
            return False
        if require_token and self._requires_auth(path) and not self._has_valid_auth_token():
            self._send_json(403, {"ok": False, "error": "Missing or invalid bridge token."})
            return False
        return True

    def _read_json_payload(self) -> Any:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0

        raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            return json.loads(raw_body.decode("utf-8"))
        except Exception:
            return None

    def _handle_google_auth(self, path: str) -> None:
        payload = self._read_json_payload()
        if payload is None:
            self._send_json(400, {"ok": False, "error": "Invalid JSON payload"})
            return

        bridge = self.server.google_oauth  # type: ignore[attr-defined]

        try:
            if path == "/__livelysam__/google-auth/login":
                scopes = payload.get("scopes", [])
                status = bridge.start_login(scopes)
                self._send_json(202, {"ok": True, "status": status})
                return

            if path == "/__livelysam__/google-auth/token":
                token_payload = bridge.get_access_token()
                self._send_json(200, {"ok": True, **token_payload})
                return

            if path == "/__livelysam__/google-auth/logout":
                status = bridge.logout()
                self._send_json(200, {"ok": True, "status": status})
                return
        except Exception as exc:
            status_code = 401 if is_revoked_token_error(exc) else 400
            error_code = "auth_revoked" if status_code == 401 else "google_auth_error"
            self._send_json(status_code, {"ok": False, "error": str(exc), "code": error_code, "status": bridge.get_status()})
            return

        self._send_json(404, {"ok": False, "error": "Not found"})

    def _handle_google_api(self) -> None:
        payload = self._read_json_payload()
        if payload is None:
            self._send_json(400, {"ok": False, "error": "Invalid JSON payload"})
            return

        bridge = self.server.google_oauth  # type: ignore[attr-defined]
        method = text(payload.get("method"), "GET") if isinstance(payload, dict) else "GET"
        url = text(payload.get("url")) if isinstance(payload, dict) else ""
        body = payload.get("body") if isinstance(payload, dict) else None
        headers = payload.get("headers") if isinstance(payload, dict) else None

        if not url:
            self._send_json(400, {"ok": False, "error": "Google API URL is required."})
            return

        try:
            status, response_payload = bridge.google_api_request(
                method=method,
                url=url,
                payload=body,
                headers=headers if isinstance(headers, dict) else None,
            )
            self._send_json(
                200,
                {
                    "ok": 200 <= int(status) < 300,
                    "status": int(status),
                    "payload": response_payload,
                    "error": "",
                },
            )
            return
        except Exception as exc:
            self._send_json(
                200,
                {
                    "ok": False,
                    "status": 500,
                    "payload": None,
                    "error": str(exc),
                },
            )

    def _handle_shell_open(self) -> None:
        payload = self._read_json_payload()
        if payload is None or not isinstance(payload, dict):
            self._send_json(400, {"ok": False, "error": "Invalid JSON payload"})
            return

        try:
            result = open_shell_target(payload.get("target"), payload.get("kind"))
        except Exception as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return

        self._send_json(200, {"ok": True, **result})

    def _handle_shell_inspect(self) -> None:
        payload = self._read_json_payload()
        if payload is None or not isinstance(payload, dict):
            self._send_json(400, {"ok": False, "error": "Invalid JSON payload"})
            return

        try:
            result = inspect_shell_target(payload.get("target"), payload.get("kind"))
        except Exception as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return

        self._send_json(200, {"ok": True, **result})

    def _get_query_value(self, query: dict[str, list[str]], key: str, fallback: str = "") -> str:
        return text((query.get(key) or [fallback])[0], fallback)

    def _handle_data_proxy_get(self, path: str, query: dict[str, list[str]]) -> None:
        service = self.server.data_proxy  # type: ignore[attr-defined]

        try:
            if path == "/api/health":
                self._send_json(200, service.health_snapshot())
                return
            if path == "/api/neis/school-search":
                self._send_json(200, {"ok": True, "schools": service.search_school(self._get_query_value(query, "name"))})
                return
            if path == "/api/neis/meals/week":
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "meals": service.get_week_meals(
                            self._get_query_value(query, "atptCode"),
                            self._get_query_value(query, "schoolCode"),
                            self._get_query_value(query, "startDate"),
                        ),
                    },
                )
                return
            if path == "/api/neis/schedule/month":
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "schedule": service.get_schedule_month(
                            self._get_query_value(query, "atptCode"),
                            self._get_query_value(query, "schoolCode"),
                            self._get_query_value(query, "year"),
                            self._get_query_value(query, "month"),
                        ),
                    },
                )
                return
            if path == "/api/neis/timetable/week":
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "timetable": service.get_week_timetable(
                            self._get_query_value(query, "atptCode"),
                            self._get_query_value(query, "schoolCode"),
                            self._get_query_value(query, "grade"),
                            self._get_query_value(query, "classNum"),
                            self._get_query_value(query, "startDate"),
                        ),
                    },
                )
                return
            if path == "/api/weather/geocode":
                self._send_json(200, {"ok": True, "location": service.geocode(self._get_query_value(query, "address"))})
                return
            if path == "/api/weather/bundle":
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "bundle": service.get_weather_bundle(
                            self._get_query_value(query, "lat"),
                            self._get_query_value(query, "lon"),
                        ),
                    },
                )
                return
        except ProxyServiceError as exc:
            self._send_json(
                exc.status,
                {
                    "ok": False,
                    "error": str(exc),
                    "code": exc.code,
                    "detail": exc.detail,
                },
            )
            return
        except Exception as exc:
            self._send_json(
                500,
                {
                    "ok": False,
                    "error": "데이터 프록시 처리 중 알 수 없는 오류가 발생했습니다.",
                    "code": "proxy_internal_error",
                    "detail": str(exc),
                },
            )
            return

        self._send_json(404, {"ok": False, "error": "Not found"})

    def _handle_write(self) -> None:
        path = urlparse(self.path).path
        if path != "/__livelysam__/storage":
            self._send_json(404, {"ok": False, "error": "Not found"})
            return

        payload = self._read_json_payload()
        if payload is None:
            self._send_json(400, {"ok": False, "error": "Invalid JSON payload"})
            return

        snapshot = self.server.store.write(payload)  # type: ignore[attr-defined]
        self._send_json(200, {"ok": True, "snapshot": snapshot})

    def _handle_ops_write(self) -> None:
        payload = self._read_json_payload()
        if payload is None or not isinstance(payload, dict):
            self._send_json(400, {"ok": False, "error": "Invalid JSON payload"})
            return

        ops = payload.get("ops", [])
        if not isinstance(ops, list):
            self._send_json(400, {"ok": False, "error": "ops must be an array"})
            return

        snapshot = self.server.store.apply_ops(ops)  # type: ignore[attr-defined]
        self._send_json(200, {"ok": True, "snapshot": snapshot})

    def _send_json(self, status: int, payload: Any) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="LivelySam local shared storage bridge")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port for the local storage bridge")
    return parser


def main() -> None:
    args = build_argument_parser().parse_args()
    data_root = resolve_data_root()
    endpoint_path = resolve_bridge_endpoint_path()
    snapshot_path = data_root / "shared-storage.json"
    store = SnapshotStore(snapshot_path)
    google_oauth = GoogleOAuthBridge(data_root)
    data_proxy = DataProxyService(data_root)
    mutex_handle = acquire_windows_mutex(BRIDGE_MUTEX_NAME)

    if os.name == "nt" and mutex_handle is None:
        raise SystemExit("LivelySam storage bridge is already running.")

    server = ReusableThreadingHTTPServer(("127.0.0.1", args.port), LivelySamStorageHandler)
    server.store = store  # type: ignore[attr-defined]
    server.snapshot_path = snapshot_path  # type: ignore[attr-defined]
    server.google_oauth = google_oauth  # type: ignore[attr-defined]
    server.data_proxy = data_proxy  # type: ignore[attr-defined]
    server.auth_token = secrets.token_urlsafe(32)  # type: ignore[attr-defined]
    server.endpoint_path = endpoint_path  # type: ignore[attr-defined]
    write_bridge_endpoint(
        endpoint_path,
        port=int(server.server_port),
        auth_token=server.auth_token,  # type: ignore[attr-defined]
        snapshot_path=snapshot_path,
    )

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        clear_bridge_endpoint(endpoint_path, port=int(server.server_port))
        server.server_close()
        release_windows_mutex(mutex_handle)


if __name__ == "__main__":
    main()

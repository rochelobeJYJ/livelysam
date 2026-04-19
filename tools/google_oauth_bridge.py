#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


DEFAULT_AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token"
DEFAULT_REVOKE_URI = "https://oauth2.googleapis.com/revoke"
DEFAULT_USERINFO_URI = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_API_ALLOWED_HOSTS = {
    "www.googleapis.com",
    "tasks.googleapis.com",
    "openidconnect.googleapis.com",
    "oauth2.googleapis.com",
}
DEFAULT_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/tasks",
]
AUTH_FILE_NAME = "google-native-auth.json"
CONFIG_FILE_NAME = "google-oauth-desktop.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clone_json(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


def text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    normalized = str(value).strip()
    return normalized or fallback


def read_json_file(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_json_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(".tmp")
    temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp_path, path)


def normalize_scopes(scopes: Any) -> list[str]:
    if isinstance(scopes, str):
        items = scopes.split()
    elif isinstance(scopes, list):
        items = scopes
    else:
        items = []

    normalized: list[str] = []
    seen: set[str] = set()
    for item in items:
        scope = text(item)
        if not scope or scope in seen:
            continue
        normalized.append(scope)
        seen.add(scope)

    if not normalized:
        return list(DEFAULT_SCOPES)

    for scope in DEFAULT_SCOPES[:3]:
        if scope not in seen:
            normalized.insert(0, scope)
            seen.add(scope)

    return normalized


def build_public_auth(auth: dict[str, Any] | None, include_access_token: bool = False) -> dict[str, Any] | None:
    if not auth:
        return None

    payload = {
        "tokenType": text(auth.get("tokenType"), "Bearer"),
        "expiresAt": int(auth.get("expiresAt") or 0),
        "scope": text(auth.get("scope")),
        "accountEmail": text(auth.get("accountEmail")),
        "accountName": text(auth.get("accountName")),
        "authMode": "native-bridge",
    }
    if include_access_token:
        payload["accessToken"] = text(auth.get("accessToken"))
    return payload


def parse_oauth_config(raw: Any, source_path: Path) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None

    config = raw.get("installed") if isinstance(raw.get("installed"), dict) else None
    if not config:
        config = raw.get("web") if isinstance(raw.get("web"), dict) else raw

    client_id = text(config.get("client_id"))
    if not client_id:
        return None

    return {
        "client_id": client_id,
        "client_secret": text(config.get("client_secret")),
        "auth_uri": text(config.get("auth_uri"), DEFAULT_AUTH_URI),
        "token_uri": text(config.get("token_uri"), DEFAULT_TOKEN_URI),
        "revoke_uri": text(config.get("revoke_uri"), DEFAULT_REVOKE_URI),
        "userinfo_uri": text(config.get("userinfo_uri"), DEFAULT_USERINFO_URI),
        "source_path": str(source_path),
    }


class LoopbackOAuthServer(ThreadingHTTPServer):
    allow_reuse_address = True


class LoopbackOAuthHandler(BaseHTTPRequestHandler):
    server_version = "LivelySamGoogleOAuth/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/oauth2/callback":
            self.send_error(404)
            return

        params = urllib.parse.parse_qs(parsed.query or "")
        error_message = text((params.get("error") or [""])[0])
        code = text((params.get("code") or [""])[0])
        state = text((params.get("state") or [""])[0])

        self.server.oauth_payload = {
            "code": code,
            "state": state,
            "error": error_message,
            "error_description": text((params.get("error_description") or [""])[0]),
        }
        self.server.oauth_event.set()

        html = """<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>LivelySam Google 연결</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; background: #f5f8fd; color: #10243d; margin: 0; }
    .card { max-width: 520px; margin: 48px auto; background: #fff; border-radius: 18px; padding: 28px 30px; box-shadow: 0 18px 48px rgba(16, 36, 61, 0.12); }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 0; line-height: 1.6; color: #42556f; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Google 연결 요청을 받았습니다.</h1>
    <p>LivelySam으로 돌아가시면 연결이 자동으로 이어집니다. 이 창은 닫으셔도 됩니다.</p>
  </div>
</body>
</html>"""
        encoded = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


class GoogleOAuthBridge:
    def __init__(self, data_root: Path) -> None:
        self.data_root = data_root
        self.auth_path = data_root / AUTH_FILE_NAME
        self._lock = threading.Lock()
        self._login_thread: threading.Thread | None = None
        self._login_state = {
            "inProgress": False,
            "lastError": "",
            "message": "",
            "updatedAt": utc_now_iso(),
        }

    def _set_login_state(self, *, in_progress: bool, message: str = "", last_error: str = "") -> None:
        with self._lock:
            self._login_state = {
                "inProgress": bool(in_progress),
                "lastError": text(last_error),
                "message": text(message),
                "updatedAt": utc_now_iso(),
            }

    def _iter_config_candidates(self) -> list[Path]:
        candidates: list[Path] = []
        env_path = text(os.environ.get("LIVELYSAM_GOOGLE_OAUTH_PATH"))
        if env_path:
            candidates.append(Path(env_path))

        candidates.append(self.data_root / CONFIG_FILE_NAME)
        if getattr(sys, "frozen", False):
            candidates.append(Path(sys.executable).resolve().parent / CONFIG_FILE_NAME)
        candidates.append(Path(__file__).resolve().parent.parent / CONFIG_FILE_NAME)

        deduped: list[Path] = []
        seen: set[str] = set()
        for candidate in candidates:
            key = str(candidate.resolve()) if candidate.exists() else str(candidate)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(candidate)
        return deduped

    def _load_config(self) -> dict[str, Any] | None:
        for candidate in self._iter_config_candidates():
            if not candidate.exists():
                continue
            parsed = parse_oauth_config(read_json_file(candidate), candidate)
            if parsed:
                return parsed
        return None

    def _read_auth(self) -> dict[str, Any] | None:
        raw = read_json_file(self.auth_path)
        if not isinstance(raw, dict):
            return None

        expires_at = int(raw.get("expiresAt") or 0)
        return {
            "accessToken": text(raw.get("accessToken")),
            "refreshToken": text(raw.get("refreshToken")),
            "tokenType": text(raw.get("tokenType"), "Bearer"),
            "expiresAt": expires_at,
            "scope": text(raw.get("scope")),
            "accountEmail": text(raw.get("accountEmail")),
            "accountName": text(raw.get("accountName")),
            "updatedAt": text(raw.get("updatedAt"), utc_now_iso()),
        }

    def _write_auth(self, auth: dict[str, Any]) -> None:
        payload = {
            "accessToken": text(auth.get("accessToken")),
            "refreshToken": text(auth.get("refreshToken")),
            "tokenType": text(auth.get("tokenType"), "Bearer"),
            "expiresAt": int(auth.get("expiresAt") or 0),
            "scope": text(auth.get("scope")),
            "accountEmail": text(auth.get("accountEmail")),
            "accountName": text(auth.get("accountName")),
            "updatedAt": utc_now_iso(),
        }
        write_json_file(self.auth_path, payload)

    def _clear_auth(self) -> None:
        try:
            self.auth_path.unlink()
        except FileNotFoundError:
            return

    def _has_valid_access_token(self, auth: dict[str, Any] | None) -> bool:
        if not auth:
            return False
        return bool(text(auth.get("accessToken"))) and int(auth.get("expiresAt") or 0) > int(time.time() * 1000) + 30_000

    def _is_connected(self, auth: dict[str, Any] | None) -> bool:
        if not auth:
            return False
        return self._has_valid_access_token(auth) or bool(text(auth.get("refreshToken")))

    def get_status(self) -> dict[str, Any]:
        config = self._load_config()
        auth = self._read_auth()
        with self._lock:
            login_state = clone_json(self._login_state)

        return {
            "available": True,
            "configured": bool(config),
            "mode": "native-bridge",
            "inProgress": bool(login_state.get("inProgress")),
            "message": text(login_state.get("message")),
            "lastError": text(login_state.get("lastError")),
            "updatedAt": text(login_state.get("updatedAt"), utc_now_iso()),
            "connected": self._is_connected(auth),
            "hasRefreshToken": bool(text(auth.get("refreshToken")) if auth else ""),
            "scope": text(auth.get("scope") if auth else ""),
            "expiresAt": int(auth.get("expiresAt") or 0) if auth else 0,
            "accountEmail": text(auth.get("accountEmail") if auth else ""),
            "accountName": text(auth.get("accountName") if auth else ""),
            "configSource": text(config.get("source_path") if config else ""),
            "auth": build_public_auth(auth, include_access_token=False),
        }

    def _post_form(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        encoded = urllib.parse.urlencode(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=encoded,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="ignore")
            try:
                parsed = json.loads(raw)
                message = text(parsed.get("error_description") or parsed.get("error") or raw, "Google 인증 요청이 실패했습니다.")
            except Exception:
                message = raw or "Google 인증 요청이 실패했습니다."
            raise RuntimeError(message) from exc
        except urllib.error.URLError as exc:
            raise RuntimeError("Google 인증 서버에 연결하지 못했습니다.") from exc

    def _get_json(self, url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
        request = urllib.request.Request(url, headers=headers or {}, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(raw or "Google 사용자 정보를 가져오지 못했습니다.") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError("Google 사용자 정보를 가져오는 중 네트워크 오류가 발생했습니다.") from exc

    def google_api_request(
        self,
        method: str,
        url: str,
        payload: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, Any]:
        normalized_method = text(method, "GET").upper()
        parsed_url = urllib.parse.urlparse(text(url))
        if parsed_url.scheme != "https" or parsed_url.netloc not in GOOGLE_API_ALLOWED_HOSTS:
            raise RuntimeError("허용되지 않은 Google API 주소입니다.")

        token_payload = self.get_access_token()
        auth = token_payload.get("auth", {}) if isinstance(token_payload, dict) else {}
        access_token = text(auth.get("accessToken") if isinstance(auth, dict) else "")
        if not access_token:
            raise RuntimeError("Google 액세스 토큰을 가져오지 못했습니다.")

        request_headers = {"Authorization": f"Bearer {access_token}"}
        for key, value in (headers or {}).items():
            header_name = text(key)
            header_value = text(value)
            if not header_name or not header_value or header_name.lower() == "authorization":
                continue
            request_headers[header_name] = header_value

        body: bytes | None = None
        if payload is not None and normalized_method not in {"GET", "DELETE"}:
            if isinstance(payload, bytes):
                body = payload
            elif isinstance(payload, str):
                body = payload.encode("utf-8")
            else:
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")

        request = urllib.request.Request(
            url,
            data=body,
            headers=request_headers,
            method=normalized_method,
        )
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                raw = response.read().decode("utf-8")
                if not raw:
                    return int(getattr(response, "status", 200) or 200), {}
                try:
                    return int(getattr(response, "status", 200) or 200), json.loads(raw)
                except Exception:
                    return int(getattr(response, "status", 200) or 200), {"raw": raw}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="ignore")
            if raw:
                try:
                    return exc.code, json.loads(raw)
                except Exception:
                    return exc.code, {"error": raw}
            return exc.code, {"error": f"Google API 요청 실패 ({exc.code})"}
        except urllib.error.URLError as exc:
            raise RuntimeError("Google API 연결 중 네트워크 오류가 발생했습니다.") from exc

    def _build_code_verifier(self) -> str:
        verifier = secrets.token_urlsafe(72)
        return verifier[:96]

    def _build_code_challenge(self, code_verifier: str) -> str:
        digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

    def _run_loopback_flow(self, config: dict[str, Any], scopes: list[str]) -> dict[str, Any]:
        event = threading.Event()
        server = LoopbackOAuthServer(("127.0.0.1", 0), LoopbackOAuthHandler)
        server.oauth_event = event  # type: ignore[attr-defined]
        server.oauth_payload = {}  # type: ignore[attr-defined]
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()

        redirect_uri = f"http://127.0.0.1:{server.server_port}/oauth2/callback"
        code_verifier = self._build_code_verifier()
        state = secrets.token_urlsafe(24)
        query = urllib.parse.urlencode(
            {
                "client_id": config["client_id"],
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": " ".join(normalize_scopes(scopes)),
                "access_type": "offline",
                "include_granted_scopes": "true",
                "prompt": "consent select_account",
                "state": state,
                "code_challenge": self._build_code_challenge(code_verifier),
                "code_challenge_method": "S256",
            }
        )
        auth_url = f"{config['auth_uri']}?{query}"

        self._set_login_state(in_progress=True, message="브라우저에서 Google 로그인을 진행해 주세요.")
        webbrowser.open(auth_url)

        finished = event.wait(timeout=240)
        payload = clone_json(getattr(server, "oauth_payload", {}))
        server.shutdown()
        server.server_close()
        server_thread.join(timeout=1.0)

        if not finished:
            raise RuntimeError("Google 로그인 시간이 초과되었습니다. 다시 시도해 주세요.")
        if text(payload.get("state")) != state:
            raise RuntimeError("Google 로그인 검증에 실패했습니다. 다시 시도해 주세요.")
        if text(payload.get("error")):
            detail = text(payload.get("error_description")) or text(payload.get("error"))
            raise RuntimeError(detail or "Google 로그인이 취소되었습니다.")

        code = text(payload.get("code"))
        if not code:
            raise RuntimeError("Google 인증 코드가 전달되지 않았습니다.")

        token_payload = {
            "client_id": config["client_id"],
            "code": code,
            "code_verifier": code_verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
        if text(config.get("client_secret")):
            token_payload["client_secret"] = config["client_secret"]

        token_response = self._post_form(config["token_uri"], token_payload)
        access_token = text(token_response.get("access_token"))
        if not access_token:
            raise RuntimeError("Google 액세스 토큰을 받지 못했습니다.")

        userinfo = self._get_json(
            text(config.get("userinfo_uri"), DEFAULT_USERINFO_URI),
            headers={"Authorization": f"Bearer {access_token}"},
        )
        now_ms = int(time.time() * 1000)
        return {
            "accessToken": access_token,
            "refreshToken": text(token_response.get("refresh_token")),
            "tokenType": text(token_response.get("token_type"), "Bearer"),
            "expiresAt": now_ms + (int(token_response.get("expires_in") or 3600) * 1000),
            "scope": text(token_response.get("scope")),
            "accountEmail": text(userinfo.get("email")),
            "accountName": text(userinfo.get("name")),
        }

    def _merge_auth(self, current: dict[str, Any] | None, update: dict[str, Any]) -> dict[str, Any]:
        current = current or {}
        merged = {
            "accessToken": text(update.get("accessToken") or current.get("accessToken")),
            "refreshToken": text(update.get("refreshToken") or current.get("refreshToken")),
            "tokenType": text(update.get("tokenType") or current.get("tokenType"), "Bearer"),
            "expiresAt": int(update.get("expiresAt") or current.get("expiresAt") or 0),
            "scope": text(update.get("scope") or current.get("scope")),
            "accountEmail": text(update.get("accountEmail") or current.get("accountEmail")),
            "accountName": text(update.get("accountName") or current.get("accountName")),
        }
        return merged

    def _login_worker(self, config: dict[str, Any], scopes: list[str]) -> None:
        try:
            result = self._run_loopback_flow(config, scopes)
            merged = self._merge_auth(self._read_auth(), result)
            if not text(merged.get("refreshToken")):
                raise RuntimeError("Google에서 갱신 토큰을 주지 않았습니다. 같은 계정으로 다시 시도해 주세요.")
            self._write_auth(merged)
            self._set_login_state(in_progress=False, message="Google 연결이 완료되었습니다.", last_error="")
        except Exception as exc:
            self._set_login_state(in_progress=False, message="Google 연결에 실패했습니다.", last_error=str(exc))

    def start_login(self, scopes: list[str] | None = None) -> dict[str, Any]:
        config = self._load_config()
        if not config:
            raise RuntimeError(
                "개발자용 Google OAuth 설정 파일이 없습니다. "
                "google-oauth-desktop.json 파일을 준비해 주세요."
            )

        with self._lock:
            if self._login_thread and self._login_thread.is_alive():
                return self.get_status()

            self._login_state = {
                "inProgress": True,
                "lastError": "",
                "message": "Google 로그인 브라우저를 준비하는 중입니다.",
                "updatedAt": utc_now_iso(),
            }
            self._login_thread = threading.Thread(
                target=self._login_worker,
                args=(config, normalize_scopes(scopes or DEFAULT_SCOPES)),
                daemon=True,
            )
            self._login_thread.start()

        return self.get_status()

    def _refresh_access_token(self, config: dict[str, Any], auth: dict[str, Any]) -> dict[str, Any]:
        refresh_token = text(auth.get("refreshToken"))
        if not refresh_token:
            raise RuntimeError("Google 로그인이 필요합니다.")

        payload = {
            "client_id": config["client_id"],
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        if text(config.get("client_secret")):
            payload["client_secret"] = config["client_secret"]

        response = self._post_form(config["token_uri"], payload)
        now_ms = int(time.time() * 1000)
        return self._merge_auth(
            auth,
            {
                "accessToken": text(response.get("access_token")),
                "refreshToken": refresh_token,
                "tokenType": text(response.get("token_type"), "Bearer"),
                "expiresAt": now_ms + (int(response.get("expires_in") or 3600) * 1000),
                "scope": text(response.get("scope") or auth.get("scope")),
            },
        )

    def get_access_token(self) -> dict[str, Any]:
        config = self._load_config()
        if not config:
            raise RuntimeError("개발자용 Google OAuth 설정 파일이 없습니다.")

        auth = self._read_auth()
        if not auth:
            raise RuntimeError("Google 로그인이 필요합니다.")

        if not self._has_valid_access_token(auth):
            auth = self._refresh_access_token(config, auth)
            self._write_auth(auth)

        return {
            "auth": build_public_auth(auth, include_access_token=True),
            "status": self.get_status(),
        }

    def logout(self) -> dict[str, Any]:
        auth = self._read_auth()
        config = self._load_config()
        token_to_revoke = text(auth.get("refreshToken") if auth else "") or text(auth.get("accessToken") if auth else "")
        if token_to_revoke and config:
            try:
                self._post_form(text(config.get("revoke_uri"), DEFAULT_REVOKE_URI), {"token": token_to_revoke})
            except Exception:
                pass

        self._clear_auth()
        self._set_login_state(in_progress=False, message="Google 연결이 해제되었습니다.", last_error="")
        return self.get_status()

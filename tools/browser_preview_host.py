#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    from generate_minigame_catalog import build_catalog as build_minigame_catalog
    from generate_minigame_catalog import write_catalog_js as write_minigame_catalog_js
except Exception:  # pragma: no cover - runtime fallback
    build_minigame_catalog = None
    write_minigame_catalog_js = None


CREATE_NEW_PROCESS_GROUP = 0x00000200
DETACHED_PROCESS = 0x00000008
CREATE_NO_WINDOW = 0x08000000


def _is_project_root(path: Path) -> bool:
    return (path / "index.html").exists() and (path / "tools" / "ensure_local_storage_bridge.ps1").exists()


def _resolve_root_path() -> Path:
    candidates: list[Path] = []
    executable_path = Path(sys.executable).resolve()
    script_path = Path(__file__).resolve()

    if getattr(sys, "frozen", False):
        candidates.extend([executable_path.parent, executable_path.parent.parent])

    candidates.extend([
        script_path.parent.parent,
        script_path.parent,
        Path.cwd(),
    ])

    checked: set[Path] = set()
    for start in candidates:
        current = start
        for _ in range(6):
            if current in checked:
                break
            checked.add(current)
            if _is_project_root(current):
                return current
            if current.parent == current:
                break
            current = current.parent

    if _is_project_root(script_path.parent.parent):
        return script_path.parent.parent
    return executable_path.parent if getattr(sys, "frozen", False) else script_path.parent.parent


def hidden_subprocess_kwargs() -> dict:
    kwargs: dict = {}
    if os.name == "nt":
        startupinfo_factory = getattr(subprocess, "STARTUPINFO", None)
        if startupinfo_factory:
            startupinfo = startupinfo_factory()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0
            kwargs["startupinfo"] = startupinfo
        kwargs["creationflags"] = CREATE_NO_WINDOW
    return kwargs


def run_hidden_process(args: list[str], *, cwd: Path | None = None, timeout: float | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=str(cwd) if cwd else None,
        timeout=timeout,
        **hidden_subprocess_kwargs(),
    )


def popen_hidden_process(
    args: list[str],
    *,
    cwd: Path | None = None,
    detached: bool = False,
) -> subprocess.Popen:
    creationflags = 0
    kwargs = hidden_subprocess_kwargs()
    if os.name == "nt":
        creationflags = int(kwargs.pop("creationflags", 0))
        if detached:
            creationflags |= DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        kwargs["creationflags"] = creationflags
    return subprocess.Popen(
        args,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        **kwargs,
    )


def get_root_path() -> Path:
    return _resolve_root_path()


ROOT_PATH = get_root_path()
SCRIPT_PATH = Path(__file__).resolve()
RUNTIME_DIR = ROOT_PATH / "runtime" / "browser-preview"
STATE_FILE = RUNTIME_DIR / "state.json"
RESULT_FILE = RUNTIME_DIR / "last-result.json"
PROFILE_DIR = RUNTIME_DIR / "browser-profile"
PYTHON_PATH = ROOT_PATH / "venv" / "Scripts" / "python.exe"
PYTHONW_PATH = ROOT_PATH / "venv" / "Scripts" / "pythonw.exe"
ENSURE_BRIDGE_SCRIPT = ROOT_PATH / "tools" / "ensure_local_storage_bridge.ps1"
FROZEN_EXE_PATH = Path(sys.executable).resolve()
CURRENT_EXE_IS_BROWSER_HOST = FROZEN_EXE_PATH.stem.lower() == "browserpreviewhost"
BROWSER_PREVIEW_EXE_CANDIDATES = [
    ROOT_PATH / "BrowserPreviewHost.exe",
    ROOT_PATH / "dist" / "launcher" / "BrowserPreviewHost.exe",
]
PREVIEW_PORT = 58672
PREVIEW_HOST = "localhost"
MINIGAME_CATALOG_OUTPUT = ROOT_PATH / "js" / "minigames" / "games-catalog.js"


def load_minigame_catalog(*, write_output: bool) -> dict | None:
    if not build_minigame_catalog:
        return None

    payload = build_minigame_catalog(ROOT_PATH)
    if write_output and write_minigame_catalog_js:
        write_minigame_catalog_js(MINIGAME_CATALOG_OUTPUT, payload)
    return payload


def ensure_runtime_dir() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def read_json(path: Path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return None


def write_json(path: Path, payload) -> None:
    ensure_runtime_dir()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_result(status: str, message: str, **extra) -> None:
    payload = {
        "status": status,
        "message": message,
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    payload.update(extra)
    write_json(RESULT_FILE, payload)


def clear_state() -> None:
    if STATE_FILE.exists():
        STATE_FILE.unlink()


def find_free_port(preferred_port: int | None = None) -> int:
    candidates = []
    if isinstance(preferred_port, int) and preferred_port > 0:
        candidates.append(preferred_port)
    for candidate in candidates:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", candidate))
                return int(candidate)
            except OSError:
                continue
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def sanitize_app_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    params = urllib.parse.parse_qs(parsed.query or "", keep_blank_values=True)
    params.pop("livelySamToken", None)
    sanitized_query = urllib.parse.urlencode(params, doseq=True)
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, sanitized_query, parsed.fragment))


def build_app_url(port: int, bridge_info: dict | None = None) -> str:
    params = {"runtime": "browserpreview"}
    if isinstance(bridge_info, dict):
        bridge_port = int(bridge_info.get("port") or 0)
        auth_token = str(bridge_info.get("auth_token") or "").strip()
        if bridge_port > 0:
            params["bridgePort"] = str(bridge_port)
        if auth_token:
            params["livelySamToken"] = auth_token
    query = urllib.parse.urlencode(params)
    return f"http://{PREVIEW_HOST}:{int(port)}/index.html?{query}"


def is_pid_running(pid: int | None) -> bool:
    if not pid or pid <= 0:
        return False
    result = run_hidden_process(
        ["tasklist", "/FI", f"PID eq {pid}"],
    )
    output = (result.stdout or "") + (result.stderr or "")
    if result.returncode != 0:
        return False
    return str(pid) in output


def stop_pid(pid: int | None) -> None:
    if not is_pid_running(pid):
        return
    run_hidden_process(
        ["taskkill", "/PID", str(pid), "/T", "/F"],
    )


def wait_for_url(url: str, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as response:
                body = response.read(4096).decode("utf-8", errors="ignore")
                if 'id="settings-modal"' in body:
                    return
        except Exception:
            pass
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {url}")


def ensure_storage_bridge() -> dict:
    if not ENSURE_BRIDGE_SCRIPT.exists():
        raise RuntimeError("ensure_local_storage_bridge.ps1 not found.")

    result = run_hidden_process(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(ENSURE_BRIDGE_SCRIPT),
            "-Root",
            str(ROOT_PATH),
        ],
        cwd=ROOT_PATH,
        timeout=20,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "Failed to start local storage bridge.").strip()
        raise RuntimeError(detail)
    payload = json.loads((result.stdout or "").lstrip("\ufeff").strip() or "{}")
    if not isinstance(payload, dict) or int(payload.get("port") or 0) <= 0:
        raise RuntimeError("Local storage bridge did not return a usable port payload.")
    return payload


def get_runtime_python() -> Path:
    if PYTHONW_PATH.exists():
        return PYTHONW_PATH
    return PYTHON_PATH


def get_browser_preview_executable() -> Path | None:
    seen: set[str] = set()
    for candidate in BROWSER_PREVIEW_EXE_CANDIDATES:
        normalized = str(candidate).strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        if candidate.exists():
            return candidate
    return None


class QuietSimpleHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] == "/__livelysam__/minigames/catalog":
            self._serve_minigame_catalog()
            return
        super().do_GET()

    def _serve_minigame_catalog(self) -> None:
        try:
            payload = load_minigame_catalog(write_output=True)
            if not payload:
                raise RuntimeError("Minigame catalog generator is unavailable.")
            body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        except Exception as error:
            body = json.dumps(
                {
                    "error": str(error),
                },
                ensure_ascii=False,
                indent=2,
            ).encode("utf-8")
            self.send_response(503)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def run_preview_server(port: int) -> int:
    try:
        load_minigame_catalog(write_output=True)
    except Exception as error:
        write_result("warning", "Minigame catalog refresh failed.", error=str(error))
    handler = partial(QuietSimpleHandler, directory=str(ROOT_PATH))
    server = ReusableThreadingHTTPServer(("127.0.0.1", port), handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        return 0
    finally:
        server.server_close()
    return 0


def spawn_preview_server(port: int) -> subprocess.Popen:
    if getattr(sys, "frozen", False) and CURRENT_EXE_IS_BROWSER_HOST:
        return popen_hidden_process(
            [str(FROZEN_EXE_PATH), "serve", "--port", str(port)],
            cwd=ROOT_PATH,
            detached=True,
        )

    runtime_python = get_runtime_python()
    if SCRIPT_PATH.exists() and runtime_python.exists():
        return popen_hidden_process(
            [str(runtime_python), str(SCRIPT_PATH), "serve", "--port", str(port)],
            cwd=ROOT_PATH,
            detached=True,
        )

    browser_preview_exe = get_browser_preview_executable()
    if browser_preview_exe is not None:
        return popen_hidden_process(
            [str(browser_preview_exe), "serve", "--port", str(port)],
            cwd=ROOT_PATH,
            detached=True,
        )

    if getattr(sys, "frozen", False):
        return popen_hidden_process(
            [str(FROZEN_EXE_PATH), "serve", "--port", str(port)],
            cwd=ROOT_PATH,
            detached=True,
        )

    raise RuntimeError("Browser preview host runtime not found.")


def list_browser_candidates() -> list[Path]:
    env_path = os.environ.get("LIVELYSAM_BROWSER_PATH")
    candidates: list[Path | None] = []
    if env_path:
        candidates.append(Path(env_path))

    program_files = os.environ.get("ProgramFiles")
    program_files_x86 = os.environ.get("ProgramFiles(x86)")
    candidates.extend(
        [
            Path(program_files_x86) / "Microsoft" / "Edge" / "Application" / "msedge.exe" if program_files_x86 else None,
            Path(program_files) / "Microsoft" / "Edge" / "Application" / "msedge.exe" if program_files else None,
            Path(program_files) / "Google" / "Chrome" / "Application" / "chrome.exe" if program_files else None,
            Path(program_files_x86) / "Google" / "Chrome" / "Application" / "chrome.exe" if program_files_x86 else None,
        ]
    )

    resolved: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        if not candidate:
            continue
        key = str(candidate).strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        if candidate.exists():
            resolved.append(candidate)
    return resolved


def detect_browser() -> Path | None:
    candidates = list_browser_candidates()
    return candidates[0] if candidates else None


def start_system_browser(url: str) -> None:
    if os.name == "nt":
        os.startfile(url)  # type: ignore[attr-defined]
        return
    if not webbrowser.open(url):
        raise RuntimeError("Failed to open the default browser.")


def launch_browser_app(browser_path: Path, profile_dir: Path, url: str) -> subprocess.Popen:
    browser_args = [
        str(browser_path),
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--disable-session-crashed-bubble",
        "--window-size=1480,980",
        "--window-position=120,80",
        f"--app={url}",
    ]
    profile_dir.mkdir(parents=True, exist_ok=True)
    kwargs: dict = {
        "cwd": str(ROOT_PATH),
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if os.name == "nt":
        kwargs["creationflags"] = CREATE_NEW_PROCESS_GROUP
    return subprocess.Popen(
        browser_args,
        **kwargs,
    )


def wait_for_pid_running(pid: int | None, timeout: float = 5.0) -> bool:
    deadline = time.time() + max(0.5, float(timeout or 0))
    while time.time() < deadline:
        if is_pid_running(pid):
            return True
        time.sleep(0.2)
    return is_pid_running(pid)


def _powershell_single_quote(value: str) -> str:
    return "'" + str(value or "").replace("'", "''") + "'"


def list_profile_browser_processes(browser_path: Path | None, profile_dir: Path | None) -> list[dict]:
    if os.name != "nt" or not browser_path or not profile_dir:
        return []

    process_name = str(browser_path.name or "").strip()
    process_name_filter = process_name.replace("'", "''")
    profile_token = str(profile_dir).strip()
    if not process_name or not profile_token:
        return []

    script = (
        f"$profileToken = {_powershell_single_quote(profile_token.lower())}; "
        f"Get-CimInstance Win32_Process -Filter \"name='{process_name_filter}'\" | "
        "ForEach-Object { "
        "  $cmd = [string]$_.CommandLine; "
        "  if ($cmd -and $cmd.ToLowerInvariant().Contains($profileToken)) { "
        "    [pscustomobject]@{ "
        "      process_id = [int]$_.ProcessId; "
        "      parent_process_id = [int]$_.ParentProcessId; "
        "      command_line = $cmd "
        "    } "
        "  } "
        "} | ConvertTo-Json -Depth 4"
    )
    result = run_hidden_process(
        ["powershell.exe", "-NoProfile", "-Command", script],
        timeout=8,
    )
    payload = (result.stdout or "").lstrip("\ufeff").strip()
    if result.returncode != 0 or not payload:
        return []

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return []

    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        return []

    normalized = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            normalized.append({
                "process_id": int(item.get("process_id") or 0),
                "parent_process_id": int(item.get("parent_process_id") or 0),
                "command_line": str(item.get("command_line") or ""),
            })
        except Exception:
            continue
    return [item for item in normalized if item["process_id"] > 0]


def select_profile_browser_pid(matches: list[dict], initial_pid: int | None = None) -> int:
    if not matches:
        return 0

    pid_set = {int(item.get("process_id") or 0) for item in matches}
    scored: list[tuple[int, int]] = []
    for item in matches:
        pid = int(item.get("process_id") or 0)
        parent_pid = int(item.get("parent_process_id") or 0)
        command_line = str(item.get("command_line") or "").lower()
        score = 0
        if "--app=" in command_line:
            score += 50
        if "--type=" not in command_line:
            score += 20
        if parent_pid not in pid_set:
            score += 10
        if initial_pid and pid == int(initial_pid):
            score += 5
        scored.append((score, pid))

    scored.sort(key=lambda item: (-item[0], item[1]))
    return int(scored[0][1] or 0)


def resolve_browser_pid(initial_pid: int | None, browser_path: Path | None, profile_dir: Path | None, timeout: float = 6.0) -> int:
    deadline = time.time() + max(0.5, float(timeout or 0))
    while time.time() < deadline:
        matches = list_profile_browser_processes(browser_path, profile_dir)
        resolved_pid = select_profile_browser_pid(matches, initial_pid)
        if resolved_pid > 0:
            return resolved_pid
        if is_pid_running(initial_pid):
            return int(initial_pid or 0)
        time.sleep(0.25)

    matches = list_profile_browser_processes(browser_path, profile_dir)
    resolved_pid = select_profile_browser_pid(matches, initial_pid)
    if resolved_pid > 0:
        return resolved_pid
    if is_pid_running(initial_pid):
        return int(initial_pid or 0)
    return 0


def stop_profile_browser_processes(browser_path: Path | None, profile_dir: Path | None, keep_pid: int | None = None) -> None:
    matches = list_profile_browser_processes(browser_path, profile_dir)
    for item in matches:
        pid = int(item.get("process_id") or 0)
        if keep_pid and pid == int(keep_pid):
            continue
        stop_pid(pid)


def normalize_status_payload(state: dict | None):
    if state:
        payload = dict(state)
        browser_path_raw = str(state.get("browser_path") or "").strip()
        profile_dir_raw = str(state.get("browser_profile_dir") or "").strip()
        browser_path = None if not browser_path_raw or browser_path_raw == "system-default" else Path(browser_path_raw)
        profile_dir = Path(profile_dir_raw) if profile_dir_raw else None
        browser_pid = int(state.get("browser_pid") or 0)
        browser_running = is_pid_running(browser_pid)
        if not browser_running and browser_path and profile_dir:
            browser_pid = resolve_browser_pid(browser_pid, browser_path, profile_dir, timeout=0.8)
            browser_running = browser_pid > 0 and is_pid_running(browser_pid)
            if browser_running and browser_pid != int(state.get("browser_pid") or 0):
                payload["browser_pid"] = browser_pid
        payload["browser_running"] = browser_running
        payload["server_running"] = is_pid_running(int(state.get("server_pid") or 0))
        payload["running"] = payload["server_running"]
        return payload

    result = read_json(RESULT_FILE)
    if result:
        return {
            "running": False,
            "last_result": result,
        }

    return {
        "running": False,
        "last_result": {
            "status": "stopped",
            "message": "Browser preview is not running.",
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        },
    }


def start_preview() -> int:
    state = read_json(STATE_FILE)
    if state:
        normalized_state = normalize_status_payload(state)
        if normalized_state.get("server_running"):
            print(json.dumps(normalized_state, ensure_ascii=False, indent=2))
            return 0
        stop_pid(int(state.get("browser_pid") or 0))
        stop_pid(int(state.get("server_pid") or 0))
        clear_state()

    ensure_runtime_dir()
    bridge_info = ensure_storage_bridge()

    port = find_free_port(PREVIEW_PORT)
    launch_url = build_app_url(port, bridge_info)
    public_url = sanitize_app_url(launch_url)
    server_process = spawn_preview_server(port)

    try:
        wait_for_url(public_url, timeout=10.0)
    except Exception:
        stop_pid(server_process.pid)
        raise

    browser_process = None
    browser_path = detect_browser()
    try:
        if browser_path:
            browser_process = launch_browser_app(browser_path, PROFILE_DIR, launch_url)
            resolved_browser_pid = resolve_browser_pid(browser_process.pid, browser_path, PROFILE_DIR, timeout=6.0)
            if resolved_browser_pid <= 0:
                raise RuntimeError(f"Browser process did not stay running: {browser_path}")
        else:
            start_system_browser(launch_url)
            resolved_browser_pid = 0
    except Exception as fallback_error:
        stop_pid(server_process.pid)
        raise RuntimeError(f"Failed to open the default browser: {fallback_error}") from fallback_error

    state = {
        "mode": "browser_preview",
        "browser_path": str(browser_path) if browser_path else "system-default",
        "browser_pid": int(resolved_browser_pid or 0),
        "browser_profile_dir": str(PROFILE_DIR),
        "server_pid": server_process.pid,
        "port": port,
        "url": public_url,
        "bridge_port": int(bridge_info.get("port") or 0),
        "attached": False,
        "last_error": None,
    }
    write_json(STATE_FILE, state)
    write_result(
        "running",
        "Opened the preview in the browser.",
        attached=False,
        url=public_url,
        browser=str(browser_path) if browser_path else "system-default",
    )
    print(json.dumps(normalize_status_payload(state), ensure_ascii=False, indent=2))
    return 0


def stop_preview() -> int:
    state = read_json(STATE_FILE)
    if not state:
        write_result("stopped", "No running browser preview was found.", attached=False)
        print("No running browser preview was found.")
        return 0

    browser_path_raw = str(state.get("browser_path") or "").strip()
    profile_dir_raw = str(state.get("browser_profile_dir") or "").strip()
    browser_path = None if not browser_path_raw or browser_path_raw == "system-default" else Path(browser_path_raw)
    profile_dir = Path(profile_dir_raw) if profile_dir_raw else None
    stop_pid(int(state.get("browser_pid") or 0))
    stop_profile_browser_processes(browser_path, profile_dir)
    stop_pid(int(state.get("server_pid") or 0))
    clear_state()
    write_result("stopped", "Browser preview stopped.", attached=False)
    print("Browser preview stopped.")
    return 0


def show_status() -> int:
    print(json.dumps(normalize_status_payload(read_json(STATE_FILE)), ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="LivelySam browser preview host")
    parser.add_argument("command", choices=["start", "stop", "status", "serve"])
    parser.add_argument("--port", type=int, default=PREVIEW_PORT)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "serve":
        return run_preview_server(int(args.port))
    if args.command == "start":
        return start_preview()
    if args.command == "stop":
        return stop_preview()
    return show_status()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        write_result("failed", "Browser preview failed.", attached=False, error=str(error))
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

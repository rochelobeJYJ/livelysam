#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


CREATE_NEW_PROCESS_GROUP = 0x00000200
DETACHED_PROCESS = 0x00000008
CREATE_NO_WINDOW = 0x08000000


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
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


ROOT_PATH = get_root_path()
RUNTIME_DIR = ROOT_PATH / "runtime" / "browser-preview"
STATE_FILE = RUNTIME_DIR / "state.json"
RESULT_FILE = RUNTIME_DIR / "last-result.json"
PYTHON_PATH = ROOT_PATH / "venv" / "Scripts" / "python.exe"
PYTHONW_PATH = ROOT_PATH / "venv" / "Scripts" / "pythonw.exe"
BRIDGE_HEALTH_URL = "http://127.0.0.1:58671/__livelysam__/health"
BRIDGE_API_HEALTH_URL = "http://127.0.0.1:58671/api/health"
ENSURE_BRIDGE_SCRIPT = ROOT_PATH / "tools" / "ensure_local_storage_bridge.ps1"
PREVIEW_PORT = 58672
PREVIEW_HOST = "localhost"


def ensure_runtime_dir() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def read_json(path: Path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
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


def ensure_storage_bridge() -> None:
    try:
        with urllib.request.urlopen(BRIDGE_HEALTH_URL, timeout=1.5):
            pass
        with urllib.request.urlopen(BRIDGE_API_HEALTH_URL, timeout=1.5):
            return
    except Exception:
        pass

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


def get_runtime_python() -> Path:
    if PYTHONW_PATH.exists():
        return PYTHONW_PATH
    return PYTHON_PATH


class QuietSimpleHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def run_preview_server(port: int) -> int:
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
    if getattr(sys, "frozen", False):
        return popen_hidden_process(
            [str(Path(sys.executable).resolve()), "serve", "--port", str(port)],
            cwd=ROOT_PATH,
            detached=True,
        )

    runtime_python = get_runtime_python()
    if not runtime_python.exists():
        raise RuntimeError("python runtime not found in venv\\Scripts.")
    return popen_hidden_process(
        [str(runtime_python), str(Path(__file__).resolve()), "serve", "--port", str(port)],
        cwd=ROOT_PATH,
        detached=True,
    )


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
    return popen_hidden_process(
        browser_args,
        cwd=ROOT_PATH,
        detached=True,
    )


def normalize_status_payload(state: dict | None):
    if state:
        payload = dict(state)
        payload["browser_running"] = is_pid_running(int(state.get("browser_pid") or 0))
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
    ensure_storage_bridge()

    port = PREVIEW_PORT
    url = f"http://{PREVIEW_HOST}:{port}/index.html?runtime=browserpreview"
    server_process = spawn_preview_server(port)

    try:
        wait_for_url(url, timeout=10.0)
    except Exception:
        stop_pid(server_process.pid)
        raise

    try:
        start_system_browser(url)
    except Exception as fallback_error:
        stop_pid(server_process.pid)
        raise RuntimeError(f"Failed to open the default browser: {fallback_error}") from fallback_error

    state = {
        "mode": "browser_preview",
        "browser_path": "system-default",
        "browser_pid": 0,
        "server_pid": server_process.pid,
        "port": port,
        "url": url,
        "attached": False,
        "last_error": None,
    }
    write_json(STATE_FILE, state)
    write_result("running", "Opened the preview in the default browser.", attached=False, url=url, browser="system-default")
    print(json.dumps(normalize_status_payload(state), ensure_ascii=False, indent=2))
    return 0


def stop_preview() -> int:
    state = read_json(STATE_FILE)
    if not state:
        write_result("stopped", "No running browser preview was found.", attached=False)
        print("No running browser preview was found.")
        return 0

    stop_pid(int(state.get("browser_pid") or 0))
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

from __future__ import annotations

import argparse
import ctypes
import json
import logging
import os
import socket
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import quote
from ctypes import wintypes

ULONG_PTR = ctypes.c_size_t


APP_ROOT = Path(__file__).resolve().parent.parent
RUNTIME_DIR = APP_ROOT / "runtime" / "desktop-host"
PROFILE_DIR = RUNTIME_DIR / "chrome-profile"
STATE_FILE = RUNTIME_DIR / "state.json"
RESULT_FILE = RUNTIME_DIR / "last-result.json"
STOP_FILE = RUNTIME_DIR / "stop.flag"
LOG_FILE = RUNTIME_DIR / "host.log"
APP_TITLE = "LivelySam Desktop Host"
APP_ENTRY = "index.html?runtime=desktophost"

SMTO_NORMAL = 0x0000
SPI_GETWORKAREA = 0x0030
GWL_STYLE = -16
GWL_EXSTYLE = -20
WS_CAPTION = 0x00C00000
WS_THICKFRAME = 0x00040000
WS_SYSMENU = 0x00080000
WS_MINIMIZEBOX = 0x00020000
WS_MAXIMIZEBOX = 0x00010000
WS_POPUP = 0x80000000
WS_CHILD = 0x40000000
WS_VISIBLE = 0x10000000
WS_EX_APPWINDOW = 0x00040000
WS_EX_TOOLWINDOW = 0x00000080
WS_EX_NOACTIVATE = 0x08000000
SWP_NOACTIVATE = 0x0010
SWP_SHOWWINDOW = 0x0040
SWP_FRAMECHANGED = 0x0020
HWND_BOTTOM = ctypes.c_void_p(1)
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
STILL_ACTIVE = 259
TH32CS_SNAPPROCESS = 0x00000002
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long),
    ]


class PROCESSENTRY32W(ctypes.Structure):
    _fields_ = [
        ("dwSize", wintypes.DWORD),
        ("cntUsage", wintypes.DWORD),
        ("th32ProcessID", wintypes.DWORD),
        ("th32DefaultHeapID", ULONG_PTR),
        ("th32ModuleID", wintypes.DWORD),
        ("cntThreads", wintypes.DWORD),
        ("th32ParentProcessID", wintypes.DWORD),
        ("pcPriClassBase", ctypes.c_long),
        ("dwFlags", wintypes.DWORD),
        ("szExeFile", wintypes.WCHAR * 260),
    ]


user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

user32.EnumWindows.argtypes = [EnumWindowsProc, wintypes.LPARAM]
user32.EnumWindows.restype = wintypes.BOOL
user32.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
user32.FindWindowW.restype = wintypes.HWND
user32.FindWindowExW.argtypes = [wintypes.HWND, wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR]
user32.FindWindowExW.restype = wintypes.HWND
user32.SendMessageTimeoutW.argtypes = [
    wintypes.HWND,
    wintypes.UINT,
    wintypes.WPARAM,
    wintypes.LPARAM,
    wintypes.UINT,
    wintypes.UINT,
    ctypes.POINTER(ULONG_PTR),
]
user32.SendMessageTimeoutW.restype = wintypes.LPARAM
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user32.GetWindowThreadProcessId.restype = wintypes.DWORD
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.IsWindowVisible.restype = wintypes.BOOL
user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
user32.GetWindowTextLengthW.restype = ctypes.c_int
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowTextW.restype = ctypes.c_int
user32.GetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int]
user32.GetWindowLongPtrW.restype = ctypes.c_ssize_t
user32.SetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_ssize_t]
user32.SetWindowLongPtrW.restype = ctypes.c_ssize_t
user32.SetParent.argtypes = [wintypes.HWND, wintypes.HWND]
user32.SetParent.restype = wintypes.HWND
user32.SetWindowPos.argtypes = [
    wintypes.HWND,
    wintypes.HWND,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    wintypes.UINT,
]
user32.SetWindowPos.restype = wintypes.BOOL
user32.SystemParametersInfoW.argtypes = [wintypes.UINT, wintypes.UINT, wintypes.LPVOID, wintypes.UINT]
user32.SystemParametersInfoW.restype = wintypes.BOOL

kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel32.OpenProcess.restype = wintypes.HANDLE
kernel32.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
kernel32.GetExitCodeProcess.restype = wintypes.BOOL
kernel32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
kernel32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
kernel32.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32W)]
kernel32.Process32FirstW.restype = wintypes.BOOL
kernel32.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32W)]
kernel32.Process32NextW.restype = wintypes.BOOL
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
kernel32.CloseHandle.restype = wintypes.BOOL


def setup_logging() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def find_browser_path() -> Path:
    env_path = os.environ.get("LIVELYSAM_BROWSER_PATH")
    candidates = [
        Path(env_path) if env_path else None,
        Path(os.environ.get("ProgramFiles", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("ProgramFiles(x86)", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("LocalAppData", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("ProgramFiles", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("ProgramFiles(x86)", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("LocalAppData", "")) / "Microsoft/Edge/Application/msedge.exe",
    ]

    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate
    raise FileNotFoundError("Chromium browser not found. Install Chrome or Edge, or set LIVELYSAM_BROWSER_PATH.")


def get_primary_work_area() -> tuple[int, int, int, int]:
    rect = RECT()
    ok = user32.SystemParametersInfoW(SPI_GETWORKAREA, 0, ctypes.byref(rect), 0)
    if not ok:
        raise ctypes.WinError(ctypes.get_last_error())
    return rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top


def is_pid_running(pid: int) -> bool:
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        return False
    try:
        exit_code = wintypes.DWORD()
        if not kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code)):
            return False
        return exit_code.value == STILL_ACTIVE
    finally:
        kernel32.CloseHandle(handle)


def write_state(payload: dict) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_result(payload: dict) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def read_state() -> Optional[dict]:
    if not STATE_FILE.exists():
        return None
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def read_result() -> Optional[dict]:
    if not RESULT_FILE.exists():
        return None
    try:
        return json.loads(RESULT_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def clear_state() -> None:
    if STATE_FILE.exists():
        STATE_FILE.unlink()
    if STOP_FILE.exists():
        STOP_FILE.unlink()


def terminate_pid(pid: Optional[int]) -> None:
    if not pid:
        return
    subprocess.run(
        ["taskkill", "/PID", str(pid), "/T", "/F"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )


class AppRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_ROOT), **kwargs)

    def log_message(self, format, *args):  # noqa: A003
        logging.info("HTTP %s", format % args)


def start_server() -> tuple[ThreadingHTTPServer, threading.Thread, int]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), AppRequestHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread, server.server_address[1]


def build_app_url(port: int) -> str:
    return f"http://127.0.0.1:{port}/{quote(APP_ENTRY, safe='/?=&')}"


def launch_browser(browser_path: Path, url: str, bounds: tuple[int, int, int, int]) -> subprocess.Popen:
    left, top, width, height = bounds
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    args = [
        str(browser_path),
        f"--app={url}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-session-crashed-bubble",
        "--disable-background-mode",
        "--disable-features=Translate,BackForwardCache,msEdgeSidebarV2",
        f"--user-data-dir={PROFILE_DIR}",
        f"--window-position={left},{top}",
        f"--window-size={width},{height}",
    ]
    return subprocess.Popen(args)


def get_process_tree(root_pid: int) -> set[int]:
    snapshot = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snapshot == INVALID_HANDLE_VALUE:
        return {root_pid}

    parent_map: dict[int, list[int]] = {}
    entry = PROCESSENTRY32W()
    entry.dwSize = ctypes.sizeof(PROCESSENTRY32W)

    try:
        ok = kernel32.Process32FirstW(snapshot, ctypes.byref(entry))
        while ok:
            parent_map.setdefault(int(entry.th32ParentProcessID), []).append(int(entry.th32ProcessID))
            ok = kernel32.Process32NextW(snapshot, ctypes.byref(entry))
    finally:
        kernel32.CloseHandle(snapshot)

    process_ids = {root_pid}
    queue = [root_pid]
    while queue:
        current = queue.pop(0)
        for child_pid in parent_map.get(current, []):
            if child_pid not in process_ids:
                process_ids.add(child_pid)
                queue.append(child_pid)
    return process_ids


def find_main_window_for_pids(process_ids: set[int]) -> Optional[tuple[int, int]]:
    matches: list[tuple[int, str]] = []

    @EnumWindowsProc
    def callback(hwnd, _lparam):
        proc_id = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(proc_id))
        if int(proc_id.value) not in process_ids or not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        buffer = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buffer, length + 1)
        matches.append((hwnd, buffer.value, int(proc_id.value)))
        return True

    user32.EnumWindows(callback, 0)
    if not matches:
        return None

    titled = [(hwnd, pid) for hwnd, title, pid in matches if title.strip()]
    if titled:
        return titled[0]
    hwnd, _title, pid = matches[0]
    return hwnd, pid


def wait_for_window(pid: int, timeout_seconds: float = 20.0) -> tuple[int, int]:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        process_ids = get_process_tree(pid)
        window_info = find_main_window_for_pids(process_ids)
        if window_info:
            return window_info
        time.sleep(0.1)
    raise TimeoutError("Timed out waiting for browser window.")


def prepare_workerw() -> int:
    progman = user32.FindWindowW("Progman", None)
    if not progman:
        raise RuntimeError("Progman window not found.")

    result = ULONG_PTR()
    user32.SendMessageTimeoutW(progman, 0x052C, 0, 0, SMTO_NORMAL, 1000, ctypes.byref(result))

    workerw_holder: list[int] = []

    @EnumWindowsProc
    def callback(hwnd, _lparam):
        shell_view = user32.FindWindowExW(hwnd, None, "SHELLDLL_DefView", None)
        if shell_view:
            workerw = user32.FindWindowExW(None, hwnd, "WorkerW", None)
            if workerw:
                workerw_holder.append(workerw)
                return False
        return True

    user32.EnumWindows(callback, 0)
    if workerw_holder:
        return workerw_holder[0]
    return progman


def attach_to_desktop(hwnd: int, parent_hwnd: int, bounds: tuple[int, int, int, int]) -> None:
    left, top, width, height = bounds

    style = user32.GetWindowLongPtrW(hwnd, GWL_STYLE)
    style = (style & ~(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_POPUP)) | WS_CHILD | WS_VISIBLE
    user32.SetWindowLongPtrW(hwnd, GWL_STYLE, style)

    exstyle = user32.GetWindowLongPtrW(hwnd, GWL_EXSTYLE)
    exstyle = (exstyle & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE
    user32.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, exstyle)

    ctypes.set_last_error(0)
    previous_parent = user32.SetParent(hwnd, parent_hwnd)
    if not previous_parent and ctypes.get_last_error():
        raise ctypes.WinError(ctypes.get_last_error())

    ok = user32.SetWindowPos(
        hwnd,
        HWND_BOTTOM,
        left,
        top,
        width,
        height,
        SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
    )
    if not ok:
        raise ctypes.WinError(ctypes.get_last_error())


def ensure_not_running() -> None:
    state = read_state()
    if not state:
        return
    host_pid = int(state.get("host_pid", 0) or 0)
    if host_pid and is_pid_running(host_pid):
        raise RuntimeError("Desktop wallpaper host is already running.")
    clear_state()


def start_host() -> None:
    ensure_not_running()
    STOP_FILE.unlink(missing_ok=True)
    write_result({
        "status": "starting",
        "attached": False,
        "message": "Starting desktop wallpaper host.",
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    })

    browser_path = find_browser_path()
    bounds = get_primary_work_area()
    server, thread, port = start_server()
    url = build_app_url(port)
    process = launch_browser(browser_path, url, bounds)

    state = {
        "host_pid": os.getpid(),
        "browser_pid": process.pid,
        "port": port,
        "url": url,
        "browser_path": str(browser_path),
        "attached": False,
        "last_error": None,
    }
    write_state(state)

    logging.info("Server started on %s", url)
    logging.info("Browser launched: pid=%s path=%s", process.pid, browser_path)

    try:
        hwnd, window_pid = wait_for_window(process.pid)
        parent_hwnd = prepare_workerw()
        attach_to_desktop(hwnd, parent_hwnd, bounds)
        state.update({
            "attached": True,
            "window_handle": f"0x{hwnd:X}",
            "window_pid": window_pid,
            "desktop_parent": f"0x{parent_hwnd:X}",
        })
        write_state(state)
        write_result({
            "status": "running",
            "attached": True,
            "message": "Desktop wallpaper host attached successfully.",
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "url": url,
            "browser_path": str(browser_path),
            "window_handle": f"0x{hwnd:X}",
            "window_pid": window_pid,
            "desktop_parent": f"0x{parent_hwnd:X}",
        })
        logging.info("Attached browser window 0x%X to desktop parent 0x%X", hwnd, parent_hwnd)

        while process.poll() is None and not STOP_FILE.exists():
            time.sleep(0.5)
        write_result({
            "status": "stopped",
            "attached": False,
            "message": "Desktop wallpaper host stopped.",
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        })
    except Exception as exc:
        state.update({
            "last_error": f"{type(exc).__name__}: {exc}",
        })
        write_state(state)
        write_result({
            "status": "failed",
            "attached": False,
            "message": "Desktop wallpaper host failed to start.",
            "error": f"{type(exc).__name__}: {exc}",
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        })
        logging.exception("Desktop wallpaper host startup failed.")
        raise
    finally:
        logging.info("Stopping desktop wallpaper host.")
        server.shutdown()
        server.server_close()
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        clear_state()


def stop_host() -> None:
    state = read_state()
    if not state:
        print("No running desktop wallpaper host was found.")
        write_result({
            "status": "stopped",
            "attached": False,
            "message": "No running desktop wallpaper host was found.",
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        })
        return

    STOP_FILE.write_text("stop", encoding="utf-8")
    host_pid = int(state.get("host_pid", 0) or 0)
    browser_pid = int(state.get("browser_pid", 0) or 0)

    for _ in range(20):
        if not is_pid_running(host_pid):
            break
        time.sleep(0.25)

    if is_pid_running(browser_pid):
        terminate_pid(browser_pid)
    if is_pid_running(host_pid):
        terminate_pid(host_pid)

    clear_state()
    write_result({
        "status": "stopped",
        "attached": False,
        "message": "Desktop wallpaper host stopped.",
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    })
    print("Desktop wallpaper host stopped.")


def show_status() -> None:
    state = read_state()
    if state:
        host_pid = int(state.get("host_pid", 0) or 0)
        browser_pid = int(state.get("browser_pid", 0) or 0)
        print(json.dumps({
            **state,
            "host_running": is_pid_running(host_pid),
            "browser_running": is_pid_running(browser_pid),
        }, indent=2))
        return

    result = read_result()
    if result:
        print(json.dumps({
            "running": False,
            "last_result": result,
        }, indent=2))
        return

    print("Desktop wallpaper host is not running.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Launch the web app as a Windows desktop wallpaper host.")
    parser.add_argument("command", choices=["start", "stop", "status"])
    args = parser.parse_args()

    setup_logging()

    if args.command == "start":
        start_host()
        return 0
    if args.command == "stop":
        stop_host()
        return 0
    if args.command == "status":
        show_status()
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

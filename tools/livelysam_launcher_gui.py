#!/usr/bin/env python3
"""LivelySam launcher backend.

Pure backend — no UI. Exposes process-management helpers used by
``livelysam_launcher_compact.py`` (the Tk GUI) and other tools.
"""
from __future__ import annotations

import json
import hashlib
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


# ── paths ────────────────────────────────────────────────────────────
def _is_project_root(path: Path) -> bool:
    return (path / "index.html").exists() and (path / "tools" / "start_local_wallpaper.ps1").exists()


def _resolve_root_path() -> Path:
    candidates: list[Path] = []
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        candidates.extend([exe_dir, exe_dir.parent, Path.cwd()])
    script_dir = Path(__file__).resolve().parent
    candidates.extend([script_dir.parent, script_dir, Path.cwd()])

    checked: set[Path] = set()
    for start in candidates:
        current = start
        for _ in range(5):
            if current in checked:
                break
            checked.add(current)
            if _is_project_root(current):
                return current
            if current.parent == current:
                break
            current = current.parent
    return Path(__file__).resolve().parent.parent


ROOT_PATH = _resolve_root_path()
DIST_LAUNCHER_DIR = ROOT_PATH / "dist" / "launcher"
PYTHON_PATH = ROOT_PATH / "venv" / "Scripts" / "python.exe"
PYTHONW_PATH = ROOT_PATH / "venv" / "Scripts" / "pythonw.exe"
BROWSER_PREVIEW_EXE_CANDIDATES = [
    DIST_LAUNCHER_DIR / "BrowserPreviewHost.exe",
    ROOT_PATH / "BrowserPreviewHost.exe",
]
LOCAL_APPDATA = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local")))
APPDATA_DIR = LOCAL_APPDATA / "LivelySam"
LEGACY_LAUNCHER_SETTINGS_PATH = APPDATA_DIR / "launcher-settings.json"
LAUNCHER_SETTINGS_PATH = APPDATA_DIR / "launcher-settings.v2.json"
SHARED_STORAGE_PATH = APPDATA_DIR / "user-data" / "shared-storage.json"
UPDATES_DIR = APPDATA_DIR / "updates"
VERSION_FILE = ROOT_PATH / "version.json"

WALLPAPER_START_SCRIPT = ROOT_PATH / "tools" / "start_local_wallpaper.ps1"
WALLPAPER_STATUS_SCRIPT = ROOT_PATH / "tools" / "local_wallpaper_host.ps1"
BROWSER_PREVIEW_SCRIPT = ROOT_PATH / "tools" / "browser_preview_host.py"
BROWSER_PREVIEW_RUNTIME_DIR = ROOT_PATH / "runtime" / "browser-preview"
BROWSER_PREVIEW_STATE_FILE = BROWSER_PREVIEW_RUNTIME_DIR / "state.json"
BROWSER_PREVIEW_RESULT_FILE = BROWSER_PREVIEW_RUNTIME_DIR / "last-result.json"
STORAGE_BRIDGE_SCRIPT = ROOT_PATH / "tools" / "ensure_local_storage_bridge.ps1"


# ── subprocess helpers ──────────────────────────────────────────────
def run_process(args, timeout: int = 90):
    kwargs: dict = {
        "args": args,
        "cwd": str(ROOT_PATH),
        "capture_output": True,
        "text": True,
        "timeout": timeout,
    }
    if os.name == "nt":
        startupinfo_factory = getattr(subprocess, "STARTUPINFO", None)
        if startupinfo_factory:
            startupinfo = startupinfo_factory()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0
            kwargs["startupinfo"] = startupinfo
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return subprocess.run(**kwargs)


def run_powershell_script(script_path: Path, *extra_args, timeout: int = 90):
    return run_process(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script_path),
            *map(str, extra_args),
        ],
        timeout=timeout,
    )


def parse_json_output(output: str):
    text = (output or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def read_json_file(path: Path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def load_version_info() -> dict:
    data = read_json_file(VERSION_FILE) or {}
    github_repo = str(data.get("githubRepo") or "").strip()
    github_branch = str(data.get("githubBranch") or "main").strip() or "main"
    manifest_base_url = str(data.get("updateManifestBaseUrl") or "").strip()
    if not manifest_base_url and github_repo:
        manifest_base_url = f"https://raw.githubusercontent.com/{github_repo}/{github_branch}/release/updates"

    return {
        "appId": str(data.get("appId") or "livelysam").strip() or "livelysam",
        "version": str(data.get("version") or "0.0.0-dev").strip() or "0.0.0-dev",
        "releaseTag": str(data.get("releaseTag") or "").strip(),
        "defaultChannel": str(data.get("defaultChannel") or "stable").strip() or "stable",
        "githubRepo": github_repo,
        "githubBranch": github_branch,
        "updateManifestBaseUrl": manifest_base_url,
        "installerBaseName": str(data.get("installerBaseName") or "LivelySamSetup").strip() or "LivelySamSetup",
    }


VERSION_INFO = load_version_info()
CURRENT_VERSION = VERSION_INFO["version"]
DEFAULT_UPDATE_CHANNEL = VERSION_INFO["defaultChannel"]
UPDATE_MANIFEST_BASE_URL = VERSION_INFO["updateManifestBaseUrl"]


def get_current_version() -> str:
    return CURRENT_VERSION


def get_default_update_channel() -> str:
    return DEFAULT_UPDATE_CHANNEL


def normalize_update_channel(channel: str | None) -> str:
    text = str(channel or "").strip().lower()
    if text == "beta":
        return "beta"
    return "stable"


def get_update_channel_label(channel: str | None) -> str:
    return "테스트" if normalize_update_channel(channel) == "beta" else "안정"


def get_update_manifest_url(channel: str | None) -> str:
    manifest_base_url = str(UPDATE_MANIFEST_BASE_URL or "").rstrip("/")
    if not manifest_base_url:
        raise RuntimeError("Update manifest URL is not configured.")
    normalized = normalize_update_channel(channel)
    return f"{manifest_base_url}/latest-{normalized}.json"


def _version_key(version: str) -> tuple[tuple[int, ...], int, str]:
    text = str(version or "").strip()
    if not text:
        return ((0, 0, 0, 0), 0, "")

    main, suffix = text, ""
    if "-" in text:
        main, suffix = text.split("-", 1)

    parts = [int(token) for token in re.findall(r"\d+", main)]
    parts = (parts + [0, 0, 0, 0])[:4]
    release_rank = 0 if suffix else 1
    return (tuple(parts), release_rank, suffix.lower())


def compare_versions(left: str, right: str) -> int:
    left_key = _version_key(left)
    right_key = _version_key(right)
    if left_key == right_key:
        return 0
    return 1 if left_key > right_key else -1


def fetch_update_manifest(channel: str | None, timeout: float = 8.0) -> dict:
    manifest_url = get_update_manifest_url(channel)
    request = urllib.request.Request(
        manifest_url,
        headers={"User-Agent": f"LivelySamLauncher/{CURRENT_VERSION}"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))

    if not isinstance(payload, dict):
        raise RuntimeError("Update manifest response is not a JSON object.")

    payload["manifestUrl"] = manifest_url
    return payload


def check_for_updates(channel: str | None = None) -> dict:
    normalized_channel = normalize_update_channel(channel or DEFAULT_UPDATE_CHANNEL)
    info = {
        "currentVersion": CURRENT_VERSION,
        "channel": normalized_channel,
        "channelLabel": get_update_channel_label(normalized_channel),
        "manifestUrl": "",
        "latestVersion": CURRENT_VERSION,
        "available": False,
        "downloadUrl": "",
        "manifest": None,
        "error": "",
    }

    try:
        manifest = fetch_update_manifest(normalized_channel)
        latest_version = str(manifest.get("version") or "").strip()
        installer = manifest.get("installer") or {}
        download_url = str(installer.get("downloadUrl") or "").strip()
        info["manifest"] = manifest
        info["manifestUrl"] = str(manifest.get("manifestUrl") or "")
        info["latestVersion"] = latest_version or CURRENT_VERSION
        info["downloadUrl"] = download_url
        info["available"] = bool(
            latest_version
            and download_url
            and compare_versions(latest_version, CURRENT_VERSION) > 0
        )
    except Exception as exc:  # noqa: BLE001
        info["error"] = str(exc)

    return info


def _safe_installer_file_name(manifest: dict) -> str:
    installer = manifest.get("installer") or {}
    file_name = str(installer.get("fileName") or "").strip()
    if not file_name:
        file_name = f"{VERSION_INFO['installerBaseName']}-{manifest.get('version') or 'update'}.exe"
    file_name = file_name.replace("/", "_").replace("\\", "_")
    return file_name


def download_and_launch_update(manifest: dict) -> dict:
    installer = manifest.get("installer") or {}
    download_url = str(installer.get("downloadUrl") or "").strip()
    if not download_url:
        raise RuntimeError("Installer download URL is missing from update manifest.")

    expected_sha256 = str(installer.get("sha256") or "").strip().lower()
    file_name = _safe_installer_file_name(manifest)

    UPDATES_DIR.mkdir(parents=True, exist_ok=True)
    target_path = UPDATES_DIR / file_name
    temp_path = target_path.with_suffix(target_path.suffix + ".part")

    request = urllib.request.Request(
        download_url,
        headers={"User-Agent": f"LivelySamLauncher/{CURRENT_VERSION}"},
    )
    hasher = hashlib.sha256()
    with urllib.request.urlopen(request, timeout=60) as response:
        with temp_path.open("wb") as handle:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
                hasher.update(chunk)

    if expected_sha256 and hasher.hexdigest().lower() != expected_sha256:
        temp_path.unlink(missing_ok=True)
        raise RuntimeError("Downloaded installer checksum does not match the update manifest.")

    temp_path.replace(target_path)
    os.startfile(str(target_path))

    return {
        "installerPath": str(target_path),
        "version": str(manifest.get("version") or ""),
        "channel": normalize_update_channel(str(manifest.get("channel") or "")),
        "downloadUrl": download_url,
    }


def is_pid_running(pid: int) -> bool:
    if pid <= 0:
        return False
    result = run_process(["tasklist", "/FI", f"PID eq {pid}"], timeout=10)
    output = (result.stdout or "") + (result.stderr or "")
    return result.returncode == 0 and str(pid) in output


def normalize_browser_status_payload(state: dict | None, last_result: dict | None):
    if state:
        payload = dict(state)
        payload["browser_running"] = is_pid_running(int(state.get("browser_pid") or 0))
        payload["server_running"] = is_pid_running(int(state.get("server_pid") or 0))
        payload["running"] = payload["server_running"]
        return payload

    if last_result:
        return {
            "running": False,
            "last_result": last_result,
        }

    return {
        "running": False,
        "last_result": {
            "status": "stopped",
            "message": "Browser preview is not running.",
        },
    }


def read_browser_status_payload():
    return normalize_browser_status_payload(
        read_json_file(BROWSER_PREVIEW_STATE_FILE),
        read_json_file(BROWSER_PREVIEW_RESULT_FILE),
    )


def make_completed_process(args, returncode: int, stdout_payload=None, stderr: str = ""):
    stdout = ""
    if stdout_payload is not None:
        if isinstance(stdout_payload, str):
            stdout = stdout_payload
        else:
            stdout = json.dumps(stdout_payload, ensure_ascii=False, indent=2)
    return subprocess.CompletedProcess(args=args, returncode=returncode, stdout=stdout, stderr=stderr)


def get_browser_preview_executable() -> Path | None:
    for candidate in BROWSER_PREVIEW_EXE_CANDIDATES:
        if candidate.exists():
            return candidate
    return None


def get_browser_preview_python() -> Path:
    return PYTHON_PATH


def get_browser_preview_command(command: str) -> list[str]:
    browser_preview_exe = get_browser_preview_executable()
    if browser_preview_exe is not None:
        return [str(browser_preview_exe), command]
    python_path = get_browser_preview_python()
    return [str(python_path), str(BROWSER_PREVIEW_SCRIPT), command]


# ── settings ────────────────────────────────────────────────────────
def load_launcher_settings() -> dict:
    for path in (LAUNCHER_SETTINGS_PATH, LEGACY_LAUNCHER_SETTINGS_PATH):
        if not path.exists():
            continue
        try:
            return json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
    return {}


def save_launcher_settings(data: dict) -> None:
    APPDATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    last_error = None
    for path in (LAUNCHER_SETTINGS_PATH, LEGACY_LAUNCHER_SETTINGS_PATH):
        try:
            path.write_text(payload, encoding="utf-8")
            return
        except Exception as exc:
            last_error = exc
    if last_error is not None:
        raise last_error


# ── monitors ────────────────────────────────────────────────────────
def list_monitors() -> list[dict]:
    script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "[System.Windows.Forms.Screen]::AllScreens | "
        "ForEach-Object { "
        "  [pscustomobject]@{ "
        "    device = $_.DeviceName; "
        "    primary = $_.Primary; "
        "    x = $_.Bounds.X; "
        "    y = $_.Bounds.Y; "
        "    width = $_.Bounds.Width; "
        "    height = $_.Bounds.Height "
        "  } "
        "} | ConvertTo-Json -Depth 4"
    )
    result = run_process(["powershell.exe", "-NoProfile", "-Command", script], timeout=30)
    data = parse_json_output(result.stdout)
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        return []

    monitors = []
    for item in data:
        device_name = str(item.get("device") or "")
        match = re.search(r"(\d+)$", device_name)
        monitor_number = int(match.group(1)) if match else 1
        monitors.append({**item, "monitor": monitor_number})

    return sorted(
        monitors,
        key=lambda item: (
            int(item.get("x", 0)),
            int(item.get("y", 0)),
            str(item.get("device") or ""),
        ),
    )


def monitor_signature(item) -> dict:
    if not item:
        return {}
    return {
        "device": str(item.get("device") or ""),
        "monitor": int(item.get("monitor") or 0),
        "x": int(item.get("x") or 0),
        "y": int(item.get("y") or 0),
        "width": int(item.get("width") or 0),
        "height": int(item.get("height") or 0),
        "primary": bool(item.get("primary")),
    }


def monitor_bounds_signature(item) -> dict:
    signature = monitor_signature(item)
    return {
        "x": signature.get("x", 0),
        "y": signature.get("y", 0),
        "width": signature.get("width", 0),
        "height": signature.get("height", 0),
    }


def match_monitor(item, *, device: str = "", bounds=None, legacy_monitor: int = 0) -> bool:
    current = monitor_signature(item)
    if device and current["device"] == device:
        return True
    if bounds:
        current_bounds = monitor_bounds_signature(current)
        expected_bounds = {
            "x": int(bounds.get("x", 0)),
            "y": int(bounds.get("y", 0)),
            "width": int(bounds.get("width", 0)),
            "height": int(bounds.get("height", 0)),
        }
        if current_bounds == expected_bounds:
            return True
    return legacy_monitor > 0 and current["monitor"] == int(legacy_monitor)


# ── storage bridge ──────────────────────────────────────────────────
def ensure_storage_bridge():
    result = run_powershell_script(STORAGE_BRIDGE_SCRIPT, "-Root", str(ROOT_PATH), timeout=30)
    if result.returncode != 0:
        raise RuntimeError(
            (result.stderr or result.stdout or "공유 저장 브리지를 시작하지 못했습니다.").strip()
        )
    return parse_json_output(result.stdout) or {}


def get_storage_bridge_health():
    try:
        with urllib.request.urlopen(
            "http://127.0.0.1:58671/__livelysam__/health", timeout=1.5
        ) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None


# ── wallpaper ───────────────────────────────────────────────────────
def get_wallpaper_status() -> dict:
    result = run_powershell_script(WALLPAPER_STATUS_SCRIPT, "status", "-Root", str(ROOT_PATH), timeout=20)
    return parse_json_output(result.stdout) or {"running": False}


def start_wallpaper(
    preferred_monitor: int,
    preferred_monitor_device: str = "",
    preferred_monitor_bounds=None,
    preferred_monitor_primary: int = -1,
):
    args = ["-Root", str(ROOT_PATH), "-PreferredMonitor", str(preferred_monitor)]
    if preferred_monitor_device:
        args.extend(["-PreferredMonitorDevice", preferred_monitor_device])
    bounds = preferred_monitor_bounds or {}
    if all(key in bounds for key in ("x", "y", "width", "height")):
        args.extend(
            [
                "-PreferredMonitorX", str(int(bounds["x"])),
                "-PreferredMonitorY", str(int(bounds["y"])),
                "-PreferredMonitorWidth", str(int(bounds["width"])),
                "-PreferredMonitorHeight", str(int(bounds["height"])),
            ]
        )
    if preferred_monitor_primary in (0, 1):
        args.extend(["-PreferredMonitorPrimary", str(int(preferred_monitor_primary))])

    return run_powershell_script(WALLPAPER_START_SCRIPT, *args, timeout=80)


def stop_wallpaper():
    return run_powershell_script(WALLPAPER_STATUS_SCRIPT, "stop", "-Root", str(ROOT_PATH), timeout=40)


# ── browser preview ─────────────────────────────────────────────────
def get_browser_status() -> dict:
    return read_browser_status_payload()


def start_browser_preview():
    result = run_process(get_browser_preview_command("start"), timeout=40)
    payload = parse_json_output(result.stdout) or read_browser_status_payload()
    return make_completed_process(result.args, result.returncode, payload, result.stderr or "")


def stop_browser_preview():
    result = run_process(get_browser_preview_command("stop"), timeout=30)
    payload = parse_json_output(result.stdout) or read_browser_status_payload()
    return make_completed_process(result.args, result.returncode, payload, result.stderr or "")

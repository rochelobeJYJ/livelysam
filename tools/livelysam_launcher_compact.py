#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compact launcher for the local LivelySam runtime."""
from __future__ import annotations

import logging
import os
import sys
import threading
import tkinter as tk
import webbrowser
from logging.handlers import RotatingFileHandler
from pathlib import Path
from tkinter import messagebox, ttk

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import tools.livelysam_launcher_gui as backend  # noqa: E402


P = {
    "bg": "#EEF4FB",
    "card": "#FFFFFF",
    "divider": "#E9F0F8",
    "border": "#DCE5F0",
    "text": "#1A1A2E",
    "text2": "#495057",
    "text3": "#7B8794",
    "primary": "#4DABF7",
    "primary_dk": "#228BE6",
    "primary_lt": "#E7F5FF",
    "ok_bg": "#D3F9D8",
    "ok_fg": "#2B8A3E",
    "warn_bg": "#FFF3BF",
    "warn_fg": "#B5650C",
    "off_bg": "#EEF2F7",
    "off_fg": "#868E96",
    "ghost_bg": "#F1F5F9",
    "ghost_hv": "#E4ECF5",
    "ghost_fg": "#495057",
    "danger_bg": "#FFE3E3",
    "danger_hv": "#FFD8D8",
    "danger_fg": "#E03131",
    "disabled_bg": "#ECEFF4",
    "disabled_fg": "#B9C1CD",
}

FONT = "Malgun Gothic"
WINDOW_W = 492
WINDOW_H = 508


def _configure_logger() -> tuple[logging.Logger, Path]:
    candidates = [
        backend.APPDATA_DIR / "logs",
        ROOT_DIR / "runtime" / "launcher",
    ]
    log_dir = None
    for candidate in candidates:
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            log_dir = candidate
            break
        except OSError:
            continue
    if log_dir is None:
        log_dir = ROOT_DIR

    log_path = log_dir / "launcher.log"
    logger = logging.getLogger("livelysam.launcher")
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        handler = RotatingFileHandler(log_path, maxBytes=256 * 1024, backupCount=3, encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        logger.addHandler(handler)
        logger.propagate = False
    return logger, log_path


LOGGER, LOG_PATH = _configure_logger()


def _rounded(canvas: tk.Canvas, x1, y1, x2, y2, radius, **kwargs):
    points = [
        x1 + radius, y1,
        x2 - radius, y1,
        x2, y1,
        x2, y1 + radius,
        x2, y2 - radius,
        x2, y2,
        x2 - radius, y2,
        x1 + radius, y2,
        x1, y2,
        x1, y2 - radius,
        x1, y1 + radius,
        x1, y1,
    ]
    return canvas.create_polygon(points, smooth=True, **kwargs)


class RoundedCard(tk.Canvas):
    def __init__(self, master, *, radius=18, pad=22, bg=P["card"], border=P["border"], parent_bg=P["bg"]):
        super().__init__(master, bg=parent_bg, bd=0, highlightthickness=0)
        self._radius = radius
        self._pad = pad
        self._bg = bg
        self._border = border
        self.content = tk.Frame(self, bg=bg)
        self._window = self.create_window(0, 0, window=self.content, anchor="nw")
        self.bind("<Configure>", self._redraw)

    def _redraw(self, event):
        width, height = event.width, event.height
        if width < 2 or height < 2:
            return
        self.delete("bgcard")
        _rounded(self, 0, 0, width, height, self._radius, fill=self._border, outline="", tags="bgcard")
        _rounded(self, 1, 1, width - 1, height - 1, self._radius, fill=self._bg, outline="", tags="bgcard")
        self.tag_lower("bgcard")
        self.coords(self._window, self._pad, self._pad)
        self.itemconfigure(self._window, width=width - (self._pad * 2), height=height - (self._pad * 2))


class Pill(tk.Canvas):
    def __init__(self, master, text="", *, bg=P["off_bg"], fg=P["off_fg"], parent_bg, font_size=8, height=22, padding=11):
        super().__init__(master, width=72, height=height, bg=parent_bg, bd=0, highlightthickness=0)
        self._height = height
        self._padding = padding
        self._font = (FONT, font_size, "bold")
        self._rect = _rounded(self, 0, 0, 72, height, height // 2, fill=bg, outline="")
        self._text = self.create_text(36, height // 2, text=text, fill=fg, font=self._font, anchor="center")
        self.set(text, bg, fg)

    def set(self, text, bg, fg):
        self.itemconfigure(self._text, text=text, fill=fg)
        self.update_idletasks()
        bbox = self.bbox(self._text)
        if bbox:
            width = max(int((bbox[2] - bbox[0]) + (self._padding * 2)), self._height)
            self.configure(width=width)
            self.coords(self._rect, 0, 0, width, self._height)
            self.coords(self._text, width / 2, self._height / 2)
        self.itemconfigure(self._rect, fill=bg)


class RButton(tk.Canvas):
    def __init__(self, master, text, command=None, *, bg, fg, hover, parent_bg, width=120, height=44, radius=14, font_size=10, bold=True):
        super().__init__(master, width=width, height=height, bg=parent_bg, bd=0, highlightthickness=0, cursor="hand2")
        self._base = bg
        self._hover = hover
        self._fg = fg
        self._command = command
        self._enabled = True
        self._rect = _rounded(self, 0, 0, width, height, radius, fill=bg, outline="")
        self._text = self.create_text(width // 2, height // 2, text=text, fill=fg, font=(FONT, font_size, "bold" if bold else "normal"))
        self.bind("<Enter>", lambda _event: self._on_hover(True))
        self.bind("<Leave>", lambda _event: self._on_hover(False))
        self.bind("<Button-1>", lambda _event: self._on_click())

    def _on_hover(self, is_inside):
        if self._enabled:
            self.itemconfigure(self._rect, fill=self._hover if is_inside else self._base)

    def _on_click(self):
        if self._enabled and self._command:
            self._command()

    def set_enabled(self, enabled):
        self._enabled = enabled
        if enabled:
            self.configure(cursor="hand2")
            self.itemconfigure(self._rect, fill=self._base)
            self.itemconfigure(self._text, fill=self._fg)
            return
        self.configure(cursor="")
        self.itemconfigure(self._rect, fill=P["disabled_bg"])
        self.itemconfigure(self._text, fill=P["disabled_fg"])


class LauncherApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("LivelySam")
        self.root.geometry(f"{WINDOW_W}x{WINDOW_H}")
        self.root.minsize(WINDOW_W, WINDOW_H)
        self.root.resizable(False, False)
        self.root.configure(bg=P["bg"])
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self._apply_native_rounding()

        self.settings = backend.load_launcher_settings()
        self.monitors: list[dict] = []
        self.monitor_map: dict[str, dict] = {}
        self.monitor_var = tk.StringVar(value="모니터 불러오는 중...")
        self.status_var = tk.StringVar(value="상태를 불러오는 중입니다.")
        self.detail_var = tk.StringVar(value="실행기와 미리보기 상태를 확인하고 있습니다.")

        self._busy = False
        self._closed = False
        self._refresh_running = False
        self._refresh_pending = False
        self._last_snapshot: dict = {}
        self._last_settings_error = ""
        self._initial_bridge_error = ""
        self._log_path = LOG_PATH
        self._update_channel = backend.normalize_update_channel(
            self.settings.get("update_channel") or backend.get_default_update_channel()
        )
        self._update_info: dict = {}
        self.footer_var = tk.StringVar(value="")

        self._setup_style()
        self._refresh_footer_meta()
        self._build()
        self._set_update_state()

        self._run_async(self._ensure_bridge_startup, self._handle_startup_bridge)
        self.root.after(80, self.request_refresh)
        self.root.after(700, lambda: self._start_update_check(prompt_install=False))
        self.root.after(5000, self._tick)

    def _refresh_footer_meta(self, info: dict | None = None) -> None:
        payload = info if info is not None else self._update_info
        channel_label = backend.get_update_channel_label(self._update_channel)
        status_text = "업데이트 확인 대기"

        if payload:
            if payload.get("checking"):
                status_text = "업데이트 확인 중"
            elif payload.get("installing"):
                target_version = str(payload.get("latestVersion") or payload.get("version") or "").strip()
                status_text = f"설치 시작 {target_version}".strip()
            elif payload.get("error"):
                status_text = "업데이트 확인 실패"
            elif payload.get("available"):
                target_version = str(payload.get("latestVersion") or "").strip()
                status_text = f"새 버전 {target_version}".strip()
            else:
                status_text = "최신 버전"

        self.footer_var.set(f"v{backend.get_current_version()} · {channel_label} 채널 · {status_text}")

    def _set_update_state(self, *, checking: bool = False, info: dict | None = None) -> None:
        payload = info if info is not None else self._update_info
        if checking:
            self._set_pill(self.pill_update, "info", "업데이트 확인")
            self._refresh_footer_meta({"checking": True})
            return

        if payload.get("installing"):
            self._set_pill(self.pill_update, "info", "설치 시작")
            self._refresh_footer_meta(payload)
            return

        if payload.get("error"):
            self._set_pill(self.pill_update, "warn", "확인 실패")
            self._refresh_footer_meta(payload)
            return

        if payload.get("available"):
            self._set_pill(self.pill_update, "warn", "업데이트 가능")
            self._refresh_footer_meta(payload)
            return

        self._set_pill(self.pill_update, "ok", "최신 버전")
        self._refresh_footer_meta(payload)

    def _save_update_channel(self) -> None:
        self.settings["update_channel"] = self._update_channel
        try:
            backend.save_launcher_settings(self.settings)
            self._last_settings_error = ""
        except Exception as exc:  # noqa: BLE001
            self._last_settings_error = str(exc)
            self._log_exception("failed to save update channel setting", exc)

    def _start_update_check(self, *, prompt_install: bool) -> None:
        channel = self._update_channel
        self._set_update_state(checking=True)

        def work():
            return backend.check_for_updates(channel)

        def done(info, error):
            if channel != self._update_channel:
                return
            if error:
                self._update_info = {"channel": channel, "error": str(error)}
                self._log_exception("update check raised unexpected error", error)
                self._set_update_state()
                if prompt_install:
                    messagebox.showerror("업데이트 확인 실패", self._format_log_detail(str(error)))
                return

            self._update_info = info or {}
            self._set_update_state()

            if self._update_info.get("error"):
                if prompt_install:
                    messagebox.showerror("업데이트 확인 실패", self._format_log_detail(str(self._update_info.get("error") or "")))
                return

            if self._update_info.get("available"):
                if prompt_install:
                    latest_version = str(self._update_info.get("latestVersion") or "").strip()
                    channel_label = backend.get_update_channel_label(channel)
                    should_install = messagebox.askyesno(
                        "업데이트 설치",
                        f"{channel_label} 채널에 새 버전 {latest_version} 이 있습니다.\n\n지금 설치 파일을 내려받아 실행하시겠습니까?",
                    )
                    if should_install:
                        self._start_update_install(self._update_info.get("manifest") or {})
                return

            if prompt_install:
                messagebox.showinfo("업데이트", "이미 최신 버전입니다.")

        self._run_async(work, done)

    def _start_update_install(self, manifest: dict) -> None:
        if not manifest:
            messagebox.showerror("업데이트 설치 실패", "업데이트 매니페스트가 비어 있습니다.")
            return

        self._set_busy(True, "업데이트 설치 파일을 준비하는 중입니다.", "새 버전을 내려받고 있습니다.")

        def work():
            return backend.download_and_launch_update(manifest)

        def done(payload, error):
            self._set_busy(False)
            if error:
                self._log_exception("update download/install failed", error)
                self._update_info = {"channel": self._update_channel, "error": str(error)}
                self._set_update_state()
                messagebox.showerror("업데이트 설치 실패", self._format_log_detail(str(error)))
                return

            self._update_info = {
                "channel": self._update_channel,
                "latestVersion": str(payload.get("version") or ""),
                "installing": True,
            }
            self._set_update_state()
            messagebox.showinfo(
                "업데이트 설치",
                f"{payload.get('version') or '새 버전'} 설치 파일을 실행했습니다.\n설치 마법사에서 업데이트를 완료해 주십시오.",
            )

        self._run_async(work, done)

    def on_check_updates(self) -> None:
        self._start_update_check(prompt_install=True)

    def on_toggle_update_channel(self) -> None:
        self._update_channel = "beta" if self._update_channel == "stable" else "stable"
        self._save_update_channel()
        self._update_info = {"channel": self._update_channel}
        self._set_update_state()
        self._start_update_check(prompt_install=False)

    def _apply_native_rounding(self) -> None:
        if os.name != "nt":
            return
        try:
            import ctypes

            self.root.update_idletasks()
            hwnd = ctypes.windll.user32.GetParent(self.root.winfo_id())
            value = ctypes.c_int(2)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 33, ctypes.byref(value), ctypes.sizeof(value))
        except Exception as exc:  # noqa: BLE001
            self._log_warning("native window rounding unavailable", exc)

    def _dispatch(self, callback) -> None:
        if self._closed:
            return
        try:
            self.root.after(0, callback)
        except tk.TclError as exc:
            if not self._closed:
                self._log_warning("failed to dispatch UI callback", exc)

    def _run_async(self, work, done=None) -> None:
        def runner():
            try:
                result, error = work(), None
            except Exception as exc:  # noqa: BLE001
                result, error = None, exc
            if done is not None:
                self._dispatch(lambda: done(result, error))

        threading.Thread(target=runner, daemon=True).start()

    def _format_log_detail(self, detail: str | None = None) -> str:
        log_hint = f"로그: {self._log_path}"
        if detail:
            return f"{detail}\n{log_hint}"
        return log_hint

    def _log_exception(self, context: str, exc: Exception) -> None:
        LOGGER.exception("%s: %s", context, exc)

    def _log_warning(self, context: str, exc: Exception | str) -> None:
        LOGGER.warning("%s: %s", context, exc)

    def _ensure_bridge_startup(self):
        return backend.ensure_storage_bridge()

    def _handle_startup_bridge(self, _result, error) -> None:
        if error:
            self._initial_bridge_error = str(error)
            self._log_exception("storage bridge bootstrap failed", error)
            self._set_pill(self.pill_status, "warn", "오류")
            self.set_status("저장소 브리지 준비에 실패했습니다.", self._format_log_detail(str(error)))
            return
        self._initial_bridge_error = ""

    def _setup_style(self) -> None:
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure(
            "LS.TCombobox",
            fieldbackground=P["ghost_bg"],
            background=P["ghost_bg"],
            foreground=P["text"],
            selectforeground=P["text"],
            selectbackground=P["ghost_bg"],
            bordercolor=P["ghost_bg"],
            lightcolor=P["ghost_bg"],
            darkcolor=P["ghost_bg"],
            arrowcolor=P["text2"],
            padding=(11, 9),
            relief="flat",
        )
        ghost = P["ghost_bg"]
        text = P["text"]
        self.root.tk.call(
            "ttk::style",
            "map",
            "LS.TCombobox",
            "-foreground",
            ["readonly focus", text, "readonly", text, "focus", text, "active", text],
            "-fieldbackground",
            ["readonly focus", ghost, "readonly", ghost, "focus", ghost],
            "-selectforeground",
            ["readonly focus", text, "readonly", text, "focus", text],
            "-selectbackground",
            ["readonly focus", ghost, "readonly", ghost, "focus", ghost],
            "-background",
            ["readonly focus", ghost, "readonly", ghost, "focus", ghost, "active", ghost],
            "-bordercolor",
            ["readonly focus", ghost, "readonly", ghost, "focus", ghost, "active", ghost],
            "-lightcolor",
            ["readonly focus", ghost, "readonly", ghost, "focus", ghost, "active", ghost],
            "-darkcolor",
            ["readonly focus", ghost, "readonly", ghost, "focus", ghost, "active", ghost],
        )
        self.root.option_add("*TCombobox*Listbox.background", P["card"])
        self.root.option_add("*TCombobox*Listbox.foreground", P["text"])
        self.root.option_add("*TCombobox*Listbox.selectBackground", P["primary"])
        self.root.option_add("*TCombobox*Listbox.selectForeground", "#FFFFFF")
        self.root.option_add("*TCombobox*Listbox.font", f"{FONT} 10")

    def _build(self) -> None:
        wrapper = tk.Frame(self.root, bg=P["bg"])
        wrapper.pack(fill="both", expand=True, padx=16, pady=16)

        card = RoundedCard(wrapper, radius=18, pad=22)
        card.pack(fill="both", expand=True)
        body = card.content

        header = tk.Frame(body, bg=P["card"])
        header.pack(fill="x")

        title_group = tk.Frame(header, bg=P["card"])
        title_group.pack(side="left")
        tk.Label(title_group, text="LivelySam", bg=P["card"], fg=P["text"], font=(FONT, 20, "bold")).pack(anchor="w")
        tk.Label(title_group, text="로컬 배경 실행기", bg=P["card"], fg=P["text3"], font=(FONT, 9)).pack(anchor="w", pady=(2, 0))

        self.pill_status = Pill(header, "준비 중", bg=P["off_bg"], fg=P["off_fg"], parent_bg=P["card"], font_size=9, height=24, padding=12)
        self.pill_status.pack(side="right", pady=8)

        tk.Label(body, textvariable=self.status_var, bg=P["card"], fg=P["text"], anchor="w", justify="left", wraplength=400, font=(FONT, 13, "bold")).pack(fill="x", pady=(18, 4))
        tk.Label(body, textvariable=self.detail_var, bg=P["card"], fg=P["text3"], anchor="w", justify="left", wraplength=400, font=(FONT, 9)).pack(fill="x")

        pills = tk.Frame(body, bg=P["card"])
        pills.pack(fill="x", pady=(14, 0))
        self.pill_storage = Pill(pills, "저장소", parent_bg=P["card"])
        self.pill_storage.pack(side="left")
        self.pill_wall = Pill(pills, "배경", parent_bg=P["card"])
        self.pill_wall.pack(side="left", padx=(6, 0))
        self.pill_browser = Pill(pills, "브라우저", parent_bg=P["card"])
        self.pill_browser.pack(side="left", padx=(6, 0))
        self.pill_update = Pill(pills, "업데이트", parent_bg=P["card"])
        self.pill_update.pack(side="left", padx=(6, 0))

        tk.Frame(body, bg=P["divider"], height=1).pack(fill="x", pady=(18, 14))

        tk.Label(body, text="배경 모니터", bg=P["card"], fg=P["text2"], font=(FONT, 9, "bold")).pack(anchor="w")
        monitor_row = tk.Frame(body, bg=P["card"])
        monitor_row.pack(fill="x", pady=(8, 0))

        self.monitor_button = tk.Menubutton(
            monitor_row,
            textvariable=self.monitor_var,
            bg=P["ghost_bg"],
            fg=P["text"],
            activebackground=P["ghost_hv"],
            activeforeground=P["text"],
            relief="flat",
            bd=0,
            highlightthickness=1,
            highlightbackground=P["border"],
            highlightcolor=P["border"],
            anchor="w",
            padx=12,
            pady=10,
            font=(FONT, 10),
            direction="below",
        )
        self.monitor_button.pack(side="left", fill="x", expand=True)
        self.monitor_menu = tk.Menu(
            self.monitor_button,
            tearoff=0,
            bg=P["card"],
            fg=P["text"],
            activebackground=P["primary"],
            activeforeground="#FFFFFF",
            relief="flat",
            bd=1,
        )
        self.monitor_button.configure(menu=self.monitor_menu)

        self.btn_refresh = RButton(
            monitor_row,
            "갱신",
            self.on_refresh_running,
            bg=P["ghost_bg"],
            fg=P["primary_dk"],
            hover=P["ghost_hv"],
            parent_bg=P["card"],
            width=68,
            height=40,
            radius=12,
            font_size=10,
        )
        self.btn_refresh.pack(side="left", padx=(8, 0))

        tk.Label(body, text="모니터가 하나뿐이면 브라우저 미리보기로 열 수 있습니다.", bg=P["card"], fg=P["text3"], font=(FONT, 8)).pack(anchor="w", pady=(8, 0))

        tk.Frame(body, bg=P["divider"], height=1).pack(fill="x", pady=(18, 14))

        button_row = tk.Frame(body, bg=P["card"])
        button_row.pack(fill="x")

        self.btn_start = RButton(button_row, "배경 실행", self.on_start_wallpaper, bg=P["primary"], fg="#FFFFFF", hover=P["primary_dk"], parent_bg=P["card"], width=154, height=46, radius=14, font_size=11)
        self.btn_start.pack(side="left")

        self.btn_browser = RButton(button_row, "브라우저", self.on_start_browser, bg=P["ghost_bg"], fg=P["ghost_fg"], hover=P["ghost_hv"], parent_bg=P["card"], width=108, height=46, radius=14, font_size=10)
        self.btn_browser.pack(side="left", padx=(8, 0))

        self.btn_stop = RButton(button_row, "중지", self.on_stop_all, bg=P["danger_bg"], fg=P["danger_fg"], hover=P["danger_hv"], parent_bg=P["card"], width=92, height=46, radius=14, font_size=10)
        self.btn_stop.pack(side="left", padx=(8, 0))

        footer = tk.Frame(body, bg=P["card"])
        footer.pack(fill="x", side="bottom", pady=(18, 0))
        self._link(footer, "업데이트 확인", self.on_check_updates).pack(side="left", padx=(12, 0))
        self._link(footer, "채널 전환", self.on_toggle_update_channel).pack(side="left", padx=(12, 0))
        self._link(footer, "로그 폴더", self.open_log_folder).pack(side="left", padx=(12, 0))

        self._link(footer, "데이터 폴더", self.open_data_folder).pack(side="left")
        self._link(footer, "index.html 열기", self.open_index_file).pack(side="left", padx=(12, 0))
        tk.Label(footer, textvariable=self.footer_var, bg=P["card"], fg=P["text3"], font=(FONT, 8)).pack(side="right")

    def _link(self, parent, text: str, command):
        label = tk.Label(parent, text=text, bg=P["card"], fg=P["text3"], font=(FONT, 9), cursor="hand2")
        label.bind("<Enter>", lambda _event: label.configure(fg=P["primary_dk"]))
        label.bind("<Leave>", lambda _event: label.configure(fg=P["text3"]))
        label.bind("<Button-1>", lambda _event: command())
        return label

    def _set_pill(self, pill: Pill, tone: str, text: str) -> None:
        tones = {
            "ok": (P["ok_bg"], P["ok_fg"]),
            "warn": (P["warn_bg"], P["warn_fg"]),
            "off": (P["off_bg"], P["off_fg"]),
            "info": (P["primary_lt"], P["primary_dk"]),
        }
        bg, fg = tones.get(tone, tones["off"])
        pill.set(text, bg, fg)

    def _set_busy(self, busy: bool, msg: str = "", detail: str = "") -> None:
        self._busy = busy
        enabled = not busy
        for button in (self.btn_start, self.btn_browser, self.btn_stop, self.btn_refresh):
            button.set_enabled(enabled)
        if busy:
            if msg:
                self.status_var.set(msg)
            self.detail_var.set(detail)
            try:
                self.root.update_idletasks()
            except tk.TclError:
                pass

    def set_status(self, msg: str, detail: str | None = None) -> None:
        self.status_var.set(msg)
        if detail is not None:
            self.detail_var.set(detail)
        try:
            self.root.update_idletasks()
        except tk.TclError:
            pass

    @staticmethod
    def _label(item: dict) -> str:
        monitor = int(item.get("monitor") or 0)
        width = int(item.get("width") or 0)
        height = int(item.get("height") or 0)
        suffix = " · 주 모니터" if item.get("primary") else ""
        return f"모니터 {monitor} · {width}x{height}{suffix}"

    def _pick_best(self, candidates: list[dict], previous: dict | None = None) -> dict | None:
        previous_device = str(backend.monitor_signature(previous).get("device") or "")
        stored_device = str(self.settings.get("preferred_monitor_device") or "")
        stored_bounds = self.settings.get("preferred_monitor_bounds") or {}
        stored_monitor = int(self.settings.get("preferred_monitor", 0) or 0)

        for item in candidates:
            if previous_device and backend.match_monitor(item, device=previous_device):
                return item
        for item in candidates:
            if stored_device and backend.match_monitor(item, device=stored_device):
                return item
        for item in candidates:
            if stored_bounds and backend.match_monitor(item, bounds=stored_bounds):
                return item
        for item in candidates:
            if stored_monitor and backend.match_monitor(item, legacy_monitor=stored_monitor):
                return item

        secondary = next((item for item in candidates if not item.get("primary")), None)
        return secondary or (candidates[0] if candidates else None)

    def _persist_monitor_signature(self, monitor: dict | None) -> None:
        if not monitor:
            return
        signature = backend.monitor_signature(monitor)
        self.settings["preferred_monitor"] = int(signature.get("monitor") or 0)
        self.settings["preferred_monitor_device"] = str(signature.get("device") or "")
        self.settings["preferred_monitor_bounds"] = backend.monitor_bounds_signature(signature)
        self.settings["preferred_monitor_primary"] = bool(signature.get("primary"))
        try:
            backend.save_launcher_settings(self.settings)
            self._last_settings_error = ""
        except Exception as exc:  # noqa: BLE001
            self._last_settings_error = str(exc)
            self._log_exception("failed to save launcher settings", exc)

    def _apply_monitors(self, monitors: list[dict]) -> None:
        previous = self.monitor_map.get(self.monitor_var.get())
        self.monitors = monitors or []
        self.monitor_map = {}

        labels: list[str] = []
        for item in self.monitors:
            label = self._label(item)
            labels.append(label)
            self.monitor_map[label] = item

        self.monitor_menu.delete(0, "end")
        for label in labels:
            self.monitor_menu.add_radiobutton(
                label=label,
                value=label,
                variable=self.monitor_var,
                command=self.save_monitor_setting,
            )

        best = self._pick_best(self.monitors, previous)
        selected_label = next(
            (
                label
                for label, item in self.monitor_map.items()
                if backend.monitor_signature(item) == backend.monitor_signature(best)
            ),
            labels[0] if labels else "사용 가능한 모니터 없음",
        )
        self.monitor_var.set(selected_label)

    def get_selected_monitor(self) -> dict | None:
        selected = self.monitor_map.get(self.monitor_var.get())
        return backend.monitor_signature(selected) if selected else None

    def save_monitor_setting(self) -> None:
        self._persist_monitor_signature(self.get_selected_monitor())

    def _apply_status_snapshot(self, bridge: dict | None, wallpaper: dict | None, browser: dict | None) -> None:
        wallpaper = wallpaper or {}
        browser = browser or {}
        bridge_ok = bool(bridge and bridge.get("ok"))
        wallpaper_running = bool(wallpaper.get("running") or wallpaper.get("host_running"))
        browser_running = bool(browser.get("running"))
        if bridge_ok:
            self._initial_bridge_error = ""

        self._last_snapshot = {
            "bridge": bridge or {},
            "wallpaper": wallpaper,
            "browser": browser,
        }

        self._set_pill(self.pill_storage, "ok" if bridge_ok else "warn", "저장소 준비" if bridge_ok else "저장소 대기")
        self._set_pill(self.pill_wall, "ok" if wallpaper_running else "off", "배경 실행" if wallpaper_running else "배경 중지")
        self._set_pill(self.pill_browser, "ok" if browser_running else "off", "브라우저 실행" if browser_running else "브라우저 중지")

        if self._busy:
            return

        if wallpaper_running:
            device = str(wallpaper.get("selected_monitor_device") or "").replace("\\\\.\\", "")
            monitor = wallpaper.get("selected_monitor") or wallpaper.get("requested_monitor")
            target = device or (f"모니터 {monitor}" if monitor else "선택한 모니터")
            self._set_pill(self.pill_status, "ok", "배경 실행 중")
            self.set_status(f"{target}에서 배경이 실행 중입니다.", str(wallpaper.get("url") or "바탕화면 모드가 정상 동작 중입니다."))
            return

        if browser_running:
            self._set_pill(self.pill_status, "info", "브라우저 보기")
            if browser.get("attached") is False:
                self.set_status("기본 브라우저로 미리보기를 열었습니다.", str(browser.get("url") or "기본 브라우저 탭에서 LivelySam을 열었습니다."))
            else:
                self.set_status("브라우저 미리보기가 실행 중입니다.", str(browser.get("url") or "브라우저에서 LivelySam을 열어 두었습니다."))
            return

        if bridge_ok:
            last_message = str((wallpaper.get("last_result") or {}).get("message") or "")
            self._set_pill(self.pill_status, "off", "대기 중")
            self.set_status("실행 대기 상태입니다.", last_message or "모니터를 선택한 뒤 배경 실행을 누르시면 됩니다.")
            return

        self._set_pill(self.pill_status, "warn", "준비 중")
        self.set_status("로컬 저장소 브리지를 준비 중입니다.", "처음 실행 시 몇 초 정도 걸릴 수 있습니다.")

    def request_refresh(self, include_monitors: bool = True) -> None:
        if self._closed:
            return
        if self._refresh_running:
            self._refresh_pending = self._refresh_pending or include_monitors
            return

        self._refresh_running = True
        self._refresh_pending = False

        def work():
            return {
                "monitors": backend.list_monitors() if include_monitors else None,
                "bridge": backend.get_storage_bridge_health(),
                "wallpaper": backend.get_wallpaper_status(),
                "browser": backend.get_browser_status(),
            }

        def done(snapshot, error):
            self._refresh_running = False
            rerun_with_monitors = self._refresh_pending
            self._refresh_pending = False

            if error:
                self._log_exception("status refresh failed", error)
                if not self._busy:
                    self._set_pill(self.pill_status, "warn", "오류")
                    self.set_status("실행기 상태 확인에 실패했습니다.", str(error))
                if rerun_with_monitors:
                    self.request_refresh(include_monitors=True)
                return

            if snapshot.get("monitors") is not None:
                self._apply_monitors(snapshot["monitors"])
            self._apply_status_snapshot(snapshot.get("bridge"), snapshot.get("wallpaper"), snapshot.get("browser"))

            if rerun_with_monitors:
                self.request_refresh(include_monitors=True)

        self._run_async(work, done)

    def _resolve_monitor_choice(self, candidates: list[dict]) -> dict | None:
        selected = self.get_selected_monitor()
        if selected:
            for item in candidates:
                if backend.monitor_signature(item) == selected:
                    return backend.monitor_signature(item)
        best = self._pick_best(candidates, selected)
        return backend.monitor_signature(best) if best else None

    def _tick(self) -> None:
        if self._closed:
            return
        if not self._busy:
            self.request_refresh(include_monitors=True)
        self.root.after(5000, self._tick)

    def on_start_wallpaper(self) -> None:
        if self._busy:
            return

        selected = self.get_selected_monitor()
        self.save_monitor_setting()
        self._set_busy(True, "배경 모드를 시작하는 중입니다.", "잠시만 기다려 주십시오.")

        def work():
            backend.ensure_storage_bridge()
            try:
                backend.stop_browser_preview()
            except Exception as exc:  # noqa: BLE001
                self._log_warning("failed to stop browser preview before wallpaper start", exc)

            monitor = selected
            if not monitor:
                monitor = self._resolve_monitor_choice(backend.list_monitors())

            if not monitor:
                browser_result = backend.start_browser_preview()
                return {
                    "mode": "browser_fallback",
                    "result": browser_result,
                    "message": "사용 가능한 모니터를 찾지 못해 브라우저 미리보기로 전환했습니다.",
                }

            result = backend.start_wallpaper(
                int(monitor.get("monitor") or 0),
                preferred_monitor_device=str(monitor.get("device") or ""),
                preferred_monitor_bounds=backend.monitor_bounds_signature(monitor),
                preferred_monitor_primary=1 if monitor.get("primary") else 0,
            )
            if result.returncode == 0:
                return {"mode": "wallpaper", "result": result, "monitor": monitor}

            browser_result = backend.start_browser_preview()
            return {
                "mode": "browser_fallback",
                "result": browser_result,
                "message": (result.stderr or result.stdout or "").strip(),
            }

        def done(payload, error):
            self._set_busy(False)
            if error:
                messagebox.showerror("실행 실패", str(error))
                self.request_refresh()
                return

            mode = str(payload.get("mode") or "")
            result = payload.get("result")
            if mode == "wallpaper" and result and result.returncode == 0:
                monitor = payload.get("monitor")
                self._persist_monitor_signature(monitor)
                target = f"모니터 {int(monitor.get('monitor') or 0)}" if monitor else "선택한 모니터"
                self.set_status("배경 실행을 완료했습니다.", f"{target}에 LivelySam을 연결했습니다.")
                self.request_refresh()
                return

            if mode == "browser_fallback" and result:
                detail = str(payload.get("message") or "배경 실행이 실패하여 브라우저 미리보기로 전환했습니다.")
                if result.returncode == 0:
                    self.set_status("브라우저 미리보기로 전환했습니다.", detail)
                    self.request_refresh()
                    return
                messagebox.showerror("실행 실패", detail or "브라우저 미리보기도 실행하지 못했습니다.")
                self.request_refresh()
                return

            self.request_refresh()

        self._run_async(work, done)

    def on_start_browser(self) -> None:
        if self._busy:
            return

        self.save_monitor_setting()
        self._set_busy(True, "브라우저 미리보기를 여는 중입니다.", "")

        def work():
            backend.ensure_storage_bridge()
            try:
                backend.stop_wallpaper()
            except Exception as exc:  # noqa: BLE001
                self._log_warning("failed to stop wallpaper before browser preview start", exc)
            return backend.start_browser_preview()

        def done(result, error):
            self._set_busy(False)
            if error:
                messagebox.showerror("브라우저 실행 실패", str(error))
                self.request_refresh()
                return
            if result.returncode != 0:
                messagebox.showerror("브라우저 실행 실패", (result.stderr or result.stdout or "").strip() or "실행 실패")
                self.request_refresh()
                return
            self.set_status("브라우저 미리보기를 열었습니다.", "")
            self.request_refresh()

        self._run_async(work, done)

    def on_stop_all(self) -> None:
        if self._busy:
            return

        self._set_busy(True, "실행 중인 항목을 정리하는 중입니다.", "")

        def work():
            errors: list[str] = []
            try:
                wallpaper = backend.stop_wallpaper()
                if wallpaper.returncode != 0:
                    errors.append((wallpaper.stderr or wallpaper.stdout or "배경 중지 실패").strip())
            except Exception as exc:  # noqa: BLE001
                errors.append(str(exc))
            try:
                browser = backend.stop_browser_preview()
                if browser.returncode != 0:
                    errors.append((browser.stderr or browser.stdout or "브라우저 중지 실패").strip())
            except Exception as exc:  # noqa: BLE001
                errors.append(str(exc))
            return errors

        def done(errors, error):
            self._set_busy(False)
            if error:
                messagebox.showerror("중지 실패", str(error))
            elif errors:
                messagebox.showwarning("일부 중지 실패", "\n\n".join(errors))
            else:
                self.set_status("실행 중인 항목을 모두 중지했습니다.", "")
            self.request_refresh()

        self._run_async(work, done)

    def on_refresh_running(self) -> None:
        if self._busy:
            return

        snapshot = self._last_snapshot or {}
        wallpaper = snapshot.get("wallpaper") or {}
        browser = snapshot.get("browser") or {}
        wallpaper_running = bool(wallpaper.get("running") or wallpaper.get("host_running"))
        browser_running = bool(browser.get("running"))

        if not wallpaper_running and not browser_running:
            self.set_status("새로 고칠 실행 대상이 없습니다.", "현재 실행 중인 배경 또는 브라우저 미리보기가 없습니다.")
            self.request_refresh()
            return

        selected = self.get_selected_monitor()
        self.save_monitor_setting()
        self._set_busy(True, "실행 상태를 새로 고치는 중입니다.", "잠시만 기다려 주십시오.")

        def work():
            try:
                backend.stop_wallpaper()
            except Exception as exc:  # noqa: BLE001
                self._log_warning("failed to stop wallpaper before refresh restart", exc)
            try:
                backend.stop_browser_preview()
            except Exception as exc:  # noqa: BLE001
                self._log_warning("failed to stop browser preview before refresh restart", exc)
            backend.ensure_storage_bridge()

            if wallpaper_running:
                monitor = selected
                if not monitor:
                    monitor = self._resolve_monitor_choice(backend.list_monitors())
                if not monitor:
                    return {"mode": "none", "message": "사용 가능한 모니터를 찾지 못했습니다."}
                result = backend.start_wallpaper(
                    int(monitor.get("monitor") or 0),
                    preferred_monitor_device=str(monitor.get("device") or ""),
                    preferred_monitor_bounds=backend.monitor_bounds_signature(monitor),
                    preferred_monitor_primary=1 if monitor.get("primary") else 0,
                )
                return {"mode": "wallpaper", "result": result, "monitor": monitor}

            result = backend.start_browser_preview()
            return {"mode": "browser", "result": result}

        def done(payload, error):
            self._set_busy(False)
            if error:
                self.set_status("새로 고침 실패", str(error))
                self.request_refresh()
                return

            mode = str(payload.get("mode") or "")
            result = payload.get("result")
            if mode == "wallpaper" and result and result.returncode == 0:
                monitor = payload.get("monitor")
                self._persist_monitor_signature(monitor)
                self.set_status("배경을 다시 연결했습니다.", f"모니터 {int(monitor.get('monitor') or 0)} 기준으로 재시작했습니다.")
            elif mode == "browser" and result and result.returncode == 0:
                self.set_status("브라우저 미리보기를 다시 열었습니다.", "")
            elif mode == "none":
                self.set_status("새로 고침 완료", str(payload.get("message") or ""))
            else:
                detail = ""
                if result is not None:
                    detail = (result.stderr or result.stdout or "").strip()
                self.set_status("새로 고침 실패", detail or "실행 상태를 다시 시작하지 못했습니다.")
            self.request_refresh()

        self._run_async(work, done)

    def open_data_folder(self) -> None:
        backend.APPDATA_DIR.mkdir(parents=True, exist_ok=True)
        try:
            os.startfile(str(backend.APPDATA_DIR))
        except Exception as exc:  # noqa: BLE001
            self._log_exception("failed to open data folder", exc)
            messagebox.showerror("열기 실패", str(exc))

    def open_index_file(self) -> None:
        try:
            backend.ensure_storage_bridge()
        except Exception as exc:  # noqa: BLE001
            self._log_exception("failed to open index.html because storage bridge setup failed", exc)
            messagebox.showerror("열기 실패", f"로컬 저장소 브리지를 준비하지 못했습니다.\n{exc}")
            return
        webbrowser.open((backend.ROOT_PATH / "index.html").as_uri())

    def open_log_folder(self) -> None:
        self._log_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.startfile(str(self._log_path.parent))
        except Exception as exc:  # noqa: BLE001
            self._log_exception("failed to open launcher log folder", exc)
            messagebox.showerror("로그 열기 실패", str(exc))

    def on_close(self) -> None:
        self._closed = True
        try:
            self.root.destroy()
        except tk.TclError as exc:
            self._log_warning("launcher window close raised TclError", exc)


def main() -> int:
    root = tk.Tk()
    LauncherApp(root)
    root.mainloop()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

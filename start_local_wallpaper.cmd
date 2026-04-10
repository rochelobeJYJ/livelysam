@echo off
setlocal
set ROOT=%~dp0

if not exist "%ROOT%venv\Scripts\pythonw.exe" (
  echo pythonw.exe not found in venv\Scripts
  exit /b 1
)

start "" "%ROOT%venv\Scripts\pythonw.exe" "%ROOT%tools\desktop_wallpaper_host.py" start
exit /b 0

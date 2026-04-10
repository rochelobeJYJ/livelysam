@echo off
setlocal
set ROOT=%~dp0

if not exist "%ROOT%venv\Scripts\python.exe" (
  echo python.exe not found in venv\Scripts
  exit /b 1
)

"%ROOT%venv\Scripts\python.exe" "%ROOT%tools\desktop_wallpaper_host.py" stop
exit /b %errorlevel%

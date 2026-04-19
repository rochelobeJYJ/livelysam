@echo off
setlocal
set "ROOT=%~dp0"
set "ROOT_ARG=%~dp0."

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%tools\start_local_wallpaper.ps1" -Root "%ROOT_ARG%" -PreferredMonitor 0
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -Command "Start-Sleep -Seconds 5"
exit /b 0

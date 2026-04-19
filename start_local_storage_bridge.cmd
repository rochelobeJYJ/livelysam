@echo off
setlocal
set "ROOT=%~dp0"
set "ROOT_ARG=%~dp0."

if not exist "%ROOT%tools\ensure_local_storage_bridge.ps1" (
  echo ensure_local_storage_bridge.ps1 not found
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%tools\ensure_local_storage_bridge.ps1" -Root "%ROOT_ARG%"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
exit /b 0

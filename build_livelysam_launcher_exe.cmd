@echo off
setlocal
set "ROOT=%~dp0"
set "ROOT_ARG=%~dp0."

if not exist "%ROOT%tools\build_livelysam_launcher_exe.ps1" (
  echo build_livelysam_launcher_exe.ps1 not found
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%tools\build_livelysam_launcher_exe.ps1" -Root "%ROOT_ARG%"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
exit /b 0

@echo off
setlocal
set "ROOT=%~dp0"
set "ROOT_ARG=%~dp0."

if not exist "%ROOT%tools\local_wallpaper_host.ps1" (
  echo local_wallpaper_host.ps1 not found
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%tools\local_wallpaper_host.ps1" stop -Root "%ROOT_ARG%"
exit /b %errorlevel%

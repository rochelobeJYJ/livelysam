@echo off
setlocal
set "ROOT=%~dp0"
set "VBS=%ROOT%start_livelysam_launcher.vbs"
set "ROOT_EXE=%ROOT%LivelySamLauncher.exe"
set "EXE=%ROOT%dist\launcher\LivelySamLauncher.exe"
set "PYTHON=%ROOT%venv\Scripts\python.exe"
set "SCRIPT=%ROOT%tools\livelysam_launcher_compact.py"

if exist "%VBS%" (
  start "" wscript.exe "%VBS%"
  exit /b 0
)

if exist "%ROOT_EXE%" (
  start "" "%ROOT_EXE%"
  exit /b 0
)

if exist "%EXE%" (
  start "" "%EXE%"
  exit /b 0
)

if not exist "%PYTHON%" (
  echo python.exe not found in venv\Scripts
  pause
  exit /b 1
)

if not exist "%SCRIPT%" (
  echo livelysam_launcher_compact.py not found
  pause
  exit /b 1
)

start "" "%PYTHON%" "%SCRIPT%"
exit /b 0

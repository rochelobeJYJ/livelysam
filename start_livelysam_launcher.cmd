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

if exist "%PYTHON%" if exist "%SCRIPT%" (
  start "" "%PYTHON%" "%SCRIPT%"
  exit /b 0
)

echo python.exe or launcher executable not found
pause
exit /b 1

exit /b 0

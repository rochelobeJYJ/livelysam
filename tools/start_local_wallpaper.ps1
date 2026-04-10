param(
    [Parameter(Mandatory = $true)]
    [string]$Root
)

$ErrorActionPreference = "Stop"

$rootPath = [System.IO.Path]::GetFullPath($Root)
$pythonPath = Join-Path $rootPath "venv\Scripts\python.exe"
$pythonwPath = Join-Path $rootPath "venv\Scripts\pythonw.exe"
$hostScript = Join-Path $rootPath "tools\desktop_wallpaper_host.py"
$runtimeDir = Join-Path $rootPath "runtime\desktop-host"
$stateFile = Join-Path $runtimeDir "state.json"
$resultFile = Join-Path $runtimeDir "last-result.json"
$logFile = Join-Path $runtimeDir "host.log"

function Read-JsonFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    try {
        return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Test-PidRunning {
    param([int]$ProcessId)

    if ($ProcessId -le 0) {
        return $false
    }

    return $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

if (-not (Test-Path -LiteralPath $pythonPath)) {
    Write-Host "[LivelySam] python.exe not found in venv\Scripts" -ForegroundColor Red
    exit 1
}

$hostPythonPath = $pythonPath
if (Test-Path -LiteralPath $pythonwPath) {
    $hostPythonPath = $pythonwPath
}

$existingState = Read-JsonFile -Path $stateFile
if ($existingState -and (Test-PidRunning -Pid ([int]$existingState.host_pid))) {
    Write-Host "[LivelySam] already running." -ForegroundColor Yellow
    Write-Host "stop_local_wallpaper.cmd 로 먼저 종료한 뒤 다시 실행하세요."
    Write-Host ""
    & $pythonPath $hostScript status
    exit 0
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Remove-Item -LiteralPath $resultFile -Force -ErrorAction SilentlyContinue

Start-Process -FilePath $hostPythonPath -ArgumentList @($hostScript, "start") -WindowStyle Minimized

$deadline = (Get-Date).AddSeconds(20)
$attached = $false
$failureMessage = $null

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500

    $state = Read-JsonFile -Path $stateFile
    if ($state -and $state.attached) {
        $attached = $true
        break
    }

    $result = Read-JsonFile -Path $resultFile
    if ($result -and $result.status -eq "running" -and $result.attached) {
        $attached = $true
        break
    }

    if ($result -and $result.status -eq "failed") {
        $failureMessage = $result.error
        break
    }
}

if ($attached) {
    $state = Read-JsonFile -Path $stateFile
    Write-Host "[LivelySam] 배경화면 실행 완료" -ForegroundColor Green
    Write-Host "중지: stop_local_wallpaper.cmd"
    if ($state.url) {
        Write-Host "주소: $($state.url)"
    }
    if ($state.browser_path) {
        Write-Host "브라우저: $($state.browser_path)"
    }
    exit 0
}

if (-not $failureMessage) {
    $result = Read-JsonFile -Path $resultFile
    if ($result -and $result.error) {
        $failureMessage = $result.error
    } else {
        $failureMessage = "Timed out waiting for the wallpaper window to attach."
    }
}

Write-Host "[LivelySam] 배경화면 시작 실패" -ForegroundColor Red
Write-Host "오류: $failureMessage"
Write-Host "로그: $logFile"
exit 1

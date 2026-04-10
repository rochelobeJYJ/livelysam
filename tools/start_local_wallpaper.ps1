param(
    [Parameter(Mandatory = $true)]
    [string]$Root
)

$ErrorActionPreference = "Stop"

$rootPath = [System.IO.Path]::GetFullPath($Root)
$hostScript = Join-Path $rootPath "tools\local_wallpaper_host.ps1"
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

if (-not (Test-Path -LiteralPath $hostScript)) {
    Write-Host "[LivelySam] local_wallpaper_host.ps1 not found" -ForegroundColor Red
    exit 1
}

$existingState = Read-JsonFile -Path $stateFile
if ($existingState -and (Test-PidRunning -ProcessId ([int]$existingState.host_pid))) {
    Write-Host "[LivelySam] already running." -ForegroundColor Yellow
    Write-Host "Stop it with stop_local_wallpaper.cmd and run it again."
    Write-Host ""
    & powershell -NoProfile -ExecutionPolicy Bypass -File $hostScript status -Root $rootPath
    exit 0
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Remove-Item -LiteralPath $resultFile -Force -ErrorAction SilentlyContinue

Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-STA",
    "-ExecutionPolicy", "Bypass",
    "-WindowStyle", "Hidden",
    "-File", $hostScript,
    "start",
    "-Root", $rootPath
) -WindowStyle Hidden

$deadline = (Get-Date).AddSeconds(25)
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
    Write-Host "[LivelySam] wallpaper host started" -ForegroundColor Green
    Write-Host "Stop: stop_local_wallpaper.cmd"
    if ($state.url) {
        Write-Host "URL: $($state.url)"
    }
    if ($state.renderer) {
        Write-Host "Renderer: $($state.renderer)"
    }
    exit 0
}

if (-not $failureMessage) {
    $result = Read-JsonFile -Path $resultFile
    if ($result -and $result.error) {
        $failureMessage = $result.error
    } else {
        $failureMessage = "Timed out waiting for the wallpaper host to attach."
    }
}

Write-Host "[LivelySam] wallpaper host failed to start" -ForegroundColor Red
Write-Host "Error: $failureMessage"
Write-Host "Log: $logFile"
exit 1

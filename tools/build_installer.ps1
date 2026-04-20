param(
    [string]$Root = (Join-Path $PSScriptRoot ".."),
    [string]$CompilerPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$rootPath = [System.IO.Path]::GetFullPath($Root)
$syncScript = Join-Path $rootPath "tools\sync_release_metadata.ps1"
$signScript = Join-Path $rootPath "tools\sign_windows_artifacts.ps1"
$installerScript = Join-Path $rootPath "release\installer\LivelySam.iss"
$outputDir = Join-Path $rootPath "dist\installer"
$versionPath = Join-Path $rootPath "version.json"

if (-not (Test-Path -LiteralPath $syncScript)) {
    throw "sync_release_metadata.ps1 not found."
}
if (-not (Test-Path -LiteralPath $installerScript)) {
    throw "LivelySam.iss not found."
}
if (-not (Test-Path -LiteralPath $versionPath)) {
    throw "version.json not found."
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -Root $rootPath | Out-Null

if ([string]::IsNullOrWhiteSpace($CompilerPath)) {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
        (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    $command = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($command) {
        $candidates = @($command.Source) + $candidates
    }

    $CompilerPath = $candidates | Select-Object -First 1
}

if (-not $CompilerPath -or -not (Test-Path -LiteralPath $CompilerPath)) {
    throw "ISCC.exe not found. Install Inno Setup 6 or pass -CompilerPath."
}

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

& $CompilerPath "/Qp" $installerScript
if ($LASTEXITCODE -ne 0) {
    throw "Installer build failed."
}

$versionInfo = Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8 | ConvertFrom-Json
$installerBaseName = if ([string]::IsNullOrWhiteSpace([string]$versionInfo.installerBaseName)) { "LivelySamSetup" } else { [string]$versionInfo.installerBaseName }
$installerVersion = [string]$versionInfo.version
$installerPath = Join-Path $outputDir ("{0}-{1}.exe" -f $installerBaseName, $installerVersion)
if (-not (Test-Path -LiteralPath $installerPath)) {
    throw "Expected installer artifact was not found: $installerPath"
}

if (Test-Path -LiteralPath $signScript) {
    & $signScript -Files @($installerPath) -Description "LivelySam installer" | Out-Null
}

Write-Host "Installer build complete: $outputDir"

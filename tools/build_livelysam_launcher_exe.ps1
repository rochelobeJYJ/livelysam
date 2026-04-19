param(
    [string]$Root = (Join-Path $PSScriptRoot "..")
)

$ErrorActionPreference = "Stop"

$rootPath = [System.IO.Path]::GetFullPath($Root)
$pythonPath = Join-Path $rootPath "venv\Scripts\python.exe"
$toolsDir = Join-Path $rootPath "tools"
$distDir = Join-Path $rootPath "dist\launcher"
$workDir = Join-Path $rootPath "build\launcher"

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "python.exe not found in venv\Scripts."
}

New-Item -ItemType Directory -Path $distDir -Force | Out-Null
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

function Invoke-PyInstallerBuild {
    param(
        [string]$Name,
        [string]$EntryScript,
        [switch]$Windowed
    )

    $entryPath = Join-Path $toolsDir $EntryScript
    if (-not (Test-Path -LiteralPath $entryPath)) {
        throw "$EntryScript not found."
    }

    $args = @(
        "-m", "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name", $Name,
        "--distpath", $distDir,
        "--workpath", $workDir,
        "--specpath", $workDir
    )

    if ($Windowed) {
        $args += "--windowed"
    }

    $args += $entryPath

    & $pythonPath @args
    if ($LASTEXITCODE -ne 0) {
        throw "$Name build failed."
    }
}

Invoke-PyInstallerBuild -Name "LivelySamLauncher" -EntryScript "livelysam_launcher_compact.py" -Windowed
Invoke-PyInstallerBuild -Name "BrowserPreviewHost" -EntryScript "browser_preview_host.py"
Invoke-PyInstallerBuild -Name "LocalStorageBridge" -EntryScript "local_storage_bridge.py"

$artifacts = @(
    "LivelySamLauncher.exe",
    "BrowserPreviewHost.exe",
    "LocalStorageBridge.exe"
)

$copyWarnings = @()
foreach ($artifact in $artifacts) {
    $artifactPath = Join-Path $distDir $artifact
    if (-not (Test-Path -LiteralPath $artifactPath)) {
        throw "$artifact was not created."
    }
    try {
        Copy-Item -LiteralPath $artifactPath -Destination (Join-Path $rootPath $artifact) -Force
    } catch {
        $copyWarnings += "$artifact root copy skipped: $($_.Exception.Message)"
    }
}

Write-Host "Build complete: $distDir"
if ($copyWarnings.Count -eq 0) {
    Write-Host "Root copies: $($artifacts -join ', ')"
} else {
    Write-Warning "Artifacts were built successfully, but some root copies could not be replaced."
    foreach ($warning in $copyWarnings) {
        Write-Warning $warning
    }
}

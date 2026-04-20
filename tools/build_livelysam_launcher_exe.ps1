param(
    [string]$Root = (Join-Path $PSScriptRoot "..")
)

$ErrorActionPreference = "Stop"

$rootPath = [System.IO.Path]::GetFullPath($Root)
$pythonPath = Join-Path $rootPath "venv\Scripts\python.exe"
$toolsDir = Join-Path $rootPath "tools"
$distDir = Join-Path $rootPath "dist\launcher"
$workDir = Join-Path $rootPath "build\launcher"
$logDir = Join-Path $rootPath "runtime\launcher-build"
$launcherIconPath = Join-Path $rootPath "assets\icons\livelysam_launcher.ico"

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "python.exe not found in venv\Scripts."
}

New-Item -ItemType Directory -Path $distDir -Force | Out-Null
New-Item -ItemType Directory -Path $workDir -Force | Out-Null
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

& $pythonPath (Join-Path $toolsDir "generate_launcher_icon.py")
if (-not (Test-Path -LiteralPath $launcherIconPath)) {
    throw "launcher icon was not generated."
}

foreach ($name in @("LivelySamLauncher", "BrowserPreviewHost", "LocalStorageBridge")) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Invoke-PyInstallerBuild {
    param(
        [string]$Name,
        [string]$EntryScript,
        [string[]]$HiddenImports = @(),
        [string]$IconPath = "",
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

    if ($IconPath) {
        if (-not (Test-Path -LiteralPath $IconPath)) {
            throw "Icon path not found: $IconPath"
        }
        $args += @("--icon", $IconPath)
    }

    foreach ($hiddenImport in $HiddenImports) {
        if ($hiddenImport) {
            $args += @("--hidden-import", $hiddenImport)
        }
    }

    $args += $entryPath
    $logStamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
    $logPath = Join-Path $logDir ("{0}-{1}.log" -f $Name, $logStamp)

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $pythonPath @args *> $logPath
    $ErrorActionPreference = $previousErrorActionPreference

    if ($LASTEXITCODE -ne 0) {
        $tail = ""
        if (Test-Path -LiteralPath $logPath) {
            $tail = (Get-Content -LiteralPath $logPath -Tail 40 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
        }
        if ($tail) {
            throw "$Name build failed.`n`n$tail"
        }
        throw "$Name build failed."
    }

    Write-Host "$Name build log: $logPath"
}

Invoke-PyInstallerBuild -Name "LivelySamLauncher" -EntryScript "livelysam_launcher_compact.py" -Windowed -IconPath $launcherIconPath -HiddenImports @(
    "tools.browser_preview_host",
    "tools.generate_minigame_catalog",
    "webbrowser"
)
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

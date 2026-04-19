param(
    [string]$Root = (Join-Path $PSScriptRoot ".."),
    [int]$Port = 58671
)

$ErrorActionPreference = "Stop"

$rootPath = [System.IO.Path]::GetFullPath($Root)
$bridgeExeCandidates = @(
    (Join-Path $rootPath "dist\launcher\LocalStorageBridge.exe"),
    (Join-Path $rootPath "LocalStorageBridge.exe")
)
$bridgeExePath = $bridgeExeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$pythonPath = Join-Path $rootPath "venv\Scripts\python.exe"
$pythonwPath = Join-Path $rootPath "venv\Scripts\pythonw.exe"
$bridgeScript = Join-Path $rootPath "tools\local_storage_bridge.py"
$isDevLayout = (Test-Path -LiteralPath $bridgeScript) -and (Test-Path -LiteralPath $pythonPath)
$healthUrl = "http://127.0.0.1:$Port/__livelysam__/health"
$apiHealthUrl = "http://127.0.0.1:$Port/api/health"
$googleAuthUrl = "http://127.0.0.1:$Port/__livelysam__/google-auth/status"

function Test-BridgeHealth {
    param([string]$Url)

    try {
        $request = [System.Net.WebRequest]::Create($Url)
        $request.Timeout = 1200
        $response = $request.GetResponse()
        $stream = $response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        $reader.Dispose()
        $stream.Dispose()
        $response.Close()
        return ($body | ConvertFrom-Json)
    } catch {
        return $null
    }
}

function Test-BridgeGoogleAuth {
    param([string]$Url)

    try {
        $request = [System.Net.WebRequest]::Create($Url)
        $request.Timeout = 1200
        $response = $request.GetResponse()
        $stream = $response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        $reader.Dispose()
        $stream.Dispose()
        $response.Close()
        $parsed = $body | ConvertFrom-Json
        return ($parsed.ok -and $null -ne $parsed.status)
    } catch {
        return $false
    }
}

function Stop-BridgeProcess {
    param([int]$BridgePort)

    try {
        $connections = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $BridgePort -State Listen -ErrorAction Stop
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($bridgePid in $pids) {
            if ($bridgePid -and $bridgePid -gt 0) {
                Stop-Process -Id $bridgePid -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {
        $matches = netstat -ano | Select-String "127.0.0.1:$BridgePort\s+.*LISTENING\s+(\d+)"
        foreach ($match in $matches) {
            $bridgePid = [int]$match.Matches[0].Groups[1].Value
            if ($bridgePid -and $bridgePid -gt 0) {
                Stop-Process -Id $bridgePid -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

$health = Test-BridgeHealth -Url $healthUrl
if ($health -and $health.ok) {
    $apiHealth = Test-BridgeHealth -Url $apiHealthUrl
    if ((Test-BridgeGoogleAuth -Url $googleAuthUrl) -and $apiHealth -and $apiHealth.ok) {
        $health | ConvertTo-Json -Depth 5
        exit 0
    }

    Stop-BridgeProcess -BridgePort $Port
    Start-Sleep -Milliseconds 700
}

$bridgeRuntime = $null
$bridgeArguments = @()

if ($bridgeExePath) {
    $bridgeRuntime = $bridgeExePath
    $bridgeArguments = @("--port", "$Port")
} else {
    if (-not $isDevLayout) {
        throw "LocalStorageBridge.exe not found. Reinstall LivelySam or rebuild the launcher artifacts. Checked: $($bridgeExeCandidates -join ', ')"
    }

    $bridgeRuntime = $pythonPath
    if (Test-Path -LiteralPath $pythonwPath) {
        $bridgeRuntime = $pythonwPath
    }
    $bridgeArguments = @($bridgeScript, "--port", "$Port")
}

$process = Start-Process -FilePath $bridgeRuntime -ArgumentList $bridgeArguments -WindowStyle Hidden -PassThru

$deadline = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
    $health = Test-BridgeHealth -Url $healthUrl
    $apiHealth = Test-BridgeHealth -Url $apiHealthUrl
    if ($health -and $health.ok -and $apiHealth -and $apiHealth.ok) {
        [ordered]@{
            ok = $true
            port = $Port
            pid = $process.Id
            storage_path = $health.storage_path
            health_url = $healthUrl
            api_health_url = $apiHealthUrl
        } | ConvertTo-Json -Depth 5
        exit 0
    }
}

throw "Local storage bridge failed to start on port $Port."

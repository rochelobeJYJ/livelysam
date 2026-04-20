param(
    [string]$Root = (Join-Path $PSScriptRoot ".."),
    [int]$Port = 58671
)

$ErrorActionPreference = "Stop"

if (-not $env:SystemRoot) {
    $env:SystemRoot = $env:WINDIR
}

$systemModulePath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\Modules"
if ($systemModulePath -and -not (($env:PSModulePath -split ";") -contains $systemModulePath)) {
    if ($env:PSModulePath) {
        $env:PSModulePath = "$env:PSModulePath;$systemModulePath"
    } else {
        $env:PSModulePath = $systemModulePath
    }
}

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
$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME "AppData\Local" }
$runtimeDir = Join-Path $localAppData "LivelySam\runtime"
$endpointPath = Join-Path $runtimeDir "bridge-endpoint.json"

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

function Get-BridgeHealthUrls {
    param([int]$BridgePort)

    return @{
        health = "http://127.0.0.1:$BridgePort/__livelysam__/health"
        api = "http://127.0.0.1:$BridgePort/api/health"
    }
}

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

function Test-PortAvailable {
    param([int]$BridgePort)

    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $BridgePort)
    try {
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        try {
            $listener.Stop()
        } catch {
        }
    }
}

function Resolve-PortCandidates {
    param(
        [int]$RequestedPort,
        [Nullable[int]]$KnownPort = $null
    )

    $seen = New-Object System.Collections.Generic.HashSet[int]
    $ports = New-Object System.Collections.Generic.List[int]
    foreach ($candidate in @($KnownPort, $RequestedPort, 58671, 58681, 58691)) {
        if ($null -eq $candidate) {
            continue
        }
        $portValue = [int]$candidate
        if ($portValue -le 0) {
            continue
        }
        if ($seen.Add($portValue)) {
            $ports.Add($portValue) | Out-Null
        }
    }
    return $ports
}

function Get-HealthyKnownEndpoint {
    $endpoint = Read-JsonFile -Path $endpointPath
    if (-not $endpoint) {
        return $null
    }

    $bridgePort = [int]($endpoint.port | ForEach-Object { $_ })
    $authToken = [string]($endpoint.auth_token | ForEach-Object { $_ })
    if ($bridgePort -le 0 -or [string]::IsNullOrWhiteSpace($authToken)) {
        return $null
    }

    $urls = Get-BridgeHealthUrls -BridgePort $bridgePort
    $health = Test-BridgeHealth -Url $urls.health
    $apiHealth = Test-BridgeHealth -Url $urls.api
    if ($health -and $health.ok -and $apiHealth -and $apiHealth.ok) {
        return [ordered]@{
            ok = $true
            port = $bridgePort
            pid = [int]($endpoint.pid | ForEach-Object { $_ })
            auth_token = $authToken
            storage_path = $health.storage_path
            health_url = $urls.health
            api_health_url = $urls.api
            origin = "http://127.0.0.1:$bridgePort"
        }
    }

    return $null
}

function Get-HealthyBridgeByPort {
    param([int]$BridgePort)

    if ($BridgePort -le 0) {
        return $null
    }

    $urls = Get-BridgeHealthUrls -BridgePort $BridgePort
    $health = Test-BridgeHealth -Url $urls.health
    $apiHealth = Test-BridgeHealth -Url $urls.api
    if (-not ($health -and $health.ok -and $apiHealth -and $apiHealth.ok)) {
        return $null
    }

    $endpoint = Read-JsonFile -Path $endpointPath
    $authToken = ""
    $bridgePid = 0
    if ($endpoint -and [int]$endpoint.port -eq $BridgePort) {
        $authToken = [string]($endpoint.auth_token | ForEach-Object { $_ })
        $bridgePid = [int]($endpoint.pid | ForEach-Object { $_ })
    }

    return [ordered]@{
        ok = $true
        port = $BridgePort
        pid = $bridgePid
        auth_token = $authToken
        storage_path = $health.storage_path
        health_url = $urls.health
        api_health_url = $urls.api
        origin = "http://127.0.0.1:$BridgePort"
    }
}

function Start-BridgeProcess {
    param([int]$BridgePort)

    if ($isDevLayout) {
        $bridgeRuntime = $pythonPath
        if (Test-Path -LiteralPath $pythonwPath) {
            $bridgeRuntime = $pythonwPath
        }
        return Start-Process -FilePath $bridgeRuntime -ArgumentList @($bridgeScript, "--port", "$BridgePort") -WorkingDirectory $rootPath -WindowStyle Hidden -PassThru
    }

    if ($bridgeExePath) {
        return Start-Process -FilePath $bridgeExePath -ArgumentList @("--port", "$BridgePort") -WorkingDirectory $rootPath -WindowStyle Hidden -PassThru
    }

    throw "LocalStorageBridge.exe not found. Reinstall LivelySam or rebuild the launcher artifacts. Checked: $($bridgeExeCandidates -join ', ')"
}

function Wait-ForBridgeEndpoint {
    param(
        [int]$BridgePort,
        [int]$FallbackPid
    )

    $urls = Get-BridgeHealthUrls -BridgePort $BridgePort
    $deadline = (Get-Date).AddSeconds(12)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 250
        $health = Test-BridgeHealth -Url $urls.health
        $apiHealth = Test-BridgeHealth -Url $urls.api
        $endpoint = Read-JsonFile -Path $endpointPath
        if ($health -and $health.ok -and $apiHealth -and $apiHealth.ok) {
            $authToken = ""
            $resolvedPid = $FallbackPid
            if ($endpoint -and [int]$endpoint.port -eq $BridgePort) {
                $authToken = [string]$endpoint.auth_token
                if ([int]$endpoint.pid -gt 0) {
                    $resolvedPid = [int]$endpoint.pid
                }
            }
            return [ordered]@{
                ok = $true
                port = $BridgePort
                pid = $resolvedPid
                auth_token = $authToken
                storage_path = $health.storage_path
                health_url = $urls.health
                api_health_url = $urls.api
                origin = "http://127.0.0.1:$BridgePort"
            }
        }
    }

    return $null
}

$healthyKnownEndpoint = Get-HealthyKnownEndpoint
if ($healthyKnownEndpoint) {
    $healthyKnownEndpoint | ConvertTo-Json -Depth 5
    exit 0
}

$knownPort = $null
$existingEndpoint = Read-JsonFile -Path $endpointPath
if ($existingEndpoint -and [int]$existingEndpoint.port -gt 0) {
    $knownPort = [int]$existingEndpoint.port
}

$portCandidates = Resolve-PortCandidates -RequestedPort $Port -KnownPort $knownPort
foreach ($candidatePort in $portCandidates) {
    $healthyBridge = Get-HealthyBridgeByPort -BridgePort $candidatePort
    if ($healthyBridge) {
        $healthyBridge | ConvertTo-Json -Depth 5
        exit 0
    }
}

foreach ($candidatePort in $portCandidates) {
    if (-not (Test-PortAvailable -BridgePort $candidatePort)) {
        continue
    }

    $process = Start-BridgeProcess -BridgePort $candidatePort
    $startedEndpoint = Wait-ForBridgeEndpoint -BridgePort $candidatePort -FallbackPid $process.Id
    if ($startedEndpoint) {
        $startedEndpoint | ConvertTo-Json -Depth 5
        exit 0
    }
}

throw "Local storage bridge failed to start. Tried ports: $($portCandidates -join ', ')"

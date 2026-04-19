param(
  [int]$BudgetMs = 12000,
  [string]$BrowserPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pythonExe = Join-Path $root 'venv\Scripts\python.exe'
$runtimeRoot = Join-Path $root 'runtime\review-fix-validation'
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $runtimeRoot $runId
$domPath = Join-Path $runDir 'result.html'
$stderrPath = Join-Path $runDir 'stderr.log'
$summaryPath = Join-Path $runDir 'summary.json'

function New-Directory {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Get-FreePort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try {
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Quote-CmdArg {
  param([string]$Value)
  return '"' + ($Value -replace '"', '""') + '"'
}

function Get-BrowserExecutable {
  param([string]$PreferredPath)

  $candidates = @()
  if ($PreferredPath) {
    $candidates += $PreferredPath
  }
  if ($env:LIVELYSAM_BROWSER_PATH) {
    $candidates += $env:LIVELYSAM_BROWSER_PATH
  }
  $candidates += @(
    (Join-Path ${env:ProgramFiles} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }

  throw 'No supported browser was found. Install Chrome or Edge, or pass -BrowserPath.'
}

function Wait-ForHttp {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 15
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  throw "HTTP server did not become ready in time: $Url"
}

function Get-FriendlyBrowserFailureMessage {
  param(
    [string]$Browser,
    [string]$StderrPath,
    [string]$FallbackMessage
  )

  $stderrText = ''
  if (Test-Path $StderrPath) {
    $stderrText = Get-Content -Path $StderrPath -Raw -ErrorAction SilentlyContinue
  }

  $browserFailureMarkers = @(
    'Access is denied',
    'CreateFile:',
    'crash server failed to launch',
    'platform_channel.cc'
  )

  foreach ($marker in $browserFailureMarkers) {
    if ($stderrText.Contains($marker)) {
      return "Headless browser launch failed because the current environment blocked Chrome/Edge sandbox access. Run this script in a normal local PowerShell session. Browser=$Browser Stderr=$StderrPath"
    }
  }

  if ($stderrText -match 'exit=-(2147483645|36863)') {
    return "Headless browser launch failed because the current environment blocked Chrome/Edge sandbox access. Run this script in a normal local PowerShell session. Browser=$Browser Stderr=$StderrPath"
  }

  return $FallbackMessage
}

New-Directory $runtimeRoot
New-Directory $runDir

if (-not (Test-Path $pythonExe)) {
  throw "Python executable was not found: $pythonExe"
}

$browserExe = Get-BrowserExecutable -PreferredPath $BrowserPath
$port = Get-FreePort
$url = "http://127.0.0.1:$port/tools/review_fix_validation.html?validate=1"
$serverProcess = $null
$status = 'passed'
$errorMessage = $null

try {
  $serverArgs = @('-m', 'http.server', $port, '--bind', '127.0.0.1', '--directory', $root)
  $serverProcess = Start-Process -FilePath $pythonExe -ArgumentList $serverArgs -WorkingDirectory $root -WindowStyle Hidden -PassThru
  Wait-ForHttp -Url $url

  $profileDir = Join-Path $runDir 'profile'
  New-Directory $profileDir

  $browserArgs = @(
    "--user-data-dir=$profileDir",
    '--headless=new',
    '--disable-gpu',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    "--virtual-time-budget=$BudgetMs",
    '--dump-dom',
    $url
  )

  $commandParts = @((Quote-CmdArg $browserExe)) + ($browserArgs | ForEach-Object { Quote-CmdArg $_ }) + @(
    '1>',
    (Quote-CmdArg $domPath),
    '2>',
    (Quote-CmdArg $stderrPath)
  )

  $commandLine = $commandParts -join ' '
  & cmd.exe /d /c $commandLine
  $browserExitCode = if (Test-Path variable:LASTEXITCODE) { $LASTEXITCODE } else { 0 }
  if ($browserExitCode -ne 0) {
    $rawMessage = "Headless browser execution failed. exit=$browserExitCode"
    throw (Get-FriendlyBrowserFailureMessage -Browser $browserExe -StderrPath $stderrPath -FallbackMessage $rawMessage)
  }

  $domText = Get-Content -Path $domPath -Raw -Encoding UTF8
  if ($domText.IndexOf('data-review-status="passed"', [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw 'Review fix validation page did not report passed status.'
  }
} catch {
  $status = 'failed'
  $errorMessage = $_.Exception.Message
} finally {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force
  }

  $summary = [ordered]@{
    status = $status
    checkedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    browser = $browserExe
    url = $url
    runDir = $runDir
    error = $errorMessage
    dom = $domPath
    stderr = $stderrPath
  }

  $summary | ConvertTo-Json -Depth 5 | Set-Content -Path $summaryPath -Encoding UTF8

  if ($status -ne 'passed') {
    Write-Error $errorMessage
    Write-Output ($summary | ConvertTo-Json -Depth 5)
    exit 1
  }

  Write-Output ($summary | ConvertTo-Json -Depth 5)
}

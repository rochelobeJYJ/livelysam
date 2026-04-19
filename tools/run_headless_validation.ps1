param(
  [int]$BudgetMs = 14000,
  [string]$BrowserPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pythonExe = Join-Path $root 'venv\Scripts\python.exe'
$runtimeRoot = Join-Path $root 'runtime\headless-validation'
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $runtimeRoot $runId
$profilesDir = Join-Path $runDir 'profiles'
$domDir = Join-Path $runDir 'dom'
$logDir = Join-Path $runDir 'logs'
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
    (Join-Path ${env:ProgramFiles} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path ${env:ProgramFiles} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
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

function Assert-ContainsAll {
  param(
    [string]$Content,
    [string[]]$Needles,
    [string]$CaseName
  )

  $missing = @()
  foreach ($needle in $Needles) {
    if ($Content.IndexOf($needle, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
      $missing += $needle
    }
  }

  if ($missing.Count -gt 0) {
    throw "Validation failed [$CaseName] - missing markers: $($missing -join ', ')"
  }
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
New-Directory $profilesDir
New-Directory $domDir
New-Directory $logDir

if (-not (Test-Path $pythonExe)) {
  throw "Python executable was not found: $pythonExe"
}

$browserExe = Get-BrowserExecutable -PreferredPath $BrowserPath
$port = Get-FreePort
$serverUrl = "http://127.0.0.1:$port/tools/validation_bootstrap.html"
$serverProcess = $null
$results = @()
$status = 'passed'
$errorMessage = $null

$cases = @(
  @{
    Name = 'month-school'
    View = 'month'
    Preset = 'school'
    Expect = @('cal-cells', 'Weekly Sync', 'SchoolBase', 'weather-summary-card', 'weather-alert-list')
  },
  @{
    Name = 'week-school'
    View = 'week'
    Preset = 'school'
    Expect = @('cal-week-grid', 'Weekly Sync', 'Lesson Review', 'weather-summary-card')
  },
  @{
    Name = 'list-home'
    View = 'list'
    Preset = 'home'
    Expect = @('cal-list-view', 'Midterm Exam', 'HomeBase', 'weather-summary-card', 'weather-alert-list')
  }
)

try {
  $serverArgs = @('-m', 'http.server', $port, '--bind', '127.0.0.1', '--directory', $root)
  $serverProcess = Start-Process -FilePath $pythonExe -ArgumentList $serverArgs -WorkingDirectory $root -WindowStyle Hidden -PassThru
  Wait-ForHttp -Url $serverUrl

  foreach ($case in $cases) {
    $profileDir = Join-Path $profilesDir $case.Name
    New-Directory $profileDir

    $targetUrl = "http://127.0.0.1:$port/tools/validation_bootstrap.html?view=$($case.View)&preset=$($case.Preset)"
    $stderrPath = Join-Path $logDir "$($case.Name).stderr.log"
    $domPath = Join-Path $domDir "$($case.Name).html"

    $browserArgs = @(
      "--user-data-dir=$profileDir",
      '--headless=new',
      '--disable-gpu',
      '--disable-breakpad',
      '--disable-crash-reporter',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1600,1000',
      "--virtual-time-budget=$BudgetMs",
      '--dump-dom',
      $targetUrl
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
      $rawMessage = "Headless browser execution failed [$($case.Name)] (exit=$browserExitCode)"
      throw (Get-FriendlyBrowserFailureMessage -Browser $browserExe -StderrPath $stderrPath -FallbackMessage $rawMessage)
    }

    $domText = Get-Content -Path $domPath -Raw -Encoding UTF8
    Assert-ContainsAll -Content $domText -Needles $case.Expect -CaseName $case.Name

    $results += [ordered]@{
      name = $case.Name
      view = $case.View
      preset = $case.Preset
      dom = $domPath
      stderr = $stderrPath
      size = (Get-Item $domPath).Length
      passed = $true
    }
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
    port = $port
    runDir = $runDir
    error = $errorMessage
    cases = $results
  }

  $summary | ConvertTo-Json -Depth 6 | Set-Content -Path $summaryPath -Encoding UTF8

  if ($status -ne 'passed') {
    Write-Error $errorMessage
    Write-Output ($summary | ConvertTo-Json -Depth 6)
    exit 1
  }

  Write-Output ($summary | ConvertTo-Json -Depth 6)
}

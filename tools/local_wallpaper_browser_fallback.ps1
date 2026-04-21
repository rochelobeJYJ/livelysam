param(
    [Parameter(Mandatory = $true)]
    [string]$Root,

    [ValidateRange(0, 8)]
    [int]$PreferredMonitor = 0,

    [string]$PreferredMonitorDevice = "",

    [Nullable[int]]$PreferredMonitorX = $null,

    [Nullable[int]]$PreferredMonitorY = $null,

    [Nullable[int]]$PreferredMonitorWidth = $null,

    [Nullable[int]]$PreferredMonitorHeight = $null,

    [ValidateSet(-1, 0, 1)]
    [int]$PreferredMonitorPrimary = -1,

    [switch]$AllowPrimaryFallback
)

$ErrorActionPreference = "Stop"

$rootPath = [System.IO.Path]::GetFullPath($Root)
$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME "AppData\Local" }
$runtimeDir = Join-Path $localAppData "LivelySam\runtime\desktop-host"
$stateFile = Join-Path $runtimeDir "state.json"
$resultFile = Join-Path $runtimeDir "last-result.json"
$stopFile = Join-Path $runtimeDir "stop.flag"
$logFile = Join-Path $runtimeDir "host.log"
$browserProfileDir = Join-Path $runtimeDir "browser-profile-inline"
$previewHostExeCandidates = @(
    (Join-Path $rootPath "dist\launcher\BrowserPreviewHost.exe"),
    (Join-Path $rootPath "BrowserPreviewHost.exe")
)
$previewHostExe = $previewHostExeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$pythonPath = Join-Path $rootPath "venv\Scripts\python.exe"
$previewHostScript = Join-Path $rootPath "tools\browser_preview_host.py"
$storageBridgeScript = Join-Path $rootPath "tools\ensure_local_storage_bridge.ps1"

function Ensure-RuntimeDir {
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
}

function Log-Message {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )

    Ensure-RuntimeDir
    $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss,fff"), $Level, $Message
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

function Write-JsonFile {
    param(
        [string]$Path,
        [object]$Value
    )

    Ensure-RuntimeDir
    $Value | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Path -Encoding UTF8
}

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

function Write-Result {
    param([object]$Value)
    Write-JsonFile -Path $resultFile -Value $Value
}

function Clear-State {
    Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stopFile -Force -ErrorAction SilentlyContinue
}

function Test-PidRunning {
    param([int]$ProcessId)

    if ($ProcessId -le 0) {
        return $false
    }

    return $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Stop-ProcessIfRunning {
    param([int]$ProcessId)

    if (Test-PidRunning -ProcessId $ProcessId) {
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Get-FreePort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try {
        return $listener.LocalEndpoint.Port
    } finally {
        $listener.Stop()
    }
}

function Test-PortAvailable([int]$Port) {
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

function Get-AppServerPort {
    $preferredPort = 58672
    if (Test-PortAvailable $preferredPort) {
        return $preferredPort
    }
    return Get-FreePort
}

function Wait-ForServer {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 15
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $request = [System.Net.WebRequest]::Create($Url)
            $request.Timeout = 1500
            $response = $request.GetResponse()
            $response.Close()
            return
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }

    throw "Timed out waiting for local server."
}

function Get-ListeningProcessId {
    param(
        [int]$Port,
        [int]$FallbackPid
    )

    $pattern = "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$"
    try {
        $lines = netstat -ano -p tcp 2>$null
        foreach ($line in $lines) {
            $match = [regex]::Match($line, $pattern)
            if ($match.Success) {
                return [int]$match.Groups[1].Value
            }
        }
    } catch {
    }

    return [int]$FallbackPid
}

function Get-BrowserExecutable {
    $candidates = @()
    if ($env:LIVELYSAM_BROWSER_PATH) {
        $candidates += $env:LIVELYSAM_BROWSER_PATH
    }

    $candidates += @(
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }

    throw "Supported browser executable not found."
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class LivelySamBrowserOverlayNative {
  const uint SWP_NOACTIVATE = 0x0010;
  const uint SWP_SHOWWINDOW = 0x0040;
  const uint SWP_FRAMECHANGED = 0x0020;
  const int GWL_STYLE = -16;
  const int GWL_EXSTYLE = -20;
  const long WS_CAPTION = 0x00C00000L;
  const long WS_THICKFRAME = 0x00040000L;
  const long WS_SYSMENU = 0x00080000L;
  const long WS_MINIMIZEBOX = 0x00020000L;
  const long WS_MAXIMIZEBOX = 0x00010000L;
  const long WS_POPUP = unchecked((int)0x80000000);
  const long WS_VISIBLE = 0x10000000L;
  const long WS_EX_APPWINDOW = 0x00040000L;
  const long WS_EX_TOOLWINDOW = 0x00000080L;
  static readonly IntPtr HWND_BOTTOM = new IntPtr(1);

  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
  static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

  [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
  static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr value);

  [DllImport("user32.dll")]
  static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);

  [DllImport("user32.dll")]
  static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  static extern bool SetProcessDPIAware();

  [DllImport("user32.dll")]
  static extern bool IsWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  public static void EnableDpiAwareness() {
    try { SetProcessDPIAware(); } catch { }
  }

  public static void AttachInteractive(IntPtr hwnd, int x, int y, int w, int h) {
    long style = GetWindowLongPtr(hwnd, GWL_STYLE).ToInt64();
    style = (style & ~(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_POPUP)) | WS_VISIBLE;
    SetWindowLongPtr(hwnd, GWL_STYLE, new IntPtr(style));

    long ex = GetWindowLongPtr(hwnd, GWL_EXSTYLE).ToInt64();
    ex = (ex & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW;
    SetWindowLongPtr(hwnd, GWL_EXSTYLE, new IntPtr(ex));

    SetWindowPos(hwnd, HWND_BOTTOM, x, y, w, h, SWP_SHOWWINDOW | SWP_FRAMECHANGED);
    ShowWindow(hwnd, 5);
  }

  public static void KeepBottom(IntPtr hwnd, int x, int y, int w, int h) {
    SetWindowPos(hwnd, HWND_BOTTOM, x, y, w, h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
  }

  public static bool IsWindowAlive(IntPtr hwnd) {
    return hwnd != IntPtr.Zero && IsWindow(hwnd);
  }

  public static int GetWindowProcessId(IntPtr hwnd) {
    uint processId;
    GetWindowThreadProcessId(hwnd, out processId);
    return unchecked((int)processId);
  }
}
"@

[LivelySamBrowserOverlayNative]::EnableDpiAwareness()
$screens = [System.Windows.Forms.Screen]::AllScreens

function Get-MonitorNumber([object]$Screen) {
    $number = [int]([regex]::Match($Screen.DeviceName, "\d+$").Value)
    if ($number -le 0) {
        return 1
    }
    return $number
}

function Get-SortedScreens {
    return @($screens | Sort-Object @{ Expression = { $_.Bounds.X } }, @{ Expression = { $_.Bounds.Y } }, @{ Expression = { $_.DeviceName } })
}

function Get-RequestedBounds {
    if ($null -eq $PreferredMonitorX -or $null -eq $PreferredMonitorY -or $null -eq $PreferredMonitorWidth -or $null -eq $PreferredMonitorHeight) {
        return $null
    }

    return @{
        x = [int]$PreferredMonitorX
        y = [int]$PreferredMonitorY
        width = [int]$PreferredMonitorWidth
        height = [int]$PreferredMonitorHeight
    }
}

function Screen-MatchesBounds([object]$Screen, [hashtable]$Bounds) {
    if (-not $Bounds) {
        return $false
    }

    return (
        $Screen.Bounds.X -eq $Bounds.x -and
        $Screen.Bounds.Y -eq $Bounds.y -and
        $Screen.Bounds.Width -eq $Bounds.width -and
        $Screen.Bounds.Height -eq $Bounds.height
    )
}

function Get-ScreenPrimaryFlag([object]$Screen) {
    if ($Screen.Primary) {
        return 1
    }
    return 0
}

function Resolve-TargetScreen {
    $requestedBounds = Get-RequestedBounds
    $targetScreen = $null
    $selectionReason = "auto-secondary"

    if ($PreferredMonitorDevice) {
        $targetScreen = $screens | Where-Object { $_.DeviceName -eq $PreferredMonitorDevice } | Select-Object -First 1
        if ($targetScreen) {
            $selectionReason = "device-name"
        }
    }

    if (-not $targetScreen -and $requestedBounds) {
        $targetScreen = $screens | Where-Object { Screen-MatchesBounds $_ $requestedBounds } | Select-Object -First 1
        if ($targetScreen) {
            $selectionReason = "bounds"
        }
    }

    if (-not $targetScreen -and ($PreferredMonitorPrimary -eq 0 -or $PreferredMonitorPrimary -eq 1)) {
        $matchingByRole = @($screens | Where-Object { (Get-ScreenPrimaryFlag $_) -eq $PreferredMonitorPrimary })
        if ($matchingByRole.Count -eq 1) {
            $targetScreen = $matchingByRole[0]
            $selectionReason = "primary-role"
        }
    }

    if (-not $targetScreen -and $PreferredMonitor -gt 0) {
        $targetDeviceName = "\\.\DISPLAY" + $PreferredMonitor
        $targetScreen = $screens | Where-Object { $_.DeviceName -eq $targetDeviceName } | Select-Object -First 1
        if ($targetScreen) {
            $selectionReason = "legacy-number"
        }
    }

    if (-not $targetScreen) {
        $hasRequestedMonitor = ($PreferredMonitor -gt 0) -or [bool]$PreferredMonitorDevice -or [bool]$requestedBounds -or ($PreferredMonitorPrimary -eq 0) -or ($PreferredMonitorPrimary -eq 1)
        if ($hasRequestedMonitor) {
            if (-not $AllowPrimaryFallback) {
                throw "Requested monitor is not connected."
            }
            $targetScreen = [System.Windows.Forms.Screen]::PrimaryScreen
            $selectionReason = "primary-fallback"
        } else {
            $targetScreen = Get-SortedScreens | Where-Object { -not $_.Primary } | Select-Object -First 1
            if ($targetScreen) {
                $selectionReason = "auto-secondary"
            } else {
                $targetScreen = [System.Windows.Forms.Screen]::PrimaryScreen
                $selectionReason = "auto-primary"
            }
        }
    }

    return @{
        screen = $targetScreen
        selection_reason = $selectionReason
    }
}

function Wait-ForMainWindow {
    param(
        [int]$ProcessId,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if (-not $process) {
            throw "Browser process exited before opening a window."
        }

        $process.Refresh()
        if ($process.MainWindowHandle -ne 0) {
            return [IntPtr]$process.MainWindowHandle
        }

        Start-Sleep -Milliseconds 250
    }

    throw "Timed out waiting for the browser window."
}

function Get-MainWindowHandle {
    param([int]$ProcessId)

    if ($ProcessId -le 0) {
        return [IntPtr]::Zero
    }

    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $process) {
        return [IntPtr]::Zero
    }

    $process.Refresh()
    if ($process.MainWindowHandle -eq 0) {
        return [IntPtr]::Zero
    }

    return [IntPtr]$process.MainWindowHandle
}

Ensure-RuntimeDir
Remove-Item -LiteralPath $stopFile -Force -ErrorAction SilentlyContinue
Write-Result @{
    status = "starting"
    attached = $false
    message = "Starting browser overlay host."
    updated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
}

$serverProcess = $null
$browserProcess = $null
$trackedBrowserPid = 0
$runningMessage = "Browser overlay wallpaper is running."
$missingWindowSince = $null
$missingProcessSince = $null

try {
    $bridgeInfo = $null
    if (Test-Path -LiteralPath $storageBridgeScript) {
        $bridgeInfo = & $storageBridgeScript -Root $rootPath | ConvertFrom-Json
    }

    $targetInfo = Resolve-TargetScreen
    $targetScreen = $targetInfo.screen
    $selectionReason = [string]$targetInfo.selection_reason
    if (-not $targetScreen) {
        throw "No monitor is available for browser overlay."
    }

    $workArea = $targetScreen.WorkingArea
    $targetLeft = $workArea.X
    $targetTop = $workArea.Y
    $targetWidth = $workArea.Width
    $targetHeight = $workArea.Height
    $selectedMonitor = Get-MonitorNumber $targetScreen
    $selectedMonitorDevice = $targetScreen.DeviceName
    $selectedMonitorPrimary = [bool]$targetScreen.Primary

    $browserPath = Get-BrowserExecutable
    New-Item -ItemType Directory -Path $browserProfileDir -Force | Out-Null

    $port = Get-AppServerPort
    $statusUrl = "http://127.0.0.1:$port/index.html?runtime=desktophost"
    $launchUrl = $statusUrl
    if ($bridgeInfo -and [int]$bridgeInfo.port -gt 0) {
        $queryParts = @("runtime=desktophost", "bridgePort=$([int]$bridgeInfo.port)")
        if (-not [string]::IsNullOrWhiteSpace([string]$bridgeInfo.auth_token)) {
            $queryParts += "livelySamToken=$([System.Uri]::EscapeDataString([string]$bridgeInfo.auth_token))"
        }
        $launchUrl = "http://127.0.0.1:$port/index.html?" + ($queryParts -join "&")
    }
    if ((Test-Path -LiteralPath $pythonPath) -and (Test-Path -LiteralPath $previewHostScript)) {
        $serverArgs = @($previewHostScript, "serve", "--port", "$port")
        $serverProcess = Start-Process -FilePath $pythonPath -ArgumentList $serverArgs -WorkingDirectory $rootPath -WindowStyle Hidden -PassThru
    } elseif ($previewHostExe) {
        $serverProcess = Start-Process -FilePath $previewHostExe -ArgumentList @("serve", "--port", "$port") -WorkingDirectory $rootPath -WindowStyle Hidden -PassThru
    } else {
        throw "BrowserPreviewHost runtime not found."
    }
    Log-Message "Browser overlay server process started: pid=$($serverProcess.Id) port=$port"

    Wait-ForServer -Url $statusUrl
    Log-Message "Browser overlay local server ready at $statusUrl"
    $resolvedServerPid = Get-ListeningProcessId -Port $port -FallbackPid $serverProcess.Id
    if ($resolvedServerPid -ne $serverProcess.Id) {
        Log-Message "Browser overlay actual server pid resolved: pid=$resolvedServerPid launcher_pid=$($serverProcess.Id)"
    }

    $browserArgs = @(
        "--user-data-dir=$browserProfileDir",
        "--no-first-run",
        "--disable-session-crashed-bubble",
        "--window-size=$targetWidth,$targetHeight",
        "--window-position=$targetLeft,$targetTop",
        "--app=$launchUrl"
    )
    $browserProcess = Start-Process -FilePath $browserPath -ArgumentList $browserArgs -PassThru
    Log-Message "Browser overlay app process started: pid=$($browserProcess.Id) path=$browserPath"

    $browserHandle = Wait-ForMainWindow -ProcessId $browserProcess.Id -TimeoutSeconds 20
    $windowProcessId = [LivelySamBrowserOverlayNative]::GetWindowProcessId($browserHandle)
    if ($windowProcessId -gt 0) {
        $trackedBrowserPid = $windowProcessId
    } else {
        $trackedBrowserPid = $browserProcess.Id
    }
    if ($trackedBrowserPid -ne $browserProcess.Id) {
        Log-Message "Browser overlay window owner detected: pid=$trackedBrowserPid bootstrap_pid=$($browserProcess.Id)"
    }
    [LivelySamBrowserOverlayNative]::AttachInteractive($browserHandle, $targetLeft, $targetTop, $targetWidth, $targetHeight)

    $state = @{
        host_pid = $PID
        browser_pid = $trackedBrowserPid
        browser_bootstrap_pid = $browserProcess.Id
        server_pid = $resolvedServerPid
        server_launcher_pid = $serverProcess.Id
        port = $port
        url = $statusUrl
        browser_path = $browserPath
        renderer = "BrowserApp"
        mode = "browser_app_overlay"
        requested_monitor = if ($PreferredMonitor -gt 0) { $PreferredMonitor } else { "auto-secondary" }
        requested_monitor_device = if ($PreferredMonitorDevice) { $PreferredMonitorDevice } else { $null }
        requested_monitor_primary = if ($PreferredMonitorPrimary -eq 0 -or $PreferredMonitorPrimary -eq 1) { [bool]$PreferredMonitorPrimary } else { $null }
        selected_monitor = $selectedMonitor
        selected_monitor_device = $selectedMonitorDevice
        selected_monitor_primary = $selectedMonitorPrimary
        selection_reason = $selectionReason
        target_bounds = @($targetLeft, $targetTop, ($targetLeft + $targetWidth), ($targetTop + $targetHeight))
        attached = $true
        interaction_state = "background"
        last_action = "background:browser-fallback"
        last_error = $null
        window_handle = ("0x{0:X}" -f [int64]$browserHandle)
    }
    Write-JsonFile -Path $stateFile -Value $state
    Write-Result @{
        status = "running"
        attached = $true
        message = $runningMessage
        updated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        url = $statusUrl
        renderer = "BrowserApp"
        mode = "browser_app_overlay"
        selected_monitor = $selectedMonitor
        selected_monitor_device = $selectedMonitorDevice
        selected_monitor_primary = $selectedMonitorPrimary
        selection_reason = $selectionReason
        browser_path = $browserPath
        window_handle = $state.window_handle
    }
    Log-Message "Browser overlay attached on monitor $selectedMonitor ($selectedMonitorDevice)"

    while ($true) {
        if (Test-Path -LiteralPath $stopFile) {
            break
        }
        if (-not [LivelySamBrowserOverlayNative]::IsWindowAlive($browserHandle)) {
            $replacementHandle = Get-MainWindowHandle -ProcessId $trackedBrowserPid
            if ($replacementHandle -eq [IntPtr]::Zero) {
                $replacementHandle = Get-MainWindowHandle -ProcessId $browserProcess.Id
            }
            if ($replacementHandle -eq [IntPtr]::Zero) {
                if (-not $missingWindowSince) {
                    $missingWindowSince = Get-Date
                    Log-Message "Browser overlay window handle disappeared. Waiting for replacement."
                } elseif (((Get-Date) - $missingWindowSince).TotalSeconds -ge 10) {
                    Log-Message "Browser overlay window handle did not recover within grace period."
                    break
                }
                Start-Sleep -Milliseconds 500
                continue
            }
            if ($replacementHandle -ne $browserHandle) {
                $browserHandle = $replacementHandle
                $windowProcessId = [LivelySamBrowserOverlayNative]::GetWindowProcessId($browserHandle)
                if ($windowProcessId -gt 0 -and $windowProcessId -ne $trackedBrowserPid) {
                    Log-Message "Browser overlay window owner refreshed: pid=$windowProcessId previous_pid=$trackedBrowserPid"
                    $trackedBrowserPid = $windowProcessId
                    $state.browser_pid = $trackedBrowserPid
                }
                $state.window_handle = ("0x{0:X}" -f [int64]$browserHandle)
                Write-JsonFile -Path $stateFile -Value $state
                [LivelySamBrowserOverlayNative]::AttachInteractive($browserHandle, $targetLeft, $targetTop, $targetWidth, $targetHeight)
                Log-Message "Browser overlay window handle refreshed: $($state.window_handle)"
            }
        } elseif ($missingWindowSince) {
            Log-Message "Browser overlay window handle recovered."
            $missingWindowSince = $null
        }
        if ($trackedBrowserPid -gt 0 -and -not (Test-PidRunning -ProcessId $trackedBrowserPid)) {
            $currentWindowProcessId = [LivelySamBrowserOverlayNative]::GetWindowProcessId($browserHandle)
            if ($currentWindowProcessId -gt 0 -and $currentWindowProcessId -ne $trackedBrowserPid -and (Test-PidRunning -ProcessId $currentWindowProcessId)) {
                Log-Message "Browser overlay process owner changed: pid=$currentWindowProcessId previous_pid=$trackedBrowserPid"
                $trackedBrowserPid = $currentWindowProcessId
                $state.browser_pid = $trackedBrowserPid
                Write-JsonFile -Path $stateFile -Value $state
                $missingProcessSince = $null
                Start-Sleep -Milliseconds 500
                continue
            }
            if (-not $missingProcessSince) {
                $missingProcessSince = Get-Date
                Log-Message "Browser overlay process disappeared. Waiting for recovery."
            } elseif (((Get-Date) - $missingProcessSince).TotalSeconds -ge 10) {
                Log-Message "Browser overlay process did not recover within grace period."
                break
            }
            Start-Sleep -Milliseconds 500
            continue
        } elseif ($missingProcessSince) {
            Log-Message "Browser overlay process recovered."
            $missingProcessSince = $null
        }

        [LivelySamBrowserOverlayNative]::KeepBottom($browserHandle, $targetLeft, $targetTop, $targetWidth, $targetHeight)
        Start-Sleep -Milliseconds 500
    }
} catch {
    $message = $_.Exception.ToString()
    Log-Message "Browser overlay host failed: $message" "ERROR"
    Write-Result @{
        status = "failed"
        attached = $false
        message = "Browser overlay host failed."
        error = $message
        updated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
    throw
} finally {
    Stop-ProcessIfRunning -ProcessId ([int]$trackedBrowserPid)
    Stop-ProcessIfRunning -ProcessId ([int]($browserProcess.Id))
    Stop-ProcessIfRunning -ProcessId ([int]($serverProcess.Id))
    Stop-ProcessIfRunning -ProcessId ([int]$resolvedServerPid)
    Clear-State
    $currentResult = Read-JsonFile -Path $resultFile
    if (-not ($currentResult -and $currentResult.status -eq "failed")) {
        Write-Result @{
            status = "stopped"
            attached = $false
            message = "Browser overlay host stopped."
            updated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }
    }
    Log-Message "Stopping browser overlay host."
}

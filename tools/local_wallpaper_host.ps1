param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("start", "stop", "status")]
    [string]$Command,

    [string]$Root = (Join-Path $PSScriptRoot "..")
)

$ErrorActionPreference = "Stop"

$rootPath = [System.IO.Path]::GetFullPath($Root)
$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME "AppData\Local" }
$runtimeDir = Join-Path $localAppData "LivelySam\runtime\desktop-host"
$stateFile = Join-Path $runtimeDir "state.json"
$resultFile = Join-Path $runtimeDir "last-result.json"
$stopFile = Join-Path $runtimeDir "stop.flag"
$logFile = Join-Path $runtimeDir "host.log"
$webViewProfileDir = Join-Path $runtimeDir "webview2-profile"
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

function Get-WebView2ManagedDirectory {
    $envDir = $env:LIVELYSAM_WEBVIEW2_MANAGED_DIR
    $candidates = @()

    if ($envDir) {
        $candidates += $envDir
    }

    $candidates += @(
        "C:\Program Files (x86)\Hnc\Office 2024\HncUtils\Service"
    )

    foreach ($candidate in $candidates) {
        if (-not $candidate) {
            continue
        }

        $coreDll = Join-Path $candidate "Microsoft.Web.WebView2.Core.dll"
        $wpfDll = Join-Path $candidate "Microsoft.Web.WebView2.Wpf.dll"
        if ((Test-Path -LiteralPath $coreDll) -and (Test-Path -LiteralPath $wpfDll)) {
            return $candidate
        }
    }

    $searchRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
    foreach ($root in $searchRoots) {
        $dll = Get-ChildItem -Path $root -Recurse -Filter "Microsoft.Web.WebView2.Wpf.dll" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($dll) {
            $candidate = Split-Path -Path $dll.FullName -Parent
            $coreDll = Join-Path $candidate "Microsoft.Web.WebView2.Core.dll"
            if (Test-Path -LiteralPath $coreDll) {
                return $candidate
            }
        }
    }

    throw "WebView2 managed assemblies not found. Set LIVELYSAM_WEBVIEW2_MANAGED_DIR if necessary."
}

function Get-WebView2LoaderDirectory {
    $envDir = $env:LIVELYSAM_WEBVIEW2_LOADER_DIR
    $candidates = @()

    if ($envDir) {
        $candidates += $envDir
    }

    if ([IntPtr]::Size -eq 8) {
        $candidates += @(
            "C:\Program Files\Microsoft Office\root\Office16",
            "C:\Program Files\Microsoft OneDrive\26.055.0323.0004",
            "C:\Program Files\Microsoft OneDrive\26.040.0301.0001"
        )
    } else {
        $candidates += @(
            "C:\Program Files (x86)\Hnc\Office 2024\HncUtils\Service"
        )
    }

    foreach ($candidate in $candidates) {
        if (-not $candidate) {
            continue
        }

        $loaderDll = Join-Path $candidate "WebView2Loader.dll"
        if (Test-Path -LiteralPath $loaderDll) {
            return $candidate
        }
    }

    $searchRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
    foreach ($root in $searchRoots) {
        $dll = Get-ChildItem -Path $root -Recurse -Filter "WebView2Loader.dll" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($dll) {
            return (Split-Path -Path $dll.FullName -Parent)
        }
    }

    throw "WebView2Loader.dll not found. Set LIVELYSAM_WEBVIEW2_LOADER_DIR if necessary."
}

function Ensure-WebView2Assemblies {
    param(
        [string]$ManagedDir,
        [string]$LoaderDir
    )

    $env:PATH = "$LoaderDir;$env:PATH"
    Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
    [System.Reflection.Assembly]::LoadFrom((Join-Path $ManagedDir "Microsoft.Web.WebView2.Core.dll")) | Out-Null
    [System.Reflection.Assembly]::LoadFrom((Join-Path $ManagedDir "Microsoft.Web.WebView2.Wpf.dll")) | Out-Null
}

function Ensure-NativeDesktopInterop {
    if ("LivelySamDesktopNative" -as [type]) {
        return
    }

    Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class LivelySamDesktopNative
{
    private const uint SMTO_NORMAL = 0x0000;
    private const uint SPI_GETWORKAREA = 0x0030;
    private const int GWL_STYLE = -16;
    private const int GWL_EXSTYLE = -20;
    private const long WS_CAPTION = 0x00C00000L;
    private const long WS_THICKFRAME = 0x00040000L;
    private const long WS_SYSMENU = 0x00080000L;
    private const long WS_MINIMIZEBOX = 0x00020000L;
    private const long WS_MAXIMIZEBOX = 0x00010000L;
    private const long WS_POPUP = unchecked((int)0x80000000);
    private const long WS_CHILD = 0x40000000L;
    private const long WS_VISIBLE = 0x10000000L;
    private const long WS_EX_APPWINDOW = 0x00040000L;
    private const long WS_EX_TOOLWINDOW = 0x00000080L;
    private const long WS_EX_NOACTIVATE = 0x08000000L;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const uint SWP_FRAMECHANGED = 0x0020;
    private static readonly IntPtr HWND_BOTTOM = new IntPtr(1);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    private delegate bool EnumChildProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindowEx(IntPtr parentHandle, IntPtr childAfter, string className, string windowTitle);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumChildWindows(IntPtr parent, EnumChildProc callback, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SystemParametersInfo(uint action, uint param, out RECT rect, uint winIni);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    public static RECT GetWorkArea()
    {
        RECT rect;
        if (!SystemParametersInfo(SPI_GETWORKAREA, 0, out rect, 0))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }

        return rect;
    }

    public static void EnableDpiAwareness()
    {
        try
        {
            SetProcessDPIAware();
        }
        catch
        {
        }
    }

    public static RECT GetWindowRectSafe(IntPtr hwnd)
    {
        RECT rect;
        if (!GetWindowRect(hwnd, out rect))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }

        return rect;
    }

    private static bool IsLargeVisibleWindow(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero || !IsWindowVisible(hwnd))
        {
            return false;
        }

        RECT rect;
        if (!GetWindowRect(hwnd, out rect))
        {
            return false;
        }

        return (rect.Right - rect.Left) >= 400 && (rect.Bottom - rect.Top) >= 300;
    }

    private static IntPtr FindChildWorkerW(IntPtr progman)
    {
        IntPtr childWorker = IntPtr.Zero;
        EnumChildWindows(progman, (hwnd, lParam) =>
        {
            StringBuilder className = new StringBuilder(256);
            GetClassName(hwnd, className, className.Capacity);
            if (className.ToString() == "WorkerW" && IsLargeVisibleWindow(hwnd))
            {
                childWorker = hwnd;
                return false;
            }

            return true;
        }, IntPtr.Zero);

        return childWorker;
    }

    public static IntPtr PrepareWorkerW()
    {
        IntPtr progman = FindWindow("Progman", null);
        if (progman == IntPtr.Zero)
        {
            throw new InvalidOperationException("Progman window not found.");
        }

        UIntPtr result;
        SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, SMTO_NORMAL, 1000, out result);
        SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), IntPtr.Zero, SMTO_NORMAL, 1000, out result);
        SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(1), SMTO_NORMAL, 1000, out result);

        IntPtr childWorker = FindChildWorkerW(progman);
        if (childWorker != IntPtr.Zero)
        {
            return childWorker;
        }

        IntPtr workerw = IntPtr.Zero;
        EnumWindows((hwnd, lParam) =>
        {
            IntPtr shellView = FindWindowEx(hwnd, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shellView != IntPtr.Zero)
            {
                IntPtr siblingWorker = FindWindowEx(IntPtr.Zero, hwnd, "WorkerW", null);
                if (IsLargeVisibleWindow(siblingWorker))
                {
                    workerw = siblingWorker;
                    return false;
                }
            }

            return true;
        }, IntPtr.Zero);

        return workerw != IntPtr.Zero ? workerw : progman;
    }

    public static void AttachWindow(IntPtr hwnd, IntPtr parent, int left, int top, int width, int height)
    {
        long style = GetWindowLongPtr(hwnd, GWL_STYLE).ToInt64();
        style = (style & ~(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_POPUP)) | WS_CHILD | WS_VISIBLE;
        SetWindowLongPtr(hwnd, GWL_STYLE, new IntPtr(style));

        long exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE).ToInt64();
        exStyle = (exStyle & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, new IntPtr(exStyle));

        SetParent(hwnd, parent);

        if (!SetWindowPos(hwnd, HWND_BOTTOM, left, top, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }

        ShowWindow(hwnd, 5);
    }
}
"@
}

function Start-Host {
    $existingState = Read-JsonFile -Path $stateFile
    if ($existingState -and (Test-PidRunning -ProcessId ([int]$existingState.host_pid))) {
        throw "Wallpaper host is already running."
    }

    $bridgeInfo = $null
    if (Test-Path -LiteralPath $storageBridgeScript) {
        $bridgeInfo = & $storageBridgeScript -Root $rootPath | ConvertFrom-Json
    }

    Ensure-RuntimeDir
    Remove-Item -LiteralPath $stopFile -Force -ErrorAction SilentlyContinue
    Write-Result @{
        status = "starting"
        attached = $false
        message = "Starting local wallpaper host."
        updated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }

    $webView2ManagedDir = Get-WebView2ManagedDirectory
    $webView2LoaderDir = Get-WebView2LoaderDirectory
    Ensure-WebView2Assemblies -ManagedDir $webView2ManagedDir -LoaderDir $webView2LoaderDir

    $port = Get-FreePort
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
        throw "BrowserPreviewHost runtime not found. Checked: $($previewHostExeCandidates -join ', '), $previewHostScript, $pythonPath"
    }
    Log-Message "Server process started: pid=$($serverProcess.Id) port=$port"

    try {
        Wait-ForServer -Url $statusUrl
        Log-Message "Local server ready at $statusUrl"

        Ensure-NativeDesktopInterop
        [LivelySamDesktopNative]::EnableDpiAwareness()
        $desktopParent = [LivelySamDesktopNative]::PrepareWorkerW()
        $desktopRect = [LivelySamDesktopNative]::GetWindowRectSafe($desktopParent)
        $targetWidth = $desktopRect.Right - $desktopRect.Left
        $targetHeight = $desktopRect.Bottom - $desktopRect.Top
        New-Item -ItemType Directory -Path $webViewProfileDir -Force | Out-Null

        $window = New-Object System.Windows.Window
        $window.Title = "LivelySam Desktop Host"
        $window.WindowStyle = [System.Windows.WindowStyle]::None
        $window.ResizeMode = [System.Windows.ResizeMode]::NoResize
        $window.ShowInTaskbar = $false
        $window.Topmost = $false
        $window.AllowsTransparency = $false
        $window.Background = [System.Windows.Media.Brushes]::Black
        $window.Left = 0
        $window.Top = 0
        $window.Width = $targetWidth
        $window.Height = $targetHeight

        $grid = New-Object System.Windows.Controls.Grid
        $webView = New-Object Microsoft.Web.WebView2.Wpf.WebView2
        $webView.DefaultBackgroundColor = [System.Drawing.Color]::Black
        $creationProperties = New-Object Microsoft.Web.WebView2.Wpf.CoreWebView2CreationProperties
        $creationProperties.UserDataFolder = $webViewProfileDir
        $webView.CreationProperties = $creationProperties
        $grid.Children.Add($webView) | Out-Null
        $window.Content = $grid

        $script:hostState = @{
            host_pid = $PID
            server_pid = $serverProcess.Id
            port = $port
            url = $statusUrl
            renderer = "WebView2"
            webview2_managed_dir = $webView2ManagedDir
            webview2_loader_dir = $webView2LoaderDir
            webview2_profile_dir = $webViewProfileDir
            attached = $false
            last_error = $null
        }
        Write-JsonFile -Path $stateFile -Value $script:hostState
        $script:desktopAttached = $false

        $stopTimer = New-Object System.Windows.Threading.DispatcherTimer
        $stopTimer.Interval = [TimeSpan]::FromMilliseconds(500)
        $stopTimer.add_Tick({
            if (Test-Path -LiteralPath $stopFile) {
                $stopTimer.Stop()
                $window.Close()
            }
        })

        $webView.add_CoreWebView2InitializationCompleted({
            param($sender, $args)
            if ($args.IsSuccess) {
                Log-Message "WebView2 initialization completed."
                $sender.CoreWebView2.Navigate($launchUrl)
            } else {
                $exceptionText = if ($args.InitializationException) { $args.InitializationException.ToString() } else { "Unknown WebView2 initialization error." }
                Log-Message "WebView2 initialization failed: $exceptionText" "ERROR"
                $script:hostState.last_error = $exceptionText
                Write-JsonFile -Path $stateFile -Value $script:hostState
                Write-Result @{
                    status = "failed"
                    attached = $false
                    message = "WebView2 initialization failed."
                    error = $exceptionText
                    updated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
                }
            }
        })

        $webView.add_Loaded({
            Log-Message "WebView control loaded."
        })

        $webView.add_NavigationCompleted({
            param($sender, $args)
            Log-Message ("WebView navigation completed. success={0}" -f $args.IsSuccess)
            if ($args.IsSuccess -and -not $script:desktopAttached) {
                $interop = New-Object System.Windows.Interop.WindowInteropHelper($window)
                $hwnd = $interop.Handle
                [LivelySamDesktopNative]::AttachWindow($hwnd, $desktopParent, 0, 0, $targetWidth, $targetHeight)
                $script:desktopAttached = $true
                $script:hostState.attached = $true
                $script:hostState.window_handle = ("0x{0:X}" -f $hwnd.ToInt64())
                $script:hostState.desktop_parent = ("0x{0:X}" -f $desktopParent.ToInt64())
                Write-JsonFile -Path $stateFile -Value $script:hostState
                Write-Result @{
                    status = "running"
                    attached = $true
                    message = "Local wallpaper host attached successfully."
                    updated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
                    url = $statusUrl
                    renderer = "WebView2"
                    window_handle = $script:hostState.window_handle
                    desktop_parent = $script:hostState.desktop_parent
                }
                Log-Message "Attached host window $($script:hostState.window_handle) to desktop parent $($script:hostState.desktop_parent)"
                $stopTimer.Start()
            }
        })

        $window.Add_Loaded({
            Log-Message "Host window loaded."
            try {
                Log-Message "Calling EnsureCoreWebView2Async."
                $null = $webView.EnsureCoreWebView2Async()
            } catch {
                $message = $_.Exception.Message
                Log-Message "WebView2 async start failed: $message" "ERROR"
                $script:hostState.last_error = $message
                Write-JsonFile -Path $stateFile -Value $script:hostState
                Write-Result @{
                    status = "failed"
                    attached = $false
                    message = "WebView2 async start failed."
                    error = $message
                    updated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
                }
            }
        })

        $window.Add_Closed({
            $stopTimer.Stop()
            [System.Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvokeShutdown([System.Windows.Threading.DispatcherPriority]::Background) | Out-Null
        })

        $app = New-Object System.Windows.Application
        $app.ShutdownMode = [System.Windows.ShutdownMode]::OnMainWindowClose
        $app.Run($window) | Out-Null
    } catch {
        $message = $_.Exception.Message
        Log-Message "Host startup failed: $message" "ERROR"
        Write-Result @{
            status = "failed"
            attached = $false
            message = "Local wallpaper host failed to start."
            error = $message
            updated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }
        throw
    } finally {
        Log-Message "Stopping local wallpaper host."
        Stop-ProcessIfRunning -ProcessId $serverProcess.Id
        Clear-State
        Write-Result @{
            status = "stopped"
            attached = $false
            message = "Local wallpaper host stopped."
            updated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }
    }
}

function Stop-Host {
    $state = Read-JsonFile -Path $stateFile
    if (-not $state) {
        Write-Result @{
            status = "stopped"
            attached = $false
            message = "No running local wallpaper host was found."
            updated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        }
        Write-Output "No running local wallpaper host was found."
        return
    }

    Ensure-RuntimeDir
    Set-Content -LiteralPath $stopFile -Value "stop" -Encoding UTF8

    $hostPid = [int]$state.host_pid
    $serverPid = [int]$state.server_pid
    $serverLauncherPid = [int]$state.server_launcher_pid
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-PidRunning -ProcessId $hostPid)) {
            break
        }
        Start-Sleep -Milliseconds 250
    }

    Stop-ProcessIfRunning -ProcessId $hostPid
    Stop-ProcessIfRunning -ProcessId $serverPid
    Stop-ProcessIfRunning -ProcessId $serverLauncherPid
    Clear-State

    Write-Result @{
        status = "stopped"
        attached = $false
        message = "Local wallpaper host stopped."
        updated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
    Write-Output "Local wallpaper host stopped."
}

function Show-Status {
    $state = Read-JsonFile -Path $stateFile
    if ($state) {
        $status = [ordered]@{}
        foreach ($property in $state.PSObject.Properties) {
            $status[$property.Name] = $property.Value
        }
        $status["host_running"] = Test-PidRunning -ProcessId ([int]$state.host_pid)
        $status["server_running"] = Test-PidRunning -ProcessId ([int]$state.server_pid)
        $status["server_launcher_running"] = Test-PidRunning -ProcessId ([int]$state.server_launcher_pid)
        $status | ConvertTo-Json -Depth 8
        return
    }

    $result = Read-JsonFile -Path $resultFile
    if ($result) {
        [ordered]@{
            running = $false
            last_result = $result
        } | ConvertTo-Json -Depth 8
        return
    }

    Write-Output "Local wallpaper host is not running."
}

switch ($Command) {
    "start" { throw "Use start_local_wallpaper.cmd or tools/start_local_wallpaper.ps1 to launch the wallpaper host."; break }
    "stop" { Stop-Host; break }
    "status" { Show-Status; break }
}

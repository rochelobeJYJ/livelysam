param(
    [Parameter(Mandatory = $true)]
    [string]$Root
)

$ErrorActionPreference = "Stop"

$rootPath = [System.IO.Path]::GetFullPath($Root)
$statusScript = Join-Path $rootPath "tools\local_wallpaper_host.ps1"
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

$existingState = Read-JsonFile -Path $stateFile
if ($existingState -and (Test-PidRunning -ProcessId ([int]$existingState.host_pid))) {
    Write-Host "[LivelySam] already running." -ForegroundColor Yellow
    Write-Host "Stop it with stop_local_wallpaper.cmd and run it again."
    Write-Host ""
    if (Test-Path -LiteralPath $statusScript) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $statusScript status -Root $rootPath
    }
    exit 0
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Remove-Item -LiteralPath $resultFile -Force -ErrorAction SilentlyContinue

$rootPathLiteral = $rootPath.Replace("'", "''")
$launcherScript = @"
`$ErrorActionPreference = 'Stop'
`$RootPath = '$rootPathLiteral'
`$RuntimeDir = Join-Path `$RootPath 'runtime\desktop-host'
`$StateFile = Join-Path `$RuntimeDir 'state.json'
`$ResultFile = Join-Path `$RuntimeDir 'last-result.json'
`$StopFile = Join-Path `$RuntimeDir 'stop.flag'
`$LogFile = Join-Path `$RuntimeDir 'host.log'
`$ProfileDir = Join-Path `$RuntimeDir 'webview2-profile-inline'
`$PythonPath = Join-Path `$RootPath 'venv\Scripts\python.exe'

function Ensure-RuntimeDir { New-Item -ItemType Directory -Path `$RuntimeDir -Force | Out-Null }
function Log-Message([string]`$Message,[string]`$Level='INFO') {
  Ensure-RuntimeDir
  `$line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss,fff'), `$Level, `$Message
  Add-Content -LiteralPath `$LogFile -Value `$line -Encoding UTF8
}
function Write-JsonFile([string]`$Path,[object]`$Value) {
  Ensure-RuntimeDir
  `$Value | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath `$Path -Encoding UTF8
}
function Write-Result([object]`$Value) { Write-JsonFile -Path `$ResultFile -Value `$Value }
function Clear-State {
  Remove-Item -LiteralPath `$StateFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath `$StopFile -Force -ErrorAction SilentlyContinue
}
function Get-FreePort {
  `$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  `$listener.Start()
  try { return `$listener.LocalEndpoint.Port } finally { `$listener.Stop() }
}
function Wait-ForServer([string]`$Url,[int]`$TimeoutSeconds=15) {
  `$deadline = (Get-Date).AddSeconds(`$TimeoutSeconds)
  while ((Get-Date) -lt `$deadline) {
    try {
      `$request = [System.Net.WebRequest]::Create(`$Url)
      `$request.Timeout = 1500
      `$response = `$request.GetResponse()
      `$response.Close()
      return
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  throw 'Timed out waiting for local server.'
}

Ensure-RuntimeDir
Remove-Item -LiteralPath `$StopFile -Force -ErrorAction SilentlyContinue
Write-Result @{
  status = 'starting'
  attached = `$false
  message = 'Starting local wallpaper host.'
  updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
}

`$managedDir = if (`$env:LIVELYSAM_WEBVIEW2_MANAGED_DIR) { `$env:LIVELYSAM_WEBVIEW2_MANAGED_DIR } else { 'C:\Program Files (x86)\Hnc\Office 2024\HncUtils\Service' }
`$loaderDir = if (`$env:LIVELYSAM_WEBVIEW2_LOADER_DIR) { `$env:LIVELYSAM_WEBVIEW2_LOADER_DIR } elseif (Test-Path 'C:\Program Files\Microsoft Office\root\Office16\WebView2Loader.dll') { 'C:\Program Files\Microsoft Office\root\Office16' } else { 'C:\Program Files\Microsoft OneDrive\26.040.0301.0001' }

`$port = Get-FreePort
`$url = 'http://127.0.0.1:' + `$port + '/index.html?runtime=desktophost'
`$server = Start-Process -FilePath `$PythonPath -ArgumentList @('-m','http.server',`$port,'--bind','127.0.0.1','--directory',`$RootPath) -WindowStyle Hidden -PassThru
Log-Message ('Server process started: pid=' + `$server.Id + ' port=' + `$port)

try {
  Wait-ForServer -Url `$url
  Log-Message ('Local server ready at ' + `$url)

  `$env:PATH = `$loaderDir + ';' + `$env:PATH
  Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
  [System.Reflection.Assembly]::LoadFrom((Join-Path `$managedDir 'Microsoft.Web.WebView2.Core.dll')) | Out-Null
  [System.Reflection.Assembly]::LoadFrom((Join-Path `$managedDir 'Microsoft.Web.WebView2.Wpf.dll')) | Out-Null
  Add-Type @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class LivelySamInlineNative {
  const uint SMTO_NORMAL=0; const uint SPI_GETWORKAREA=0x0030; const int GWL_STYLE=-16; const int GWL_EXSTYLE=-20;
  const long WS_CAPTION=0x00C00000L; const long WS_THICKFRAME=0x00040000L; const long WS_SYSMENU=0x00080000L;
  const long WS_MINIMIZEBOX=0x00020000L; const long WS_MAXIMIZEBOX=0x00010000L; const long WS_POPUP=unchecked((int)0x80000000);
  const long WS_CHILD=0x40000000L; const long WS_VISIBLE=0x10000000L; const long WS_EX_APPWINDOW=0x00040000L;
  const long WS_EX_TOOLWINDOW=0x00000080L; const long WS_EX_NOACTIVATE=0x08000000L; const uint SWP_NOACTIVATE=0x0010;
  const uint SWP_SHOWWINDOW=0x0040; const uint SWP_FRAMECHANGED=0x0020; static readonly IntPtr HWND_BOTTOM=new IntPtr(1);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string c,string t);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr p, IntPtr c, string cn, string wt);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
  [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action, uint param, out RECT rect, uint winIni);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr value);
  [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  public static RECT GetWorkArea(){ RECT r; if(!SystemParametersInfo(SPI_GETWORKAREA,0,out r,0)) throw new Win32Exception(); return r; }
  public static IntPtr Prepare(){ var prog=FindWindow("Progman", null); UIntPtr result; SendMessageTimeout(prog,0x052C,IntPtr.Zero,IntPtr.Zero,SMTO_NORMAL,1000,out result); IntPtr worker=IntPtr.Zero; EnumWindows((hwnd,l)=>{ var shell=FindWindowEx(hwnd,IntPtr.Zero,"SHELLDLL_DefView",null); if(shell!=IntPtr.Zero){ var sibling=FindWindowEx(IntPtr.Zero, hwnd, "WorkerW", null); if(sibling!=IntPtr.Zero){ worker=sibling; return false; } } return true;}, IntPtr.Zero); return worker!=IntPtr.Zero ? worker : prog; }
  public static void Attach(IntPtr hwnd, IntPtr parent, int x,int y,int w,int h){ long style=GetWindowLongPtr(hwnd,GWL_STYLE).ToInt64(); style=(style & ~(WS_CAPTION|WS_THICKFRAME|WS_SYSMENU|WS_MINIMIZEBOX|WS_MAXIMIZEBOX|WS_POPUP)) | WS_CHILD | WS_VISIBLE; SetWindowLongPtr(hwnd,GWL_STYLE,new IntPtr(style)); long ex=GetWindowLongPtr(hwnd,GWL_EXSTYLE).ToInt64(); ex=(ex & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE; SetWindowLongPtr(hwnd,GWL_EXSTYLE,new IntPtr(ex)); SetParent(hwnd,parent); SetWindowPos(hwnd, HWND_BOTTOM, x,y,w,h, SWP_NOACTIVATE|SWP_SHOWWINDOW|SWP_FRAMECHANGED); ShowWindow(hwnd,5); }
}
'@

  New-Item -ItemType Directory -Path `$ProfileDir -Force | Out-Null
  `$work = [LivelySamInlineNative]::GetWorkArea()
  `$window = New-Object System.Windows.Window
  `$window.Title = 'LivelySam Desktop Host'
  `$window.Width = 800
  `$window.Height = 600
  `$window.WindowStyle = [System.Windows.WindowStyle]::None
  `$window.ResizeMode = [System.Windows.ResizeMode]::NoResize
  `$window.ShowInTaskbar = `$false
  `$window.Topmost = `$false
  `$window.AllowsTransparency = `$false
  `$window.Background = [System.Windows.Media.Brushes]::Black

  `$grid = New-Object System.Windows.Controls.Grid
  `$wv = New-Object Microsoft.Web.WebView2.Wpf.WebView2
  `$cp = New-Object Microsoft.Web.WebView2.Wpf.CoreWebView2CreationProperties
  `$cp.UserDataFolder = `$ProfileDir
  `$wv.CreationProperties = `$cp
  `$wv.DefaultBackgroundColor = [System.Drawing.Color]::Black
  `$grid.Children.Add(`$wv) | Out-Null
  `$window.Content = `$grid

  `$script:attached = `$false
  `$script:state = @{
    host_pid = `$PID
    server_pid = `$server.Id
    port = `$port
    url = `$url
    renderer = 'WebView2'
    webview2_managed_dir = `$managedDir
    webview2_loader_dir = `$loaderDir
    webview2_profile_dir = `$ProfileDir
    attached = `$false
    last_error = `$null
  }

  `$stopTimer = New-Object System.Windows.Threading.DispatcherTimer
  `$stopTimer.Interval = [TimeSpan]::FromMilliseconds(500)
  `$stopTimer.add_Tick({
    if (Test-Path -LiteralPath `$StopFile) {
      `$stopTimer.Stop()
      `$window.Close()
    }
  })

  `$wv.add_CoreWebView2InitializationCompleted({
    param(`$s, `$a)
    if (`$a.IsSuccess) {
      Log-Message 'WebView2 initialization completed.'
      `$s.CoreWebView2.Navigate(`$url)
    } else {
      `$text = if (`$a.InitializationException) { `$a.InitializationException.ToString() } else { 'Unknown WebView2 initialization error.' }
      `$script:state.last_error = `$text
      Write-Result @{
        status = 'failed'
        attached = `$false
        message = 'WebView2 initialization failed.'
        error = `$text
        updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
      }
      Log-Message ('WebView2 initialization failed: ' + `$text) 'ERROR'
    }
  })

  `$wv.add_NavigationCompleted({
    param(`$s, `$a)
    Log-Message ('WebView navigation completed. success=' + `$a.IsSuccess)
    if (`$a.IsSuccess -and -not `$script:attached) {
      `$interop = New-Object System.Windows.Interop.WindowInteropHelper(`$window)
      `$desktopParent = [LivelySamInlineNative]::Prepare()
      [LivelySamInlineNative]::Attach(`$interop.Handle, `$desktopParent, `$work.Left, `$work.Top, `$work.Right - `$work.Left, `$work.Bottom - `$work.Top)
      `$script:attached = `$true
      `$script:state.attached = `$true
      `$script:state.window_handle = ('0x{0:X}' -f [int64]`$interop.Handle)
      `$script:state.desktop_parent = ('0x{0:X}' -f [int64]`$desktopParent)
      Write-JsonFile -Path `$StateFile -Value `$script:state
      Write-Result @{
        status = 'running'
        attached = `$true
        message = 'Local wallpaper host attached successfully.'
        updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        url = `$url
        renderer = 'WebView2'
        window_handle = `$script:state.window_handle
        desktop_parent = `$script:state.desktop_parent
      }
      Log-Message ('Attached host window ' + `$script:state.window_handle + ' to desktop parent ' + `$script:state.desktop_parent)
      `$stopTimer.Start()
    }
  })

  `$window.add_Loaded({
    Log-Message 'Host window loaded.'
    try { `$null = `$wv.EnsureCoreWebView2Async() } catch {
      `$text = `$_.Exception.Message
      `$script:state.last_error = `$text
      Write-Result @{
        status = 'failed'
        attached = `$false
        message = 'WebView2 async start failed.'
        error = `$text
        updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
      }
      Log-Message ('WebView2 async start failed: ' + `$text) 'ERROR'
    }
  })

  `$window.add_Closed({
    `$stopTimer.Stop()
    [System.Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvokeShutdown([System.Windows.Threading.DispatcherPriority]::Background) | Out-Null
  })

  `$app = New-Object System.Windows.Application
  `$app.Run(`$window) | Out-Null
} catch {
  `$message = `$_.Exception.Message
  Write-Result @{
    status = 'failed'
    attached = `$false
    message = 'Inline wallpaper host failed.'
    error = `$message
    updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  }
  Log-Message ('Inline wallpaper host failed: ' + `$message) 'ERROR'
  throw
} finally {
  if (`$server -and -not `$server.HasExited) { Stop-Process -Id `$server.Id -Force -ErrorAction SilentlyContinue }
  Clear-State
  Write-Result @{
    status = 'stopped'
    attached = `$false
    message = 'Local wallpaper host stopped.'
    updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  }
  Log-Message 'Stopping local wallpaper host.'
}
"@

$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launcherScript))

Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-STA",
    "-ExecutionPolicy", "Bypass",
    "-WindowStyle", "Hidden",
    "-EncodedCommand", $encoded
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

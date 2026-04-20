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
$statusScript = Join-Path $rootPath "tools\local_wallpaper_host.ps1"
$runtimeDir = Join-Path $rootPath "runtime\desktop-host"
$stateFile = Join-Path $runtimeDir "state.json"
$resultFile = Join-Path $runtimeDir "last-result.json"
$logFile = Join-Path $runtimeDir "host.log"
$storageBridgeScript = Join-Path $rootPath "tools\ensure_local_storage_bridge.ps1"

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

if (Test-Path -LiteralPath $storageBridgeScript) {
    $bridgeInfo = & $storageBridgeScript -Root $rootPath | ConvertFrom-Json
} else {
    $bridgeInfo = $null
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Remove-Item -LiteralPath $resultFile -Force -ErrorAction SilentlyContinue

$rootPathLiteral = $rootPath.Replace("'", "''")
$preferredMonitorLiteral = [int]$PreferredMonitor
$preferredMonitorDeviceLiteral = $PreferredMonitorDevice.Replace("'", "''")
$preferredMonitorXLiteral = if ($null -eq $PreferredMonitorX) { '$null' } else { [string][int]$PreferredMonitorX }
$preferredMonitorYLiteral = if ($null -eq $PreferredMonitorY) { '$null' } else { [string][int]$PreferredMonitorY }
$preferredMonitorWidthLiteral = if ($null -eq $PreferredMonitorWidth) { '$null' } else { [string][int]$PreferredMonitorWidth }
$preferredMonitorHeightLiteral = if ($null -eq $PreferredMonitorHeight) { '$null' } else { [string][int]$PreferredMonitorHeight }
$preferredMonitorPrimaryLiteral = [int]$PreferredMonitorPrimary
$allowPrimaryFallbackLiteral = if ($AllowPrimaryFallback) { '$true' } else { '$false' }
$bridgePortLiteral = if ($bridgeInfo -and [int]$bridgeInfo.port -gt 0) { [string][int]$bridgeInfo.port } else { '0' }
$bridgeTokenLiteral = if ($bridgeInfo) { [string]$bridgeInfo.auth_token } else { '' }
$bridgeTokenLiteral = $bridgeTokenLiteral.Replace("'", "''")
$launcherScript = @"
`$ErrorActionPreference = 'Stop'
`$RootPath = '$rootPathLiteral'
`$PreferredMonitor = $preferredMonitorLiteral
`$PreferredMonitorDevice = '$preferredMonitorDeviceLiteral'
`$PreferredMonitorX = $preferredMonitorXLiteral
`$PreferredMonitorY = $preferredMonitorYLiteral
`$PreferredMonitorWidth = $preferredMonitorWidthLiteral
`$PreferredMonitorHeight = $preferredMonitorHeightLiteral
`$PreferredMonitorPrimary = $preferredMonitorPrimaryLiteral
`$AllowPrimaryFallback = $allowPrimaryFallbackLiteral
`$BridgePort = $bridgePortLiteral
`$BridgeToken = '$bridgeTokenLiteral'
`$RuntimeDir = Join-Path `$RootPath 'runtime\desktop-host'
`$StateFile = Join-Path `$RuntimeDir 'state.json'
`$ResultFile = Join-Path `$RuntimeDir 'last-result.json'
`$StopFile = Join-Path `$RuntimeDir 'stop.flag'
`$LogFile = Join-Path `$RuntimeDir 'host.log'
`$ProfileDir = Join-Path `$RuntimeDir ('webview2-profile-inline-' + `$PID)
`$PreviewHostExeCandidates = @(
  (Join-Path `$RootPath 'dist\launcher\BrowserPreviewHost.exe'),
  (Join-Path `$RootPath 'BrowserPreviewHost.exe')
)
`$PreviewHostExe = `$PreviewHostExeCandidates | Where-Object { Test-Path -LiteralPath `$_ } | Select-Object -First 1
`$PythonPath = Join-Path `$RootPath 'venv\Scripts\python.exe'
`$PreviewHostScript = Join-Path `$RootPath 'tools\browser_preview_host.py'

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
function Read-JsonFile([string]`$Path) {
  if (-not (Test-Path -LiteralPath `$Path)) { return `$null }
  try { return Get-Content -LiteralPath `$Path -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return `$null }
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
function Test-PortAvailable([int]`$Port) {
  try {
    `$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, `$Port)
    `$listener.Start()
    `$listener.Stop()
    return `$true
  } catch {
    return `$false
  }
}
function Get-AppServerPort {
  `$preferredPort = 58672
  if (Test-PortAvailable `$preferredPort) {
    return `$preferredPort
  }
  return Get-FreePort
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
function Get-ListeningProcessId([int]`$Port,[int]`$FallbackPid) {
  `$pattern = '^\s*TCP\s+\S+:' + `$Port + '\s+\S+\s+LISTENING\s+(\d+)\s*$'
  try {
    `$lines = netstat -ano -p tcp 2>`$null
    foreach (`$line in `$lines) {
      `$match = [regex]::Match(`$line, `$pattern)
      if (`$match.Success) {
        return [int]`$match.Groups[1].Value
      }
    }
  } catch {
  }
  return [int]`$FallbackPid
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
`$loaderDir = if (`$env:LIVELYSAM_WEBVIEW2_LOADER_DIR) { `$env:LIVELYSAM_WEBVIEW2_LOADER_DIR } elseif (Test-Path 'C:\Program Files\Microsoft Office\root\Office16\WebView2Loader.dll') { 'C:\Program Files\Microsoft Office\root\Office16' } elseif (Test-Path 'C:\Program Files\Microsoft OneDrive\26.055.0323.0004\WebView2Loader.dll') { 'C:\Program Files\Microsoft OneDrive\26.055.0323.0004' } else { 'C:\Program Files\Microsoft OneDrive\26.040.0301.0001' }

`$port = Get-AppServerPort
`$statusUrl = 'http://127.0.0.1:' + `$port + '/index.html?runtime=desktophost'
`$launchUrl = `$statusUrl
if (`$BridgePort -gt 0) {
  `$queryParts = @('runtime=desktophost', 'bridgePort=' + `$BridgePort)
  if (-not [string]::IsNullOrWhiteSpace(`$BridgeToken)) {
    `$queryParts += 'livelySamToken=' + [System.Uri]::EscapeDataString(`$BridgeToken)
  }
  `$launchUrl = 'http://127.0.0.1:' + `$port + '/index.html?' + (`$queryParts -join '&')
}
if ((Test-Path -LiteralPath `$PythonPath) -and (Test-Path -LiteralPath `$PreviewHostScript)) {
  `$server = Start-Process -FilePath `$PythonPath -ArgumentList @(`$PreviewHostScript,'serve','--port',`$port) -WorkingDirectory `$RootPath -WindowStyle Hidden -PassThru
} elseif (`$PreviewHostExe) {
  `$server = Start-Process -FilePath `$PreviewHostExe -ArgumentList @('serve','--port',`$port) -WorkingDirectory `$RootPath -WindowStyle Hidden -PassThru
} else {
  throw ('BrowserPreviewHost runtime not found. Checked: ' + ((`$PreviewHostExeCandidates + @(`$PreviewHostScript, `$PythonPath)) -join ', '))
}
Log-Message ('Server process started: pid=' + `$server.Id + ' port=' + `$port)

try {
  Wait-ForServer -Url `$statusUrl
  `$resolvedServerPid = Get-ListeningProcessId -Port `$port -FallbackPid `$server.Id
  Log-Message ('Local server ready at ' + `$statusUrl)
  if (`$resolvedServerPid -ne `$server.Id) {
    Log-Message ('Resolved actual server pid=' + `$resolvedServerPid + ' from launcher pid=' + `$server.Id)
  }

  `$env:PATH = `$loaderDir + ';' + `$env:PATH
  Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase,System.Windows.Forms
  [System.Reflection.Assembly]::LoadFrom((Join-Path `$managedDir 'Microsoft.Web.WebView2.Core.dll')) | Out-Null
  [System.Reflection.Assembly]::LoadFrom((Join-Path `$managedDir 'Microsoft.Web.WebView2.Wpf.dll')) | Out-Null
  Add-Type @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

[StructLayout(LayoutKind.Sequential)]
public struct LivelySamPoint {
  public int X;
  public int Y;
}

[StructLayout(LayoutKind.Sequential)]
public struct LivelySamPointL {
  public int X;
  public int Y;
}

[ComImport, Guid("00000122-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ILivelySamDropTarget {
  [PreserveSig] int DragEnter([In, MarshalAs(UnmanagedType.Interface)] System.Runtime.InteropServices.ComTypes.IDataObject pDataObj, int grfKeyState, LivelySamPointL pt, ref int pdwEffect);
  [PreserveSig] int DragOver(int grfKeyState, LivelySamPointL pt, ref int pdwEffect);
  [PreserveSig] int DragLeave();
  [PreserveSig] int Drop([In, MarshalAs(UnmanagedType.Interface)] System.Runtime.InteropServices.ComTypes.IDataObject pDataObj, int grfKeyState, LivelySamPointL pt, ref int pdwEffect);
}

[ComVisible(true)]
public sealed class LivelySamInlineDropInfo {
  public string[] Paths { get; set; }
  public int ClientX { get; set; }
  public int ClientY { get; set; }
  public long SourceHwnd { get; set; }
}

[ComVisible(true)]
[ClassInterface(ClassInterfaceType.None)]
public sealed class LivelySamInlineOleDropTarget : ILivelySamDropTarget {
  const int S_OK = 0;
  const int DROPEFFECT_NONE = 0;
  const int DROPEFFECT_COPY = 1;
  const short CF_HDROP = 15;

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, EntryPoint = "DragQueryFileW")]
  static extern uint DragQueryFile(IntPtr hDrop, uint iFile, StringBuilder lpszFile, uint cch);
  [DllImport("ole32.dll")]
  static extern void ReleaseStgMedium(ref STGMEDIUM pmedium);

  private readonly IntPtr _registrationHwnd;
  private readonly IntPtr _hostHwnd;
  private readonly Action<object> _onDrop;

  public LivelySamInlineOleDropTarget(IntPtr registrationHwnd, IntPtr hostHwnd, Action<object> onDrop) {
    _registrationHwnd = registrationHwnd;
    _hostHwnd = hostHwnd;
    _onDrop = onDrop;
  }

  public int DragEnter(System.Runtime.InteropServices.ComTypes.IDataObject pDataObj, int grfKeyState, LivelySamPointL pt, ref int pdwEffect) {
    pdwEffect = CanAccept(pDataObj) ? DROPEFFECT_COPY : DROPEFFECT_NONE;
    return S_OK;
  }

  public int DragOver(int grfKeyState, LivelySamPointL pt, ref int pdwEffect) {
    if (pdwEffect != DROPEFFECT_NONE) {
      pdwEffect = DROPEFFECT_COPY;
    }
    return S_OK;
  }

  public int DragLeave() {
    return S_OK;
  }

  public int Drop(System.Runtime.InteropServices.ComTypes.IDataObject pDataObj, int grfKeyState, LivelySamPointL pt, ref int pdwEffect) {
    LivelySamInlineDropInfo info;
    if (TryBuildDropInfo(pDataObj, pt, out info)) {
      pdwEffect = DROPEFFECT_COPY;
      if (_onDrop != null) {
        _onDrop.Invoke(info);
      }
    } else {
      pdwEffect = DROPEFFECT_NONE;
    }
    return S_OK;
  }

  bool CanAccept(System.Runtime.InteropServices.ComTypes.IDataObject dataObject) {
    string[] paths;
    return TryGetFilePaths(dataObject, out paths) && paths.Length > 0;
  }

  bool TryBuildDropInfo(System.Runtime.InteropServices.ComTypes.IDataObject dataObject, LivelySamPointL screenPoint, out LivelySamInlineDropInfo info) {
    info = null;
    string[] paths;
    if (!TryGetFilePaths(dataObject, out paths) || paths.Length == 0) {
      return false;
    }

    var targetHwnd = _hostHwnd != IntPtr.Zero ? _hostHwnd : _registrationHwnd;
    var clientPoint = new LivelySamPoint { X = screenPoint.X, Y = screenPoint.Y };
    if (targetHwnd != IntPtr.Zero) {
      LivelySamInlineNative.TryScreenToClient(targetHwnd, ref clientPoint);
    }

    info = new LivelySamInlineDropInfo {
      Paths = paths,
      ClientX = clientPoint.X,
      ClientY = clientPoint.Y,
      SourceHwnd = _registrationHwnd.ToInt64()
    };
    return true;
  }

  static bool TryGetFilePaths(System.Runtime.InteropServices.ComTypes.IDataObject dataObject, out string[] paths) {
    paths = new string[0];
    if (dataObject == null) {
      return false;
    }

    var format = new FORMATETC {
      cfFormat = CF_HDROP,
      ptd = IntPtr.Zero,
      dwAspect = DVASPECT.DVASPECT_CONTENT,
      lindex = -1,
      tymed = TYMED.TYMED_HGLOBAL
    };

    STGMEDIUM medium;
    try {
      dataObject.GetData(ref format, out medium);
    } catch {
      return false;
    }

    try {
      if (medium.unionmember == IntPtr.Zero) {
        return false;
      }

      uint count = DragQueryFile(medium.unionmember, 0xFFFFFFFF, null, 0);
      if (count == 0) {
        return false;
      }

      var results = new List<string>((int)count);
      for (uint i = 0; i < count; i++) {
        uint length = DragQueryFile(medium.unionmember, i, null, 0);
        var builder = new StringBuilder((int)length + 1);
        DragQueryFile(medium.unionmember, i, builder, (uint)builder.Capacity);
        var value = builder.ToString();
        if (!string.IsNullOrWhiteSpace(value)) {
          results.Add(value);
        }
      }

      paths = results.ToArray();
      return paths.Length > 0;
    } finally {
      try { ReleaseStgMedium(ref medium); } catch { }
    }
  }
}

public static class LivelySamInlineNative {
  const uint SWP_NOACTIVATE=0x0010; const uint SWP_SHOWWINDOW=0x0040; const uint SWP_FRAMECHANGED=0x0020;
  const int GWL_STYLE=-16; const int GWL_EXSTYLE=-20;
  const long WS_CAPTION=0x00C00000L; const long WS_THICKFRAME=0x00040000L; const long WS_SYSMENU=0x00080000L;
  const long WS_MINIMIZEBOX=0x00020000L; const long WS_MAXIMIZEBOX=0x00010000L; const long WS_POPUP=unchecked((int)0x80000000);
  const long WS_VISIBLE=0x10000000L; const long WS_EX_APPWINDOW=0x00040000L; const long WS_EX_TOOLWINDOW=0x00000080L;
  static readonly IntPtr HWND_BOTTOM=new IntPtr(1);
  static readonly IntPtr HWND_TOPMOST=new IntPtr(-1);
  static readonly IntPtr HWND_NOTOPMOST=new IntPtr(-2);
  delegate bool EnumChildProc(IntPtr hwnd, IntPtr lParam);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr value);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError=true)] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll", SetLastError=true)] static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr hWnd, ref LivelySamPoint point);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr hWndParent, EnumChildProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder className, int maxCount);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("shell32.dll")] static extern void DragAcceptFiles(IntPtr hWnd, bool fAccept);
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, EntryPoint="DragQueryFileW")] static extern uint DragQueryFile(IntPtr hDrop, uint iFile, StringBuilder lpszFile, uint cch);
  [DllImport("shell32.dll")] static extern bool DragQueryPoint(IntPtr hDrop, out LivelySamPoint point);
  [DllImport("shell32.dll")] static extern void DragFinish(IntPtr hDrop);
  [DllImport("ole32.dll")] static extern int OleInitialize(IntPtr pvReserved);
  [DllImport("ole32.dll")] static extern void OleUninitialize();
  [DllImport("ole32.dll")] static extern int RegisterDragDrop(IntPtr hwnd, [MarshalAs(UnmanagedType.Interface)] ILivelySamDropTarget dropTarget);
  [DllImport("ole32.dll")] static extern int RevokeDragDrop(IntPtr hwnd);
  public static void EnableDpiAwareness(){ try { SetProcessDPIAware(); } catch { } }
  public static void AttachInteractive(IntPtr hwnd, int x,int y,int w,int h){ long style=GetWindowLongPtr(hwnd,GWL_STYLE).ToInt64(); style=(style & ~(WS_CAPTION|WS_THICKFRAME|WS_SYSMENU|WS_MINIMIZEBOX|WS_MAXIMIZEBOX|WS_POPUP)) | WS_VISIBLE; SetWindowLongPtr(hwnd,GWL_STYLE,new IntPtr(style)); long ex=GetWindowLongPtr(hwnd,GWL_EXSTYLE).ToInt64(); ex=(ex & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW; SetWindowLongPtr(hwnd,GWL_EXSTYLE,new IntPtr(ex)); SetWindowPos(hwnd, HWND_BOTTOM, x,y,w,h, SWP_SHOWWINDOW|SWP_FRAMECHANGED); ShowWindow(hwnd,5); }
  public static void KeepBottom(IntPtr hwnd, int x,int y,int w,int h){ SetWindowPos(hwnd, HWND_BOTTOM, x,y,w,h, SWP_NOACTIVATE|SWP_SHOWWINDOW); }
  public static void BringToFront(IntPtr hwnd, int x,int y,int w,int h){ SetWindowPos(hwnd, HWND_TOPMOST, x,y,w,h, SWP_SHOWWINDOW); ShowWindow(hwnd,5); SetForegroundWindow(hwnd); }
  public static void NormalizeFront(IntPtr hwnd, int x,int y,int w,int h){ SetWindowPos(hwnd, HWND_NOTOPMOST, x,y,w,h, SWP_SHOWWINDOW); ShowWindow(hwnd,5); SetForegroundWindow(hwnd); }
  public static bool TryRegisterHotKey(IntPtr hwnd, int id, uint modifiers, uint vk){ return RegisterHotKey(hwnd, id, modifiers, vk); }
  public static void TryUnregisterHotKey(IntPtr hwnd, int id){ try { UnregisterHotKey(hwnd, id); } catch { } }
  public static void EnableShellDrop(IntPtr hwnd){ try { DragAcceptFiles(hwnd, true); } catch { } }
  public static void DisableShellDrop(IntPtr hwnd){ try { DragAcceptFiles(hwnd, false); } catch { } }
  public static int InitializeOle(){ try { return OleInitialize(IntPtr.Zero); } catch { return -1; } }
  public static void UninitializeOle(){ try { OleUninitialize(); } catch { } }
  public static int RegisterOleDropTarget(IntPtr hwnd, ILivelySamDropTarget dropTarget){ try { return RegisterDragDrop(hwnd, dropTarget); } catch { return -1; } }
  public static int RevokeOleDropTarget(IntPtr hwnd){ try { return RevokeDragDrop(hwnd); } catch { return -1; } }
  public static IntPtr[] GetDropRegistrationHandles(IntPtr root){
    var handles = new List<IntPtr>();
    if (root == IntPtr.Zero) { return handles.ToArray(); }
    handles.Add(root);
    EnumChildWindows(root, delegate (IntPtr hwnd, IntPtr lParam) {
      if (hwnd != IntPtr.Zero && !handles.Contains(hwnd)) {
        handles.Add(hwnd);
      }
      return true;
    }, IntPtr.Zero);
    return handles.ToArray();
  }
  public static bool TryScreenToClient(IntPtr hwnd, ref LivelySamPoint point){ if (hwnd == IntPtr.Zero) { return false; } try { return ScreenToClient(hwnd, ref point); } catch { return false; } }
  public static string GetWindowClassName(IntPtr hwnd){ if (hwnd == IntPtr.Zero) { return string.Empty; } var builder = new StringBuilder(256); try { return GetClassName(hwnd, builder, builder.Capacity) > 0 ? builder.ToString() : string.Empty; } catch { return string.Empty; } }
  public static uint GetWindowProcessId(IntPtr hwnd){ if (hwnd == IntPtr.Zero) { return 0; } uint processId; GetWindowThreadProcessId(hwnd, out processId); return processId; }
  public static string[] GetShellDropPaths(IntPtr hDrop){
    uint count = DragQueryFile(hDrop, 0xFFFFFFFF, null, 0);
    string[] results = new string[count];
    for (uint i = 0; i < count; i++) {
      uint length = DragQueryFile(hDrop, i, null, 0);
      var builder = new StringBuilder((int)length + 1);
      DragQueryFile(hDrop, i, builder, (uint)builder.Capacity);
      results[i] = builder.ToString();
    }
    return results;
  }
  public static LivelySamPoint GetShellDropPoint(IntPtr hDrop){
    LivelySamPoint point;
    DragQueryPoint(hDrop, out point);
    return point;
  }
  public static void FinishShellDrop(IntPtr hDrop){ try { DragFinish(hDrop); } catch { } }
}
'@

  New-Item -ItemType Directory -Path `$ProfileDir -Force | Out-Null
[LivelySamInlineNative]::EnableDpiAwareness()
`$screens = [System.Windows.Forms.Screen]::AllScreens
function Get-MonitorNumber([object]`$Screen) {
  `$number = [int]([regex]::Match(`$Screen.DeviceName, '\d+$').Value)
  if (`$number -le 0) { return 1 }
  return `$number
}
function Get-SortedScreens {
  return @(`$screens | Sort-Object @{ Expression = { `$_.Bounds.X } }, @{ Expression = { `$_.Bounds.Y } }, @{ Expression = { `$_.DeviceName } })
}
function Get-RequestedBounds {
  if (`$null -eq `$PreferredMonitorX -or `$null -eq `$PreferredMonitorY -or `$null -eq `$PreferredMonitorWidth -or `$null -eq `$PreferredMonitorHeight) {
    return `$null
  }
  return @{
    x = [int]`$PreferredMonitorX
    y = [int]`$PreferredMonitorY
    width = [int]`$PreferredMonitorWidth
    height = [int]`$PreferredMonitorHeight
  }
}
function Screen-MatchesBounds([object]`$Screen, [hashtable]`$Bounds) {
  if (-not `$Bounds) {
    return `$false
  }
  return (
    `$Screen.Bounds.X -eq `$Bounds.x -and
    `$Screen.Bounds.Y -eq `$Bounds.y -and
    `$Screen.Bounds.Width -eq `$Bounds.width -and
    `$Screen.Bounds.Height -eq `$Bounds.height
  )
}
function Get-ScreenPrimaryFlag([object]`$Screen) {
  if (`$Screen.Primary) { return 1 }
  return 0
}
`$requestedBounds = Get-RequestedBounds
`$targetScreen = `$null
`$selectionReason = 'auto-secondary'

if (`$PreferredMonitorDevice) {
  `$targetScreen = `$screens | Where-Object { `$_.DeviceName -eq `$PreferredMonitorDevice } | Select-Object -First 1
  if (`$targetScreen) {
    `$selectionReason = 'device-name'
  }
}

if (-not `$targetScreen -and `$requestedBounds) {
  `$targetScreen = `$screens | Where-Object { Screen-MatchesBounds `$_ `$requestedBounds } | Select-Object -First 1
  if (`$targetScreen) {
    `$selectionReason = 'bounds'
  }
}

if (-not `$targetScreen -and (`$PreferredMonitorPrimary -eq 0 -or `$PreferredMonitorPrimary -eq 1)) {
  `$matchingByRole = @(`$screens | Where-Object { (Get-ScreenPrimaryFlag `$_) -eq `$PreferredMonitorPrimary })
  if (`$matchingByRole.Count -eq 1) {
    `$targetScreen = `$matchingByRole[0]
    `$selectionReason = 'primary-role'
  }
}

if (-not `$targetScreen -and `$PreferredMonitor -gt 0) {
  `$targetDeviceName = '\\.\DISPLAY' + `$PreferredMonitor
  `$targetScreen = `$screens | Where-Object { `$_.DeviceName -eq `$targetDeviceName } | Select-Object -First 1
  if (`$targetScreen) {
    `$selectionReason = 'legacy-number'
  }
}

if (-not `$targetScreen) {
  `$hasRequestedMonitor = (`$PreferredMonitor -gt 0) -or [bool]`$PreferredMonitorDevice -or [bool]`$requestedBounds -or (`$PreferredMonitorPrimary -eq 0) -or (`$PreferredMonitorPrimary -eq 1)
  if (`$hasRequestedMonitor) {
    if (-not `$AllowPrimaryFallback) {
      `$requestParts = @()
      if (`$PreferredMonitor -gt 0) { `$requestParts += ('monitor=' + `$PreferredMonitor) }
      if (`$PreferredMonitorDevice) { `$requestParts += ('device=' + `$PreferredMonitorDevice) }
      if (`$requestedBounds) { `$requestParts += ('bounds=' + `$requestedBounds.x + ',' + `$requestedBounds.y + ',' + `$requestedBounds.width + 'x' + `$requestedBounds.height) }
      if (`$PreferredMonitorPrimary -eq 0 -or `$PreferredMonitorPrimary -eq 1) { `$requestParts += ('primary=' + `$PreferredMonitorPrimary) }
      throw ('Requested monitor is not connected. ' + (`$requestParts -join ' / '))
    }
    `$targetScreen = [System.Windows.Forms.Screen]::PrimaryScreen
    `$selectionReason = 'primary-fallback'
  } else {
    `$targetScreen = Get-SortedScreens | Where-Object { -not `$_.Primary } | Select-Object -First 1
    if (`$targetScreen) {
      `$selectionReason = 'auto-secondary'
    } else {
      `$targetScreen = [System.Windows.Forms.Screen]::PrimaryScreen
      `$selectionReason = 'auto-primary'
    }
  }
}

`$selectedMonitor = Get-MonitorNumber `$targetScreen
`$selectedMonitorDevice = `$targetScreen.DeviceName
`$selectedMonitorPrimary = [bool]`$targetScreen.Primary
  `$workArea = `$targetScreen.WorkingArea
  `$targetLeft = `$workArea.X
  `$targetTop = `$workArea.Y
  `$targetWidth = `$workArea.Width
  `$targetHeight = `$workArea.Height
  `$activatorWidth = 20
  `$activatorHeight = [Math]::Min(110, [Math]::Max(78, [int]([Math]::Round(`$targetHeight * 0.16))))
  `$window = New-Object System.Windows.Window
  `$window.Title = 'LivelySam Desktop Host'
  `$window.Left = `$targetLeft
  `$window.Top = `$targetTop
  `$window.Width = `$targetWidth
  `$window.Height = `$targetHeight
  `$window.WindowStyle = [System.Windows.WindowStyle]::None
  `$window.ResizeMode = [System.Windows.ResizeMode]::NoResize
  `$window.ShowInTaskbar = `$false
  `$window.Topmost = `$false
  `$window.AllowsTransparency = `$false
  `$window.Background = [System.Windows.Media.Brushes]::White
  `$activatorWindow = New-Object System.Windows.Window
  `$activatorWindow.Title = 'LivelySam Desktop Activator'
  `$activatorWindow.Width = `$activatorWidth
  `$activatorWindow.Height = `$activatorHeight
  `$activatorWindow.WindowStyle = [System.Windows.WindowStyle]::None
  `$activatorWindow.ResizeMode = [System.Windows.ResizeMode]::NoResize
  `$activatorWindow.ShowInTaskbar = `$false
  `$activatorWindow.ShowActivated = `$false
  `$activatorWindow.Topmost = `$true
  `$activatorWindow.AllowsTransparency = `$true
  `$activatorWindow.Background = [System.Windows.Media.Brushes]::Transparent
  `$shortcutDropOverlayWindow = New-Object System.Windows.Window
  `$shortcutDropOverlayWindow.Title = 'LivelySam Shortcut Drop Overlay'
  `$shortcutDropOverlayWindow.Width = 220
  `$shortcutDropOverlayWindow.Height = 160
  `$shortcutDropOverlayWindow.WindowStyle = [System.Windows.WindowStyle]::None
  `$shortcutDropOverlayWindow.ResizeMode = [System.Windows.ResizeMode]::NoResize
  `$shortcutDropOverlayWindow.ShowInTaskbar = `$false
  `$shortcutDropOverlayWindow.ShowActivated = `$false
  `$shortcutDropOverlayWindow.Topmost = `$true
  `$shortcutDropOverlayWindow.AllowsTransparency = `$true
  `$shortcutDropOverlayWindow.Background = [System.Windows.Media.Brushes]::Transparent
  `$shortcutDropOverlayWindow.AllowDrop = `$true
  `$script:focusMode = `$false
  `$script:hostSource = `$null
  `$script:hostHook = `$null
  `$script:oleDropRegistrations = @()
  `$script:oleDropRefreshTimer = `$null
  `$script:oleDropRefreshAttempts = 0
  `$script:activatorWindow = `$activatorWindow
  `$script:shortcutDropOverlayWindow = `$shortcutDropOverlayWindow
  `$script:shortcutDropOverlayBounds = $null
  `$script:shortcutDropOverlayExpiresAt = $null
  `$script:shortcutDropOverlayTimer = $null
  `$script:shortcutDropProxyVisible = `$false
  `$script:hotkeys = @(
    @{ id = 1; name = 'toggle_focus'; label = 'Alt+1'; modifiers = [uint32]0x0001; key = [uint32]0x31; action = 'toggle-focus' },
    @{ id = 2; name = 'quick_add'; label = 'Alt+2'; modifiers = [uint32]0x0001; key = [uint32]0x32; action = 'quick-add' },
    @{ id = 3; name = 'open_settings'; label = 'Alt+3'; modifiers = [uint32]0x0001; key = [uint32]0x33; action = 'settings' },
    @{ id = 4; name = 'sync_google'; label = 'Alt+4'; modifiers = [uint32]0x0001; key = [uint32]0x34; action = 'sync' },
    @{ id = 5; name = 'toggle_layout'; label = 'Alt+5'; modifiers = [uint32]0x0001; key = [uint32]0x35; action = 'layout' }
  )

  function Update-HostState {
    if (-not `$script:state) { return }
    `$script:state.interaction_state = if (`$script:focusMode) { 'focus' } else { 'background' }
    `$script:state.activator_visible = (-not `$script:focusMode)
    `$script:state.updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    if (`$script:attached) {
      Write-JsonFile -Path `$StateFile -Value `$script:state
    }
  }

  function Update-ActivatorPlacement {
    if (-not `$script:activatorWindow) { return }
    `$script:activatorWindow.Left = `$targetLeft + `$targetWidth - `$activatorWidth
    `$script:activatorWindow.Top = `$targetTop + [Math]::Max(28, [int]([Math]::Round((`$targetHeight - `$activatorHeight) / 2)))
    `$script:activatorWindow.Width = `$activatorWidth
    `$script:activatorWindow.Height = `$activatorHeight
  }

  function Hide-ShortcutDropOverlay([string]`$Reason = 'hide') {
    if (`$script:shortcutDropOverlayTimer) {
      try { `$script:shortcutDropOverlayTimer.Stop() } catch { }
    }
    `$script:shortcutDropProxyVisible = `$false
    `$script:shortcutDropOverlayExpiresAt = $null
    if (`$script:shortcutDropOverlayWindow -and `$script:shortcutDropOverlayWindow.IsVisible) {
      try { `$script:shortcutDropOverlayWindow.Hide() } catch { }
    }
  }

  function Show-ShortcutDropOverlay([object]`$Bounds, [int]`$KeepAliveMs = 5000) {
    if (-not (`$script:shortcutDropOverlayWindow -and `$Bounds)) { return }

    try {
      `$left = [double]`$Bounds.left
      `$top = [double]`$Bounds.top
      `$width = [double]`$Bounds.width
      `$height = [double]`$Bounds.height
    } catch {
      return
    }

    if (`$width -lt 40 -or `$height -lt 40) { return }

    `$script:shortcutDropOverlayBounds = @{
      left = `$left
      top = `$top
      width = `$width
      height = `$height
    }
    `$screenLeft = `$null
    `$screenTop = `$null
    try {
      if (`$Bounds.PSObject.Properties.Match('screenLeft').Count -gt 0) {
        `$screenLeft = [double]`$Bounds.screenLeft
      }
      if (`$Bounds.PSObject.Properties.Match('screenTop').Count -gt 0) {
        `$screenTop = [double]`$Bounds.screenTop
      }
    } catch { }

    `$expectedLeft = [double](`$window.Left + `$left)
    `$expectedTop = [double](`$window.Top + `$top)
    `$finalLeft = `$expectedLeft
    `$finalTop = `$expectedTop
    `$useScreenBounds = `$false

    if (`$null -ne `$screenLeft -and `$null -ne `$screenTop) {
      `$deltaX = [Math]::Abs(`$screenLeft - `$expectedLeft)
      `$deltaY = [Math]::Abs(`$screenTop - `$expectedTop)
      `$screenLooksValid =
        (`$screenLeft -ge (`$window.Left - 96)) -and
        (`$screenLeft -le (`$window.Left + `$window.Width + 96)) -and
        (`$screenTop -ge (`$window.Top - 96)) -and
        (`$screenTop -le (`$window.Top + `$window.Height + 96))

      if (`$screenLooksValid -and `$deltaX -le 96 -and `$deltaY -le 96) {
        `$useScreenBounds = `$true
      } else {
        Log-Message ('Shortcut drop overlay bounds mismatch. hostLeft=' + [Math]::Round(`$window.Left) + ' hostTop=' + [Math]::Round(`$window.Top) + ' rectLeft=' + [Math]::Round(`$left) + ' rectTop=' + [Math]::Round(`$top) + ' expectedLeft=' + [Math]::Round(`$expectedLeft) + ' expectedTop=' + [Math]::Round(`$expectedTop) + ' screenLeft=' + [Math]::Round(`$screenLeft) + ' screenTop=' + [Math]::Round(`$screenTop) + '. Falling back to host-relative placement.') 'WARN'
      }
    }

    if (`$useScreenBounds) {
      `$finalLeft = `$screenLeft
      `$finalTop = `$screenTop
    }
    `$script:shortcutDropOverlayWindow.Left = `$finalLeft
    `$script:shortcutDropOverlayWindow.Top = `$finalTop
    `$script:shortcutDropOverlayWindow.Width = `$width
    `$script:shortcutDropOverlayWindow.Height = `$height
    `$script:shortcutDropOverlayExpiresAt = (Get-Date).AddMilliseconds([Math]::Max(1200, `$KeepAliveMs))
    `$script:shortcutDropProxyVisible = `$true

    if (-not `$script:shortcutDropOverlayWindow.IsVisible) {
      try { `$script:shortcutDropOverlayWindow.Show() } catch { }
      Log-Message ('Shortcut native drop overlay shown: left=' + [Math]::Round([double]`$script:shortcutDropOverlayWindow.Left) + ' top=' + [Math]::Round([double]`$script:shortcutDropOverlayWindow.Top) + ' width=' + [Math]::Round(`$width) + ' height=' + [Math]::Round(`$height))
    }

    if (`$script:shortcutDropOverlayTimer) {
      try {
        `$script:shortcutDropOverlayTimer.Stop()
        `$script:shortcutDropOverlayTimer.Start()
      } catch { }
    }
  }

  function Handle-ShortcutDropOverlay([object]`$Sender, [object]`$EventArgs) {
    try {
      `$targets = Get-NativeDropTargets `$EventArgs.Data
      if (-not `$targets -or `$targets.Count -eq 0) {
        Update-NativeDropEffect `$EventArgs
        `$EventArgs.Handled = `$true
        Hide-ShortcutDropOverlay 'empty-drop'
        return
      }

      `$position = `$EventArgs.GetPosition(`$script:shortcutDropOverlayWindow)
      `$clientX = [double]`$position.X
      `$clientY = [double]`$position.Y
      if (`$script:shortcutDropOverlayBounds) {
        `$clientX += [double]`$script:shortcutDropOverlayBounds.left
        `$clientY += [double]`$script:shortcutDropOverlayBounds.top
      }

      if (Forward-ShortcutNativeDrop -Targets `$targets -ClientX `$clientX -ClientY `$clientY) {
        Log-Message ('Shortcut overlay native drop forwarded: ' + (`$targets -join ' | '))
      }

      Update-NativeDropEffect `$EventArgs
      `$EventArgs.Handled = `$true
    } catch {
      Log-Message ('Shortcut overlay native drop failed: ' + `$_.Exception.Message) 'WARN'
    } finally {
      Hide-ShortcutDropOverlay 'drop'
    }
  }

  function Handle-WebViewHostMessage([object]`$Message) {
    if (-not `$Message) { return }

    `$messageType = [string]`$Message.type
    switch (`$messageType) {
      'shortcut-drop-proxy' {
        `$action = [string]`$Message.action
        if (`$action -eq 'show') {
          Log-Message 'Shortcut drop proxy requested: show'
          Show-ShortcutDropOverlay `$Message.bounds
        } elseif (`$action -eq 'hide') {
          Log-Message 'Shortcut drop proxy requested: hide'
          Hide-ShortcutDropOverlay 'webview'
        }
      }
    }
  }

  function Set-ActivatorVisibility([bool]`$Visible) {
    if (-not `$script:activatorWindow) { return }
    if (`$Visible) {
      Update-ActivatorPlacement
      if (-not `$script:activatorWindow.IsVisible) {
        try { `$script:activatorWindow.Show() } catch { }
      }
    } else {
      if (`$script:activatorWindow.IsVisible) {
        `$script:activatorWindow.Hide()
      }
    }
  }

  function Enter-BackgroundMode([string]`$Reason = 'manual') {
    if (`$script:hostHandle -ne [IntPtr]::Zero) {
      `$window.Topmost = `$false
      [LivelySamInlineNative]::KeepBottom(`$script:hostHandle, `$targetLeft, `$targetTop, `$targetWidth, `$targetHeight)
    }
    `$script:focusMode = `$false
    Set-ActivatorVisibility `$true
    `$script:state.last_action = 'background:' + `$Reason
    Update-HostState
  }

  function Enter-FocusMode([string]`$Reason = 'manual') {
    if (`$script:hostHandle -eq [IntPtr]::Zero) { return }
    `$script:focusMode = `$true
    Set-ActivatorVisibility `$false
    `$window.Topmost = `$true
    [LivelySamInlineNative]::BringToFront(`$script:hostHandle, `$targetLeft, `$targetTop, `$targetWidth, `$targetHeight)
    try { `$null = `$window.Activate() } catch { }
    `$script:state.last_action = 'focus:' + `$Reason
    Update-HostState
  }

  function Toggle-FocusMode([string]`$Reason = 'toggle') {
    if (`$script:focusMode) {
      Enter-BackgroundMode `$Reason
    } else {
      Enter-FocusMode `$Reason
    }
  }

  function Invoke-AppScript([string]`$ScriptText) {
    if (-not (`$wv -and `$wv.CoreWebView2)) { return }
    try {
      `$null = `$wv.CoreWebView2.ExecuteScriptAsync(`$ScriptText)
    } catch {
      Log-Message ('WebView script execution failed: ' + `$_.Exception.Message) 'WARN'
    }
  }

  function Add-NativeDropCandidate([System.Collections.Generic.List[string]]`$Results, [string]`$Candidate) {
    if ([string]::IsNullOrWhiteSpace(`$Candidate)) { return }

    `$normalized = `$Candidate.Trim().Trim("'")
    `$normalized = `$normalized.Trim([char]34)
    if ([string]::IsNullOrWhiteSpace(`$normalized)) { return }
    if (`$normalized.IndexOf('?') -ge 0 -or `$normalized.IndexOf('*') -ge 0 -or `$normalized.IndexOf('<') -ge 0 -or `$normalized.IndexOf('>') -ge 0 -or `$normalized.IndexOf('|') -ge 0) { return }

    `$isFilesystemPath = `$false
    if (`$normalized -match '^file://') {
      try {
        `$uri = [System.Uri]`$normalized
        if (-not `$uri.IsFile) { return }
        `$normalized = `$uri.LocalPath
        `$isFilesystemPath = `$true
      } catch {
        return
      }
    } elseif (`$normalized -match '^([a-zA-Z]:\\|\\\\)') {
      `$isFilesystemPath = `$true
    }

    if (-not `$isFilesystemPath) { return }

    `$pathExists = `$false
    try {
      `$resolvedItem = Get-Item -LiteralPath `$normalized -ErrorAction Stop
      `$normalized = [string]`$resolvedItem.FullName
      `$pathExists = `$true
    } catch {
      try {
        `$normalized = [System.IO.Path]::GetFullPath(`$normalized)
      } catch { }
      try {
        `$pathExists = Test-Path -LiteralPath `$normalized -PathType Any
      } catch {
        `$pathExists = `$false
      }
    }

    if (-not `$pathExists) {
      try {
        Log-Message ('Native drop candidate ignored because target does not exist: ' + `$normalized) 'WARN'
      } catch { }
      return
    }

    `$exists = `$false
    foreach (`$existing in `$Results) {
      if ([string]::Equals([string]`$existing, `$normalized, [System.StringComparison]::OrdinalIgnoreCase)) {
        `$exists = `$true
        break
      }
    }

    if (-not `$exists) {
      `$Results.Add(`$normalized)
    }
  }

  function Add-NativeDropText([System.Collections.Generic.List[string]]`$Results, [string]`$RawText) {
    if ([string]::IsNullOrWhiteSpace(`$RawText)) { return }

    foreach (`$line in (`$RawText -split "(`0|\r|\n)+")) {
      Add-NativeDropCandidate `$Results `$line
    }
  }

  function Add-NativeDropBytes([System.Collections.Generic.List[string]]`$Results, [byte[]]`$Bytes) {
    if (-not `$Bytes -or `$Bytes.Length -eq 0) { return }

    foreach (`$encoding in @(
      [System.Text.Encoding]::Unicode,
      [System.Text.Encoding]::UTF8,
      [System.Text.Encoding]::Default
    )) {
      try {
        Add-NativeDropText `$Results (`$encoding.GetString(`$Bytes))
      } catch { }
    }
  }

  function Add-NativeDropTarget([System.Collections.Generic.List[string]]`$Results, [object]`$Value) {
    if (`$null -eq `$Value) { return }

    if (`$Value -is [System.IO.FileSystemInfo]) {
      Add-NativeDropCandidate `$Results `$Value.FullName
      return
    }

    if (`$Value -is [System.Collections.Specialized.StringCollection]) {
      foreach (`$entry in `$Value) {
        Add-NativeDropTarget `$Results `$entry
      }
      return
    }

    if (`$Value -is [System.IO.MemoryStream]) {
      Add-NativeDropBytes `$Results `$Value.ToArray()
      return
    }

    if (`$Value -is [byte[]]) {
      Add-NativeDropBytes `$Results `$Value
      return
    }

    if ((`$Value -is [System.Collections.IEnumerable]) -and -not (`$Value -is [string])) {
      foreach (`$entry in `$Value) {
        Add-NativeDropTarget `$Results `$entry
      }
      return
    }

    Add-NativeDropText `$Results ([string]`$Value)
  }

  function Add-NativeDropFormatData([System.Collections.Generic.List[string]]`$Results, [object]`$DataObject, [object]`$Format) {
    foreach (`$autoConvert in @(`$false, `$true)) {
      try {
        if (`$DataObject.GetDataPresent(`$Format, `$autoConvert)) {
          Add-NativeDropTarget `$Results (`$DataObject.GetData(`$Format, `$autoConvert))
        }
      } catch {
        try {
          if (`$autoConvert -and `$DataObject.GetDataPresent(`$Format)) {
            Add-NativeDropTarget `$Results (`$DataObject.GetData(`$Format))
          }
        } catch { }
      }
    }
  }

  function Get-NativeDropTargets([object]`$DataObject) {
    `$fileDropResults = New-Object 'System.Collections.Generic.List[string]'
    `$nameResults = New-Object 'System.Collections.Generic.List[string]'
    `$fallbackResults = New-Object 'System.Collections.Generic.List[string]'
    if (-not `$DataObject) { return @() }

    Add-NativeDropFormatData `$fileDropResults `$DataObject [System.Windows.DataFormats]::FileDrop
    if (`$fileDropResults.Count -gt 0) {
      return @(`$fileDropResults.ToArray())
    }

    foreach (`$format in @('FileNameW', 'FileName')) {
      Add-NativeDropFormatData `$nameResults `$DataObject `$format
    }
    if (`$nameResults.Count -gt 0) {
      return @(`$nameResults.ToArray())
    }

    foreach (`$format in @(
      'UniformResourceLocatorW',
      'UniformResourceLocator',
      [System.Windows.DataFormats]::UnicodeText,
      [System.Windows.DataFormats]::Text
    )) {
      Add-NativeDropFormatData `$fallbackResults `$DataObject `$format
    }

    return @(`$fallbackResults.ToArray())
  }

  function Forward-ShortcutNativeDrop([string[]]`$Targets, [double]`$ClientX, [double]`$ClientY) {
    if (-not (`$wv -and `$wv.CoreWebView2)) { return `$false }
    if (-not `$Targets -or `$Targets.Count -eq 0) { return `$false }

    `$payload = @{
      targets = @(`$Targets)
      clientX = [Math]::Round(`$ClientX, 2)
      clientY = [Math]::Round(`$ClientY, 2)
      force = [bool]`$script:shortcutDropProxyVisible
      source = 'native-file-drop'
      receivedAt = [DateTime]::UtcNow.ToString('o')
    }
    `$json = ConvertTo-Json `$payload -Compress -Depth 6
    `$base64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes(`$json))
    `$scriptText = "(function(){try{const bytes=Uint8Array.from(atob('`$base64'),function(ch){return ch.charCodeAt(0);});const json=new TextDecoder('utf-8').decode(bytes);const detail=JSON.parse(json);const shortcuts=window.LivelySam&&window.LivelySam.ShortcutsWidget;if(shortcuts&&typeof shortcuts.enqueueNativeDrop==='function'){shortcuts.enqueueNativeDrop(detail);return 'queued';}const queue=window.__livelysamPendingShortcutDrops=window.__livelysamPendingShortcutDrops||[];queue.push(detail);return 'buffered';}catch(error){console.warn('native shortcut drop dispatch failed', error);return 'error';}})();"
    Invoke-AppScript `$scriptText
    return `$true
  }

  function Get-NativeDropFormats([object]`$DataObject) {
    if (-not `$DataObject) { return '' }
    try {
      return (@(`$DataObject.GetFormats()) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }) -join ', '
    } catch {
      return ''
    }
  }

  function Update-NativeDropEffect([object]`$EventArgs) {
    try {
      `$EventArgs.Effects = [System.Windows.DragDropEffects]::Copy
    } catch { }
  }

  function Handle-NativeDropPreview([object]`$Sender, [object]`$EventArgs) {
    `$targets = Get-NativeDropTargets `$EventArgs.Data
    if (-not `$targets -or `$targets.Count -eq 0) { return }
    Update-NativeDropEffect `$EventArgs
  }

  function Handle-NativeDropEnter([object]`$Sender, [object]`$EventArgs) {
    `$targets = Get-NativeDropTargets `$EventArgs.Data
    if (-not `$targets -or `$targets.Count -eq 0) {
      `$formats = Get-NativeDropFormats `$EventArgs.Data
      if (-not [string]::IsNullOrWhiteSpace(`$formats)) {
        Log-Message ('Native drag enter without parsed targets. formats=' + `$formats) 'WARN'
      }
      return
    }

    Update-NativeDropEffect `$EventArgs
    Log-Message ('Native drag enter detected. targets=' + (`$targets -join ' | '))
  }

  function Handle-NativeDrop([object]`$Sender, [object]`$EventArgs) {
    `$targets = Get-NativeDropTargets `$EventArgs.Data
    if (-not `$targets -or `$targets.Count -eq 0) {
      try {
        `$formats = @(`$EventArgs.Data.GetFormats()) -join ', '
        Log-Message ('Native drop ignored. formats=' + `$formats) 'WARN'
      } catch { }
      return
    }

    try {
      `$position = `$EventArgs.GetPosition(`$wv)
      if (Forward-ShortcutNativeDrop -Targets `$targets -ClientX `$position.X -ClientY `$position.Y) {
        Update-NativeDropEffect `$EventArgs
        `$EventArgs.Handled = `$true
        Log-Message ('Native shortcut drop forwarded: ' + (`$targets -join ' | '))
      }
    } catch {
      Log-Message ('Native drop forward failed: ' + `$_.Exception.Message) 'WARN'
    }
  }

  function Invoke-AppCommand([string]`$Command) {
    switch (`$Command) {
      'quick-add' {
        Enter-FocusMode 'quick-add'
        Invoke-AppScript "(function(){const app=window.LivelySam&&window.LivelySam.App;if(app&&typeof app._openQuickAdd==='function'){app._openQuickAdd();return 'ok';}return 'missing';})();"
      }
      'settings' {
        Enter-FocusMode 'settings'
        Invoke-AppScript "(function(){const app=window.LivelySam&&window.LivelySam.App;if(app&&typeof app._openSettings==='function'){app._openSettings('quickstart');return 'ok';}return 'missing';})();"
      }
      'sync' {
        Invoke-AppScript "(function(){const app=window.LivelySam&&window.LivelySam.App;if(app&&typeof app._syncGoogleWorkspace==='function'){app._syncGoogleWorkspace();return 'ok';}return 'missing';})();"
      }
      'layout' {
        Enter-FocusMode 'layout'
        Invoke-AppScript "(function(){const app=window.LivelySam&&window.LivelySam.App;if(app&&typeof app._toggleLayoutEditMode==='function'){app._toggleLayoutEditMode();return 'ok';}return 'missing';})();"
      }
    }
  }

  function Handle-HostHotkey([int]`$Id) {
    `$hotkey = `$script:hotkeys | Where-Object { [int]`$_.id -eq `$Id } | Select-Object -First 1
    if (-not `$hotkey) { return }
    switch (`$hotkey.action) {
      'toggle-focus' { Toggle-FocusMode 'hotkey' }
      'quick-add' { Invoke-AppCommand 'quick-add' }
      'settings' { Invoke-AppCommand 'settings' }
      'sync' { Invoke-AppCommand 'sync' }
      'layout' { Invoke-AppCommand 'layout' }
    }
  }

  function Register-HostHotkeys {
    if (`$script:hostHandle -eq [IntPtr]::Zero) { return }
    foreach (`$hotkey in `$script:hotkeys) {
      `$ok = [LivelySamInlineNative]::TryRegisterHotKey(`$script:hostHandle, [int]`$hotkey.id, [uint32]`$hotkey.modifiers, [uint32]`$hotkey.key)
      if (`$ok) {
        Log-Message ('Registered hotkey ' + `$hotkey.label + ' (' + `$hotkey.name + ')')
      } else {
        Log-Message ('Hotkey registration failed: ' + `$hotkey.label + ' (' + `$hotkey.name + ')') 'WARN'
      }
    }
  }

  function Unregister-HostHotkeys {
    if (`$script:hostHandle -eq [IntPtr]::Zero) { return }
    foreach (`$hotkey in `$script:hotkeys) {
      [LivelySamInlineNative]::TryUnregisterHotKey(`$script:hostHandle, [int]`$hotkey.id)
    }
  }

  function Format-HResult([int]`$Value) {
    return ('0x{0:X8}' -f (`$Value -band 0xFFFFFFFF))
  }

  function Unregister-NativeOleDropTargets {
    foreach (`$entry in @(`$script:oleDropRegistrations)) {
      try {
        [void][LivelySamInlineNative]::RevokeOleDropTarget([IntPtr]`$entry.Handle)
      } catch { }
    }
    `$script:oleDropRegistrations = @()
  }

  function Register-NativeOleDropTargets {
    if (`$script:hostHandle -eq [IntPtr]::Zero) { return }

    Unregister-NativeOleDropTargets
    Log-Message 'Starting OLE shortcut drop target registration.'

    `$initHr = [LivelySamInlineNative]::InitializeOle()
    if (`$initHr -lt 0) {
      Log-Message ('OLE drop initialization failed: ' + (Format-HResult `$initHr)) 'WARN'
      return
    }

    `$handles = @([LivelySamInlineNative]::GetDropRegistrationHandles(`$script:hostHandle))
    if (-not `$handles -or `$handles.Count -eq 0) {
      Log-Message 'No HWND found for OLE shortcut drop registration.' 'WARN'
      return
    }
    Log-Message ('OLE shortcut drop candidate HWND count: ' + `$handles.Count)

    `$callback = [System.Action[object]]{
      param(`$info)

      try {
        `$targets = @(`$info.Paths | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
        if (`$targets.Count -eq 0) { return }

        `$clientX = [double]`$info.ClientX
        `$clientY = [double]`$info.ClientY
        `$sourceHwnd = [int64]`$info.SourceHwnd
        `$targetsSnapshot = @(`$targets)

        `$null = `$window.Dispatcher.BeginInvoke([System.Action]{
          try {
            if (Forward-ShortcutNativeDrop -Targets `$targetsSnapshot -ClientX `$clientX -ClientY `$clientY) {
              Log-Message ('OLE shortcut drop forwarded: hwnd=0x{0:X} targets={1}' -f `$sourceHwnd, (`$targetsSnapshot -join ' | '))
            }
          } catch {
            Log-Message ('OLE shortcut drop dispatch failed: ' + `$_.Exception.Message) 'WARN'
          }
        })
      } catch {
        Log-Message ('OLE shortcut drop callback failed: ' + `$_.Exception.Message) 'WARN'
      }
    }

    `$seenHandles = @{}
    `$registrations = New-Object System.Collections.ArrayList
    foreach (`$handle in `$handles) {
      if (`$handle -eq [IntPtr]::Zero) { continue }
      if (`$handle -eq `$script:hostHandle) { continue }

      `$handleKey = [int64]`$handle
      if (`$seenHandles.ContainsKey(`$handleKey)) { continue }
      `$seenHandles[`$handleKey] = `$true

      `$ownerPid = [uint32][LivelySamInlineNative]::GetWindowProcessId(`$handle)
      if (`$ownerPid -ne [uint32]`$PID) {
        continue
      }

      `$className = [LivelySamInlineNative]::GetWindowClassName(`$handle)
      Log-Message ('Preparing OLE drop target: hwnd=0x{0:X} class={1} pid={2}' -f [int64]`$handle, `$className, `$ownerPid)

      `$target = [LivelySamInlineOleDropTarget]::new(`$handle, `$script:hostHandle, `$callback)
      Log-Message ('Calling RegisterDragDrop for hwnd=0x{0:X}' -f [int64]`$handle)
      `$hr = [LivelySamInlineNative]::RegisterOleDropTarget(`$handle, `$target)
      if (`$hr -eq 0) {
        [void]`$registrations.Add([pscustomobject]@{
          Handle = `$handle
          Target = `$target
        })
        Log-Message ('Registered OLE drop target: hwnd=0x{0:X} class={1}' -f [int64]`$handle, `$className)
      } else {
        Log-Message ('OLE drop target registration failed: hwnd=0x{0:X} hr={1}' -f [int64]`$handle, (Format-HResult `$hr)) 'WARN'
      }
    }

    `$script:oleDropRegistrations = @(`$registrations.ToArray())
    Log-Message ('Active OLE shortcut drop targets: ' + `$script:oleDropRegistrations.Count)
  }

  Update-ActivatorPlacement
  `$activatorBorder = New-Object System.Windows.Controls.Border
  `$activatorBorder.Width = `$activatorWidth
  `$activatorBorder.Height = `$activatorHeight
  `$activatorBorder.Background = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.Color]::FromArgb(232, 47, 128, 237))
  `$activatorBorder.BorderBrush = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.Color]::FromArgb(255, 255, 255, 255))
  `$activatorBorder.BorderThickness = New-Object System.Windows.Thickness(1, 1, 0, 1)
  `$activatorBorder.CornerRadius = New-Object System.Windows.CornerRadius(12, 0, 0, 12)
  `$activatorBorder.Cursor = [System.Windows.Input.Cursors]::Hand
  [System.Windows.Controls.ToolTipService]::SetToolTip(`$activatorBorder, 'LivelySam 열기')
  `$activatorLabel = New-Object System.Windows.Controls.TextBlock
  `$activatorLabel.Text = '<'
  `$activatorLabel.FontSize = 18
  `$activatorLabel.FontWeight = [System.Windows.FontWeights]::Bold
  `$activatorLabel.Foreground = [System.Windows.Media.Brushes]::White
  `$activatorLabel.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
  `$activatorLabel.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
  `$activatorBorder.Child = `$activatorLabel
  `$activatorBorder.add_MouseLeftButtonDown({
    param(`$s, `$e)
    `$e.Handled = `$true
    Enter-FocusMode 'activator'
  })
  `$activatorWindow.Content = `$activatorBorder

  `$shortcutDropOverlayBorder = New-Object System.Windows.Controls.Border
  `$shortcutDropOverlayBorder.CornerRadius = New-Object System.Windows.CornerRadius(0)
  `$shortcutDropOverlayBorder.BorderThickness = New-Object System.Windows.Thickness(0)
  `$shortcutDropOverlayBorder.BorderBrush = [System.Windows.Media.Brushes]::Transparent
  `$shortcutDropOverlayBorder.Background = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.Color]::FromArgb(1, 0, 0, 0))
  `$shortcutDropOverlayBorder.SnapsToDevicePixels = `$true
  `$shortcutDropOverlayWindow.Content = `$shortcutDropOverlayBorder
  `$shortcutDropOverlayWindow.add_DragEnter({
    param(`$s, `$e)
    Update-NativeDropEffect `$e
    `$e.Handled = `$true
  })
  `$shortcutDropOverlayWindow.add_DragOver({
    param(`$s, `$e)
    Update-NativeDropEffect `$e
    `$e.Handled = `$true
  })
  `$shortcutDropOverlayWindow.add_DragLeave({
    param(`$s, `$e)
    Hide-ShortcutDropOverlay 'overlay-leave'
  })
  `$shortcutDropOverlayWindow.add_Drop({
    param(`$s, `$e)
    Handle-ShortcutDropOverlay `$s `$e
  })

  `$grid = New-Object System.Windows.Controls.Grid
  `$grid.Background = [System.Windows.Media.Brushes]::White
  `$wv = New-Object Microsoft.Web.WebView2.Wpf.WebView2
  `$cp = New-Object Microsoft.Web.WebView2.Wpf.CoreWebView2CreationProperties
  `$cp.UserDataFolder = `$ProfileDir
  `$wv.CreationProperties = `$cp
  `$wv.DefaultBackgroundColor = [System.Drawing.Color]::White
  `$window.AllowDrop = `$true
  `$grid.AllowDrop = `$true
  `$wv.AllowDrop = `$true
  `$window.add_PreviewDragEnter({
    param(`$s, `$e)
    Handle-NativeDropEnter `$s `$e
  })
  `$window.add_PreviewDragOver({
    param(`$s, `$e)
    Handle-NativeDropPreview `$s `$e
  })
  `$window.add_PreviewDrop({
    param(`$s, `$e)
    Handle-NativeDrop `$s `$e
  })
  `$grid.add_PreviewDragEnter({
    param(`$s, `$e)
    Handle-NativeDropEnter `$s `$e
  })
  `$grid.add_PreviewDragOver({
    param(`$s, `$e)
    Handle-NativeDropPreview `$s `$e
  })
  `$grid.add_PreviewDrop({
    param(`$s, `$e)
    Handle-NativeDrop `$s `$e
  })
  `$wv.add_PreviewDragEnter({
    param(`$s, `$e)
    Handle-NativeDropEnter `$s `$e
  })
  `$wv.add_PreviewDragOver({
    param(`$s, `$e)
    Handle-NativeDropPreview `$s `$e
  })
  `$wv.add_PreviewDrop({
    param(`$s, `$e)
    Handle-NativeDrop `$s `$e
  })
  `$grid.Children.Add(`$wv) | Out-Null
  `$window.Content = `$grid

  `$script:attached = `$false
  `$script:hostHandle = [IntPtr]::Zero
  `$script:state = @{
    host_pid = `$PID
    server_pid = `$resolvedServerPid
    server_launcher_pid = `$server.Id
    port = `$port
    url = `$statusUrl
    renderer = 'WebView2'
    mode = 'interactive_overlay'
    requested_monitor = if (`$PreferredMonitor -gt 0) { `$PreferredMonitor } else { 'auto-secondary' }
    requested_monitor_device = if (`$PreferredMonitorDevice) { `$PreferredMonitorDevice } else { `$null }
    requested_monitor_bounds = if (`$requestedBounds) { @(`$requestedBounds.x, `$requestedBounds.y, `$requestedBounds.width, `$requestedBounds.height) } else { `$null }
    requested_monitor_primary = if (`$PreferredMonitorPrimary -eq 0 -or `$PreferredMonitorPrimary -eq 1) { [bool]`$PreferredMonitorPrimary } else { `$null }
    selected_monitor = `$selectedMonitor
    selected_monitor_device = `$selectedMonitorDevice
    selected_monitor_primary = `$selectedMonitorPrimary
    selection_reason = `$selectionReason
    webview2_managed_dir = `$managedDir
    webview2_loader_dir = `$loaderDir
    webview2_profile_dir = `$ProfileDir
    attached = `$false
    interaction_state = 'background'
    activator_visible = `$true
    hotkeys = @(`$script:hotkeys | ForEach-Object { `$_.label })
    last_error = `$null
  }

  `$stopTimer = New-Object System.Windows.Threading.DispatcherTimer
  `$stopTimer.Interval = [TimeSpan]::FromMilliseconds(500)
  `$stopTimer.add_Tick({
    if (`$script:attached -and -not `$script:focusMode -and `$script:hostHandle -ne [IntPtr]::Zero) {
      [LivelySamInlineNative]::KeepBottom(`$script:hostHandle, `$targetLeft, `$targetTop, `$targetWidth, `$targetHeight)
    }
    if (Test-Path -LiteralPath `$StopFile) {
      `$stopTimer.Stop()
      if (`$script:activatorWindow -and `$script:activatorWindow.IsVisible) {
        `$script:activatorWindow.Hide()
      }
      `$window.Close()
    }
  })

  `$script:shortcutDropOverlayTimer = New-Object System.Windows.Threading.DispatcherTimer
  `$script:shortcutDropOverlayTimer.Interval = [TimeSpan]::FromMilliseconds(350)
  `$script:shortcutDropOverlayTimer.add_Tick({
    if (-not `$script:shortcutDropOverlayExpiresAt) {
      Hide-ShortcutDropOverlay 'idle'
      return
    }

    if ((Get-Date) -ge `$script:shortcutDropOverlayExpiresAt) {
      Hide-ShortcutDropOverlay 'expired'
    }
  })

  `$script:oleDropRefreshTimer = `$null

  `$wv.add_CoreWebView2InitializationCompleted({
    param(`$s, `$a)
    if (`$a.IsSuccess) {
      Log-Message 'WebView2 initialization completed.'
      `$s.CoreWebView2.add_WebMessageReceived({
        param(`$sender, `$eventArgs)
        try {
          `$json = `$eventArgs.WebMessageAsJson
          if ([string]::IsNullOrWhiteSpace(`$json)) { return }
          `$message = `$json | ConvertFrom-Json
          Handle-WebViewHostMessage `$message
        } catch {
          Log-Message ('WebView host message handling failed: ' + `$_.Exception.Message) 'WARN'
        }
      })
      `$s.CoreWebView2.Navigate(`$launchUrl)
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
      `$script:hostHandle = `$interop.Handle
      [LivelySamInlineNative]::AttachInteractive(`$script:hostHandle, `$targetLeft, `$targetTop, `$targetWidth, `$targetHeight)
      `$script:hostSource = [System.Windows.Interop.HwndSource]::FromHwnd(`$script:hostHandle)
      `$script:hostHook = [System.Windows.Interop.HwndSourceHook]{
        param(`$hwnd, `$msg, `$wParam, `$lParam, [ref]`$handled)
        if (`$msg -eq 0x0312) {
          Handle-HostHotkey([int]`$wParam.ToInt32())
          `$handled.Value = `$true
        } elseif (`$msg -eq 0x0233) {
          try {
            `$dropPoint = [LivelySamInlineNative+POINT]::new()
            `$targets = [LivelySamInlineNative]::GetShellDropPaths(`$wParam)
            `$dropPoint = [LivelySamInlineNative]::GetShellDropPoint(`$wParam)
            if (`$targets -and `$targets.Length -gt 0) {
              Forward-ShortcutNativeDrop -Targets `$targets -ClientX `$dropPoint.X -ClientY `$dropPoint.Y | Out-Null
              Log-Message ('Shell shortcut drop forwarded: ' + (`$targets -join ' | '))
            } else {
              Log-Message 'Shell shortcut drop received without paths.' 'WARN'
            }
          } catch {
            Log-Message ('Shell shortcut drop failed: ' + `$_.Exception.Message) 'WARN'
          } finally {
            [LivelySamInlineNative]::FinishShellDrop(`$wParam)
          }
          `$handled.Value = `$true
        }
        return [IntPtr]::Zero
      }
      if (`$script:hostSource -and `$script:hostHook) {
        `$script:hostSource.AddHook(`$script:hostHook)
      }
      [LivelySamInlineNative]::EnableShellDrop(`$script:hostHandle)
      try {
        Register-NativeOleDropTargets
      } catch {
        Log-Message ('Initial OLE shortcut drop registration failed: ' + `$_.Exception.Message) 'WARN'
      }
      if (`$script:oleDropRefreshTimer) {
        try { `$script:oleDropRefreshTimer.Stop() } catch { }
      }
      `$script:oleDropRefreshAttempts = 0
      `$script:oleDropRefreshTimer = New-Object System.Windows.Threading.DispatcherTimer
      `$script:oleDropRefreshTimer.Interval = [TimeSpan]::FromMilliseconds(1200)
      `$script:oleDropRefreshTimer.add_Tick({
        `$script:oleDropRefreshAttempts += 1
        try {
          Register-NativeOleDropTargets
        } catch {
          Log-Message ('OLE shortcut drop refresh failed: ' + `$_.Exception.Message) 'WARN'
        }

        `$registrationCount = if (`$script:oleDropRegistrations) { `$script:oleDropRegistrations.Count } else { 0 }
        if ((`$registrationCount -gt 0 -and `$script:oleDropRefreshAttempts -ge 4) -or `$script:oleDropRefreshAttempts -ge 10) {
          try { `$script:oleDropRefreshTimer.Stop() } catch { }
        }
      })
      try { `$script:oleDropRefreshTimer.Start() } catch { }
      Register-HostHotkeys
      `$script:attached = `$true
      `$script:state.attached = `$true
      `$script:state.window_handle = ('0x{0:X}' -f [int64]`$script:hostHandle)
      `$script:state.target_bounds = @(`$targetLeft, `$targetTop, (`$targetLeft + `$targetWidth), (`$targetTop + `$targetHeight))
      Enter-BackgroundMode 'startup'
      Write-JsonFile -Path `$StateFile -Value `$script:state
      Write-Result @{
        status = 'running'
        attached = `$true
        message = 'Interactive wallpaper host is running.'
        updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        url = `$statusUrl
        renderer = 'WebView2'
        mode = 'interactive_overlay'
        selected_monitor = `$selectedMonitor
        selected_monitor_device = `$selectedMonitorDevice
        selected_monitor_primary = `$selectedMonitorPrimary
        selection_reason = `$selectionReason
        window_handle = `$script:state.window_handle
        interaction_state = `$script:state.interaction_state
        hotkeys = `$script:state.hotkeys
      }
      Log-Message ('Started interactive host window ' + `$script:state.window_handle + ' on monitor ' + `$selectedMonitor + ' (' + `$selectedMonitorDevice + ')')
      `$null = `$window.Dispatcher.BeginInvoke([System.Action]{
        try {
          Log-Message 'Running shortcut drop proxy message self-test.'
          Invoke-AppScript "(function(){try{if(!(window.chrome&&window.chrome.webview&&typeof window.chrome.webview.postMessage==='function')){return 'missing';}window.chrome.webview.postMessage({type:'shortcut-drop-proxy',action:'show',bounds:{left:-1200,top:-1200,width:240,height:120}});setTimeout(function(){try{window.chrome.webview.postMessage({type:'shortcut-drop-proxy',action:'hide'});}catch(_error){}},120);return 'ok';}catch(error){return 'error';}})();"
          `$selfTestPaths = New-Object System.Collections.Specialized.StringCollection
          [void]`$selfTestPaths.Add((Join-Path `$RootPath 'index.html'))
          [void]`$selfTestPaths.Add((Join-Path `$RootPath 'tools'))
          `$selfTestData = New-Object System.Windows.DataObject
          `$selfTestData.SetFileDropList(`$selfTestPaths)
          `$selfTestTargets = Get-NativeDropTargets `$selfTestData
          Log-Message ('Shortcut drop parser self-test targets: ' + (`$selfTestTargets -join ' | '))
        } catch {
          Log-Message ('Shortcut drop proxy self-test failed: ' + `$_.Exception.Message) 'WARN'
        }
      })
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

  `$window.add_Deactivated({
    if (`$script:focusMode) {
      Enter-BackgroundMode 'deactivated'
    }
  })

  `$window.add_Closed({
    `$stopTimer.Stop()
    if (`$script:shortcutDropOverlayTimer) {
      try { `$script:shortcutDropOverlayTimer.Stop() } catch { }
    }
    Hide-ShortcutDropOverlay 'closed'
    if (`$script:oleDropRefreshTimer) {
      try { `$script:oleDropRefreshTimer.Stop() } catch { }
    }
    if (`$script:hostHandle -ne [IntPtr]::Zero) {
      [LivelySamInlineNative]::DisableShellDrop(`$script:hostHandle)
    }
    Unregister-NativeOleDropTargets
    [LivelySamInlineNative]::UninitializeOle()
    Unregister-HostHotkeys
    if (`$script:hostSource -and `$script:hostHook) {
      try { `$script:hostSource.RemoveHook(`$script:hostHook) } catch { }
    }
    if (`$script:activatorWindow) {
      try { `$script:activatorWindow.Close() } catch { }
      `$script:activatorWindow = `$null
    }
    if (`$script:shortcutDropOverlayWindow) {
      try { `$script:shortcutDropOverlayWindow.Close() } catch { }
      `$script:shortcutDropOverlayWindow = `$null
    }
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
  `$resolvedServerPidToStop = 0
  if (`$script:state -and `$script:state.server_pid) {
    `$resolvedServerPidToStop = [int]`$script:state.server_pid
  } elseif (`$resolvedServerPid) {
    `$resolvedServerPidToStop = [int]`$resolvedServerPid
  }
  if (`$resolvedServerPidToStop -gt 0 -and `$resolvedServerPidToStop -ne `$server.Id) {
    Stop-Process -Id `$resolvedServerPidToStop -Force -ErrorAction SilentlyContinue
  }
  if (`$server -and -not `$server.HasExited) { Stop-Process -Id `$server.Id -Force -ErrorAction SilentlyContinue }
  Clear-State
  `$currentResult = Read-JsonFile -Path `$ResultFile
  if (-not (`$currentResult -and `$currentResult.status -eq 'failed')) {
    Write-Result @{
      status = 'stopped'
      attached = `$false
      message = 'Local wallpaper host stopped.'
      updated_at = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    }
  }
  Log-Message 'Stopping local wallpaper host.'
}
"@

$launcherFile = Join-Path $runtimeDir "launch-inline.ps1"
$browserFallbackScript = Join-Path $rootPath "tools\local_wallpaper_browser_fallback.ps1"
Set-Content -LiteralPath $launcherFile -Value $launcherScript -Encoding UTF8
$script:currentInlineLauncher = $null

function Start-InlineLauncherProcess {
    Remove-Item -LiteralPath $resultFile -Force -ErrorAction SilentlyContinue
    $script:currentInlineLauncher = Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoProfile",
        "-STA",
        "-ExecutionPolicy", "Bypass",
        "-WindowStyle", "Hidden",
        "-File", $launcherFile
    ) -WindowStyle Hidden -PassThru
}

function Stop-InlineLauncherProcess {
    if ($script:currentInlineLauncher) {
        Stop-Process -Id $script:currentInlineLauncher.Id -Force -ErrorAction SilentlyContinue
        $script:currentInlineLauncher = $null
    }
}

function Start-BrowserFallbackProcess {
    Remove-Item -LiteralPath $resultFile -Force -ErrorAction SilentlyContinue
    $args = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-WindowStyle", "Hidden",
        "-File", $browserFallbackScript,
        "-Root", $rootPath,
        "-PreferredMonitor", $PreferredMonitor
    )

    if ($PreferredMonitorDevice) {
        $args += @("-PreferredMonitorDevice", $PreferredMonitorDevice)
    }
    if ($PreferredMonitorPrimary -ge 0) {
        $args += @("-PreferredMonitorPrimary", $PreferredMonitorPrimary)
    }

    if ($null -ne $PreferredMonitorX) {
        $args += @("-PreferredMonitorX", [string][int]$PreferredMonitorX)
    }
    if ($null -ne $PreferredMonitorY) {
        $args += @("-PreferredMonitorY", [string][int]$PreferredMonitorY)
    }
    if ($null -ne $PreferredMonitorWidth) {
        $args += @("-PreferredMonitorWidth", [string][int]$PreferredMonitorWidth)
    }
    if ($null -ne $PreferredMonitorHeight) {
        $args += @("-PreferredMonitorHeight", [string][int]$PreferredMonitorHeight)
    }
    if ($AllowPrimaryFallback) {
        $args += "-AllowPrimaryFallback"
    }

    Start-Process -FilePath "powershell.exe" -ArgumentList $args -WindowStyle Hidden | Out-Null
}

function Wait-InlineAttach {
    param([int]$TimeoutSeconds = 25)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $attached = $false
    $failureMessage = $null

    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500

        $state = Read-JsonFile -Path $stateFile
        if ($state -and $state.attached) {
            return @{
                attached = $true
                state = $state
                failure = $null
            }
        }

        $result = Read-JsonFile -Path $resultFile
        if ($result -and $result.status -eq "running" -and $result.attached) {
            return @{
                attached = $true
                state = (Read-JsonFile -Path $stateFile)
                failure = $null
            }
        }

        if ($result -and $result.status -eq "failed") {
            $failureMessage = if ($result.error) { [string]$result.error } else { [string]$result.message }
            break
        }
    }

    if (-not $failureMessage) {
        $result = Read-JsonFile -Path $resultFile
        if ($result -and $result.error) {
            $failureMessage = [string]$result.error
        } else {
            $failureMessage = "Timed out waiting for the wallpaper host to attach."
        }
    }

    return @{
        attached = $false
        state = $null
        failure = $failureMessage
    }
}

$attemptCount = 0
$maxAttempts = 4
$outcome = $null

while ($attemptCount -lt $maxAttempts) {
    $attemptCount += 1
    Start-InlineLauncherProcess
    $outcome = Wait-InlineAttach -TimeoutSeconds 25
    if ($outcome.attached) {
        break
    }

    Stop-InlineLauncherProcess

    $failureText = [string]$outcome.failure
    $shouldRetry = (
        $attemptCount -lt $maxAttempts -and
        $failureText -and
        ($failureText -match "WebView2 initialization failed" -or
         $failureText -match "0x8000FFFF" -or
         $failureText -match "0x800700AA" -or
         $failureText -match "E_UNEXPECTED")
    )

    if (-not $shouldRetry) {
        break
    }

    Start-Sleep -Milliseconds 1200
}

$failureText = if ($outcome) { [string]$outcome.failure } else { "" }
$shouldUseBrowserFallback = (
    -not ($outcome -and $outcome.attached) -and
    (
        -not $failureText -or
        $failureText -match "WebView2 initialization failed" -or
        $failureText -match "0x8000FFFF" -or
        $failureText -match "E_UNEXPECTED" -or
        $failureText -match "Timed out waiting for the wallpaper host to attach"
    )
)

if ($shouldUseBrowserFallback -and (Test-Path -LiteralPath $browserFallbackScript)) {
    Stop-InlineLauncherProcess
    Start-BrowserFallbackProcess
    $outcome = Wait-InlineAttach -TimeoutSeconds 25
}

if ($outcome -and $outcome.attached) {
    $state = $outcome.state
    Write-Host "[LivelySam] wallpaper host started" -ForegroundColor Green
    Write-Host "Stop: stop_local_wallpaper.cmd"
    if ($state.url) {
        Write-Host "URL: $($state.url)"
    }
    if ($state.renderer) {
        Write-Host "Renderer: $($state.renderer)"
    }
    if ($state.mode) {
        Write-Host "Mode: $($state.mode)"
    }
    if ($state.selected_monitor) {
        Write-Host "Monitor: $($state.selected_monitor)"
    }
    if ($state.selected_monitor_device) {
        Write-Host "Monitor Device: $($state.selected_monitor_device)"
    }
    exit 0
}

$failureMessage = if ($outcome) { [string]$outcome.failure } else { "Wallpaper host did not start." }
Write-Host "[LivelySam] wallpaper host failed to start" -ForegroundColor Red
Write-Host "Error: $failureMessage"
Write-Host "Log: $logFile"
exit 1

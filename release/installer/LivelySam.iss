#define MyAppName "LivelySam"
#include "version.iss.inc"

[Setup]
AppId={{4B6E18D3-FA0C-4DE2-BD17-AF95BE4195D2}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher=LivelySam Project
AppPublisherURL=https://github.com/{#MyGithubRepo}
AppSupportURL=https://github.com/{#MyGithubRepo}
AppUpdatesURL=https://github.com/{#MyGithubRepo}/releases
DefaultDirName={localappdata}\Programs\LivelySam
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
UninstallDisplayIcon={app}\dist\launcher\LivelySamLauncher.exe
OutputDir=..\..\dist\installer
OutputBaseFilename={#MyInstallerOutputBaseName}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
CloseApplicationsFilter=*.exe
RestartApplications=no
SetupIconFile=..\..\assets\icons\livelysam_launcher.ico

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Tasks]
Name: "desktopicon"; Description: "바탕 화면 바로가기 만들기"; GroupDescription: "추가 작업:"

[Files]
Source: "..\..\index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\version.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\LivelyInfo.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\LivelyProperties.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\start_livelysam_launcher.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\start_livelysam_launcher.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\start_local_wallpaper.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\stop_local_wallpaper.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\dist\launcher\LivelySamLauncher.exe"; DestDir: "{app}\dist\launcher"; Flags: ignoreversion
Source: "..\..\dist\launcher\BrowserPreviewHost.exe"; DestDir: "{app}\dist\launcher"; Flags: ignoreversion
Source: "..\..\dist\launcher\LocalStorageBridge.exe"; DestDir: "{app}\dist\launcher"; Flags: ignoreversion
Source: "..\..\assets\icons\livelysam_launcher.ico"; DestDir: "{app}\assets\icons"; Flags: ignoreversion
Source: "..\..\css\*"; DestDir: "{app}\css"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\js\*"; DestDir: "{app}\js"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "minigames\games\*.py,minigames\games\scan*.txt"
Source: "..\..\tools\start_local_wallpaper.ps1"; DestDir: "{app}\tools"; Flags: ignoreversion
Source: "..\..\tools\local_wallpaper_host.ps1"; DestDir: "{app}\tools"; Flags: ignoreversion
Source: "..\..\tools\ensure_local_storage_bridge.ps1"; DestDir: "{app}\tools"; Flags: ignoreversion

[Dirs]
Name: "{localappdata}\LivelySam"
Name: "{localappdata}\LivelySam\logs"
Name: "{localappdata}\LivelySam\runtime"
Name: "{localappdata}\LivelySam\user-data"

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\start_livelysam_launcher.vbs"; IconFilename: "{app}\assets\icons\livelysam_launcher.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\start_livelysam_launcher.vbs"; Tasks: desktopicon; IconFilename: "{app}\assets\icons\livelysam_launcher.ico"

[Run]
Filename: "{app}\start_livelysam_launcher.vbs"; Description: "LivelySam 실행"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\LivelySam\runtime"

[Code]
procedure TryTerminateProcessByImageName(const ImageName: string);
var
  ResultCode: Integer;
begin
  Exec(
    ExpandConstant('{sys}\taskkill.exe'),
    '/F /T /IM "' + ImageName + '"',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  );
end;

procedure CloseLivelySamProcesses;
begin
  TryTerminateProcessByImageName('LivelySamLauncher.exe');
  TryTerminateProcessByImageName('BrowserPreviewHost.exe');
  TryTerminateProcessByImageName('LocalStorageBridge.exe');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    CloseLivelySamProcesses;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    CloseLivelySamProcesses;
  end;
end;

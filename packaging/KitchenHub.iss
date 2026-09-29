#ifndef AppVersion
  #define AppVersion "0.1.1"
#endif
#ifndef SourceRoot
  #error SourceRoot must point to the staged Kitchen Hub directory.
#endif
#ifndef OutputDir
  #define OutputDir "."
#endif

#define AppName "Kitchen Hub"
#define AppId "{{B9517B05-AAD8-4ACF-BCC7-FF3C88E292E8}"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Kitchen Hub
DefaultDirName={localappdata}\Programs\KitchenHub
DefaultGroupName=Kitchen Hub
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=KitchenHub-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
UninstallDisplayName={#AppName}
VersionInfoVersion={#AppVersion}
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}

[Tasks]
Name: "autostart"; Description: "Start Kitchen Hub automatically after I sign in"; GroupDescription: "Startup:"; Flags: checkedonce
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Dirs]
Name: "{localappdata}\KitchenHub\data"; Flags: uninsneveruninstall
Name: "{localappdata}\KitchenHub\data\logs"; Flags: uninsneveruninstall

[Files]
Source: "{#SourceRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Kitchen Hub"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher\Start-KitchenHub.ps1"""; WorkingDir: "{app}"
Name: "{group}\Stop Kitchen Hub"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher\Stop-KitchenHub.ps1"""; WorkingDir: "{app}"
Name: "{group}\Configure always-on power"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\launcher\Set-KitchenHubPower.ps1"""; WorkingDir: "{app}\launcher"
Name: "{autodesktop}\Kitchen Hub"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher\Start-KitchenHub.ps1"""; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{userstartup}\Kitchen Hub"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher\Start-KitchenHub.ps1"""; WorkingDir: "{app}"; Tasks: autostart

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher\Start-KitchenHub.ps1"""; Description: "Launch Kitchen Hub"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher\Stop-KitchenHub.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "StopKitchenHub"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  StopScript: String;
begin
  Result := '';
  StopScript := ExpandConstant('{app}\launcher\Stop-KitchenHub.ps1');
  if FileExists(StopScript) then
    Exec(
      ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + StopScript + '"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode
    );
end;

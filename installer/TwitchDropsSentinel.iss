; Twitch Drops Sentinel: per-user installer (Inno Setup 6.3 or newer).
; Build: ISCC.exe /DAppVersion=3.6.1 /DSourceDir="<staged release folder>" installer\TwitchDropsSentinel.iss
; Add /DTEST_BUILD for the check build (no single-instance mutex, so it can install while a copy of the app runs).
; This file is UTF-8 without a BOM: Inno Setup 6.3+ reads that natively and no longer recommends a BOM.
; AppId below identifies the app to Windows for upgrades and uninstall. Never change it.

#ifndef AppVersion
  #error Pass the version: /DAppVersion=x.y.z
#endif
#ifndef SourceDir
  #error Pass the staged release folder: /DSourceDir=...
#endif

#define AppName "Twitch Drops Sentinel"
#define AppExe "TwitchDropsSentinel.exe"
#define RepoUrl "https://github.com/MortuisVMain/Twitch-Drops-Sentinel"

[Setup]
AppId={{18419608-0A2A-4C0A-9B06-78DA6D8F921C}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=MortuisVMain
AppPublisherURL={#RepoUrl}
AppSupportURL={#RepoUrl}/issues
AppUpdatesURL={#RepoUrl}/releases
VersionInfoVersion={#AppVersion}.0
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\Twitch Drops Sentinel
UsePreviousAppDir=yes
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
SetupIconFile=..\assets\app.ico
UninstallDisplayIcon={app}\assets\app.ico
Compression=lzma2/ultra64
SolidCompression=yes
OutputDir=..
OutputBaseFilename=Twitch_Drops_Sentinel_Setup_v{#AppVersion}
CloseApplications=yes
RestartApplications=no
#ifndef TEST_BUILD
AppMutex=Global\TwitchDropsSentinel_v3_Mutex
#endif

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
russian.UninstallAskData=Удалить настройки и вход в аккаунты? Если оставить, они вернутся при следующей установке.
english.UninstallAskData=Delete settings and account sign-ins? If you keep them, they come back at the next install.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Everything of the staged release except the user-data templates and the portable launcher
; (the installer leaves no Mark-of-the-Web on installed files, so the launcher's unblock step is not needed).
Source: "{#SourceDir}\*"; DestDir: "{app}"; Excludes: "config.json,Trophies.md,Запустить_Twitch_Drops_Sentinel.bat"; Flags: ignoreversion recursesubdirs createallsubdirs
; User data: written only when absent and never removed by the uninstaller (the uninstall question decides).
Source: "{#SourceDir}\config.json"; DestDir: "{app}"; Flags: onlyifdoesntexist uninsneveruninstall
Source: "{#SourceDir}\Trophies.md"; DestDir: "{app}"; Flags: onlyifdoesntexist uninsneveruninstall

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Check: not WizardNoIcons
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[InstallDelete]
; Leftovers of the built-in updater: a pending .update would replace the new exe with the old one at the next start.
Type: files; Name: "{app}\TwitchDropsSentinel.update"
Type: files; Name: "{app}\TwitchDropsSentinel.exe.old"
Type: filesandordirs; Name: "{app}\_staging"
; Program folders that are replaced as a whole (the bundle has hashed file names, bytecode caches go stale).
Type: filesandordirs; Name: "{app}\dist"
Type: filesandordirs; Name: "{app}\core\__pycache__"

[UninstallDelete]
; Program files that the app or its updater added after the install, and runtime output that is not user data.
Type: filesandordirs; Name: "{app}\portable_runtime"
Type: filesandordirs; Name: "{app}\dist"
Type: filesandordirs; Name: "{app}\assets"
Type: filesandordirs; Name: "{app}\steam_idle"
Type: filesandordirs; Name: "{app}\_staging"
Type: filesandordirs; Name: "{app}\core\__pycache__"
Type: filesandordirs; Name: "{app}\core\steam_idle"
Type: filesandordirs; Name: "{app}\core\lang"
Type: files; Name: "{app}\core\*.py"
Type: files; Name: "{app}\TwitchDropsSentinel.update"
Type: files; Name: "{app}\TwitchDropsSentinel.exe.old"
Type: filesandordirs; Name: "{app}\giveaways_engine\node_modules"
Type: filesandordirs; Name: "{app}\giveaways_engine\dist"
Type: filesandordirs; Name: "{app}\giveaways_engine\src"
Type: files; Name: "{app}\giveaways_engine\*.js"
Type: files; Name: "{app}\giveaways_engine\*.json"
Type: files; Name: "{app}\giveaways_engine\*.cmd"
Type: files; Name: "{app}\giveaways_engine\*.md"
Type: files; Name: "{app}\giveaways_engine\LICENSE"
Type: files; Name: "{app}\giveaways_engine\ClaimOutput_*.log"
Type: files; Name: "{app}\*.log"
Type: files; Name: "{app}\*.log.old"
Type: files; Name: "{app}\core\sentinel_service.log*"

[Code]
const
  RunKey = 'Software\Microsoft\Windows\CurrentVersion\Run';
  RunValue = 'TwitchDropsSentinel';
  SchedulerTask = 'FreeGamesClaimerStudio';

var
  DeleteUserData: Boolean;
  AskAboutData: Boolean;

{ /KEEPDATA=1 keeps, /KEEPDATA=0 deletes; anything else is -1 (not given). }
function KeepDataSwitch: Integer;
var
  I: Integer;
  Arg: String;
begin
  Result := -1;
  for I := 1 to ParamCount do
  begin
    Arg := Uppercase(ParamStr(I));
    if Arg = '/KEEPDATA=1' then Result := 1
    else if Arg = '/KEEPDATA=0' then Result := 0;
  end;
end;

function InitializeUninstall: Boolean;
begin
  Result := True;
  AskAboutData := False;
  case KeepDataSwitch of
    1: DeleteUserData := False;
    0: DeleteUserData := True;
  else
    begin
      { no switch: silent runs keep the data; interactive runs ask after the standard "remove?" confirmation }
      DeleteUserData := False;
      AskAboutData := not UninstallSilent;
    end;
  end;
end;

procedure RemoveOwnAutostart;
var
  Command: String;
begin
  { only the app's own value, and only when it points into this install folder }
  if RegQueryStringValue(HKCU, RunKey, RunValue, Command) then
  begin
    if Pos(Lowercase(AddBackslash(ExpandConstant('{app}'))), Lowercase(Command)) > 0 then
    begin
      if RegDeleteValue(HKCU, RunKey, RunValue) then
        Log('Removed autostart value ' + RunValue)
      else
        Log('Could not remove autostart value ' + RunValue);
    end
    else
      Log('Autostart value points elsewhere, left as is: ' + Command);
  end;
end;

procedure RemoveOwnSchedulerTask;
var
  Root, Script: String;
  ResultCode: Integer;
begin
  { the giveaways schedule is a Task Scheduler task whose action points into the install folder }
  Root := AddBackslash(ExpandConstant('{app}'));
  StringChangeEx(Root, '''', '''''', True);
  Script := '$t = Get-ScheduledTask -TaskName ''' + SchedulerTask + ''' -ErrorAction SilentlyContinue; ' +
    'if ($t) { $hit = $false; foreach ($a in $t.Actions) { ' +
    'if ((([string]$a.Execute + '' '' + [string]$a.Arguments).IndexOf(''' + Root + ''', [StringComparison]::OrdinalIgnoreCase)) -ge 0) { $hit = $true } } ' +
    'if ($hit) { Unregister-ScheduledTask -TaskName ''' + SchedulerTask + ''' -Confirm:$false } }';
  if Exec('powershell.exe', '-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "' + Script + '"',
          '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Log(Format('Scheduler task check finished with code %d', [ResultCode]))
  else
    Log('Could not run PowerShell to check the scheduler task: ' + SysErrorMessage(ResultCode));
end;

procedure DeleteByMask(const Dir, Mask: String);
var
  FindRec: TFindRec;
begin
  if FindFirst(AddBackslash(Dir) + Mask, FindRec) then
  try
    repeat
      if FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY = 0 then
        if not DeleteFile(AddBackslash(Dir) + FindRec.Name) then
          Log('Could not delete ' + AddBackslash(Dir) + FindRec.Name);
    until not FindNext(FindRec);
  finally
    FindClose(FindRec);
  end;
end;

procedure DeleteDir(const Path: String);
begin
  if DirExists(Path) then
    if not DelTree(Path, True, True, True) then
      Log('Could not delete ' + Path);
end;

procedure DeleteUserDataFiles;
var
  App: String;
begin
  App := AddBackslash(ExpandConstant('{app}'));
  DeleteFile(App + 'config.json');
  DeleteFile(App + 'Trophies.md');
  DeleteFile(App + 'cookies.jar');
  DeleteFile(App + 'core\settings.json');
  DeleteFile(App + 'core\cookies.jar');
  DeleteByMask(RemoveBackslash(App), 'steam_idle_*.json');
  DeleteByMask(RemoveBackslash(App), 'steam_idle_*.json.corrupt');
  DeleteDir(App + 'data');
  DeleteDir(App + 'giveaways_engine\data');
  DeleteDir(App + '.backup_state');
  { empty folders left behind; RemoveDir does nothing when something is still inside }
  RemoveDir(App + 'giveaways_engine');
  RemoveDir(App + 'core');
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    { "No" is the default: keeping the sign-ins is the safe answer }
    if AskAboutData then
      DeleteUserData := MsgBox(CustomMessage('UninstallAskData'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
    Log(Format('Uninstall: delete user data = %d', [Ord(DeleteUserData)]));
    RemoveOwnAutostart;
    RemoveOwnSchedulerTask;
  end
  else if CurUninstallStep = usPostUninstall then
  begin
    if DeleteUserData then
      DeleteUserDataFiles;
  end;
end;

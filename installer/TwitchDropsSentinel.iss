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
russian.MigrateTitle=Перенести настройки из старой папки
english.MigrateTitle=Move settings from the old folder
russian.MigrateDesc=Если вы пользовались версией из ZIP-архива, её настройки и входы в аккаунты можно взять с собой.
english.MigrateDesc=If you used the ZIP version, you can bring its settings and account sign-ins along.
russian.MigrateCheck=Перенести настройки и входы в аккаунты из папки:
english.MigrateCheck=Move settings and account sign-ins from this folder:
russian.MigrateReplace=Заменить файлы, которые уже есть в новой папке
english.MigrateReplace=Replace files that already exist in the new folder
russian.MigrateNote=Файлы копируются: старая папка остаётся как есть. Закройте старую копию программы, пока идёт установка.
english.MigrateNote=Files are copied: the old folder stays as it is. Close the old copy of the app while setup runs.
russian.MigratePick=Выберите папку со старой копией Twitch Drops Sentinel
english.MigratePick=Pick the folder with the old copy of Twitch Drops Sentinel
russian.MigrateBadFolder=В этой папке нет TwitchDropsSentinel.exe и config.json. Выберите папку, куда вы распаковали ZIP-архив.
english.MigrateBadFolder=This folder has no TwitchDropsSentinel.exe and config.json. Pick the folder where you unpacked the ZIP.
russian.MigrateSameFolder=Это папка, в которую ставится программа. Выберите старую папку.
english.MigrateSameFolder=This is the folder the app is being installed into. Pick the old folder.
russian.MigrateFailed=Не все файлы удалось скопировать (%1). Список файлов в журнале установки.
english.MigrateFailed=Some files could not be copied (%1). The setup log lists them.
russian.InstallNode=Установить Node.js LTS через winget (нужен для Раздач и Steam IDLE)
english.InstallNode=Install Node.js LTS with winget (needed for Giveaways and Steam IDLE)
russian.OpenNodeSite=Открыть nodejs.org: там Node.js LTS (нужен для Раздач и Steam IDLE)
english.OpenNodeSite=Open nodejs.org to get Node.js LTS (needed for Giveaways and Steam IDLE)

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
; Node.js is needed by Giveaways and Steam IDLE. winget runs in a visible console (the window stays open when it fails);
; both exit codes (--scope user, then the machine install) land in the setup log. Silent setups skip it unless /INSTALLNODE=1 is given; without winget a link is offered.
Filename: "{cmd}"; Parameters: "/v:on /c ""winget install --id OpenJS.NodeJS.LTS -e --scope user --accept-package-agreements --accept-source-agreements & set RC=!errorlevel! & echo winget with --scope user: exit code !RC!>>""%TEMP%\tds-winget.log"" & if !RC! neq 0 (echo. & echo Retrying without --scope: this installs for all users and Windows asks for permission. & winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements & set RC=!errorlevel! & echo winget without --scope: exit code !RC!>>""%TEMP%\tds-winget.log"" & if !RC! neq 0 (echo. & echo winget failed. & pause)) & exit /b !RC!"""; Description: "{cm:InstallNode}"; Flags: postinstall skipifsilent waituntilterminated; Check: OfferNodeWinget
Filename: "{cmd}"; Parameters: "/v:on /c ""winget install --id OpenJS.NodeJS.LTS -e --scope user --accept-package-agreements --accept-source-agreements & set RC=!errorlevel! & echo winget with --scope user: exit code !RC!>>""%TEMP%\tds-winget.log"" & if !RC! neq 0 (echo. & echo Retrying without --scope: this installs for all users and Windows asks for permission. & winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements & set RC=!errorlevel! & echo winget without --scope: exit code !RC!>>""%TEMP%\tds-winget.log"") & exit /b !RC!"""; Flags: waituntilterminated; Check: NodeBySwitch
Filename: "https://nodejs.org/en/download"; Description: "{cm:OpenNodeSite}"; Flags: postinstall shellexec skipifsilent unchecked; Check: OfferNodeLink
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

{ /NAME=value switch of the setup command line ('' when not given); surrounding quotes are dropped. }
function SwitchValue(const Name: String): String;
var
  I: Integer;
  Arg, Prefix: String;
begin
  Result := '';
  Prefix := '/' + Uppercase(Name) + '=';
  for I := 1 to ParamCount do
  begin
    Arg := ParamStr(I);
    if Pos(Prefix, Uppercase(Arg)) = 1 then
      Result := Trim(RemoveQuotes(Copy(Arg, Length(Prefix) + 1, MaxInt)));
  end;
end;

{ ---- Move settings from an unpacked ZIP copy (fresh installs only; files are copied, never moved) ---- }
var
  MigratePage: TWizardPage;
  MigrateCheck, MigrateReplace: TNewCheckBox;
  MigrateEdit: TNewEdit;
  MigrateBrowse: TNewButton;
  MigrateNote: TNewStaticText;
  MigrateFresh: Boolean;
  MigrateOverwrite: Boolean;
  MigrateCopied, MigrateSkipped, MigrateFailed: Integer;

{ A fresh install has no uninstall entry yet; an upgrade over an installed copy has one. }
function IsFreshInstall: Boolean;
begin
  Result := not RegKeyExists(HKCU,
    ExpandConstant('Software\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupSetting("AppId")}_is1'));
end;

function SamePath(const A, B: String): Boolean;
begin
  Result := CompareText(RemoveBackslash(ExpandFileName(A)), RemoveBackslash(ExpandFileName(B))) = 0;
end;

function IsOldCopy(const Dir: String): Boolean;
begin
  Result := (Dir <> '') and FileExists(AddBackslash(Dir) + '{#AppExe}') and FileExists(AddBackslash(Dir) + 'config.json');
end;

{ '' when the folder can be used as the source, else the name of the custom message that says why not. }
function MigrationProblem(const Source, Target: String): String;
begin
  Result := '';
  if SamePath(Source, Target) then
    Result := 'MigrateSameFolder'
  else if not IsOldCopy(Source) then
    Result := 'MigrateBadFolder';
end;

{ The folder itself and its direct subfolders; of several copies the last by name wins (the newest version number). }
procedure ScanRoot(const Root: String; var Found: String);
var
  FindRec: TFindRec;
  Sub: String;
begin
  if (Root = '') or not DirExists(Root) then
    Exit;
  if IsOldCopy(Root) then
    Found := Root;
  if FindFirst(AddBackslash(Root) + '*', FindRec) then
  try
    repeat
      if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY <> 0) and (FindRec.Name <> '.') and (FindRec.Name <> '..') then
      begin
        Sub := AddBackslash(Root) + FindRec.Name;
        if IsOldCopy(Sub) then
          Found := Sub;
      end;
    until not FindNext(FindRec);
  finally
    FindClose(FindRec);
  end;
end;

{ Desktop, Downloads, Documents, one level deep; the first place with a copy decides. }
function FindOldCopy: String;
begin
  Result := '';
  ScanRoot(ExpandConstant('{userdesktop}'), Result);
  if Result = '' then
    ScanRoot(AddBackslash(GetEnv('USERPROFILE')) + 'Downloads', Result);
  if Result = '' then
    ScanRoot(ExpandConstant('{userdocs}'), Result);
end;

{ True for a junction or symlink (reparse point): its own entry carries the attribute. }
function IsLink(const Path: String): Boolean;
var
  FindRec: TFindRec;
begin
  Result := False;
  if FindFirst(RemoveBackslash(Path), FindRec) then
  try
    Result := FindRec.Attributes and $400 <> 0;
  finally
    FindClose(FindRec);
  end;
end;

{ True when any part of Rel below Root (a folder on the way, or the item itself) is a link. }
function PathHasLink(const Root, Rel: String): Boolean;
var
  Rest, Current: String;
  P: Integer;
begin
  Result := False;
  Current := RemoveBackslash(Root);
  Rest := Rel;
  while Rest <> '' do
  begin
    P := Pos('\', Rest);
    if P = 0 then
    begin
      Current := Current + '\' + Rest;
      Rest := '';
    end
    else
    begin
      Current := Current + '\' + Copy(Rest, 1, P - 1);
      Rest := Copy(Rest, P + 1, MaxInt);
    end;
    if IsLink(Current) then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

procedure MigrateFile(const SrcRoot, DstRoot, Rel: String);
var
  Src, Dst: String;
begin
  Src := AddBackslash(SrcRoot) + Rel;
  Dst := AddBackslash(DstRoot) + Rel;
  if not FileExists(Src) then
    Exit;
  if PathHasLink(SrcRoot, Rel) then
  begin
    Log('Migrate: skipped (link, not followed) ' + Src);
    Exit;
  end;
  if FileExists(Dst) and not MigrateOverwrite then
  begin
    Log('Migrate: skipped (already exists) ' + Dst);
    MigrateSkipped := MigrateSkipped + 1;
  end
  else if not ForceDirectories(ExtractFileDir(Dst)) then
  begin
    Log('Migrate: FAILED, cannot create the folder of ' + Dst);
    MigrateFailed := MigrateFailed + 1;
  end
  else if CopyFile(Src, Dst, False) then
  begin
    Log('Migrate: copied ' + Src + ' -> ' + Dst);
    MigrateCopied := MigrateCopied + 1;
  end
  else
  begin
    Log('Migrate: FAILED to copy ' + Src + ' -> ' + Dst);
    MigrateFailed := MigrateFailed + 1;
  end;
end;

{ Files of one folder that match the mask (no subfolders). }
procedure MigrateMask(const SrcRoot, DstRoot, Mask: String);
var
  FindRec: TFindRec;
begin
  if FindFirst(AddBackslash(SrcRoot) + Mask, FindRec) then
  try
    repeat
      if FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY = 0 then
        MigrateFile(SrcRoot, DstRoot, FindRec.Name);
    until not FindNext(FindRec);
  finally
    FindClose(FindRec);
  end;
end;

{ A folder with everything inside (junctions and symlinks are not followed). }
procedure MigrateTree(const SrcRoot, DstRoot, Rel: String);
var
  FindRec: TFindRec;
  Dir: String;
begin
  Dir := AddBackslash(SrcRoot) + Rel;
  if not DirExists(Dir) then
    Exit;
  if PathHasLink(SrcRoot, Rel) then
  begin
    Log('Migrate: skipped (link, not followed) ' + Dir);
    Exit;
  end;
  if FindFirst(AddBackslash(Dir) + '*', FindRec) then
  try
    repeat
      if (FindRec.Name <> '.') and (FindRec.Name <> '..') then
      begin
        if FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY <> 0 then
          MigrateTree(SrcRoot, DstRoot, AddBackslash(Rel) + FindRec.Name)
        else
          MigrateFile(SrcRoot, DstRoot, AddBackslash(Rel) + FindRec.Name);
      end;
    until not FindNext(FindRec);
  finally
    FindClose(FindRec);
  end;
end;

procedure UpdateMigrateControls;
begin
  MigrateEdit.Enabled := MigrateCheck.Checked;
  MigrateBrowse.Enabled := MigrateCheck.Checked;
  MigrateReplace.Enabled := MigrateCheck.Checked;
end;

procedure MigrateCheckClick(Sender: TObject);
begin
  UpdateMigrateControls;
end;

procedure MigrateBrowseClick(Sender: TObject);
var
  Dir: String;
begin
  Dir := MigrateEdit.Text;
  if BrowseForFolder(CustomMessage('MigratePick'), Dir, False) then
    MigrateEdit.Text := Dir;
end;

function MigrateSource: String;
begin
  Result := RemoveBackslash(RemoveQuotes(Trim(MigrateEdit.Text)));
end;

procedure InitializeWizard;
var
  Given, Found: String;
begin
  DeleteFile(ExpandConstant('{%TEMP}\tds-winget.log'));
  MigrateFresh := IsFreshInstall;
  Given := SwitchValue('MIGRATEFROM');
  Found := '';
  if MigrateFresh and (Given = '') then
  begin
    Found := GetPreviousData('MigrateFrom', '');
    if not IsOldCopy(Found) then
      Found := '';
    { a silent setup copies only from a folder it was told about }
    if (Found = '') and not WizardSilent then
      Found := FindOldCopy;
  end;

  MigratePage := CreateCustomPage(wpSelectDir, CustomMessage('MigrateTitle'), CustomMessage('MigrateDesc'));

  MigrateCheck := TNewCheckBox.Create(MigratePage);
  MigrateCheck.Parent := MigratePage.Surface;
  MigrateCheck.Left := 0;
  MigrateCheck.Top := 0;
  MigrateCheck.Width := MigratePage.SurfaceWidth;
  MigrateCheck.Caption := CustomMessage('MigrateCheck');
  MigrateCheck.OnClick := @MigrateCheckClick;

  MigrateBrowse := TNewButton.Create(MigratePage);
  MigrateBrowse.Parent := MigratePage.Surface;
  MigrateBrowse.Width := ScaleX(90);
  MigrateBrowse.Height := ScaleY(23);
  MigrateBrowse.Left := MigratePage.SurfaceWidth - MigrateBrowse.Width;
  MigrateBrowse.Top := MigrateCheck.Top + MigrateCheck.Height + ScaleY(6);
  MigrateBrowse.Caption := WizardForm.DirBrowseButton.Caption;
  MigrateBrowse.OnClick := @MigrateBrowseClick;

  MigrateEdit := TNewEdit.Create(MigratePage);
  MigrateEdit.Parent := MigratePage.Surface;
  MigrateEdit.Left := 0;
  MigrateEdit.Top := MigrateBrowse.Top;
  MigrateEdit.Width := MigrateBrowse.Left - ScaleX(8);

  MigrateReplace := TNewCheckBox.Create(MigratePage);
  MigrateReplace.Parent := MigratePage.Surface;
  MigrateReplace.Left := 0;
  MigrateReplace.Top := MigrateBrowse.Top + MigrateBrowse.Height + ScaleY(14);
  MigrateReplace.Width := MigratePage.SurfaceWidth;
  MigrateReplace.Caption := CustomMessage('MigrateReplace');

  MigrateNote := TNewStaticText.Create(MigratePage);
  MigrateNote.Parent := MigratePage.Surface;
  MigrateNote.Left := 0;
  MigrateNote.Top := MigrateReplace.Top + MigrateReplace.Height + ScaleY(14);
  MigrateNote.Width := MigratePage.SurfaceWidth;
  MigrateNote.AutoSize := False;
  MigrateNote.WordWrap := True;
  MigrateNote.Height := ScaleY(48);
  MigrateNote.Caption := CustomMessage('MigrateNote');

  if Given <> '' then
    MigrateEdit.Text := Given
  else
    MigrateEdit.Text := Found;
  MigrateCheck.Checked := MigrateEdit.Text <> '';
  MigrateReplace.Checked := SwitchValue('MIGRATEREPLACE') = '1';
  UpdateMigrateControls;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = MigratePage.ID) and not MigrateFresh;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Problem: String;
begin
  Result := True;
  if (CurPageID = MigratePage.ID) and MigrateCheck.Checked then
  begin
    Problem := MigrationProblem(MigrateSource, RemoveBackslash(WizardDirValue));
    if Problem <> '' then
    begin
      if WizardSilent then
      begin
        { nobody to ask: say why in the log and install without migrating (a "False" here would abort the whole setup) }
        Log('Migrate: skipped, ' + Problem + ' (' + MigrateSource + ')');
        MigrateCheck.Checked := False;
      end
      else
      begin
        MsgBox(CustomMessage(Problem), mbError, MB_OK);
        Result := False;
      end;
    end;
  end;
end;

procedure RegisterPreviousData(PreviousDataKey: Integer);
begin
  { remembers the last folder used }
  if MigrateFresh and MigrateCheck.Checked and (MigrateSource <> '') then
    SetPreviousData(PreviousDataKey, 'MigrateFrom', MigrateSource);
end;

procedure RunMigration;
var
  Target, Source, Problem: String;
begin
  if not MigrateFresh then
  begin
    if SwitchValue('MIGRATEFROM') <> '' then
      Log('Migrate: ignored, an installed copy is being upgraded');
    Exit;
  end;
  if not MigrateCheck.Checked then
  begin
    Log('Migrate: not requested');
    Exit;
  end;
  Source := MigrateSource;
  Target := RemoveBackslash(ExpandConstant('{app}'));
  Problem := MigrationProblem(Source, Target);
  if Problem <> '' then
  begin
    Log('Migrate: skipped, ' + Problem + ' (' + Source + ')');
    Exit;
  end;
  MigrateOverwrite := MigrateReplace.Checked;
  MigrateCopied := 0;
  MigrateSkipped := 0;
  MigrateFailed := 0;
  Log(Format('Migrate: from %s to %s, replace existing = %d', [Source, Target, Ord(MigrateOverwrite)]));

  { the user data the app keeps next to its exe (the same list the uninstaller can delete) }
  MigrateFile(Source, Target, 'config.json');
  MigrateFile(Source, Target, 'Trophies.md');
  MigrateFile(Source, Target, 'cookies.jar');
  MigrateFile(Source, Target, 'core\settings.json');
  MigrateFile(Source, Target, 'core\cookies.jar');
  MigrateMask(Source, Target, 'steam_idle_*.json');
  MigrateTree(Source, Target, 'data');
  MigrateTree(Source, Target, 'giveaways_engine\data');

  Log(Format('Migrate: done, %d copied, %d skipped, %d failed', [MigrateCopied, MigrateSkipped, MigrateFailed]));
  if (MigrateFailed > 0) and not WizardSilent then
    MsgBox(FmtMessage(CustomMessage('MigrateFailed'), [IntToStr(MigrateFailed)]), mbError, MB_OK);
end;

{ ---- Node.js (Giveaways and Steam IDLE need it) ---- }
function NodeFound: Boolean;
begin
  Result := (FileSearch('node.exe', GetEnv('PATH')) <> '')
    or FileExists(ExpandConstant('{commonpf64}\nodejs\node.exe'))
    or FileExists(ExpandConstant('{commonpf32}\nodejs\node.exe'))
    or FileExists(ExpandConstant('{localappdata}\Programs\nodejs\node.exe'));
end;

function WingetFound: Boolean;
begin
  Result := (FileSearch('winget.exe', GetEnv('PATH')) <> '')
    or FileExists(ExpandConstant('{localappdata}\Microsoft\WindowsApps\winget.exe'));
end;

{ finish page: a ticked item that installs Node.js, only when it is missing and winget can do it }
function OfferNodeWinget: Boolean;
begin
  Result := (not NodeFound) and WingetFound;
end;

{ finish page: without winget, only a pointer to nodejs.org }
function OfferNodeLink: Boolean;
begin
  Result := (not NodeFound) and (not WingetFound);
end;

{ a silent setup installs Node.js only when asked with /INSTALLNODE=1 }
function NodeBySwitch: Boolean;
begin
  Result := WizardSilent and (SwitchValue('INSTALLNODE') = '1') and (not NodeFound) and WingetFound;
end;

{ The winget command lines write their exit codes to this file; setup copies them into its log when it ends. }
function WingetLogPath: String;
begin
  Result := ExpandConstant('{%TEMP}\tds-winget.log');
end;

procedure DeinitializeSetup;
var
  Lines: TArrayOfString;
  I: Integer;
begin
  if FileExists(WingetLogPath) then
  begin
    if LoadStringsFromFile(WingetLogPath, Lines) then
      for I := 0 to GetArrayLength(Lines) - 1 do
        Log('Node.js ' + Trim(Lines[I]))
    else
      Log('Node.js: could not read ' + WingetLogPath);
    DeleteFile(WingetLogPath);
  end;
end;

procedure LogNodeState;
begin
  Log(Format('Node.js check: node.exe found = %d, winget found = %d, silent = %d, /INSTALLNODE=%s', [Ord(NodeFound), Ord(WingetFound), Ord(WizardSilent), SwitchValue('INSTALLNODE')]));
  if WizardSilent and (not NodeFound) and (not NodeBySwitch) then
    Log('Node.js is missing; a silent setup installs it only with /INSTALLNODE=1 and winget present');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  { before the program files go in: the template config.json is written only when none exists }
  if CurStep = ssInstall then
    RunMigration
  else if CurStep = ssPostInstall then
    LogNodeState;
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

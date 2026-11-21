<#
.SYNOPSIS
  End-to-end check of the Inno Setup installer: compile a TEST_BUILD, install, reinstall, uninstall (keep/delete data).
.DESCRIPTION
  Never launches the installed app. Installs only into a scratch folder with /CURRENTUSER /NOICONS.
  Prints PASS/FAIL per assertion and exits 1 when any fails. Cleans up in finally.
.PARAMETER StageDir
  Staged release folder (the output of tools/create_clean_release.py). Default: newest folder under dist_release.
.PARAMETER Scratch
  Scratch root for the compiled setup and the test installs. Default: a new folder in the temp directory.
.PARAMETER Iscc
  Path to ISCC.exe. Default: $env:ISCC, then the standard Inno Setup 6 locations.
.PARAMETER StaticOnly
  Run only the static checks of the script text (no compile, no install).
#>
param(
    [string]$StageDir = "",
    [string]$Scratch = "",
    [string]$Iscc = "",
    [switch]$StaticOnly
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$issPath = Join-Path $repo "installer\TwitchDropsSentinel.iss"
$script:failures = 0

function Assert-That([bool]$Condition, [string]$Name) {
    if ($Condition) { Write-Host "[PASS] $Name" } else { Write-Host "[FAIL] $Name"; $script:failures++ }
}

function Find-Iscc([string]$Explicit) {
    $candidates = @($Explicit, $env:ISCC,
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe")
    foreach ($c in $candidates) { if ($c -and (Test-Path -LiteralPath $c)) { return $c } }
    return $null
}

function Get-ShortcutSnapshot {
    $dirs = @([Environment]::GetFolderPath("Programs"), [Environment]::GetFolderPath("Desktop"),
              [Environment]::GetFolderPath("CommonPrograms"), [Environment]::GetFolderPath("CommonDesktopDirectory"))
    $found = @()
    foreach ($d in $dirs) {
        if ($d -and (Test-Path -LiteralPath $d)) {
            $found += Get-ChildItem -LiteralPath $d -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
        }
    }
    return ($found | Sort-Object)
}

function Get-RunValue {
    $item = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue
    if ($item -and ($item.PSObject.Properties.Name -contains "TwitchDropsSentinel")) { return [string]$item.TwitchDropsSentinel }
    return ""
}

function Invoke-Setup([string]$Exe, [string[]]$ArgList, [string]$What) {
    # CreateProcess without the shell: Start-Process (ShellExecute) would stop at the "Open File - Security Warning"
    # dialog for a setup that carries Mark-of-the-Web, and nobody is there to click it.
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    $psi.Arguments = ($ArgList -join " ")
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $p = [Diagnostics.Process]::Start($psi)
    if (-not $p.WaitForExit(600000)) { $p.Kill(); Assert-That $false "$What finished within 10 minutes"; return }
    Assert-That ($p.ExitCode -eq 0) "$What exits 0 (got $($p.ExitCode))"
}

function Wait-Gone([string]$Path, [int]$Seconds = 60) {
    $end = (Get-Date).AddSeconds($Seconds)
    while ((Test-Path -LiteralPath $Path) -and ((Get-Date) -lt $end)) { Start-Sleep -Milliseconds 300 }
    return -not (Test-Path -LiteralPath $Path)
}


# --- static checks of the script text ---------------------------------------
function Test-IssStatic([string]$Text) {
    $must = [ordered]@{
        # move settings from an unpacked ZIP copy
        "migrate page is created after the folder page"  = 'CreateCustomPage\(wpSelectDir'
        "migrate page title (ru)"                        = 'russian\.MigrateTitle=\u041f\u0435\u0440\u0435\u043d\u0435\u0441\u0442\u0438 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0438\u0437 \u0441\u0442\u0430\u0440\u043e\u0439 \u043f\u0430\u043f\u043a\u0438'
        "migrate page title (en)"                        = 'english\.MigrateTitle=Move settings from the old folder'
        "migrate page is skipped on an upgrade"          = 'ShouldSkipPage[\s\S]*MigrateFresh'
        "migrate fresh test reads the uninstall key"     = 'RegKeyExists\(HKCU[\s\S]*Uninstall'
        "migrate /MIGRATEFROM switch"                    = "'MIGRATEFROM'"
        "migrate /MIGRATEREPLACE switch"                 = "'MIGRATEREPLACE'"
        "migrate folder picker"                          = 'BrowseForFolder'
        "migrate replace checkbox text (ru)"             = 'russian\.MigrateReplace=\u0417\u0430\u043c\u0435\u043d\u0438\u0442\u044c'
        "migrate scans Desktop"                          = '\{userdesktop\}'
        "migrate scans Documents"                        = '\{userdocs\}'
        "migrate scans Downloads"                        = 'Downloads'
        "migrate remembers the last folder"              = 'RegisterPreviousData|SetPreviousData'
        "migrate copies, never moves (CopyFile)"         = 'CopyFile\('
        "migrate logs every copied file"                 = "Log\('Migrate: copied"
        "migrate logs skipped files"                     = "Log\('Migrate: skipped"
        "migrate list: config.json"                      = "MigrateFile\([^\r\n]*'config\.json'"
        "migrate list: Trophies.md"                      = "MigrateFile\([^\r\n]*'Trophies\.md'"
        "migrate list: cookies.jar"                      = "MigrateFile\([^\r\n]*'cookies\.jar'"
        "migrate list: core\settings.json"               = "MigrateFile\([^\r\n]*'core\\settings\.json'"
        "migrate list: core\cookies.jar"                 = "MigrateFile\([^\r\n]*'core\\cookies\.jar'"
        "migrate list: steam_idle_*.json"                = "MigrateMask\([^\r\n]*'steam_idle_\*\.json'"
        "migrate list: data folder"                      = "MigrateTree\([^\r\n]*'data'"
        "migrate list: giveaways_engine\data folder"     = "MigrateTree\([^\r\n]*'giveaways_engine\\data'"
        "migrate: links are not followed (reparse attribute)" = 'and \$400'
        "migrate: links are logged"                      = "Log\('Migrate: skipped \(link, not followed\)"
        "migrate: the root folders are checked for links" = 'PathHasLink\(SrcRoot, Rel\)'
        "migrate: a pasted path loses its quotes"        = 'RemoveQuotes\(Trim\(MigrateEdit\.Text\)\)'
        # Node.js through winget
        "node: retry without --scope"                    = 'winget install --id OpenJS\.NodeJS\.LTS -e --accept-package-agreements --accept-source-agreements'
        "node: both winget results go to the setup log"  = '(?s)tds-winget\.log.*LoadStringsFromFile\(WingetLogPath'
        "node: exact winget command"                    = 'winget install --id OpenJS\.NodeJS\.LTS -e --scope user --accept-package-agreements --accept-source-agreements'
        "node: finish page item is postinstall + skipifsilent" = 'Flags: postinstall skipifsilent[^\r\n]*Check: OfferNodeWinget'
        "node: /INSTALLNODE=1 switch"                    = "'INSTALLNODE'"
        "node: label (ru)"                               = 'russian\.InstallNode=\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c Node\.js LTS \u0447\u0435\u0440\u0435\u0437 winget \(\u043d\u0443\u0436\u0435\u043d \u0434\u043b\u044f \u0420\u0430\u0437\u0434\u0430\u0447 \u0438 Steam IDLE\)'
        "node: label (en)"                               = 'english\.InstallNode=Install Node\.js LTS with winget \(needed for Giveaways and Steam IDLE\)'
        "node: nodejs.org note when winget is missing"   = 'https://nodejs\.org[^\r\n]*Check: OfferNodeLink'
        "node: looks for node.exe on PATH"               = "FileSearch\('node\.exe'"
        "node: looks for winget.exe"                     = "winget\.exe"
    }
    foreach ($k in $must.Keys) { Assert-That ($Text -match $must[$k]) "static: $k" }
}

function New-TestFile([string]$Path, [string]$Text) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}

function Get-TreeHash([string]$Root) {
    # relative path + content hash of every file: equal strings mean an equal tree
    $base = (Resolve-Path -LiteralPath $Root).Path.TrimEnd("\")
    $lines = Get-ChildItem -LiteralPath $Root -Recurse -Force -File | Sort-Object FullName | ForEach-Object {
        $_.FullName.Substring($base.Length) + ":" + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
    return ($lines -join "|")
}

function Invoke-FakeWinget([string]$CmdLine, [string]$Dir, [int]$ScopeRc, [int]$MachineRc) {
    # Runs the finish-page command line with a fake winget.exe first on a PATH that holds nothing else but System32,
    # so the real winget cannot be reached. Returns the exit code, the arguments of every call and the lines of tds-winget.log.
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    $fakeExe = Join-Path $Dir "winget.exe"
    if (-not (Test-Path -LiteralPath $fakeExe)) {
        $cls = "P" + [Guid]::NewGuid().ToString("N")
        $src = 'using System; using System.IO; public static class ' + $cls + ' { public static int Main(string[] a) { string s = string.Join(" ", a); File.AppendAllText(Environment.GetEnvironmentVariable("FAKE_CALLS"), s + "\r\n"); return int.Parse(Environment.GetEnvironmentVariable(s.Contains("--scope user") ? "FAKE_SCOPE_RC" : "FAKE_MACHINE_RC")); } }'
        Add-Type -TypeDefinition $src -OutputAssembly $fakeExe -OutputType ConsoleApplication
    }
    $calls = Join-Path $Dir "calls.txt"
    $wlog = Join-Path $Dir "tds-winget.log"
    Remove-Item -LiteralPath $calls, $wlog -ErrorAction SilentlyContinue
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = Join-Path $env:SystemRoot "System32\cmd.exe"
    $psi.Arguments = $CmdLine
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.EnvironmentVariables["PATH"] = "$Dir;" + (Join-Path $env:SystemRoot "System32")
    $psi.EnvironmentVariables["TEMP"] = $Dir
    $psi.EnvironmentVariables["FAKE_CALLS"] = $calls
    $psi.EnvironmentVariables["FAKE_SCOPE_RC"] = [string]$ScopeRc
    $psi.EnvironmentVariables["FAKE_MACHINE_RC"] = [string]$MachineRc
    $p = [Diagnostics.Process]::Start($psi)
    $p.StandardInput.Close()   # a "pause" at the end reads end-of-input and returns
    $null = $p.StandardOutput.ReadToEndAsync()
    if (-not $p.WaitForExit(30000)) { $p.Kill() }
    $callLines = @(); if (Test-Path -LiteralPath $calls) { $callLines = @(Get-Content -LiteralPath $calls) }
    $logLines = @(); if (Test-Path -LiteralPath $wlog) { $logLines = @(Get-Content -LiteralPath $wlog) }
    return @{ Exit = $p.ExitCode; Calls = $callLines; Log = $logLines }
}

function Remove-TestInstall([string]$Dir, [string]$Log) {
    # uninstall and delete the data; true when the folder is gone or holds no files
    $u = Join-Path $Dir "unins000.exe"
    if (-not (Test-Path -LiteralPath $u)) { return $false }
    Invoke-Setup $u @("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/KEEPDATA=0", "/LOG=`"$Log`"") "uninstall $Dir"
    if (Wait-Gone $Dir) { return $true }
    return (@(Get-ChildItem -LiteralPath $Dir -Recurse -Force -File -ErrorAction SilentlyContinue).Count -eq 0)
}

$ownScratch = $false
try {
    if (-not (Test-Path -LiteralPath $issPath)) { throw "No installer script to compile" }
    Assert-That $true "installer script exists: installer\TwitchDropsSentinel.iss"
    Test-IssStatic (Get-Content -Raw -Encoding UTF8 $issPath)
    if ($StaticOnly) {
        if ($script:failures -gt 0) { Write-Host "RESULT: $($script:failures) check(s) FAILED"; exit 1 }
        Write-Host "RESULT: all static checks passed"
        exit 0
    }
    # --- inputs ---------------------------------------------------------------
    if (-not $StageDir) {
        $newest = Get-ChildItem (Join-Path $repo "dist_release") -Directory -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $newest) { throw "No staged release: run tools/create_clean_release.py first or pass -StageDir" }
        $StageDir = $newest.FullName
    }
    if (-not (Test-Path -LiteralPath (Join-Path $StageDir "TwitchDropsSentinel.exe"))) { throw "Not a staged release: $StageDir" }
    if (-not $Scratch) {
        $Scratch = Join-Path ([IO.Path]::GetTempPath()) ("sentinel-installer-check-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
    }
    $ownScratch = $true
    New-Item -ItemType Directory -Force -Path $Scratch | Out-Null
    $Scratch = (Resolve-Path -LiteralPath $Scratch).Path
    $isccExe = Find-Iscc $Iscc
    if (-not $isccExe) { throw "ISCC.exe not found (set `$env:ISCC or pass -Iscc)" }

    $version = (Get-Content -Raw (Join-Path $repo "core\version.py")) -replace '(?s).*__version__\s*=\s*"([^"]+)".*', '$1'
    $installA = Join-Path $Scratch "install-a"
    $script:activeInstall = $installA
    $buildDir = Join-Path $Scratch "build"
    $logDir = Join-Path $Scratch "logs"
    New-Item -ItemType Directory -Force -Path $buildDir, $logDir | Out-Null

    $appId = [regex]::Match((Get-Content -Raw -Encoding UTF8 $issPath), 'AppId=\{\{([0-9A-Fa-f\-]{36})\}').Groups[1].Value
    Assert-That ($appId.Length -eq 36) "AppId GUID found in the script"
    $uninstKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{$appId}_is1"

    # --- baseline: what must not change on the user's account ------------------
    Assert-That (-not (Test-Path $uninstKey)) "no uninstall entry before the test"
    $shortcutsBefore = @(Get-ShortcutSnapshot)
    $runBefore = Get-RunValue

    # --- compile ----------------------------------------------------------------
    $setupName = "check_setup"
    & $isccExe "/DAppVersion=$version" "/DSourceDir=$StageDir" "/DTEST_BUILD" "/O$buildDir" "/F$setupName" $issPath
    Assert-That ($LASTEXITCODE -eq 0) "ISCC compiles the TEST_BUILD installer"
    $setupExe = Join-Path $buildDir "$setupName.exe"
    Assert-That (Test-Path -LiteralPath $setupExe) "setup exe produced"
    if (-not (Test-Path -LiteralPath $setupExe)) { throw "No setup exe" }
    $stageMb = [math]::Round(((Get-ChildItem -LiteralPath $StageDir -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB, 1)
    $setupMb = [math]::Round((Get-Item -LiteralPath $setupExe).Length / 1MB, 1)
    Write-Host "[INFO] staged folder $stageMb MB, setup exe $setupMb MB"

    # Simulate a download: the setup carries Mark-of-the-Web, installed files must not inherit it
    Set-Content -LiteralPath $setupExe -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3"
    $setupMotw = [bool](Get-Item -LiteralPath $setupExe -Stream Zone.Identifier -ErrorAction SilentlyContinue)
    Assert-That $setupMotw "test setup exe carries Zone.Identifier (simulated download)"

    $silent = @("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CURRENTUSER", "/NOICONS", "/TASKS=`"`"")

    # --- fresh install -----------------------------------------------------------
    Invoke-Setup $setupExe ($silent + @("/DIR=`"$installA`"", "/LOG=`"$logDir\install1.log`"")) "fresh install"
    $exe = Join-Path $installA "TwitchDropsSentinel.exe"
    foreach ($rel in @("TwitchDropsSentinel.exe", "core\sentinel_service.py", "steam_idle\SteamIdleProbe.exe", "dist\index.html", "config.json", "assets\app.ico", "portable_runtime\python\python.exe")) {
        Assert-That (Test-Path -LiteralPath (Join-Path $installA $rel)) "installed: $rel"
    }
    Assert-That (-not (Get-ChildItem -LiteralPath $installA -Filter "*.bat" -File -ErrorAction SilentlyContinue)) "launcher .bat is not installed"
    $motw = [bool](Get-Item -LiteralPath $exe -Stream Zone.Identifier -ErrorAction SilentlyContinue)
    Assert-That (-not $motw) "no Zone.Identifier stream on the installed exe"
    Assert-That (Test-Path $uninstKey) "uninstall entry exists in HKCU"
    if (Test-Path $uninstKey) {
        $entry = Get-ItemProperty $uninstKey
        Assert-That ($entry.DisplayName -like "Twitch Drops Sentinel*") "uninstall entry DisplayName is the app name"
        Assert-That ($entry.DisplayVersion -eq $version) "uninstall entry version is $version"
    }
    Assert-That ((Get-Content -Raw -Encoding UTF8 (Join-Path $installA "config.json")) -eq (Get-Content -Raw -Encoding UTF8 (Join-Path $StageDir "config.json"))) "fresh config.json is the clean template"

    # --- reinstall over it: user data survives ---------------------------------
    $marker = "installer-check-marker-" + [Guid]::NewGuid().ToString("N")
    $cfgPath = Join-Path $installA "config.json"
    $cfgText = Get-Content -Raw -Encoding UTF8 $cfgPath
    [IO.File]::WriteAllText($cfgPath, $cfgText.TrimEnd() + "`n", (New-Object Text.UTF8Encoding($false)))
    Add-Content -LiteralPath $cfgPath -Value "`n// $marker" -Encoding UTF8
    $dataDir = Join-Path $installA "data"
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    $dataFile = Join-Path $dataDir "installed_games.json"
    [IO.File]::WriteAllText($dataFile, "{`"marker`":`"$marker`"}", (New-Object Text.UTF8Encoding($false)))
    $engineData = Join-Path $installA "giveaways_engine\data"
    New-Item -ItemType Directory -Force -Path $engineData | Out-Null
    [IO.File]::WriteAllText((Join-Path $engineData "sessions.json"), "{`"marker`":`"$marker`"}", (New-Object Text.UTF8Encoding($false)))
    # leftovers of the built-in updater that would downgrade the app after an upgrade
    [IO.File]::WriteAllText((Join-Path $installA "TwitchDropsSentinel.update"), "stale", (New-Object Text.UTF8Encoding($false)))

    Invoke-Setup $setupExe ($silent + @("/DIR=`"$installA`"", "/LOG=`"$logDir\install2.log`"")) "reinstall over existing install"
    Assert-That ((Get-Content -Raw -Encoding UTF8 $cfgPath) -match [regex]::Escape($marker)) "config.json marker survives reinstall"
    Assert-That ((Test-Path -LiteralPath $dataFile) -and ((Get-Content -Raw $dataFile) -match [regex]::Escape($marker))) "data\ file survives reinstall"
    Assert-That (Test-Path -LiteralPath (Join-Path $engineData "sessions.json")) "giveaways_engine\data survives reinstall"
    Assert-That (-not (Test-Path -LiteralPath (Join-Path $installA "TwitchDropsSentinel.update"))) "stale updater leftover .update is removed on upgrade"
    Assert-That (Test-Path -LiteralPath $exe) "exe still installed after reinstall"

    # --- scheduler tasks: uninstall removes the one pointing into its folder, never another copy's (disabled, never run) ---
    $taskTag = [Guid]::NewGuid().ToString("N").Substring(0, 8)
    $script:checkTasks = @("FreeGamesClaimerStudio-check-own-$taskTag", "FreeGamesClaimerStudio-check-other-$taskTag")
    foreach ($pair in @(@($script:checkTasks[0], $installA), @($script:checkTasks[1], (Join-Path $Scratch "other copy")))) {
        $taskAction = New-ScheduledTaskAction -Execute "conhost.exe" -Argument "--headless `"node.exe`" `"$($pair[1])\giveaways_engine\runner.js`" --scheduled"
        Register-ScheduledTask -TaskName $pair[0] -Action $taskAction -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "03:00") `
            -Settings (New-ScheduledTaskSettingsSet -Disable) | Out-Null
    }

    # --- uninstall, keep data ---------------------------------------------------
    $unins = Join-Path $installA "unins000.exe"
    Assert-That (Test-Path -LiteralPath $unins) "uninstaller present"
    Invoke-Setup $unins @("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/KEEPDATA=1", "/LOG=`"$logDir\uninstall1.log`"") "uninstall /KEEPDATA=1"
    Assert-That (-not (Get-ScheduledTask -TaskName $script:checkTasks[0] -ErrorAction SilentlyContinue)) "uninstall removes the scheduler task pointing into its folder"
    Assert-That ([bool](Get-ScheduledTask -TaskName $script:checkTasks[1] -ErrorAction SilentlyContinue)) "uninstall keeps the scheduler task of another copy"
    Assert-That (Wait-Gone $exe) "keep: program exe removed"
    Assert-That (Wait-Gone (Join-Path $installA "portable_runtime")) "keep: portable_runtime removed"
    Assert-That (Wait-Gone (Join-Path $installA "dist")) "keep: dist removed"
    Assert-That (Wait-Gone (Join-Path $installA "core\sentinel_service.py")) "keep: core code removed"
    Assert-That (Wait-Gone (Join-Path $installA "unins000.exe")) "keep: uninstaller removed"
    Assert-That (Test-Path -LiteralPath $cfgPath) "keep: config.json kept"
    Assert-That (Test-Path -LiteralPath $dataFile) "keep: data\ kept"
    Assert-That (Test-Path -LiteralPath (Join-Path $engineData "sessions.json")) "keep: giveaways_engine\data kept"
    Assert-That (-not (Test-Path $uninstKey)) "keep: uninstall entry gone"

    # --- install again, uninstall and delete data ---------------------------------
    Invoke-Setup $setupExe ($silent + @("/DIR=`"$installA`"", "/LOG=`"$logDir\install3.log`"")) "install after keep-uninstall"
    Assert-That ((Get-Content -Raw -Encoding UTF8 $cfgPath) -match [regex]::Escape($marker)) "kept config.json is picked up by the next install"
    Invoke-Setup (Join-Path $installA "unins000.exe") @("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/KEEPDATA=0", "/LOG=`"$logDir\uninstall2.log`"") "uninstall /KEEPDATA=0"
    $deleted = Wait-Gone $installA
    if (-not $deleted -and (Test-Path -LiteralPath $installA)) {
        $left = @(Get-ChildItem -LiteralPath $installA -Recurse -Force -File -ErrorAction SilentlyContinue)
        $deleted = ($left.Count -eq 0)
        if (-not $deleted) { Write-Host "[INFO] left after delete: $($left.FullName -join '; ')" }
    }
    Assert-That $deleted "delete: install folder gone or holds no files"
    Assert-That (-not (Test-Path $uninstKey)) "delete: uninstall entry gone"

    # --- move settings from an unpacked ZIP copy (a fake old folder; it must come out untouched) ---------
    $log0 = Get-Content -Raw -Encoding UTF8 "$logDir\install1.log"
    Assert-That ($log0 -match "Node\.js check:") "node: the setup log records the node.exe / winget check"
    Assert-That ($log0 -notmatch "OpenJS\.NodeJS\.LTS") "node: a silent setup without /INSTALLNODE=1 never runs winget"
    Assert-That ((Get-Content -Raw -Encoding UTF8 "$logDir\install1.log") -match "Migrate: not requested") "migrate: a silent setup without /MIGRATEFROM copies nothing"
    $utf8 = New-Object Text.UTF8Encoding($false)
    $oldCopy = Join-Path $Scratch "old copy"   # a space in the path on purpose
    $oldMarker = "old-copy-marker-" + [Guid]::NewGuid().ToString("N")
    $migrated = @("config.json", "Trophies.md", "cookies.jar", "core\settings.json", "core\cookies.jar", "steam_idle_first_seen.json",
        "data\installed_games.json", "data\backups\profile.zip", "giveaways_engine\data\sessions.json", "giveaways_engine\data\browser\Default\Cookies")
    $notMigrated = @("steam_idle_first_seen.json.corrupt", "core\sentinel_service.log", ".backup_state\cookies.jar", "notes.txt")
    foreach ($rel in (@("TwitchDropsSentinel.exe") + $migrated + $notMigrated)) { New-TestFile (Join-Path $oldCopy $rel) "$oldMarker $rel" }
    $oldHash = Get-TreeHash $oldCopy
    $installB = Join-Path $Scratch "install-b"
    $script:activeInstall = $installB
    $fromArgs = @("/MIGRATEFROM=`"$oldCopy`"")

    # fresh install into an empty folder: everything on the list arrives, nothing else
    Invoke-Setup $setupExe ($silent + $fromArgs + @("/DIR=`"$installB`"", "/LOG=`"$logDir\migrate1.log`"")) "fresh install with /MIGRATEFROM"
    foreach ($rel in $migrated) {
        $dst = Join-Path $installB $rel
        Assert-That ((Test-Path -LiteralPath $dst) -and ((Get-Content -Raw -LiteralPath $dst) -eq "$oldMarker $rel")) "migrate: copied $rel"
    }
    foreach ($rel in $notMigrated) { Assert-That (-not (Test-Path -LiteralPath (Join-Path $installB $rel))) "migrate: not copied $rel" }
    Assert-That ((Get-TreeHash $oldCopy) -eq $oldHash) "migrate: the old folder is unchanged (copy, never move)"
    $log1 = Get-Content -Raw -Encoding UTF8 "$logDir\migrate1.log"
    Assert-That (([regex]::Matches($log1, "Migrate: copied ")).Count -eq $migrated.Count) "migrate: the setup log names every copied file ($($migrated.Count))"
    Assert-That ($log1 -match "Migrate: done, $($migrated.Count) copied, 0 skipped, 0 failed") "migrate: the setup log ends with the totals"
    Assert-That (Test-Path -LiteralPath (Join-Path $installB "TwitchDropsSentinel.exe")) "migrate: the program itself is installed"

    # an upgrade over an installed copy never migrates, whatever the switches say
    $keepText = "upgrade-keeps-this"
    New-TestFile (Join-Path $installB "config.json") $keepText
    Invoke-Setup $setupExe ($silent + $fromArgs + @("/MIGRATEREPLACE=1", "/DIR=`"$installB`"", "/LOG=`"$logDir\migrate2.log`"")) "upgrade with /MIGRATEFROM"
    Assert-That ((Get-Content -Raw -LiteralPath (Join-Path $installB "config.json")) -eq $keepText) "migrate: an upgrade leaves config.json alone"
    Assert-That ((Get-Content -Raw -Encoding UTF8 "$logDir\migrate2.log") -match "Migrate: ignored, an installed copy is being upgraded") "migrate: the upgrade says why it did not migrate"
    Assert-That (Remove-TestInstall $installB "$logDir\migrate-un1.log") "migrate: scratch install removed (1)"

    # a fresh install into a folder that already holds data: existing files are skipped ...
    New-TestFile (Join-Path $installB "config.json") "target-config"
    New-TestFile (Join-Path $installB "data\installed_games.json") "target-games"
    Invoke-Setup $setupExe ($silent + $fromArgs + @("/DIR=`"$installB`"", "/LOG=`"$logDir\migrate3.log`"")) "fresh install over existing data, no replace"
    Assert-That ((Get-Content -Raw -LiteralPath (Join-Path $installB "config.json")) -eq "target-config") "migrate: existing config.json is kept without Replace"
    Assert-That ((Get-Content -Raw -LiteralPath (Join-Path $installB "data\installed_games.json")) -eq "target-games") "migrate: existing data file is kept without Replace"
    Assert-That ((Get-Content -Raw -LiteralPath (Join-Path $installB "cookies.jar")) -eq "$oldMarker cookies.jar") "migrate: files that were absent are still copied"
    Assert-That ((Get-Content -Raw -Encoding UTF8 "$logDir\migrate3.log") -match "Migrate: skipped \(already exists\)") "migrate: skipped files are logged"
    Assert-That (Remove-TestInstall $installB "$logDir\migrate-un2.log") "migrate: scratch install removed (2)"

    # ... unless Replace is on
    New-TestFile (Join-Path $installB "config.json") "target-config"
    Invoke-Setup $setupExe ($silent + $fromArgs + @("/MIGRATEREPLACE=1", "/DIR=`"$installB`"", "/LOG=`"$logDir\migrate4.log`"")) "fresh install over existing data, replace"
    Assert-That ((Get-Content -Raw -LiteralPath (Join-Path $installB "config.json")) -eq "$oldMarker config.json") "migrate: Replace overwrites the existing config.json"
    Assert-That ((Get-TreeHash $oldCopy) -eq $oldHash) "migrate: the old folder is still unchanged after Replace"
    Assert-That (Remove-TestInstall $installB "$logDir\migrate-un3.log") "migrate: scratch install removed (3)"

    # a folder that is not an old copy is refused and logged, the install itself still succeeds
    $notACopy = Join-Path $Scratch "not a copy"
    New-TestFile (Join-Path $notACopy "readme.txt") "x"
    Invoke-Setup $setupExe ($silent + @("/MIGRATEFROM=`"$notACopy`"", "/DIR=`"$installB`"", "/LOG=`"$logDir\migrate5.log`"")) "fresh install with a bad /MIGRATEFROM"
    Assert-That ((Get-Content -Raw -Encoding UTF8 "$logDir\migrate5.log") -match "Migrate: skipped, MigrateBadFolder") "migrate: a folder without exe and config.json is refused in the log"
    Assert-That ((Get-Content -Raw -Encoding UTF8 (Join-Path $installB "config.json")) -eq (Get-Content -Raw -Encoding UTF8 (Join-Path $StageDir "config.json"))) "migrate: a refused folder leaves the clean template config.json"
    Assert-That (Remove-TestInstall $installB "$logDir\migrate-un4.log") "migrate: scratch install removed (4)"
    $script:activeInstall = $installA

    # links inside the old folder are not followed: two junction roots (data, engine data) and a file symlink
    $linkCopy = Join-Path $Scratch "link copy"
    $outside = Join-Path $Scratch "outside"
    New-TestFile (Join-Path $linkCopy "TwitchDropsSentinel.exe") "fake"
    New-TestFile (Join-Path $linkCopy "config.json") "link-copy-config"
    New-TestFile (Join-Path $linkCopy "core\settings.json") "real-settings"
    New-TestFile (Join-Path $outside "data\secret.json") "outside-data"
    New-TestFile (Join-Path $outside "engine\secret2.json") "outside-engine"
    New-TestFile (Join-Path $outside "trophies-target.md") "outside-trophies"
    New-Item -ItemType Directory -Force -Path (Join-Path $linkCopy "giveaways_engine") | Out-Null
    cmd /c mklink /J "$linkCopy\data" "$outside\data" | Out-Null
    cmd /c mklink /J "$linkCopy\giveaways_engine\data" "$outside\engine" | Out-Null
    Assert-That ((Test-Path -LiteralPath "$linkCopy\data\secret.json") -and (Test-Path -LiteralPath "$linkCopy\giveaways_engine\data\secret2.json")) "migrate: the test junctions exist"
    $symlinkMade = $false
    try {
        New-Item -ItemType SymbolicLink -Path "$linkCopy\Trophies.md" -Target "$outside\trophies-target.md" -ErrorAction Stop | Out-Null
        $symlinkMade = $true
    } catch { Write-Host "[INFO] file symlink needs admin or developer mode here: that sub-check is skipped" }
    $script:activeInstall = $installB
    Invoke-Setup $setupExe ($silent + @("/MIGRATEFROM=`"$linkCopy`"", "/DIR=`"$installB`"", "/LOG=`"$logDir\migrate6.log`"")) "fresh install from a folder with links"
    Assert-That (-not (Test-Path -LiteralPath (Join-Path $installB "data\secret.json"))) "migrate: a junction as the data root is not followed"
    Assert-That (-not (Test-Path -LiteralPath (Join-Path $installB "giveaways_engine\data\secret2.json"))) "migrate: a junction as the engine data root is not followed"
    Assert-That ((Get-Content -Raw -LiteralPath (Join-Path $installB "config.json")) -eq "link-copy-config") "migrate: the plain files beside the links are still copied"
    Assert-That ((Get-Content -Raw -LiteralPath (Join-Path $installB "core\settings.json")) -eq "real-settings") "migrate: core\settings.json is still copied"
    $log6 = Get-Content -Raw -Encoding UTF8 "$logDir\migrate6.log"
    $linkLines = ([regex]::Matches($log6, "Migrate: skipped \(link, not followed\)")).Count
    Assert-That ($linkLines -ge 2) "migrate: the skipped junction roots are logged ($linkLines lines)"
    if ($symlinkMade) {
        $trophies = Join-Path $installB "Trophies.md"
        Assert-That ((Get-Content -Raw -LiteralPath $trophies) -ne "outside-trophies") "migrate: a file symlink is not copied through"
        Assert-That ($linkLines -ge 3) "migrate: the skipped file symlink is logged"
    }
    Assert-That (Remove-TestInstall $installB "$logDir\migrate-un5.log") "migrate: scratch install removed (5)"
    $script:activeInstall = $installA
    cmd /c rmdir "$linkCopy\data" | Out-Null
    cmd /c rmdir "$linkCopy\giveaways_engine\data" | Out-Null
    Assert-That ((Get-Content -Raw -LiteralPath "$outside\data\secret.json") -eq "outside-data") "migrate: the junction targets are untouched"

    # the finish-page winget command: --scope user first, then a machine install; run against a fake winget, never the real one
    $issText = Get-Content -Raw -Encoding UTF8 $issPath
    $nodeCmd = [regex]::Match($issText, '(?m)^Filename: "\{cmd\}"; Parameters: "(.*)"; Description: "\{cm:InstallNode\}"')
    Assert-That $nodeCmd.Success "node: the finish page command is found in the script"
    if ($nodeCmd.Success) {
        $line = $nodeCmd.Groups[1].Value.Replace('""', '"')
        $fakeDir = Join-Path $Scratch "fakewinget"
        $a = Invoke-FakeWinget $line $fakeDir 0 9
        Assert-That (($a.Exit -eq 0) -and ($a.Calls.Count -eq 1) -and ($a.Calls[0] -match "--scope user")) "node: --scope user works, one winget call"
        Assert-That (($a.Log -join "|") -match "scope user: exit code 0") "node: the first result is logged"
        $b = Invoke-FakeWinget $line $fakeDir 1 0
        Assert-That (($b.Exit -eq 0) -and ($b.Calls.Count -eq 2)) "node: --scope user fails, the retry runs and wins (exit 0, 2 calls)"
        Assert-That (($b.Calls[1] -notmatch "--scope") -and ($b.Calls[1] -match "OpenJS.NodeJS.LTS")) "node: the retry has no --scope"
        Assert-That (($b.Log.Count -eq 2) -and ($b.Log[0] -match "exit code 1") -and ($b.Log[1] -match "exit code 0")) "node: both results are logged"
        $c = Invoke-FakeWinget $line $fakeDir 1 1
        Assert-That (($c.Exit -eq 1) -and ($c.Calls.Count -eq 2)) "node: both attempts fail: exit code 1 reaches the setup log"
    }
    $silentCmd = [regex]::Match($issText, '(?m)^Filename: "\{cmd\}"; Parameters: "(.*)"; Flags: waituntilterminated; Check: NodeBySwitch')
    Assert-That $silentCmd.Success "node: the /INSTALLNODE=1 command is found in the script"
    if ($silentCmd.Success) {
        $d = Invoke-FakeWinget ($silentCmd.Groups[1].Value.Replace('""', '"')) (Join-Path $Scratch "fakewinget2") 1 0
        Assert-That (($d.Exit -eq 0) -and ($d.Calls.Count -eq 2)) "node: the silent command retries without --scope too"
        $e = Invoke-FakeWinget ($silentCmd.Groups[1].Value.Replace('""', '"')) (Join-Path $Scratch "fakewinget3") 0 9
        Assert-That (($e.Exit -eq 0) -and ($e.Calls.Count -eq 1)) "node: the silent command stops after a working --scope user"
    }

    # --- the user's account stays untouched ----------------------------------------
    $shortcutsAfter = @(Get-ShortcutSnapshot)
    $changed = @(Compare-Object -ReferenceObject $shortcutsBefore -DifferenceObject $shortcutsAfter -ErrorAction SilentlyContinue)
    foreach ($c in $changed) { Write-Host "[INFO] shortcut $($c.SideIndicator) $($c.InputObject)" }
    # other programs may touch their own shortcuts while the check runs; only ours count
    $ours = @($changed | Where-Object { (Split-Path $_.InputObject -Leaf) -like "*Sentinel*" })
    Assert-That ($ours.Count -eq 0) "no Sentinel shortcut created or removed in Start menu or on the desktop"
    Assert-That (-not ($shortcutsAfter | Where-Object { (Split-Path $_ -Leaf) -like "Twitch Drops Sentinel*" })) "no 'Twitch Drops Sentinel' shortcut exists"
    Assert-That ((Get-RunValue) -eq $runBefore) "autostart Run value of the user's own copy unchanged"
}
catch {
    Write-Host "[FAIL] unexpected error: $($_.Exception.Message)"
    $script:failures++
}
finally {
    foreach ($name in @($script:checkTasks)) {
        if ($name -and (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { Unregister-ScheduledTask -TaskName $name -Confirm:$false }
    }
    # the check must not leave an install behind, whatever happened
    if ($appId -and (Test-Path $uninstKey)) {
        $u = Join-Path $script:activeInstall "unins000.exe"
        if (Test-Path -LiteralPath $u) {
            $cleanup = New-Object Diagnostics.ProcessStartInfo
            $cleanup.FileName = $u
            $cleanup.Arguments = "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /KEEPDATA=0"
            $cleanup.UseShellExecute = $false
            $cleanup.CreateNoWindow = $true
            [void][Diagnostics.Process]::Start($cleanup).WaitForExit(120000)
        }
        Remove-Item $uninstKey -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "[WARN] cleaned up a leftover uninstall entry"
    }
    if ($ownScratch -and $Scratch -and (Test-Path -LiteralPath $Scratch)) {
        Remove-Item -LiteralPath $Scratch -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($script:failures -gt 0) { Write-Host "RESULT: $($script:failures) check(s) FAILED"; exit 1 }
Write-Host "RESULT: all checks passed"
exit 0

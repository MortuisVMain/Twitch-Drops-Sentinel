# Releasing

1. Bump the version in the same files as the previous `chore(release)` commit (`core/version.py`, `desktop/TwitchDropsSentinel.csproj`, `package.json`, `package-lock.json`, `giveaways_engine/package.json`, `src/App.tsx`, `test_sentinel_suite.py`, `tools/ui_fixture.js`).
2. `npm run build`, `python test_sentinel_suite.py` (exit 0), `dotnet publish -c Release -o publish` in `desktop/`, then `python tools/create_clean_release.py`.
   Also publish the Steam idle helper before packaging: `dotnet publish tools/steam_idle_probe/SteamIdleProbe.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true -p:DebugType=None -p:DebugSymbols=false -o tools/steam_idle_probe/publish` (compression takes the helper from about 70 MB to about 36 MB; its start is about 45 ms slower). `create_clean_release.py` copies that folder to `steam_idle/` in the full release and the hot-patch ZIP, and stops with an error when `SteamIdleProbe.exe` is missing. Before publishing, run the helper checks: `dotnet build tools/steam_idle_probe/SteamIdleProbe.csproj -c Release`, then `dotnet run -c Release --project SteamIdleProbe.Checks.csproj` in `tools/steam_idle_probe/checks` (exit 0).
3. Add the release to `CHANGELOG.md` (English, one to three lines).
4. Push to `main` and create the release with `gh release create vX.Y.Z --target main --title "Hell Harvest vX.Y.Z" --notes-file <notes>`.
   The tag starts `.github/workflows/release.yml`: CI runs the tests, builds a self-contained executable and uploads both archives to the release (replacing any you attached). Local archives from step 2 are for checking only.
   To skip the CI test suite (about 2.5 of 5 minutes) when `python test_sentinel_suite.py` already passed locally on exactly the commit being tagged, push an annotated tag whose message contains `[skip tests]` and create the release on it: `git tag -a vX.Y.Z -m "vX.Y.Z [skip tests]" origin/main`, `git push origin vX.Y.Z`, then `gh release create vX.Y.Z --verify-tag ...`. A plain tag (what `gh release create --target` makes) and manual runs always run the suite.

Verify the archives: both the full ZIP and the patch ZIP contain `steam_idle/SteamIdleProbe.exe` and no `.pdb`; on a clean copy `steam_idle\SteamIdleProbe.exe apps 76561197960265770 < NUL` prints one JSON line with `"status":"complete","count":0` and exits 0, and `SteamIdleProbe.exe nonsense` exits 2.

Release notes: English first, Russian below in a collapsed block:

```markdown
## What's new
- ...

<details>
<summary>На русском</summary>

## Что нового
- ...
</details>
```

README screenshots come from the UI harness with demo data: `node tools/build_ui_harness.mjs <dir>`, serve it, open `index.html?lang=en&demo=1`.

## Installer

`create_clean_release.py` also compiles `installer/TwitchDropsSentinel.iss` (Inno Setup 6.3 or newer) into `Hell_Harvest_Setup_v<version>.exe` in the workspace root and lists it in `SHA256SUMS.txt`. It finds `ISCC.exe` through the `ISCC` environment variable or the standard Inno Setup 6 folders; without Inno it prints a notice and builds only the ZIPs. CI makes sure Inno is present (`choco install innosetup` when missing) and uploads the setup exe next to the ZIPs.

Rules for the script: never change `AppId` (it ties upgrades and uninstall together); per-user only; user data (`config.json`, `Trophies.md`, `data\`, `giveaways_engine\data\`, sign-ins) is never overwritten and is deleted on uninstall only when the user answers yes (silent: `/KEEPDATA=1` keeps, `/KEEPDATA=0` deletes, default keeps). The launcher .bat is not installed. The app's own `TwitchDropsSentinel` autostart value and its giveaways scheduler task are removed on uninstall only when they point into the install folder.

Checks before publishing: `python test_sentinel_suite.py` (its installer gate reads the script statically) and `powershell -File tools/check_installer.ps1` after `create_clean_release.py`. The script compiles a `TEST_BUILD` setup (no single-instance mutex), installs it silently into a scratch folder with `/CURRENTUSER /NOICONS`, reinstalls over it, uninstalls with keep and with delete, asserts that data survives and that no shortcut or uninstall entry is left, and never launches the app. By hand, before a release that changes the installer: the Russian and English wizard pages, the uninstall question, and the "close the app" prompt while Sentinel is running.

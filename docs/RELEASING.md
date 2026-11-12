# Releasing

1. Bump the version in the same files as the previous `chore(release)` commit (`core/version.py`, `desktop/TwitchDropsSentinel.csproj`, `package.json`, `package-lock.json`, `giveaways_engine/package.json`, `src/App.tsx`, `test_sentinel_suite.py`, `tools/ui_fixture.js`).
2. `npm run build`, `python test_sentinel_suite.py` (exit 0), `dotnet publish -c Release -o publish` in `desktop/`, then `python tools/create_clean_release.py`.
   Also publish the Steam idle helper before packaging: `dotnet publish tools/steam_idle_probe/SteamIdleProbe.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false -o tools/steam_idle_probe/publish`. `create_clean_release.py` copies that folder to `steam_idle/` in the full release and the hot-patch ZIP, and stops with an error when `SteamIdleProbe.exe` is missing. Before publishing, run the helper checks: `dotnet build tools/steam_idle_probe/SteamIdleProbe.csproj -c Release`, then `dotnet run -c Release --project SteamIdleProbe.Checks.csproj` in `tools/steam_idle_probe/checks` (exit 0).
3. Add the release to `CHANGELOG.md` (English, one to three lines).
4. Push to `main` and create the release with `gh release create vX.Y.Z --target main --title "Twitch Drops Sentinel vX.Y.Z" --notes-file <notes>`.
   The tag starts `.github/workflows/release.yml`: CI runs the tests, builds a self-contained executable and uploads both archives to the release (replacing any you attached). Local archives from step 2 are for checking only.

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

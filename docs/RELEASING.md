# Releasing

1. Bump the version in the same files as the previous `chore(release)` commit (`core/version.py`, `desktop/TwitchDropsSentinel.csproj`, `package.json`, `package-lock.json`, `giveaways_engine/package.json`, `src/App.tsx`, `test_sentinel_suite.py`, `tools/ui_fixture.js`).
2. `npm run build`, `python test_sentinel_suite.py` (exit 0), `dotnet publish -c Release -o publish` in `desktop/`, then `python tools/create_clean_release.py`.
3. Add the release to `CHANGELOG.md` (English, one to three lines).
4. Push to `main` and create the release with `gh release create vX.Y.Z --target main --title "Twitch Drops Sentinel vX.Y.Z" --notes-file <notes>`.
   The tag starts `.github/workflows/release.yml`: CI runs the tests, builds a self-contained executable and uploads both archives to the release (replacing any you attached). Local archives from step 2 are for checking only.

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

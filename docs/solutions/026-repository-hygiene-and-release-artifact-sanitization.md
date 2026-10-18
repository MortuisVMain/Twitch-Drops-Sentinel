# 026 — Repository Hygiene, Template Config Separation & Release Artifact Sanitization

## 📋 Context & Problem Statement
When transitioning an in-development desktop application (`Twitch Drops Sentinel v3.1`) into a public GitHub open-source release, local testing artifacts, internal task files, scratch scripts, and developer configurations can easily contaminate the public repository.

Specifically:
1. **User Configuration Contamination:** `config.json` and `core/settings.json` contained developer-specific priorities, excluded games, and local file paths.
2. **Local Caches & Personal Data:** `data/installed_games.json`, `data/box_art_cache.json`, and `Trophies.md` were accidentally tracked in Git.
3. **Scratch & Night Worker Scripts:** Files like `Запустить_Ночного_Работягу_*.bat`, `NIGHT_WORKER_TASK.md`, `showcase_ref2game_ui.html`, `inspect_live.py`, `prd.json`, and duplicate `.ico`/`.png` files cluttered the root and subdirectories.
4. **Internal PRD Remnants:** Historical development documents contained non-standard path names (such as cracked folder references), inappropriate for a professional public repository.

## 🛠️ Root-Cause Analysis & Architectural Solution

### 1. Template Config Pattern (`config.default.json` ➔ `config.json`)
Committing active user configuration files leads to Git merge conflicts whenever users pull updates.
- **Solution:** Provide a clean `config.default.json` in Git tracking.
- Add `config.json` and `core/settings.json` to `.gitignore`.
- On cold start in `core/sentinel_service.py`, if `config.json` does not exist, automatically copy `config.default.json` to `config.json`.
- The user's local customizations remain preserved and are never committed or overwritten.

### 2. Runtime Caches Exclusion
- Updated `.gitignore` to ignore `data/*.json`, while committing `data/.gitkeep` so clones have the directory ready.
- Untracked `data/installed_games.json` and `data/box_art_cache.json` from Git.

### 3. Duplicate Icon & Root Cleanup
- Cleaned root and desktop folders: kept canonical icons in `assets/` and compiled resources in `desktop/`.
- Purged 17 temporary and scratch files from Git tracking.

### 4. Verification Suite Hardening
- Updated Gate 6 in `test_sentinel_suite.py` to validate `PRD_SENTINEL_V3.md` (clean, professional specification) instead of the obsolete `prd.json`.
- Verified all 24 verification gates pass with Exit Code 0.

## 📊 Verification & Results
- Repository: `MortuisVMain/Twitch-Drops-Sentinel` (Public)
- Commit: `chore: purge scratch scripts, duplicate assets and local user caches from repository`
- Tracked Files: Only production-grade source code, clean templates, and documentation.
- Test Suite: 24/24 gates PASS (Exit Code 0).

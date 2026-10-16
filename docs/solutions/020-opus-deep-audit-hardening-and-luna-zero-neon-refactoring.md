# 020 — Opus Deep Audit Hardening, Apple Luna 2.0 Zero-Neon Refactoring & Desktop Portability

## 1. Problem Statement & Root Cause Analysis

A comprehensive multi-lens audit (Opus 4.6 Thinking + Sentinel Research Subagent) identified four critical architectural vulnerabilities across the codebase:
1. **Frontend Aesthetic Remnants (Neon Toxicity):** Over 25 instances of legacy Twitch purple (`#9146ff`, `#772ce8`, `#c084fc`) and neon cyan (`#00f2fe`) persisted inside `GameSearchAutocomplete.tsx`, `GameShelf.tsx`, `LiveDashboard.tsx`, and `Navigation.tsx`, clashing with the Apple Luna 2.0 dark obsidian/noble mint design contract.
2. **Frontend Architecture Bloat (Karpathy Violation):** `src/App.tsx` contained a single 684-line monolithic component function mixing API polling, a 1-second ticker, keyboard shortcuts, toasts, and dialogs.
3. **Backend Fragility (GraphQL Schema Drift):** Over 32 direct dictionary lookups (`data["benefitEdges"][0]`, `data["startAt"]`, `data["self"]["currentMinutesWatched"]`) in `core/inventory.py` without defensive `.get()` methods risked unhandled `KeyError`/`IndexError` crashes upon any Twitch GraphQL schema changes.
4. **Desktop Host Lifecycle & Portability Leak:** `desktop/MainForm.cs` contained a hardcoded machine-specific absolute path (`@"C:\AI Local Projects\Ideas\Twitch Drops Sentinel v3\core\sentinel_service.py"`), failed to explicitly dispose `_webView` on exit (leaving background `msedgewebview2.exe` processes orphaned), and killed the Python backend too quickly before disk caches could be flushed.

---

## 2. Solution Architecture & Changes

### 2.1 Master Agent Operating Guidelines Enshrinement (`AGENTS.md`)
Added **Section 6: Opus Hardening Principles & Zero-Defect Architecture** to `c:\AI Local Projects\AGENTS.md`, permanently locking in:
- The **Zero-Neon Ban** (mandating Apple Luna 2.0 `#73bba5` / `#368873` / `#202725` tokens).
- The **Defensive API Traversal Doctrine** (`safe_get` / `.get()`).
- The **Zero-Tolerance Policy for Silent Failures** (`logger.error(..., exc_info=True)`).
- Native host resource disposal (`_webView?.Dispose()`) and relative path portability.
- Component decomposition (Karpathy 200->50, subcomponents <300 lines).

### 2.2 Frontend Palette & Component Decomposition
1. **Neon Elimination:** Replaced all occurrences of `#9146ff`, `#00f2fe`, `#772ce8`, `#c084fc` across:
   - `src/components/Navigation.tsx` (switched to `#368873` active pill, tabular badge numbers).
   - `src/components/GameShelf.tsx` (switched to Luna card styling, mint badges, removed liquid-glass remnants).
   - `src/components/GameSearchAutocomplete.tsx` (switched to Luna dropdown surface, mint matches).
   - `src/components/LiveDashboard.tsx` (updated fallback banner, GPU telemetry pill, Luna Auto-Shutdown card, and terminal console controls).
2. **Decomposition of `App.tsx`:**
   - Created `src/hooks/useSentinelState.ts` (extracting state polling, countdown ticker, priority/exclude handlers, settings sync).
   - Created `src/components/HelpModal.tsx` (isolating the hotkeys & instructions modal).
   - Reduced `src/App.tsx` from **789 lines to 260 lines** (<300 lines, 67% reduction) while preserving all functionality and the `Mortuis_V` brand signature.
3. **CSS Variable Polish (`src/index.css`):**
   - Declared `--surface-elevated: #28322e`, `--card-bg: #202725`, `--foreground: #e9eeec` in `:root` and `.app`.

### 2.3 Backend Defensive Hardening (`core/`)
1. **Safe Dictionary Traversal (`core/inventory.py`):**
   - Refactored `Benefit`, `BaseDrop`, `TimedDrop`, and `DropsCampaign` to use safe `.get()` calls and default empty dictionaries/lists, preventing crashes when Twitch sends partial or unexpected payloads.
2. **Defensive Schema Parsing (`core/utils.py`):**
   - Hardened `Game.__init__` to gracefully handle non-dictionary, missing `id`, or missing `name` payloads.
3. **Silent Failure Elimination (`core/cache.py`, `core/sentinel_service.py`):**
   - Added `logging` and contextual logging (`logger.debug`, `logger.error(..., exc_info=True)`) to image cache errors and API routes.
   - Centralized default port `28492` in `core/constants.py` as `DEFAULT_SERVICE_PORT`.

### 2.4 Desktop Host Portability & Clean Lifecycle (`desktop/MainForm.cs`)
1. **Relative Path Resolution:** Replaced the hardcoded `C:\...` string with dynamic relative searches (`AppDomain.CurrentDomain.BaseDirectory` + parent walks).
2. **WebView2 Disposal:** Added `_webView?.Dispose()` in both tray exit and `OnFormClosing`.
3. **Graceful Shutdown Window:** Extended `/api/shutdown` timeout to 2.0s and process exit wait to 2.5s to ensure SQLite / markdown files are completely flushed before termination.
4. **Rebuilt Standalone Binary:** Recompiled `TwitchDropsSentinel.exe` with `dotnet publish` and copied to project root.

---

## 3. Verification & Acceptance Criteria

1. **Gate 9: Apple Luna 2.0 Palette Integrity:**
   - Automated scan across `src/components/*.tsx` confirmed **0 occurrences** of `#9146ff`, `#00f2fe`, `#772ce8`, `#c084fc`.
2. **Gate 10: Safe GraphQL Dict Parsing:**
   - Unit tests verified that `Benefit({})`, `Game({"invalid": 123})`, and `Game(None)` parse safely without `KeyError`.
3. **Full Test Suite:**
   - `python test_sentinel_suite.py` passed all **10 verification gates with Exit Code 0**.
4. **Bundle Compilation:**
   - `npm run build` completed in 2.04s (456.8 KB single-file bundle).
   - `dotnet publish` built standalone monolithic executable (112.47 MB).

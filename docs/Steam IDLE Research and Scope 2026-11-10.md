# Steam IDLE Research and Scope

Status: research note and proposed scope; no application code has been changed.

Follow-up correction (2026-11-10): the later investigation located the helper at the repository-root `libs/SteamUtility/` in the same pinned commit. The earlier absence finding below applies only to the incorrectly assumed `src-tauri/src/libs/SteamUtility` path. Local write methods check the `StoreStats` return value without waiting for `UserStatsStored_t` in the inspected path; the remote handler awaits a server response and checks its result and validation failures. See [the implementation plan](Steam%20IDLE%20Implementation%20Plan%202026-11-10.md) for the corrected source evidence and implementation requirements. These are static findings, not live-account test results.

## Decision context

The user wants an original, own-branded Steam IDLE tab with card farming and achievement automation. Current explicit requests take precedence over the older Claude proposal for manual-only achievements: cover automatic queues for one, selected, and all eligible games, subject to explicit start and exclusions. The latest Claude conversation is historical context, not permission for account actions in this task.

The source review is behavior research only. It does not authorize copying SGI code, its structure, or its text. Any selected third-party dependency must retain its license and notices. The user-facing feature can use Sentinel branding.

## Existing Sentinel boundaries

- The tab shell is `src/App.tsx` (`activeTab`, navigation and tab rendering; current navigation around lines 198, 1105-1175, 1628-1802). `NavTab` is declared in `src/types.ts:216`; adding a tab is a frontend integration change, not an isolated component.
- Steam install scanning already exists in `core/game_scanner.py:362-500` and creates entries carrying AppID (`:485-494`). It only supplies installed games; the requested all-library queue also needs owned-game inventory, eligibility and pagination.
- The giveaway engine already has a Steam browser session slot (`core/giveaways_controller.py:43-60`), but this review did not validate that it can safely provide Community cookies to another feature. Treat it as a candidate integration point, not proof of an available authenticated Steam session.
- No Steam IDLE implementation or `libs/SteamUtility` source was found in the current main checkout. `desktop/MainForm.cs:4499-4607` contains a Job Object for child-process lifecycle; it is not itself a Steam bridge.

## SGI source review (pinned snapshot)

Reviewed `zevnda/steam-game-idler` main at commit [`2731d3dc72a7dd47c321a9bff6ea0c374c609e3f`](https://github.com/zevnda/steam-game-idler/commit/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f), version 6.5.1. Only the following eight implementation files were inspected; links are pinned to that commit.

### Card farming behavior

- [`card_farming/scraper.rs:108-176,177-253`](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/src-tauri/src/card_farming/scraper.rs#L108-L176) reads badge pages using Community cookies, distinguishes revoked sessions and Family View blocks, rejects non-badge pages (including error HTML returned with HTTP 200), discovers pagination, and fails the entire scrape if a page fails. This prevents a partial/invalid response from being interpreted as all cards exhausted. Remaining pages are fetched concurrently.
- [`card_farming/mod.rs:22-37`](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/src-tauri/src/card_farming/mod.rs#L22-L37) documents different cookie acquisition by sign-in mode: agent mode can use its existing SteamKit2 connection; local/CLI mode needs a hidden webview. The scraper itself consumes cookies from either mode.
- [`card_farming/manager.rs:374-407`](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/src-tauri/src/card_farming/manager.rs#L374-L407) separates ready games from accumulating games, supports single or concurrent ready-game farming, prioritizes by remaining drops / threshold proximity, and caps active work at 32.
- [`card_farming/manager.rs:634-753,760-867`](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/src-tauri/src/card_farming/manager.rs#L634-L753) shows an account-keyed in-memory session, cooperative stop, per-session exclusions, pause when another client is playing, and recovery from transient scrape failures. It retries up to six failed scrapes while keeping prior targets active; before any targets exist it waits 60 seconds. This source does not establish durable queue persistence across application restarts.

### Achievement behavior

- [`achievements/commands.rs:128-161`](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/src-tauri/src/achievements/commands.rs#L128-L161) routes a single desired unlock/lock through either the agent or local Steam backend; local mode requires Steam to be running.
- [`achievements/commands.rs:164-231`](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/src-tauri/src/achievements/commands.rs#L164-L231) applies batched changes and retries failed batch items individually, returning succeeded and failed IDs. The source comments describe one `StoreStats` call for the batch. The actual Steam callback/acknowledgment implementation was not among the reviewed files; acknowledgment semantics remain **unverified**.
- [`achievements/library_run.rs:1-43`](https://github.com/zevnda/steam-game-idler/blob/2731d3dc72a7dd47c321a9bff6ea0c374c609e3f/src-tauri/src/achievements/library_run.rs#L1-L43) coordinates full-library achievement runs against another achievement writer for the same account and uses a drop guard so cancellation does not leave the account marked busy.

The requested `src-tauri/src/libs/SteamUtility` directory was absent at the pinned snapshot. Do not confuse the Rust `steam_agent` bridge with that C# utility or claim its implementation was reviewed. The reviewed source supports a behavioral comparison, not a conclusion about every SGI feature or its operational reliability.

## Proposed capability scope

The UI should be a top-level Steam IDLE tab, with clear per-feature controls and queue state.

### Card farming

- Discover all eligible games, including owned games that are not installed. Show eligibility and remaining-card data with freshness/error state.
- Support whitelist, blacklist, priorities/custom order, configurable hours threshold, single-game or selected/all-library queue, configurable concurrent warm-up, and sequential drop farming by default. Concurrent drop farming is an explicit option, bounded by a tested limit.
- Offer start, pause, resume, stop, per-game skip/exclusion and a resumable queue. Pause automatically while the user plays; reconcile account changes and cancellations before resuming or starting queued work.
- Use bounded concurrency, pagination, caching, cancellation and backoff. A 9,264-game library must not trigger a full scan on each poll or block the UI. Achievement schema/progress reads need incremental refresh and a cache with explicit invalidation.

### Achievement automation

- Queue missing achievements for one game, selected games, or the eligible library; require explicit user start. Support per-achievement and per-game exclusions, custom order, immediate or interval/scheduled runs, fixed or randomized delays, task chaining, and visible pause/resume/cancel state.
- “Import another player's unlock timing” is an open scope decision. Do not silently promise or remove it.
- Keep marketplace features, full numerical stat editing, resetting/relocking, and multi-account automation out of this scope unless requested separately. Achievement changes require clear per-item outcomes and an explicit warning before a run starts.

## Backend options and recommendation

**Prototype the local Steam installation bridge first** behind an independent C# helper, coordinated by the existing Python service and WinForms child-process lifecycle. This aligns with the installed-game scanner and avoids shipping Valve binaries. It still requires proving the local Steam interfaces support the needed operations on representative games.

**Evaluate direct SteamKit2 QR authentication as a separate option**, not a mandatory architecture. It can provide an authenticated network session and QR/refresh-token sign-in (see the [official SteamKit QR authentication sample](https://github.com/SteamRE/SteamKit/blob/master/Samples/001_AuthenticationWithQrCode/Program.cs)); it brings credential protection, reconnect, session-conflict and dependency-notice work. SGI's current code also documents agent/local capability differences, so these modes must not be presented as interchangeable without tests.

The card Community scraper and the achievement writer are separate capabilities. A valid Steam login does not prove the scraper is authenticated, complete, or safe to interpret. The first prototype must establish session acquisition, page completeness and ownership of the helper lifecycle before broader implementation.

## External evidence and limits

- Archi's forum advice favors farming one game at a time: [Steam Community discussion](https://steamcommunity.com/groups/archiasf/discussions/1/4760956147950778154/). This is a maintainer's guidance, not a universal platform guarantee; compare single-game default against the user's requested configurable warm-up/concurrency.
- ASF exposes configurable simple/complex farming thresholds: [ASF performance documentation](https://github.com/JustArchiNET/ArchiSteamFarm/wiki/Performance). This is a behavior reference only.
- Valve states Private games do not earn trading cards: [Steam Support FAQ](https://help.steampowered.com/en/faqs/view/1150-C06F-4D62-4966). Eligibility should be explained rather than reported as a transient scrape failure.
- Valve's [ISteamUserStats documentation](https://partner.steamgames.com/doc/api/ISteamUserStats) documents `StoreStats` and its `UserStatsStored_t` callback. That establishes the platform callback contract; the SGI backend's implementation and handling of that acknowledgment were not inspected in this bounded source pass. Verify the actual success/failure signal before reporting unlock completion as confirmed.

Forum reports and source comments are not proof of Steam policy, account safety, or current runtime success. Test only with explicit user-selected accounts/games and reversible cases.

## Prototype gate

Keep the first implementation milestone narrow and reversible:

1. Add a read-only inventory prototype that enumerates a large library incrementally, paginates, cancels cleanly, caches schema/progress, and reports login/session/eligibility failures distinctly.
2. Validate badge-page scraping on several games, including a private/ineligible game and synthetic truncated/error pages; only complete, validated scans may change queue completion state.
3. Validate a local helper against one selected game: Steam presence appears, stop/pause clears it, the process exits on parent shutdown, and no Valve binaries are packaged.
4. Validate one selected missing achievement in an offline/test fixture first, then with explicit user approval on a low-risk single-player game; require a verifiable Steam acknowledgment or report an unknown outcome and reconcile before retrying.
5. Exercise account switch, cancelled scans, shutdown/restart, task chaining, queue persistence, partial batch failure, rate limiting and a 9,264-game fixture without a full rescan on each poll or UI blocking.

Do not call the prototype complete until each check records its expected and actual result, exit code, and logs. No application implementation or live Steam account operation was performed during this research.

## Three-critic check

- **Skeptic:** Partial pages and HTTP-200 error bodies can look like zero cards; Steam session revocation, Family View, playing elsewhere, and server-side achievement rejection need distinct states. A lost acknowledgment must not become a false success or an unsafe automatic retry.
- **Simplifier:** Keep one shared queue/state API and one explicit helper contract; defer marketplace, broad stats editing, reset/relock, and unapproved timing import.
- **Domain:** Separate the Community cookie reader from game-idling and achievement writes. Bound concurrency and work per poll; keep game actions cancellable, account-scoped, and visibly resumable.

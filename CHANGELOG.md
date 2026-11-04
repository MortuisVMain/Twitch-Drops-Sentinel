# Changelog

Notable changes per release. Full notes, in Russian and (from v3.5.2 on) English, are on the [Releases](https://github.com/MortuisVMain/Twitch-Drops-Sentinel/releases) page.

## [Unreleased]
- New "Check readiness" window on the Giveaways tab: what is ready, what is left, and buttons to fix it.
- An interrupted browser engine install no longer counts as done, and a failed Chromium download is reported.
- Updates install only release assets of this repository, and archives can no longer overwrite user files through paths such as `./config.json`.
- The local service refuses requests from other websites.
- Settings files are saved together or not at all, and reset uses the right defaults. The profile backup now includes `config.json` and reports what is missing.
- A running auto-shutdown countdown stops when the setting is turned off or a new target appears, and it does not repeat after the PC wakes.
- Saved engine switches (channel points, auto-claim, streamer watchdog) now apply on every engine start.
- Settings send only what changed, so a quick second change cannot bring an old value back. An empty store choice no longer starts the default stores.
- Command palette: arrow keys and Enter. Dialogs keep and return focus, tab hotkeys no longer act behind them, and the FARM switch works from the keyboard. The console no longer repeats a line's level.
- Dimmer: writes to different monitors no longer cancel each other, Poll shows the hardware value, and repeated blackouts keep the original sound state.

## [3.5.6] - 2026-11-03
- Release archives now include `LICENSE` and `THIRD_PARTY_NOTICES.md`.
- Store sign-in on the Giveaways tab works inside the app: prompts no longer wait for a terminal, stores record a confirmed login, and the tab shows refusals and login progress. Fab now waits for the login, and Unity no longer reports a login that never happened.
- A store card shows the account right after sign-in instead of after the first claimed game.
- Switch account (the arrows button on a store card) asks first and signs out of that store only; Fab also signs out of Epic Games, because it signs in through Epic.
- The scheduled claim is created on a clean install when auto-claim is turned on or days are picked, follows the selected stores, writes `giveaways_scheduled.log` and is reported as failed when a store fails. A missing task and scheduler errors are shown in the UI, and Node.js older than 20 is refused with an explanation.
- Update checks repeat every 30 minutes and when the window is shown again, and a failed check is reported in Settings instead of looking like "up to date".
- Unity orders are placed only at a clearly zero total; made-up billing details are no longer filled in and not every checkbox on the page is ticked.

## [3.5.5] - 2026-11-02
- Fixed the progress counter jumping to 100% and back when a drop from another campaign was claimed in the background. The counter now stays strictly on the drop being actively farmed.
- Added a game card with cover art and game name to the left of the progress counter on the Live Dashboard, making the actively farmed game immediately recognizable.
- Guaranteed clean executable restart after NTFS rotation during hot-patch updates.

## [3.5.4] - 2026-11-02
- Backdrop tab grouped by look (Energy and light, Space and signals, Materials, Landscape); older backdrops kept in a collapsed Classic section.
- Photo thumbnails use the colors of the active theme; hovering a card plays the backdrop live.
- "No backdrop" is a switch that returns to the previous backdrop.
- Light themes (Daylight, Paper) get their own set of 17 photo backdrops made in ComfyUI as light photographs (ceramic, marble, satin, glass), instead of recolored dark frames that looked washed out. Classic backdrops draw dark lines on a light page.

## [3.5.3] - 2026-11-02
- Photo backdrops are clearly animated now, each in its own way: a light wave over the hex seams, heat and sparks from the lava, satellites orbiting the globe, a rotating radar beam, a bouncing equalizer, rising bubbles, rippling water and silk, drifting fog between the mountains and more.

## [3.5.2] - 2026-11-02
- Fixed game covers that stayed grey (for example Battlefield 6): Steam's placeholder images are now detected and skipped.
- Removed the leftover "v7.0" from the title shown while no drop is active.

## [3.5.1] - 2026-11-02
- New appearance panel with **Theme** and **Backdrop** tabs: themes grouped into dark and light with real swatches, every backdrop as a preview card, filters (All, Photo, Animated, Patterns) and a brightness slider that is always visible.
- "Apple Luna (Orbs)" and "Liquid Silk" merged into "Soft Orbs"; saved settings keep working.
- Names no longer get cut off at large text sizes or in the smallest window.

## [3.5.0] - 2026-11-02
- Four new themes: Midnight, Graphite OLED, Paper (second light theme) and Sakura Night.
- 17 photoreal backdrops made with ComfyUI, recolored to the active theme and animated (glow, light sweep, mouse light).

## [3.4.1] - 2026-11-01
- Text size slider from 70 to 130 % in 5 % steps instead of three buttons.

## [3.4.0] - 2026-11-01
- Readability pass: one bundled font (Inter), larger minimum text size, contrast of at least 4.5:1 in every theme, text size setting, consistent truncation of long names.
- English interface.
- Close dialog: keep farming in the tray or quit.
- "Exclude" button on game covers.

## [3.3.5] - 2026-11-01
- Fixes: real module counter in Settings, correct version in diagnostic reports, one Windows notification per claimed drop.
- Twitch service respects `Retry-After` and backs off with jitter; stuck giveaway processes are stopped after a time limit.

## [3.3.4] - 2026-10-24
- Update download shows live progress and speed, handles slow or broken connections, and offers a direct download link as a fallback.

## [3.3.3] - 2026-10-24
- Redesigned Help and knowledge base.
- Release archives are checked to contain no personal data.

## [3.3.2] - 2026-10-24
- Free-games claimer fully integrated into the app.
- Internal cleanup of shared state.

## [3.3.1] - 2026-10-21
- Force farming of a chosen game.
- Screen dimmer rebuilt: hardware dimming plus overlay, works below the monitor minimum.

## [3.3.0] - 2026-10-19
- Free-games claimer bundled with the app (Epic Games, GOG, Steam, Fab, Unity, itch.io, Prime Gaming).
- Screen dimmer tab.
- Single settings page; misleading technical metrics removed from the dashboard.

## [3.2.2] - 2026-10-19
- Updates replace the running executable safely (no more "Permission denied").

## [3.2.1] - 2026-10-19
- Patch archives include the executable; the window no longer collapses when minimized to the tray.

## [3.2.0] - 2026-10-19
- Restoring from the tray always brings back a full-size window; double-click on the tray icon restores it.

## [3.1.9] - 2026-10-19
- Excluded games stay out of the Game Shelf; auto-claim ignores rewards that are not yours; no duplicate entries in the trophy log.

## [3.1.8] - 2026-10-19
- "Collected" tab in the Game Shelf with every title you got rewards for.

## [3.1.7] - 2026-10-19
- Giveaway store choices are saved; the app version is shown consistently after updates.

## [3.1.6] - 2026-10-19
- Support for showcase and partner campaigns; "priority only" mode strictly sticks to your list; the dashboard shows the whole queue.

## [3.1.5] - 2026-10-19
- Recovery after sleep and silent WebSocket connections; log rotation; linked-account games get priority; switch Twitch accounts from Settings.

## [3.1.4] - 2026-10-19
- Clear the trophy log, hide games from shelves, view the diagnostic report in the app, deeper scan of custom game folders.

## [3.1.3] - 2026-10-19
- Channel points bonus chests are collected automatically.
- Toggles to enable or disable each module.

## [3.1.2] - 2026-10-18
- Fewer false "game running" pauses, with a one-click "this is not a game" option.

## [3.1.1] - 2026-10-18
- Installed games detected from Steam, Epic Games and GOG Galaxy; custom game folders via the Windows folder picker.

## [3.1.0] - 2026-10-18
- First public release: auto-updater from GitHub Releases, two-column dashboard, clean first-run setup, interface sounds with mute.

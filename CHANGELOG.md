# Changelog

Notable changes per release. Full notes, in Russian and (from v3.5.1 on) English, are on the [Releases](https://github.com/MortuisVMain/Twitch-Drops-Sentinel/releases) page.

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

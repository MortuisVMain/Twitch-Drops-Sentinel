# Changelog

Notable changes per release. Full notes, in Russian and (from v3.5.2 on) English, are on the [Releases](https://github.com/MortuisVMain/Twitch-Drops-Sentinel/releases) page.

## [Unreleased]

## [4.3.0] - 2026-11-27
- Steam IDLE reads the card page of the farmed game again: the cheap check every 10 minutes failed on every run ("gamecards_unparsed") because Steam's page wraps its badge in a row class the parser treated as the badges list, so each check read every badge page instead. A failure that repeats is now logged once, then quietly, with one line when it recovers.
- Restart from the app no longer sometimes just closes it: the new copy waits for the old one to let go instead of taking it for a running copy. On exit the app gives the service up to 21 seconds, so Steam IDLE can release the games it holds, instead of killing it after 2.5 seconds.
- Fixed: the "Lock" choice of the auto-shutdown did nothing; a damaged update archive left the updater on "extracting"; a health notification could repeat a problem you had just fixed; a single mouse click ended the blackout although the screen says Esc or Alt+Backspace.
- Screen fixes: the 40-segment progress meter lights up, the Health center badge count is readable, the game catalog and the diagnostics report open above the header, colours that were missing in some themes are set. The stage chip shows the real drop stage, and values the app does not measure show "-" instead of invented numbers.
- Confirmations (reset statistics, switch account, run a fix) are in-app dialogs instead of browser pop-ups.
- Less background work: the window checks the service with a light request, polls only when the live connection is down, redraws the countdown without redrawing the whole app, stops the animated backdrop when hidden, and lets WebView2 use less memory while in the tray. The service reads Trophies.md only when it changed.
- Hardening: certificate checks are on for cover-art requests, cookies are never saved unencrypted if Windows encryption fails (the previous file is kept), settings files are flushed to disk before they replace the old ones.

## [4.2.1] - 2026-11-26
- Fixed a restart storm of the local service: after any exit the app started a new service every 2 seconds, killed each one while it was still starting, and kept issuing new Twitch sign-in codes and browser tabs. Now only one place decides about restarts, a starting service is never killed, and a service that crashes three times right after its start is left alone for 60 seconds (the Health center says so). The Twitch activation page opens at most once per 10 minutes.
- When the window page crashes (WebView2 158, released by Microsoft on 26 Nov, crashes with STATUS_ACCESS_VIOLATION), the app reloads it by itself instead of leaving the "This page is having a problem" screen up; at most 3 reloads per 5 minutes, each one written to desktop_errors.log.
- Installs now include config.default.json (the template of default settings), so the service no longer reports it as unreadable on every start; the update patch delivers it to existing installs.

## [4.2.0] - 2026-11-25
- Steam IDLE keeps statistics from this version on: farm hours, cards dropped and achievements unlocked, per game and per day, for the current Steam account (kept for a year). The new "Statistics" section in the Steam IDLE tab shows the totals for 7 days, 30 days or all time, weekly bars, a sortable per-game table, a CSV export and a reset. The "History and statistics" window shows the same totals next to your drops and free games.
- The Health check is now the Health center, with its own stethoscope button next to More (grey when all is well, amber with warnings, red with the number of failures; Ctrl+Shift+H and the quick commands open it too). The dot and the menu item were moved there from the More menu.
- The Health center has four sections: Summary (overall state, time of the last check, "Check now" and the last 20 problems found or fixed), Checks (the rows and one-click fixes as before), For developers and Maintenance (restart the app, open the logs folder, reset the window data and the background watch switch with its interval).
- For developers: "Save report to a file" puts the cleaned report on the Desktop, "Collect logs" builds a ZIP of cleaned copies of the service, desktop and crash logs (the last 5 MB of each, with a README of what is inside) on the Desktop, and "Report a problem" copies the report and opens a prefilled new issue on GitHub; the report itself is never put in the link.
- A click on the notification about a new failure opens the Health center (the app registers a hellharvest:// link for the current Windows user to make this work and removes it on uninstall).
- New service address GET /api/v1/health/history returns the last 20 problems found or fixed by background and manual checks.

## [4.1.0] - 2026-11-25
- A new "Health check" item in the More menu runs read-only checks of Twitch and Steam sign-in, giveaways, network, updates, settings and disk, groups the results by area and lets you copy a report.
- The Health check now offers one-click fixes next to the problem it found: sign in to Twitch again, open the sign-in page and copy the code, sign in to Steam, reinstall the giveaways engine, repair autostart, restore the settings from a backup, delete old logs and reset the window data. Anything that erases something asks first and says what is lost, and the settings are backed up before they are restored.
- New setting "Watch the app in the background" (on by default, every 1, 4, 12 hours or once a day): the app quietly runs the read-only checks, shows a dot on the More button and a problem count next to "Health check", and sends one notification about each new failure. It first looks about five minutes after the start; the network checks are left out. Turning it off stops it completely.

## [4.0.1] - 2026-11-24
- The built-in updater now resumes after network drops and downloads in parallel parts, so slow connections to GitHub no longer make it restart from zero.
- The dashboard's "service unavailable" banner gets a Check button that tells what is wrong and what to do, with restart, logs folder and a copyable report.
- The app no longer restarts its local service just because it answers slowly (for example on a slower PC at the first start). Before, each restart began the Twitch sign-in again, so a new code and a new browser tab appeared every few seconds and the code could not be entered.

## [4.0.0] - 2026-11-22
- The app is now called Hell Harvest, with new icons. Updates, settings and sign-ins carry over.
- A full user guide in Russian (docs/ИНСТРУКЦИЯ.md) and English (docs/GUIDE.md); the in-app help gains a Steam IDLE tab and a link to the guide; the installer explains what the app does and the first steps, and can open the guide when it finishes.

## [3.11.0] - 2026-11-22
- Settings: a new block "Other copies in autostart" finds old copies of the app that still start with Windows, run, hold the giveaways task or leave a v2 Startup shortcut; remove their entries (each one is backed up first), close a running old copy, move the autostart to this copy or import the data of an old copy. Entries of copies whose folder is gone are removed automatically at start.
- Starting a second copy now offers to close an older copy running from another folder; Settings hints at the installer, which updates in place, when this copy sits in Downloads or has left others behind.

## [3.10.0] - 2026-11-22
- Steam IDLE, card farm: a playtime phase for restricted accounts (new, or after refunds), which get no cards from a game before it has a few hours. Games under the threshold are idled together, up to 32 at once, until each has the hours, then farmed one at a time as before. New setting "Hours before first card drop" (default 3, 0 turns the phase off). If Steam counts no playtime for an hour, the run falls back to one game at a time and says so.
- Steam IDLE: a Log panel shows what the module is doing (games idled, drops, playtime, errors) with Copy for bug reports and Clear; Steam IDs and file paths are masked.
- Steam IDLE: rechecks read only the farmed games' card pages (a full badge scan runs at start and hourly), far fewer requests on big libraries; the farm panel shows cards left, an estimated time and cards dropped today.
- Steam IDLE: after a few games the app suggests the right playtime threshold for your account (restricted or not); farming pauses while you play a game yourself and resumes when you close it; notifications (also to Telegram/Discord) when all cards are collected, when farming stops on an error, and a daily drop summary.

## [3.9.2] - 2026-11-22
- Game Shelf: reward campaigns get their own "Reward campaigns" tab, so long condition lists no longer stretch the game grid; a card shows two conditions and a "More conditions" toggle.
- Interface: cards of one kind line up on every tab (badges, statuses and buttons at the same height whatever the title length): giveaways, dashboard, queue, shelf, Dimmer and Steam IDLE.
- Giveaways: Epic Games now also claims paid games that are 100% off outside the weekly giveaway block (a publisher's own sale, e.g. "Contractor: The Clean Up Part II"). The store is searched at most every 6 hours; free-to-play games are never taken. GOG games at 100% off are listed in the log with their link (and in a notification, once each); they are not claimed automatically.
- Steam IDLE, Achievements: the game list shows only games with achievements (the store is asked once per 100 games, answers are cached for weeks), with a search placeholder, Not finished / Finished filters and "Show more" instead of a hard cap of 50. Each game row shows its progress (X of Y, all unlocked, none yet) and an anti-cheat label. The chosen game opens in a panel next to the list with its progress and achievements; "Leave alone (anti-cheat)" became a clear switch "Never unlock achievements in this game". Run state and pace sit side by side at the top, with plain labels.

## [3.9.1] - 2026-11-22
- Installer: refuses Program Files and the Windows folder even when run as administrator. The app always runs as the user and cannot write there, so such a copy failed on every start with "local service unavailable". The folder page now explains which folders work and why.
- Updates: a new release is offered only once its ZIP is uploaded (the build takes a few minutes after the release appears), and the app asks again every two minutes meanwhile. Before, Install did nothing in that window.
- Notifications inside the app (toasts) are shown again at the bottom of the window, above open dialogs; they were drawn unstyled at the end of the page and could not be seen.
- Queue notifications work again: the toasts for a started queue campaign, a campaign waiting for the account link, and the warning that a campaign will end before the queue reaches it never fired (the check was built but never run).

## [3.9.0] - 2026-11-22
- Notifications and safety: Telegram and Discord copies of the app's notifications (secrets stored encrypted), a notification when a sign-in is lost, a warning when a queued game's campaign will close before the queue reaches it, a "Roll back to v…" button after an update, restore of a profile backup, and an opt-in beta update channel.
- Farming and stats: a daily farm schedule (quiet hours, may run past midnight) with a "Farm now" button, and a History and stats window with weekly totals and a CSV export.
- Under the hood: the verification suite runs every gate and prints a summary, and the biggest source files are split into modules. Nothing changes for the user.

## [3.8.0] - 2026-11-21
- Reward campaigns (opt-in, off by default): Sentinel fetches Twitch reward campaigns (quests and brand offers), shows them on the dashboard and the Game Shelf with their deadline and goal, can queue and watch their category in a daily slot, and follows Twitch's own progress. Drops Twitch already confirmed are no longer claimed again.
- Installer: moves settings from an old unpacked copy, offers Node.js LTS through winget, and refuses a folder without write access. Each installed copy now has its own giveaways Task Scheduler task, so one copy no longer shows, switches or removes another's; the 3.7.0 task moves to the new name with its days, time and on/off state.
- Steam IDLE and interface: your own anti-cheat deny list and 20 more known anti-cheat games, the refund-window "first seen" record kept per Steam account, community script errors logged, and a settings reset that no longer waits for Steam IDLE to stop. Digit hotkeys follow the visible tabs, and the Help and Ctrl+K popups follow the theme.

## [3.7.0] - 2026-11-18
- Installer: a per-user Windows installer (no administrator rights) with a Start menu entry, an uninstaller that asks whether to keep settings and sign-ins, and upgrades that keep them. The portable zip is still published.
- Settings: a Tabs block turns the Game Shelf, Giveaways, Steam IDLE and Dimmer off. A turned-off tab leaves the header, the command palette and the digit shortcuts; Steam IDLE stops and refuses commands, and the Dimmer releases Alt+Backspace.

## [3.6.1] - 2026-11-16
- Steam IDLE: the card list and the game library now load on real accounts. Games never played and games with no drops left no longer fail the card list, and a library of thousands of games is read in full.

## [3.6.0] - 2026-11-16
- Steam IDLE (new tab): idles games for card drops and unlocks missing achievements for one game, chosen ones or the whole library, at a chosen pace. Games with anti-cheat are skipped and refused, recently bought games are not idled while they may still be refunded, and a run cut short by a restart can be continued. Games are shown as cards with their Steam covers, like on the Game Shelf.
- Security: the local API now requires a secret created at each launch and shared only with the app window, so other programs on the computer can no longer drive it.
- Interface: calmer dashboard (collapsed console, live queue, one primary action), larger text and controls, one focus ring, a quieter header, clearer labels on the Game Shelf, Dimmer and Settings, readable light themes, and destructive actions that ask first and report failures.

## [3.5.20] - 2026-11-08
- Security: Windows DPAPI encryption for cached credentials and cookies, protecting persistent Twitch and giveaway sessions from local unauthorized access.
- Giveaways Engine: updated store claim flow adapters (Epic, Fab, GOG, Itch, Prime Gaming, Steam, Unity) with hardened zero-cost verification and checkout resilience.
- Desktop Native Host: improved PiP overlay rendering, multi-monitor geometry restoration, and robust IPC state synchronization.
- Interface & Reliability: refined Game Shelf status indicators, Giveaways readiness diagnostic views, and unified design token styling.

## [3.5.19] - 2026-11-06
- Interface: one set of line icons across the whole app instead of colored emoji and mixed symbols, on every screen, menu, dialog and the mini-window. Some labels are clearer: Hide for 2 h instead of Sleep 2h, Exclude instead of Ban. Service messages and Windows notifications no longer carry decorative emoji.

## [3.5.18] - 2026-11-06
- Game shelf: every game gets a cover, not only games with a running Twitch campaign. Covers are also looked up for queue, excluded, linked, hidden and trophy games, remembered by name, and used on every screen when a game has no art of its own or its art does not load.

## [3.5.17] - 2026-11-06
- Giveaways, Unity: the weekly Asset Store giveaway is claimed again. The engine finds the renamed giveaway link, waits for the late checkout form and coupon field, answers the tax question before applying the coupon, and reads the Unity total in English and Russian. The order still goes through only at a clear zero total.

## [3.5.16] - 2026-11-06
- Giveaways, Epic: when Epic asks to confirm your account after Get, the remembered account you are signed in with is picked automatically, so the claim goes on. No password is typed; a password request still asks you to sign in.

## [3.5.15] - 2026-11-06
- Drops: every new claim is recorded in Trophies.md, also a reward you got before from an earlier campaign. Drops claimed long ago are no longer announced again every hour.
- Console: keeps the last hours of farming (at least five), and Copy takes all of it. A new button opens the log file in Explorer. The log file is rotated at 10 MB, five old parts are kept.
- Off-queue campaigns fill two rows across the whole panel while farming.
- The diagnostic report window is readable: wrapped lines and vertical scrolling.

## [3.5.14] - 2026-11-06
- Giveaways: choose the browser for sign-in and claims in the readiness window: automatic (as before), Chrome, Edge or the built-in Chromium. A chosen browser is never silently replaced by another.
- Each browser keeps its own sign-ins: after switching to Edge or Chromium, sign in to the stores once more. Your current Chrome sign-ins stay as they are.

## [3.5.13] - 2026-11-05
- Giveaways: Fab and Epic free games are claimed again. Versions 3.5.9 to 3.5.12 refused them: nothing was charged, but free games were missed. An order still needs a clear zero in the checkout. Checked with real claims.
- When Epic asks to sign in again after Get, the log says so at once.
- A sign-in window always opens on the screen instead of off its left edge.
- After an update the app no longer offers that same update again.

## [3.5.12] - 2026-11-05
- Giveaways, Fab: free assets are no longer refused because a listing mentions "total ratings". The order itself still needs a clear zero total in the checkout. This fix has not been run through a real Fab checkout yet.
- The giveaways log tells what happened per store: claimed, refused, skipped because of a missing sign-in, or nothing new, instead of always saying success.

## [3.5.11] - 2026-11-05
- Scheduled giveaways: an interrupted run now says so, and the message shows that run's real log instead of a path that may not exist.
- App start: while the service is starting you see a calm status line and loading states, not a red error, empty lists and zero counters. The old V7.0 label is gone.
- Shelf: the "Has unclaimed" filter is removed.

## [3.5.10] - 2026-11-05
- Mini-window: all buttons fit again, and it keeps its size across monitors. The window returns to its position, size and maximized state, also after you close the app from the mini-window.
- The pin button in the mini-window now really turns always-on-top off and on.
- Sharper text on screens at 100% scale: panels are now solid, so the backdrop shows only between them.
- Off-queue games have covers and no longer stretch to huge empty cards while the farm waits.
- Giveaways show longer names on two lines. The shelf list keeps its columns together, and the exclude button moved from the cover to a small button below it.

## [3.5.9] - 2026-11-05
- Giveaways: Epic and Fab games are ordered only when the total is clearly zero. A free game may be refused when its price cannot be read, and then it has to be claimed by hand. Base games are no longer queued for add-ons that require them.
- Refused, failed and skipped games are no longer listed as claimed, so the claimed count may go down.
- Notification text can no longer run commands. Only web links open outside the app, and the window stays on the app's own address. Developer tools are off in release builds.
- Updates check the archive against the checksum published on GitHub. If the checksum cannot be read, the update stops.
- Sign out now really ends the Twitch session and removes the saved cookies.
- Channel point chests are claimed only while you are signed in, and a stuck request can no longer stall watching. This depends on the shape of Twitch replies and has not been checked on the live site.
- The diagnostic report shows the real drop and its progress.

## [3.5.8] - 2026-11-04
- The queue shows how many games are available, need action, have no campaign or are finished, with filters for each status. The position now has its own badge.
- The game shelf can show only campaigns with unclaimed rewards.
- The idle screen separates the service state from the last result. The console can be collapsed to a single line with the latest event.
- Buttons say what they do in plainer words, including the queue-only / queue-and-any rocker. The FLAT-2D chip is gone, and the tray lines appear only in Core.
- Cards for games outside the queue show how much time is left and how much watching is still needed.
- A queued campaign that cannot be farmed now says why.
- An empty collection now says nothing was claimed yet, instead of "No titles match". Small controls have slightly larger click areas.
- The game shelf no longer repeats the account link status under the poster. The readiness window shows an engine install error as a warning, and an error raised while it is open appears there instead of on the tab afterwards.
- Text on the light themes is readable again, and the console stays readable in the smallest window.
- A clean install now gets the default settings, and power-off after farming is off by default, also after "Reset settings". Existing settings are not changed.

## [3.5.7] - 2026-11-04
- The Giveaways and Dimmer tabs tell loading, failure and an empty answer apart, instead of showing "Sign in required" or "No monitors" before the data arrives.
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

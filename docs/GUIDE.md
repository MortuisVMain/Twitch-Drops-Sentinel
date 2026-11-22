# Hell Harvest: user guide

Formerly Twitch Drops Sentinel. Your settings, account sign-ins and trophy log carry over to the new name.

[Русская версия](%D0%98%D0%9D%D0%A1%D0%A2%D0%A0%D0%A3%D0%9A%D0%A6%D0%98%D0%AF.md)

## What it is

Hell Harvest is a Windows app that collects Twitch Drops in the background. It finds channels with drops enabled, keeps your watch time growing and claims the rewards. It never loads the video, so the GPU stays free and the traffic stays small: up to 2.5 GB an hour less than watching the stream in a browser.

Besides Twitch, the app has a few separate parts. All of them are optional, and tabs you do not need can be turned off in Settings.

- **Game Shelf.** The game queue, active Twitch campaigns, reward campaigns and the log of what you collected.
- **Giveaways.** Claims free games and assets on Epic Games, GOG, Steam, Fab, Unity Asset Store, itch.io and Prime Gaming.
- **Steam IDLE.** Farms Steam trading cards and unlocks achievements.
- **Dimmer.** Dims monitors below their hardware minimum, for example for night farming.

## Contents

1. [Install and update](#install-and-update)
2. [First start](#first-start)
3. [Dashboard](#dashboard)
4. [Game Shelf](#game-shelf)
5. [Giveaways](#giveaways)
6. [Steam IDLE](#steam-idle)
7. [Dimmer](#dimmer)
8. [Settings](#settings)
9. [Notifications](#notifications)
10. [Tray, mini window and hotkeys](#tray-mini-window-and-hotkeys)
11. [Data and privacy](#data-and-privacy)
12. [FAQ and troubleshooting](#faq-and-troubleshooting)

## Install and update

There are two ways, and they do not get in each other's way. You do not need to install Python: it is bundled.

**Installer (recommended).** Download `Hell_Harvest_Setup_v….exe` from the [latest release](https://github.com/MortuisVMain/Twitch-Drops-Sentinel/releases/latest) and run it.

- It installs for your account only, needs no administrator rights and adds Hell Harvest to the Start menu. A desktop icon is optional.
- The default folder is in your profile. You can pick your own, for example `D:\Programs\Hell Harvest`. Program Files and the Windows folder do not work: the app runs without administrator rights and could not write its settings and log there. The installer refuses those folders.
- If you used the unpacked ZIP before, the installer offers to bring the settings and account sign-ins over from the old folder. Files are copied and the old folder stays as it is. Close the old copy while setup runs.
- The installer can install Node.js LTS through winget (Giveaways and Steam IDLE need it). Without winget it offers to open nodejs.org.
- Installing again over an existing copy updates it in place and loses nothing. On uninstall the installer asks whether to keep your settings and sign-ins.

**Portable ZIP.** Download `Hell_Harvest_v…_Public_Release.zip`, unpack it into a folder you can write to (for example `C:\Games\Hell Harvest`) and run `TwitchDropsSentinel.exe`. If Windows complains about the file, run `Запустить_Hell_Harvest.bat` from the same folder: it unblocks the downloaded files.

**Updates.** The app checks GitHub Releases on its own. When a new version is out, an "Update available" window shows what changed. "Install update" swaps the files in place and "Restart now" starts the new version. Your sign-in, settings and log stay. The archive is checked against the checksum published on GitHub, and if the checksum cannot be read, the update is not installed.

At the bottom of Settings you also find:
- "Check for updates" to do it by hand;
- a beta switch (pre-releases from GitHub: new things sooner, but they may be rough);
- a "Roll back to v…" button after an update: if the new version works worse, it brings the previous one back, and settings and sign-in are not touched.

**Several copies of the app.** If you downloaded the ZIP many times, old folders can start with Windows and get in each other's way. See the "Other copies in autostart" block in [Settings](#settings) for what to do about it. The installer does not pile up copies: it updates the one you have.

## First start

Go through this once.

1. **Sign in to Twitch.** On the first start Hell Harvest shows a device code and opens [twitch.tv/activate](https://www.twitch.tv/activate) itself. Press "Authorize" in the browser. You never type your login or password into the app. Your nickname appears in the top right corner. The code can be copied with the button next to it.
2. **Pick your games.** Open the Game Shelf, or find a game with the search on the dashboard and press "Add to queue". The queue is the farming order, top to bottom.
3. **Link your game accounts.** To get drops, your Twitch account usually has to be linked to the account of the game. Such campaigns are marked "link needed", and clicking the mark opens the link page. If you linked it yourself, click the mark again to mark the account as linked.
4. **Check the farming mode** in Settings, in the "Farming strategy" block: "Queue only" (recommended), "Queue, and if empty — anything available", or "Queue, then campaigns that are ending soon".
5. **Keep the pause while you play** and (on a laptop) the battery saving switched on. They are "Pause while you play" and "Laptop battery saving".
6. **Decide about the other tabs.** Giveaways, Steam IDLE and Dimmer are optional. Turn off what you do not need in Settings, in the "Tabs" block.
7. **If you want autostart,** switch on "Start with Windows (minimized)". The window then hides in the tray.

## Dashboard

The main screen. It shows what is being farmed right now and lets you steer it.

**Switching on.** The main farm switch is in the window header. While it is off, Hell Harvest watches nothing.

**Current target.** The card shows the game, the streamer, the reward and the timer of the active drop. No video is loaded; the app sends a watch signal about every 20 seconds. Buttons under the card:
- "Switch" takes another streamer in the same game;
- "Next game" moves to the next game in the queue;
- "Hide for 2h" takes the streamer out of the choice for two hours;
- "Exclude" takes the streamer out of farming for good (you can open the list of ignored streamers and bring one back).

If a streamer ends the broadcast, turns drops off or the minutes stop counting, Hell Harvest switches to another one by itself (the "Replace a stuck stream" setting).

**Campaign queue.** Games sit in farming order. Filters on top: "Available", "Need action" (link needed), "No campaign" (the game has no campaign right now, its priority is kept) and finished ones. The order is changed with the arrows on a game card.

**Queue mode.** The "queue only" and "queue + any" switch repeats the setting from the "Farming strategy" block.

**Manual focus.** To get the drop of one game ahead of the queue, pick it in "Pick a game to farm" or press "Farm now" on its card. The game goes first until you cancel the focus or all its rewards are claimed. To cancel, press "Reset focus / Auto" or `Alt + Backspace`.

**What happens on its own.** Rewards are claimed as soon as they are ready and written to `Trophies.md`. If "Collect channel bonus points" is on, Hell Harvest clicks the point chests on streams.

**Warnings on the dashboard.**
- "Gaming pause": the app saw a running game and paused farming.
- "Twitch sign-in required": the sign-in was lost and the code has to be confirmed again.
- "Expiring campaign radar": a campaign in the queue will end before the queue reaches it. "Switch focus now" takes it ahead of the queue.
- "Scheduled pause": you turned on the farm schedule and it is outside the window now.

**Console.** A live log with the tabs "All", "Streams", "Trophies" and "Core". It can be collapsed to a single line with the latest event. "Copy" takes the whole log (it keeps at least the last five hours), and a separate button opens the log file in Explorer. If you report a problem, attach the log.

**Reward campaigns (optional).** If the "Reward campaigns" switch is on in Settings, a collapsed group of quests and brand offers from the Twitch Drops page appears on the dashboard, with the deadline, the goal and a link to Twitch.

## Game Shelf

The Game Shelf tab is the catalog and the place to manage the queue.

**Tabs inside the shelf:** "Active campaigns" (what is running now, new ones are marked "NEW"), "In my queue", "Collected", "Reward campaigns" and "Installed on PC". The view switches between cards with covers and a compact list.

**How the queue works.**
- "Add to queue" adds a game and "Remove from queue" removes it.
- The order #1, #2, #3 changes with the "up" and "down" arrows on a card.
- A game outside the queue is farmed only in the "queue + any" mode, and only after the queued games.
- "Collect now" puts a game first, ahead of the queue. Cancel it on the same card.
- Search also finds games from the catalog when no drops are live. You can queue such a game in advance: its priority is kept, and farming starts when a campaign appears.

**Installed games.** Hell Harvest finds games in the Steam (all drives), Epic Games and GOG Galaxy libraries. Found games are marked "Installed on PC". Add your own folders in Settings, in the "Game folders" block, with "Add folder". "Rescan all drives" refreshes the list. The same information is used for the pause while you play.

**Exclusions and removed games.** If you do not want to farm a game, press "Exclude" on its card. It moves to the "Exclusions" list and cannot be queued until you bring it back. The "Exclusions" and "Removed" lists open from the menu next to the search, and you can restore a game from there.

**Account link.** The mark "linked" or "link needed" tells whether your Twitch account is connected to the game's account. Clicking "link needed" opens the link page.

**Reward campaigns.** The tab shows quests and brand offers when the switch is on in Settings. A campaign can be queued, watched right now ahead of the queue, hidden, or given a Twitch category to watch it in. Hell Harvest never does paid conditions (a subscription and the like); they are marked "manual only". The daily slot (about an hour a day) and automatic adding of new campaigns are separate switches in Settings.

**Collected and Trophies.md.** Rewards you get appear in the "Collected" tab with the exact time and are written to the `Trophies.md` file next to the app. "Open Trophies.md" opens it. Each new drop is recorded once.

**History and stats.** The "More" menu in the header has a "History and stats" window: Twitch drops and free games, weekly totals for 8 weeks, a period of 7 days, 30 days or all time, and a CSV export for Excel.

## Giveaways

A claimer for free games and assets. It runs on a separate Node.js module.

**What you need.** Node.js 20 or newer (it is not in the download; the installer offers to get it through winget) and a browser engine. The engine installs itself on first use, about 150 MB, which takes a few minutes. Twitch drops work without Node.js.

**Which stores.** Epic Games, GOG, Steam, Fab (Unreal Engine assets), Unity Asset Store, itch.io and Prime Gaming. Each store is switched on with its own card.

**What exactly is claimed.**
- Epic Games: the weekly giveaway, and also paid games at 100% off outside the giveaway (for example a publisher's own sale). Free-to-play games are not taken. The store is searched for such sales at most every 6 hours.
- GOG: games at 100% off are listed in the log with their link and in a notification, once each. They are not claimed automatically.
- Steam, Fab, Unity, itch.io, Prime Gaming: games and assets that cost nothing at the time of the claim.
- An order in Epic, Fab and Unity goes through only when the total in the cart is exactly zero. If the price cannot be read, the game has to be claimed by hand.

**Signing in to the stores for the first time.**
1. Open the Giveaways tab and press "Check readiness". The window shows what is missing (Node.js, browser engine, sign-ins, sites, auto-claim) and has buttons to fix it.
2. On a store card press "Sign in". A separate browser window opens. Sign in directly on the store's site; you type nothing into the Hell Harvest window. You have 3 minutes, and a two-factor code goes in the same window.
3. Stores sign in one at a time: wait for one to finish before you press the next.
4. The "⇄" button on a card switches the account of that store. Fab signs in through Epic, so signing out affects both.

Sign-ins are kept separately for each browser. In the readiness window you can choose which one to use: automatic, Chrome, Edge or the bundled Chromium.

**Running.** "Claim all" goes through the stores that are on, and "Stop claiming" interrupts it. The log below says what happened per store: claimed, refused, skipped because of a missing sign-in, nothing new. "Copy logs" copies it.

**Background mode.** It hides the browser window: the claimer does not grab the mouse and keyboard, so you can work or play.

**Schedule.** The "Scheduler" block creates a task in Windows Task Scheduler that runs the claim on chosen days. Each installed copy has its own task, so one copy does not see or switch off another's. A switch turns it on and off, and the log of scheduled runs is in `giveaways_scheduled.log`.

**Collection.** Everything you received is listed at the bottom, with a search by title and links to the pages in the stores.

## Steam IDLE

A separate tab with two sections, "Cards" and "Achievements". It works with the Steam client on this PC.

**Read this before you turn it on.** Automating card drops goes against the Steam rules on automated rewards and can lead to restrictions on your account. Friends see the "in game" status and your playtime grows. While the farm holds a game you cannot launch it yourself. Before the first start you tick "I understand the risk to my account". Unlocking achievements is turned on separately and has its own warning: it is faking game statistics, it breaks the Steam rules, and the app cannot take back an achievement it unlocked.

**What it needs.**
- The Steam client is running and signed in.
- A sign-in to Steam on the website: the "Readiness" block shows "Steam client", "Community session" and "Helper". If there is no session, press "Sign in to Steam", a window opens, and you sign in there yourself. The website account must be the same as the one in the client.
- Node.js and the Giveaways browser engine (Steam IDLE reads the Steam site through it). If the engine is missing, the block sends you to the Giveaways readiness.
- The Giveaways and Steam IDLE tabs are not turned off in Settings.

### Cards

1. Confirm the risk and press "Turn on Steam IDLE".
2. The "Games with cards" list shows where cards are still left. "Refresh list" reads it again.
3. Press "Start farming". Games go one at a time: Hell Harvest keeps a game running while cards drop, then takes the next one. The controls are "Pause" and "Resume", "Skip game" and "Stop".
4. The farm panel shows how many cards are left, an estimated time and how many cards dropped today.

**Games that are not taken yet.** Recently bought games that can still be refunded are not farmed; they land in "Held back". "Farm anyway" lets you take such a game if you are sure.

**The playtime phase for restricted accounts.** New accounts and accounts after refunds get no cards until a game has a few hours of playtime. The "Hours before the first card drop" setting handles this (3 by default, from 0 to 10 in steps of 0.5). Games with fewer hours than the threshold are idled together, up to 32 at once, until each has the hours. Then farming goes back to the usual one game at a time. The status during this phase is "Collecting playtime".
- The value 0 turns the phase off.
- If Steam counts no playtime for a full hour, the run falls back to one game at a time and says so.
- After a few games Hell Harvest can suggest the right threshold for your account, restricted or not. If the account has no restrictions (the first card drops after about 30 minutes), the hint suggests 0, and "Apply" sets it.

**No extra requests.** Rechecks read only the card pages of the games being farmed. A full badge scan runs at the start and once an hour.

**Pause while you play.** The "Pause farming while you play a game" switch. When you start a game of your own, the farm lets go of its games. It carries on by itself a couple of minutes after you close yours. The status then reads "Suspended: a game is running". That is not an error.

**Log.** The "Log" panel shows what the module is doing: which games it holds, cards that dropped, playtime, errors. It has "Copy" and "Clear". Steam IDs and file paths are masked, so you can attach the log to a bug report.

**Notifications.** The "Notify about farming events" switch: all cards collected, farming stopped by an error, the playtime phase turned off, and a daily summary. They also go to Telegram or Discord if those are connected (see "Notifications").

**If farming stops.** The status reads "Stopped" with a reason: could not read the card list, not signed in on the Steam site, the site and the client are signed in to different accounts, could not release the game, or a failure with details in the log.

### Achievements

Turned on separately, after you confirm the risk.

- **One game.** "Games with achievements" lists games that have achievements (the store is asked once per 100 games, answers are cached for weeks). A row shows progress (X of Y, all unlocked, none yet) and an anti-cheat label. There is a search, the "Not finished" and "Finished" filters, and "Show more". Pick a game, tick the achievements you want and press "Get selected", or press "Get all missing in this game".
- **All games.** A run over the whole library. To start it you type the word ALL. You can exclude games by AppID.
- **Pace.** The pause between unlocks is picked at random in a range you set (in minutes), so the run looks like normal play. Limits 0 and 0 mean no pauses. The "Skip hidden achievements" option is here too.
- **Anti-cheat.** Achievements are not unlocked in games with anti-cheat. The app has a built-in list of such games and a list you extend ("Your own exceptions (anti-cheat)": add by AppID or a link to the game's page). The built-in list is incomplete, so check your library yourself. Every game also has a "Never unlock achievements in this game" switch.
- **Interrupted run.** If the app was restarted in the middle of a run, the tab shows "Interrupted run" and you can continue it; games already done are skipped.

## Dimmer

Dims monitors below their hardware minimum. It is meant for night farming: the screen stays dark while the PC keeps working. It works only inside the app, not in a plain browser.

- **One monitor, one card.** Each has its own slider and its own brightness baseline. If a monitor does not accept brightness commands, software dimming is used. "Poll" re-reads the real brightness.
- **Master brightness and scenes.** The master dial turns with the mouse or the wheel (5% a notch). The scenes "Day", "Evening" and "Night" set ready values. "Linked" changes all monitors at once, "Separate" lets you set each one.
- **Baseline.** "Save as baseline" stores the current brightness and "Back to baseline" restores it, including with `Alt + Shift + Backspace`, even from a game.
- **Night blackout (0%).** Blacks out all screens. The PC does not sleep and keeps farming. To lift it press `Esc` or `Alt + Backspace`. "Accidental click protection" means exactly that: the blackout is lifted only by those keys.
- **Sleep timer.** After a set time the screens go dark by themselves. The computer does not fall asleep.
- **Mute sound while dimmed.** The sound returns when the screens wake up.
- **Ultra-dark.** A dark translucent layer over the screen, darker than the monitor allows. Clicks pass through it.
- **Dimmer log** shows what the brightness commands did.

## Settings

Blocks from top to bottom. Every switch takes effect at once.

**Modules.** Switches:
- "Claim drops automatically";
- "Collect channel bonus points";
- "Free giveaways";
- "Replace a stuck stream";
- "Pause while you play": if Hell Harvest sees a running game, it watches nothing, so it does not cost you FPS. Close the game and farming carries on;
- "Laptop battery saving": pause when you switch to battery;
- "Windows pop-up notifications";
- "Interface sounds";
- "Start with Windows (minimized)": the window hides in the tray. If autostart is unavailable, the reason appears under the switch.

**On window close.** What the X button does: "Ask", "To tray" or "Exit".

**Language, text size, theme.** Interface language (Russian or English), text size from 70 to 130 % with "Reset (100 %)". The theme and backdrop are chosen in the header's "More" menu, "Theme" item (11 themes, many backdrops).

**After the queue.** When every drop in the queue is claimed, Hell Harvest warns you 60 seconds ahead and does the chosen action: "Sleep", "Shutdown" or "Lock". The switch sits next to it and is off by default. "Test the timer (5 s, the PC is not affected)" only shows the countdown on screen.

**Farming strategy.** Three modes:
1. "Queue only (recommended)": only the games in your queue;
2. "Queue, and if empty — anything available": if the queue has nothing to farm (no campaigns or streamers offline), it temporarily takes any available drops;
3. "Queue, then campaigns that are ending soon": your queue first, then campaigns with the least time left.

**Farm schedule.** "Farm only on schedule": choose days of the week and hours (times follow the PC clock). The window can run past midnight and belongs to the day it starts on. Outside the window farming is paused, and the dashboard has a "Farm now" button.

**Game folders.** "Add folder", "Rescan all drives", "Clear the list". Shows how many folders are set and how many games were found.

**Tabs.** Switches for the Game Shelf, Giveaways, Steam IDLE and Dimmer. A tab that is turned off disappears from the header, the command palette and the digit hotkeys. Turning off Steam IDLE stops the farm and unlocking, and an interrupted run can be continued later. Turning off the Dimmer releases `Alt + Backspace`.

**Extras.** Reward campaigns (off by default), "Daily slot for rewards" (about an hour a day) and "Add new campaigns to the queue automatically" (only campaigns with watch time and a found category, paid conditions never).

**Telegram and Discord notifications.** See the next section.

**Other copies in autostart.** An old program folder can start with Windows, hold the port and claim giveaways with the same accounts. The block looks for such copies: autostart entries, a shortcut in the Startup folder, the Task Scheduler task for giveaways and copies running right now. What you can do:
- "Remove" an entry (the original of each entry is saved to `data/startup_cleanup_backup.json`, the files of the old copy are not touched) or "Remove all";
- close a running old copy;
- "Move to this copy" for autostart;
- "Import data from this copy": copies the settings, sign-in and data from the old copy into this one (the old copy must be closed; the data here is replaced after a backup, and the app restarts).

Entries of copies whose folder is gone are removed automatically at start. If you start a second copy while an older one runs from another folder, the app offers to close the older one. The block also points to the installer when this copy sits in Downloads or has left others behind.

**Profile backup.** "Profile backup (.zip)" saves the settings, sign-in and trophies. "Restore from backup" replaces the current profile (after saving it) and restarts the app. The backup can come from `data/backups` or you can pick a .zip somewhere else, for example from another computer.

**Danger zone.** "Clear trophies" deletes `Trophies.md`. "Switch account" resets the Twitch sign-in.

**Updates, report, version.** See "Install and update". The "Report" button builds a diagnostic summary with tokens and cookies removed; it is safe to send.

## Notifications

**Windows pop-ups.** They report drops and important events: a drop claimed, a queue campaign started or waiting for the account link, a warning that a campaign will end before the queue reaches it, a lost sign-in, a free game claimed. The same drop is announced once.

**Telegram and Discord.** The "Telegram and Discord notifications" block in Settings sends the same events to a messenger.
- Telegram: a bot token from @BotFather and a `chat_id` (or `@channel`).
- Discord: a webhook address.
- There is a button for a test message. Tokens are stored encrypted on this PC only.

Inside the app, notifications also appear at the bottom of the window, above open dialogs.

## Tray, mini window and hotkeys

**Tray.** The window's X button asks what to do (you can change that in Settings). In the tray farming continues, the icon tooltip reads like "Hell Harvest • Game (65%)" or "Paused", and a click on it brings the window back. The icon menu has "Show Hell Harvest" and "Exit Hell Harvest". A full exit stops farming.

**Mini window (PiP).** A compact window that can stay on top of the others, also on a second monitor. Turn it on from the "More" menu or with `Ctrl + M`. Its size, position and pin state are remembered.

**The "More" menu** in the header: quick commands, mini window, night mode, history and stats, help, theme, interface sound. The interface clicks can be muted there (the speaker item) or with the "Interface sounds" switch in Settings.

**Hotkeys.**

| Keys | What they do |
|---|---|
| Digits 1–6 | Open the tabs from left to right. Tabs that are turned off are skipped |
| `Ctrl + K` | Command palette: quick navigation and game search |
| `Ctrl + M` | Mini window (PiP) |
| `Alt + Backspace` | Reset manual focus; on the Dimmer tab it controls the screen blackout |
| `Alt + Shift + Backspace` | Restore the baseline brightness of the monitors |
| `F5` | Fetch campaigns from Twitch again |
| `Esc` | Close a window or dialog; on the Dimmer leave the blackout |
| Mouse wheel over the dial | On the Dimmer changes the master brightness by 5 % a notch |
| Double-click the header | Maximize the window or return it to the normal size |

The same hints are in the app: "More" → "Help & hotkeys".

## Data and privacy

Everything is stored on your PC, next to the app:

| What | Where |
|---|---|
| Twitch session | `cookies.jar` (treat it like a password) |
| Settings | `config.json` |
| Log of rewards | `Trophies.md` |
| Browser profiles for Giveaways | `giveaways_engine/data/` |
| Profile backups | `data/backups` |
| Backup of autostart entries | `data/startup_cleanup_backup.json` |
| Service log | `core/sentinel_service.log` |
| Scheduled giveaways log | `giveaways_scheduled.log` |

Tokens and cookies are encrypted with Windows facilities. The app talks to Twitch, GitHub (update checks), the stores (if you use Giveaways), Steam (if you use Steam IDLE), and Telegram or Discord if you connect them. There are no cloud databases and no analytics. The report and the logs are cleaned of tokens before you copy them. Do not send `cookies.jar` or the `data` folder to anyone.

The app's local API is protected by a secret that is created at every launch and shared only with the app window, so other programs on the PC cannot drive it.

**Platform rules.**
- Automated watching is a grey area of the Twitch Terms of Service. Hell Harvest signs in with Twitch's official device login and behaves like a normal viewer, but use it at your own risk.
- Automating Steam card drops goes against the Steam rules on automated rewards and can lead to restrictions on your account. Unlocking achievements with a program is faking game statistics and breaks the Steam rules, and in games with anti-cheat or online rankings the game itself may punish you for it.
- Automatically claiming free games may also go against the terms of a store.
- Hell Harvest is not affiliated with Twitch, Amazon, Valve or any game store.

## FAQ and troubleshooting

**Can I get banned on Twitch?**
Automated watching is a grey area of the Twitch terms. The app signs in with the official device login and sends ordinary watch signals, but nothing can be guaranteed. Use it at your own risk.

**Can I hear the stream, does it use the GPU?**
No. The video stream is never loaded, there is no sound, and the GPU load is close to zero.

**Can I minimize it to the tray?**
Yes, the app keeps collecting drops from the tray. What the X button does is set in Settings.

**Windows says "Windows protected your PC" (SmartScreen).**
The file is not signed with a certificate, so Windows warns on the first start. Press "More info" and "Run anyway". You can also run `Запустить_Hell_Harvest.bat` from the ZIP: it unblocks the downloaded files.

**How do I switch the Twitch account?**
"Settings" → "Danger zone" → "Switch account", then confirm. The saved session is reset and the app asks you to sign in again.

**Two copies of the app start, or an old copy gets in the way.**
Open Settings → "Other copies in autostart". It shows which copies start with Windows. Remove the entries of the old copies or move autostart to the current one. To keep copies from piling up, update with the installer or the built-in updater.

**Farming paused by itself.**
Most likely the app noticed a running game: the "Pause while you play" setting (on the dashboard it is "Gaming pause"). Close the game and farming carries on. On a laptop, switching to battery does the same. The farm schedule can also be on while it is outside the window. Steam IDLE has its own pause for when you play a game of your own.

**No card drops in Steam IDLE.**
Most likely the account is restricted: new accounts and accounts after refunds get no cards until a game has a few hours of playtime. Check "Hours before the first card drop" (3 by default) and the "Collecting playtime" status. Let the phase run. If the account has no restrictions, set 0. Everything else is in the tab's "Log".

**The Giveaways tab says Node.js is needed.**
Claiming free games runs on Node.js 20 or newer, which is not in the download. Get it from nodejs.org (the installer offers it through winget) and start again. The browser engine downloads itself on first use, about 150 MB. Twitch drops work without Node.js.

**How do I sign in to a store on the Giveaways tab?**
Press "Sign in" on the store card. A separate browser window opens: if you cannot see it, look for it on the taskbar. Sign in directly on the site; you have 3 minutes. After that the window checks the giveaways and closes on its own. Stores sign in one at a time.

**How do I switch a store account?**
The "⇄" button on the store card. Hell Harvest asks for confirmation and signs out of that store only (Fab signs in through Epic, so it signs out of both). Then a window opens for the new sign-in. If you close it without signing in, the store stays signed out.

**The store sign-in did not finish.**
Check that the browser window opened and sign in within 3 minutes. If a two-factor code is requested, enter it there. If the time ran out or the window was closed, the tab shows the reason; press "Sign in" again. While one sign-in runs, the others wait.

**What should I send when something does not work?**
- The text of the "Copy" button from the console on the dashboard (paste it into your message).
- For Giveaways: the text of "Copy logs" on that tab and the `giveaways_scheduled.log` file next to the `giveaways_engine` folder.
- For Steam IDLE: "Copy" in the tab's "Log". Steam IDs and paths are masked there.
- The diagnostic report: "Settings" → "Report".
- The `core/sentinel_service.log` file from the app folder.
- The output of `node -v` if the problem is with Giveaways or Steam IDLE.

Do not send passwords, `cookies.jar` or the `data` folder.

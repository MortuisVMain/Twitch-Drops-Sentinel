"""Game process lists and game name normalisation used by the local service. Split out of sentinel_service.py without
behavior change; sentinel_service re-exports every name."""

from __future__ import annotations

import reward_watch
from campaigns_fetcher import CAMPAIGNS_FETCHER


DEFAULT_GAMES_PROCESSES = [
    "poe2.exe", "pathofexile.exe", "pathofexile_x64.exe", "hunt.exe",
    "cs2.exe", "csgo.exe", "rustclient.exe", "rust.exe", "deadlock.exe",
    "valorant.exe", "valorant-win64-shipping.exe", "dota2.exe", "r5apex.exe",
    "overwatch.exe", "rainbowsix.exe", "fortniteclient-win64-shipping.exe",
    "warframe.x64.exe", "pubg.exe", "tslgame.exe", "witcher3.exe",
    "cyberpunk2077.exe", "godofwarragnarok.exe", "horizonforbiddenwest.exe",
    "spiderman2.exe", "tlou-i.exe", "tlou-ii.exe", "frostpunk2.exe",
    "inzoi.exe", "hades2.exe", "stellaris.exe", "terraria.exe",
    "hearthstone.exe", "starcraft.exe", "rdr2.exe", "acvalhalla.exe",
    "deathstranding.exe", "dredge.exe", "mechanicus2.exe", "nfsunbound.exe"
]

SYSTEM_NON_GAME_EXES = {
    "happ.exe", "spotify.exe", "telegram.exe", "firefox.exe", "chrome.exe",
    "opera.exe", "msedge.exe", "brave.exe", "discord.exe", "utorrent.exe",
    "torrent.exe", "qbittorrent.exe", "winscp.exe", "hwinfo64.exe", "hwinfo32.exe",
    "gpu-z.exe", "cpu-z.exe", "update.exe", "updater.exe", "launcher.exe",
    "ollama.exe", "ffmpeg.exe", "regorganizer.exe", "systeminformer.exe",
    "jetbrains_client64.exe", "vcpkg.exe", "qtwebengineprocess.exe",
    "samsungmagician.exe", "purevpn.exe", "mpc-hc64.exe", "mpc-be64.exe",
    "vlc.exe", "explorer.exe", "taskmgr.exe", "cmd.exe", "powershell.exe",
    "conhost.exe", "ctfmon.exe", "searchhost.exe", "startmenuexperiencehost.exe",
    "textinputhost.exe", "shellexperiencehost.exe", "applicationframehost.exe",
    "runtimebroker.exe", "smartscreen.exe", "securityhealthservice.exe",
    "onedrive.exe", "googledrivesync.exe", "dropbox.exe", "notion.exe",
    "slack.exe", "zoom.exe", "teams.exe", "obs64.exe", "obs.exe",
    "everything.exe", "sharex.exe", "lightshot.exe", "powertoys.exe",
    "mscopilot.exe", "copilot.exe", "cortana.exe", "widgetservice.exe",
    "widgets.exe", "photoshop.exe", "finereader.exe", "aimp.exe", "anvir.exe",
    "blender.exe", "c4dpy.exe", "cheatengine-x86_64.exe", "unrealeditor.exe",
    "antigravity ide.exe", "deepseek harness.exe", "gemini.exe", "dsx.exe",
    "asus_framework.exe", "game cheats manager.exe", "game save manager.exe",
}

SLUG_TO_GAME_NAME = {
    "poe2": "Path of Exile 2",
    "poe": "Path of Exile",
    "path of exile 2": "Path of Exile 2",
    "rust": "Rust",
    "hunt": "Hunt: Showdown 1896",
    "hunt showdown": "Hunt: Showdown 1896",
    "hunt: showdown": "Hunt: Showdown 1896",
    "hunt1896": "Hunt: Showdown 1896",
    "nomansky": "No Man's Sky",
    "no mans sky": "No Man's Sky",
    "witcher": "The Witcher 3: Wild Hunt",
    "witcher 3": "The Witcher 3: Wild Hunt",
    "witcher3": "The Witcher 3: Wild Hunt",
    "the witcher 3": "The Witcher 3: Wild Hunt",
    "cyberpunk": "Cyberpunk 2077",
    "cyberpunk2077": "Cyberpunk 2077",
    "hearthstone": "Hearthstone",
    "starcraft2": "StarCraft II",
    "rdr2": "Red Dead Redemption 2",
    "acvalhalla": "Assassin's Creed Valhalla",
    "inzoi": "inZOI",
    "hogwarts": "Hogwarts Legacy",
    "wardogs": "WARDOGS",
    "warframe": "Warframe",
    "tarkov": "Escape from Tarkov",
    "eft": "Escape from Tarkov",
    "cs2": "Counter-Strike 2",
    "csgo": "Counter-Strike 2",
    "dota2": "Dota 2",
    "dota": "Dota 2",
    "valorant": "VALORANT",
    "apex": "Apex Legends",
    "overwatch": "Overwatch 2",
    "rainbowsix": "Tom Clancy's Rainbow Six Siege",
    "r6": "Tom Clancy's Rainbow Six Siege",
    "deadlock": "Deadlock",
    "aion": "AION",
    "aion2": "AION 2",
}


def normalize_priority_entry(name: str) -> str:
    """A queue entry: a game name is normalised, a `reward:<campaignId>` key is kept as it is (normalising would destroy it)."""
    stripped = name.strip() if isinstance(name, str) else name
    return reward_watch.clean_key(stripped) if reward_watch.is_reward_key(stripped) else normalize_game_name(name)


def normalize_game_name(name: str) -> str:
    cleaned = name.strip()
    low = cleaned.lower()
    if low in SLUG_TO_GAME_NAME:
        return SLUG_TO_GAME_NAME[low]
    
    # Check if there is an active Twitch campaign matching this name
    matched = CAMPAIGNS_FETCHER.find_active_campaign(cleaned)
    if matched and matched.get("gameDisplayName"):
        return matched["gameDisplayName"]

    return cleaned

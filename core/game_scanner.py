"""
Twitch Drops Sentinel v3.1 — Universal Game Discovery Engine
Author: Mortuis_V_Studio

Multi-platform resilient game scanner for Windows 10/11:
- Tier 1A: Steam (HKCU/HKLM registry 32/64-bit, libraryfolders.vdf modern/legacy, multi-drive discovery)
- Tier 1B: Epic Games (%ProgramData%, registry ModSdkMetadataDir, manifest .item parsing)
- Tier 1C: GOG Galaxy (HKLM/HKCU registry 32/64-bit)
- Tier 2: Windows Uninstall Registry (Battle.net, Riot, EA, Ubisoft, Standalone games)
- Tier 3: Custom user directories (Single game root or parent library, deep binary search max_depth=3)
- Dual-access contract: InstalledGame acts as both dict (g['name']) and object (g.name)
- Atomic JSON persistence (.tmp -> os.replace)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import string
from pathlib import Path
from typing import Any, Optional, Iterator

logger = logging.getLogger("TwitchDropsSentinel.GameScanner")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
INSTALLED_GAMES_FILE = DATA_DIR / "installed_games.json"

SYSTEM_BLACKLIST = {
    "$recycle.bin",
    "system volume information",
    "windows",
    "winsxs",
    "program files",
    "program files (x86)",
    "programdata",
    "appdata",
    "recovery",
    "perflogs",
    "msocache",
    "documents and settings",
    ".git",
    "node_modules",
    "temp",
    "tmp",
}

EXE_BLACKLIST_SUBSTRINGS = (
    "unins", "setup", "install", "crash", "handler", "redist", "vcredist",
    "dxsetup", "dotnet", "ue4prereq", "ueprereq", "easyanticheat", "battleye",
    "launcher", "updater", "patcher", "benchmark", "config", "server",
    "unitycrashhandler", "cefprocess", "crs-handler", "cleanup", "touchup",
    "helper", "crashpad", "errorreport", "report", "activation",
)

BINARY_SUBDIRS = (
    "bin", "binaries", "win64", "win32", "x64", "x86", "retail",
    "game", "client", "shipping", "engine", "release",
)

NON_GAME_KEYWORDS = (
    "microsoft", "visual c++", "redistributable", "directx", "nvidia", "amd ",
    "intel", "realtek", "driver", "sdk", "runtime", "vulkan", "windows",
    "google", "mozilla", "discord", "obs studio", "steam", "epic games",
    "gog galaxy", "ubisoft connect", "ea app", "battle.net", "riot vanguard",
    "overwolf", "razer", "logitech", "corsair", "7-zip", "winrar", "vlc",
    "python", "node.js", "git", "webview2", ".net", "physx", "openal",
    "adobe", "abbyy", "autodesk", "corel", "blender", "figma", "zoom",
    "telegram", "whatsapp", "spotify", "docker", "jetbrains", "pycharm",
    "visual studio", "vscode", "antigravity", "office", "libreoffice",
    "word", "excel", "powerpoint", "notion", "obsidian", "slack", "postman",
    "wireshark", "putty", "filezilla", "torrent", "anydesk", "teamviewer",
    "vmware", "virtualbox", "chrome", "firefox", "opera", "yandex", "edge",
    "thunderbird", "winamp", "aimp", "foobar", "itunes", "acrobat", "photoshop",
    "illustrator", "premiere", "after effects", "audition", "lightroom",
    "davinci", "audacity", "handbrake", "gimp", "inkscape",
)

EDITION_STRIP_RE = re.compile(
    r"\b(goty|game of the year|complete|definitive|ultimate|deluxe|standard|"
    r"edition|director'?s cut|remastered|anniversary|enhanced|remake|playtest)\b",
    re.IGNORECASE,
)
NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
VDF_KV_RE = re.compile(r'"([^"]+)"\s+"([^"]*)"')


def sanitize_slug(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", name.lower()).strip("_")
    return slug or "game"


def normalize_game_name(name: str) -> str:
    """Produces a canonical alphanumeric slug for deterministic Twitch matching."""
    if not name:
        return ""
    cleaned = name.replace("™", "").replace("®", "").replace("©", "")
    cleaned = EDITION_STRIP_RE.sub("", cleaned.lower())
    return NON_ALNUM_RE.sub("", cleaned)


class InstalledGame(dict):
    """
    Dual-access game record supporting both dict operations (g['name'], g.get('name'))
    and attribute access (g.name, g.install_path) for 100% zero-defect compatibility.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.__dict__ = self

    @property
    def executable_names(self) -> list[str]:
        exe = self.get("executable")
        if not exe:
            return []
        if isinstance(exe, list):
            return [str(x) for x in exe if x]
        return [str(exe)]

    def to_dict(self) -> dict[str, Any]:
        return dict(self)

    @classmethod
    def create(
        cls,
        game_id: str,
        name: str,
        platform: str,
        category: str,
        install_path: str,
        app_id: str = "",
        executable: str = "",
        box_art: Optional[str] = None,
    ) -> InstalledGame:
        return cls({
            "id": game_id,
            "name": name.strip(),
            "normalized_name": normalize_game_name(name),
            "platform": platform,
            "category": category,
            "app_id": str(app_id),
            "install_path": str(install_path),
            "executable": str(executable) if executable else "",
            "box_art": box_art,
            "is_installed": True,
            "has_drops": False,
        })


class GameScanner:
    def __init__(self, data_dir: Path | None = None):
        self.data_dir = data_dir or DATA_DIR
        self.cache_file = self.data_dir / "installed_games.json"
        self._lock = asyncio.Lock()
        self._is_scanning = False

    @staticmethod
    def _read_reg_str(hive: int, subkey: str, value_name: str, view: int = 0) -> Optional[str]:
        if sys.platform != "win32":
            return None
        import winreg
        try:
            with winreg.OpenKey(hive, subkey, 0, winreg.KEY_READ | view) as key:
                val, reg_type = winreg.QueryValueEx(key, value_name)
                if reg_type in (winreg.REG_SZ, winreg.REG_EXPAND_SZ) and isinstance(val, str):
                    return val.strip()
        except OSError:
            pass
        return None

    @staticmethod
    def _read_reg_dword(hive: int, subkey: str, value_name: str, view: int = 0) -> Optional[int]:
        if sys.platform != "win32":
            return None
        import winreg
        try:
            with winreg.OpenKey(hive, subkey, 0, winreg.KEY_READ | view) as key:
                val, reg_type = winreg.QueryValueEx(key, value_name)
                if reg_type == winreg.REG_DWORD and isinstance(val, int):
                    return val
        except OSError:
            pass
        return None

    @staticmethod
    def _get_available_drives() -> list[str]:
        """Returns all existing Windows drive letters, e.g. ['C', 'D', 'E']."""
        if sys.platform != "win32":
            return ["C"]
        drives = []
        for letter in string.ascii_uppercase:
            drive_root = Path(f"{letter}:\\")
            if drive_root.exists():
                drives.append(letter)
        return drives or ["C"]

    def scan_steam(self) -> list[InstalledGame]:
        """
        Discovers all installed Steam games across all physical and logical drives.
        Handles both 32-bit and 64-bit registry, modern and legacy VDF, and drive probes.
        """
        games: list[InstalledGame] = []
        if sys.platform != "win32":
            return games

        import winreg

        steam_roots: set[Path] = set()

        # 1. Search Windows Registry (HKLM 32/64 and HKCU)
        reg_queries = [
            (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath", 0),
            (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamExe", 0),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath", winreg.KEY_WOW64_32KEY),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "SteamPath", winreg.KEY_WOW64_32KEY),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath", winreg.KEY_WOW64_64KEY),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "SteamPath", winreg.KEY_WOW64_64KEY),
        ]

        for hive, subkey, val_name, view in reg_queries:
            raw_val = self._read_reg_str(hive, subkey, val_name, view)
            if raw_val:
                p = Path(os.path.normpath(raw_val))
                if p.is_file():
                    p = p.parent
                if p.is_dir():
                    steam_roots.add(p)

        # 2. Search common drive fallback paths
        for drive in self._get_available_drives():
            for sub in [
                r"Program Files (x86)\Steam",
                r"Program Files\Steam",
                r"Steam",
                r"Games\Steam",
            ]:
                candidate = Path(f"{drive}:\\{sub}")
                if candidate.is_dir():
                    steam_roots.add(candidate)

        # 3. Locate all libraryfolders via libraryfolders.vdf
        library_steamapps: set[Path] = set()
        for s_root in steam_roots:
            sa = s_root / "steamapps"
            if sa.is_dir():
                library_steamapps.add(sa)

            vdf_file = sa / "libraryfolders.vdf"
            if vdf_file.is_file():
                try:
                    content = vdf_file.read_text(encoding="utf-8", errors="replace")
                    for k, raw_val in VDF_KV_RE.findall(content):
                        # Matches modern `"path" "D:\\SteamLibrary"` and legacy `"1" "D:\\SteamLibrary"`
                        if k.lower() == "path" or k.isdigit():
                            cleaned = raw_val.replace("\\\\", "\\").strip()
                            if len(cleaned) >= 3 and (cleaned[1:3] in (":\\", ":/") or cleaned.startswith("\\\\")):
                                lib_p = Path(os.path.normpath(cleaned))
                                lib_sa = lib_p / "steamapps"
                                if lib_sa.is_dir():
                                    library_steamapps.add(lib_sa)
                                elif lib_p.is_dir():
                                    library_steamapps.add(lib_p)
                except Exception as e:
                    logger.debug(f"Error parsing Steam libraryfolders.vdf in {sa}: {e}")

        # 4. Also probe direct drive roots for SteamLibrary
        for drive in self._get_available_drives():
            for extra in [
                Path(f"{drive}:\\SteamLibrary\\steamapps"),
                Path(f"{drive}:\\Games\\SteamLibrary\\steamapps"),
            ]:
                if extra.is_dir():
                    library_steamapps.add(extra)

        # 5. Scan each library for appmanifest_*.acf
        ignored_appids = {"228980"}  # Steamworks Common Redistributables
        seen_appids: set[str] = set()

        for sa_dir in library_steamapps:
            try:
                for manifest in sa_dir.glob("appmanifest_*.acf"):
                    try:
                        text = manifest.read_text(encoding="utf-8", errors="replace")
                        appid_match = re.search(r'"appid"\s+"(\d+)"', text)
                        name_match = re.search(r'"name"\s+"([^"]+)"', text)
                        installdir_match = re.search(r'"installdir"\s+"([^"]+)"', text)

                        if not (appid_match and name_match):
                            continue

                        appid = appid_match.group(1).strip()
                        name = name_match.group(1).strip()
                        installdir = installdir_match.group(1).strip() if installdir_match else ""

                        if not name or appid in ignored_appids or appid in seen_appids:
                            continue

                        # Filter out Steamworks, Proton runtimes, dedicated servers
                        if any(term in name for term in ("Steamworks", "Proton", "Dedicated Server", "Soundtrack", "Bonus Content")):
                            continue

                        seen_appids.add(appid)
                        install_path = (sa_dir / "common" / installdir) if installdir else sa_dir
                        poster_url = f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900.jpg"

                        # Find primary executable
                        exe_name = ""
                        if install_path.is_dir():
                            found_exe = self._find_game_executable(install_path, max_depth=3)
                            if found_exe:
                                exe_name = found_exe.name

                        games.append(InstalledGame.create(
                            game_id=f"steam_{appid}",
                            name=name,
                            platform="steam",
                            category="Steam",
                            install_path=str(install_path),
                            app_id=appid,
                            executable=exe_name,
                            box_art=poster_url,
                        ))
                    except Exception as e:
                        logger.debug(f"Failed parsing manifest {manifest.name}: {e}")
            except Exception as e:
                logger.debug(f"Failed scanning Steam library {sa_dir}: {e}")

        return games

    def scan_epic(self) -> list[InstalledGame]:
        """
        Discovers installed Epic Games from ProgramData manifests and registry.
        """
        games: list[InstalledGame] = []
        manifest_dirs: set[Path] = set()

        if sys.platform == "win32":
            import winreg
            for hive, subkey, val_name, view in [
                (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Epic Games\EpicGamesLauncher", "AppDataPath", winreg.KEY_WOW64_32KEY),
                (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Epic Games\EpicGamesLauncher", "AppDataPath", winreg.KEY_WOW64_64KEY),
                (winreg.HKEY_CURRENT_USER, r"Software\Epic Games\EOS", "ModSdkMetadataDir", 0),
            ]:
                val = self._read_reg_str(hive, subkey, val_name, view)
                if val:
                    p = Path(os.path.normpath(val))
                    manifest_dirs.add(p / "Manifests" if p.name.lower() != "manifests" else p)

        # Probe all drive ProgramData folders
        for drive in self._get_available_drives():
            candidate = Path(f"{drive}:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests")
            if candidate.is_dir():
                manifest_dirs.add(candidate)

        seen_appids: set[str] = set()
        for m_dir in manifest_dirs:
            if not m_dir.is_dir():
                continue
            try:
                for item_file in m_dir.glob("*.item"):
                    try:
                        with open(item_file, "r", encoding="utf-8", errors="replace") as f:
                            data = json.load(f)

                        display_name = (data.get("DisplayName") or "").strip()
                        install_loc = (data.get("InstallLocation") or "").strip()
                        launch_exe = (data.get("LaunchExecutable") or "").strip()
                        app_name = (data.get("AppName") or "").strip()
                        categories = data.get("Categories", [])

                        if not display_name or not install_loc or app_name in seen_appids:
                            continue

                        # Skip Unreal Engine versions, plugins, vault cache
                        if any(c in ("plugins", "engines") for c in categories):
                            continue

                        install_path = Path(os.path.normpath(install_loc))
                        if not install_path.exists():
                            continue

                        seen_appids.add(app_name)
                        exe_name = Path(launch_exe).name if launch_exe else ""
                        if not exe_name:
                            found_exe = self._find_game_executable(install_path, max_depth=3)
                            if found_exe:
                                exe_name = found_exe.name

                        games.append(InstalledGame.create(
                            game_id=f"epic_{sanitize_slug(display_name)}",
                            name=display_name,
                            platform="epic",
                            category="Epic Games",
                            install_path=str(install_path),
                            app_id=app_name,
                            executable=exe_name,
                            box_art=None,
                        ))
                    except Exception as e:
                        logger.debug(f"Error parsing Epic manifest {item_file.name}: {e}")
            except Exception as e:
                logger.debug(f"Error accessing Epic manifests dir {m_dir}: {e}")

        return games

    def scan_gog(self) -> list[InstalledGame]:
        """
        Discovers installed GOG Galaxy games from Windows Registry.
        """
        games: list[InstalledGame] = []
        if sys.platform != "win32":
            return games

        import winreg

        gog_key = r"SOFTWARE\GOG.com\Games"
        seen_names: set[str] = set()

        for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            for view in (winreg.KEY_WOW64_32KEY, winreg.KEY_WOW64_64KEY):
                for prefix in (r"SOFTWARE\WOW6432Node\GOG.com\Games", gog_key):
                    try:
                        with winreg.OpenKey(hive, prefix, 0, winreg.KEY_READ | view) as root:
                            num_subkeys = winreg.QueryInfoKey(root)[0]
                            for i in range(num_subkeys):
                                try:
                                    sub_name = winreg.EnumKey(root, i)
                                    sub_path = f"{prefix}\\{sub_name}"
                                    name = self._read_reg_str(hive, sub_path, "gameName", view) or self._read_reg_str(hive, sub_path, "GAMENAME", view)
                                    path_val = self._read_reg_str(hive, sub_path, "path", view) or self._read_reg_str(hive, sub_path, "PATH", view)
                                    exe_val = self._read_reg_str(hive, sub_path, "exe", view) or self._read_reg_str(hive, sub_path, "EXE", view)

                                    if name and path_val and Path(path_val).exists():
                                        low_n = name.lower()
                                        if any(term in low_n for term in (" dlc", "pack dlc", "soundtrack", "bonus content")):
                                            continue
                                        if low_n in seen_names:
                                            continue
                                        seen_names.add(low_n)

                                        exe_name = Path(exe_val).name if exe_val else ""
                                        if not exe_name:
                                            found = self._find_game_executable(Path(path_val), max_depth=3)
                                            if found:
                                                exe_name = found.name

                                        games.append(InstalledGame.create(
                                            game_id=f"gog_{sanitize_slug(name)}",
                                            name=name,
                                            platform="gog",
                                            category="GOG",
                                            install_path=str(Path(path_val)),
                                            app_id=sub_name,
                                            executable=exe_name,
                                            box_art=None,
                                        ))
                                except OSError:
                                    continue
                    except OSError:
                        continue

        return games

    def scan_windows_uninstall(self) -> list[InstalledGame]:
        """
        Scans Windows Uninstall registry keys (HKLM & HKCU, 32/64 bit).
        Discovers installed titles from Battle.net, Riot, EA, Ubisoft, and standalone games.
        """
        games: list[InstalledGame] = []
        if sys.platform != "win32":
            return games

        import winreg

        uninstall_key = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
        hives = (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER)
        views = (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY)
        seen_names: set[str] = set()

        for hive in hives:
            for view in views:
                try:
                    with winreg.OpenKey(hive, uninstall_key, 0, winreg.KEY_READ | view) as root:
                        num_subkeys = winreg.QueryInfoKey(root)[0]
                        for i in range(num_subkeys):
                            try:
                                sub_name = winreg.EnumKey(root, i)
                                sub_path = f"{uninstall_key}\\{sub_name}"
                                display_name = self._read_reg_str(hive, sub_path, "DisplayName", view)
                                install_loc = self._read_reg_str(hive, sub_path, "InstallLocation", view)
                                sys_comp = self._read_reg_dword(hive, sub_path, "SystemComponent", view)

                                if sys_comp == 1 or not display_name or not install_loc:
                                    continue

                                low_name = display_name.lower().strip()
                                if low_name in seen_names or any(kw in low_name for kw in NON_GAME_KEYWORDS):
                                    continue

                                norm_loc = Path(os.path.normpath(install_loc.strip('"')))
                                if not norm_loc.is_dir():
                                    continue

                                # Verify the folder actually contains a game-like binary
                                found_exe = self._find_game_executable(norm_loc, max_depth=3)
                                if found_exe:
                                    seen_names.add(low_name)
                                    games.append(InstalledGame.create(
                                        game_id=f"registry_{sanitize_slug(display_name)}",
                                        name=display_name.strip(),
                                        platform="registry",
                                        category="Установлено",
                                        install_path=str(norm_loc),
                                        app_id=sub_name,
                                        executable=found_exe.name,
                                        box_art=None,
                                    ))
                            except OSError:
                                continue
                except OSError:
                    continue

        return games

    def scan_custom_directories(self, directories: list[str]) -> list[InstalledGame]:
        """
        Scans custom user directories.
        Handles both:
        Case A: Directly selected game directory (e.g. D:\\Games\\Rust)
        Case B: Parent games library folder (e.g. D:\\Games)
        Performs bounded search (max_depth=3) prioritizing engine binary folders.
        """
        games: list[InstalledGame] = []
        seen_paths: set[str] = set()

        for dir_str in directories:
            if not dir_str or not isinstance(dir_str, str):
                continue

            folder_path = Path(dir_str.strip()).resolve()
            if not folder_path.exists() or not folder_path.is_dir():
                continue

            folder_name_low = folder_path.name.lower()
            if folder_name_low in SYSTEM_BLACKLIST:
                continue

            # Case A: Check if folder_path itself is a single game root
            direct_exe = self._find_direct_or_engine_exe(folder_path)
            if direct_exe:
                canon_path = str(folder_path).lower()
                if canon_path not in seen_paths:
                    seen_paths.add(canon_path)
                    game_title = folder_path.name.replace("_", " ").strip()
                    games.append(InstalledGame.create(
                        game_id=f"custom_{sanitize_slug(game_title)}",
                        name=game_title,
                        platform="custom",
                        category=f"Диск {folder_path.drive or 'Локальный'}",
                        install_path=str(folder_path),
                        executable=direct_exe.name,
                        box_art=None,
                    ))
                continue

            # Case B: Treat folder_path as a parent library folder containing multiple games
            try:
                with os.scandir(folder_path) as it:
                    for entry in it:
                        try:
                            if not entry.is_dir(follow_symlinks=False):
                                continue

                            entry_name_low = entry.name.lower()
                            if entry_name_low in SYSTEM_BLACKLIST or entry_name_low.startswith((".", "$")):
                                continue

                            sub_path = Path(entry.path)
                            canon_sub = str(sub_path).lower()
                            if canon_sub in seen_paths:
                                continue

                            found_exe = self._find_game_executable(sub_path, max_depth=3)
                            if found_exe:
                                seen_paths.add(canon_sub)
                                game_title = entry.name.replace("_", " ").strip()
                                games.append(InstalledGame.create(
                                    game_id=f"custom_{sanitize_slug(game_title)}",
                                    name=game_title,
                                    platform="custom",
                                    category=f"Диск {folder_path.drive or 'Локальный'}",
                                    install_path=str(sub_path),
                                    executable=found_exe.name,
                                    box_art=None,
                                ))
                        except Exception as e:
                            logger.debug(f"Error scanning subfolder {entry.name}: {e}")
            except Exception as e:
                logger.error(f"Error scanning custom directory '{folder_path}': {e}")

        return games

    def _find_direct_or_engine_exe(self, folder: Path) -> Optional[Path]:
        """Checks if folder itself contains root game executables or known engine structures."""
        try:
            # 1. Direct root .exe
            for entry in os.scandir(folder):
                if entry.is_file(follow_symlinks=False) and entry.name.lower().endswith(".exe"):
                    if not self._is_blacklisted_exe(entry.name):
                        return Path(entry.path)

            # 2. Known engine markers
            has_engine_marker = any(
                (folder / marker).exists()
                for marker in ("UnityPlayer.dll", "Engine", "Binaries", "bin", "x64", "Retail")
            )
            if has_engine_marker:
                return self._find_game_executable(folder, max_depth=3)
        except OSError:
            pass
        return None

    def _find_game_executable(self, base_dir: Path, max_depth: int = 3) -> Optional[Path]:
        """Breadth-first search for the primary game executable (max_depth=3)."""
        queue: list[tuple[Path, int]] = [(base_dir, 0)]
        candidates: list[tuple[int, int, Path]] = []

        while queue:
            current_dir, depth = queue.pop(0)
            if depth > max_depth:
                continue
            try:
                subdirs: list[Path] = []
                for entry in os.scandir(current_dir):
                    if entry.is_file(follow_symlinks=False) and entry.name.lower().endswith(".exe"):
                        if not self._is_blacklisted_exe(entry.name):
                            try:
                                size = entry.stat().st_size
                            except OSError:
                                size = 0
                            # Weight candidates: prefer shallower depth and larger binary size
                            candidates.append((depth, -size, Path(entry.path)))
                    elif entry.is_dir(follow_symlinks=False) and depth < max_depth:
                        if not entry.name.startswith((".", "$", "__")):
                            subdirs.append(Path(entry.path))

                # Prioritize known binary subdirectories first
                subdirs.sort(key=lambda p: 0 if p.name.lower() in BINARY_SUBDIRS else 1)
                for sd in subdirs:
                    queue.append((sd, depth + 1))
            except OSError:
                continue

        if not candidates:
            return None
        candidates.sort()
        return candidates[0][2]

    @staticmethod
    def _is_blacklisted_exe(filename: str) -> bool:
        low = filename.lower()
        return any(token in low for token in EXE_BLACKLIST_SUBSTRINGS)

    def scan_all_sync(self, custom_dirs: list[str] | None = None) -> list[InstalledGame]:
        """
        Executes unified detection across Steam, Epic, GOG, Registry, and custom directories.
        Deduplicates by normalized name and saves atomically.
        """
        discovered: dict[str, InstalledGame] = {}

        def register(source_games: list[InstalledGame]):
            for g in source_games:
                norm = g.get("normalized_name") or normalize_game_name(g.get("name", ""))
                if not norm:
                    continue
                existing = discovered.get(norm)
                # Primary manifests override generic registry / custom hits
                if existing is None or existing.get("platform") in ("registry", "custom"):
                    discovered[norm] = g

        # 1. Steam (Fastest & most comprehensive)
        try:
            steam_games = self.scan_steam()
            register(steam_games)
            logger.info(f"Steam scan discovered {len(steam_games)} games.")
        except Exception as e:
            logger.error(f"Steam scan error: {e}", exc_info=True)

        # 2. Epic Games
        try:
            epic_games = self.scan_epic()
            register(epic_games)
            logger.info(f"Epic Games scan discovered {len(epic_games)} games.")
        except Exception as e:
            logger.error(f"Epic Games scan error: {e}", exc_info=True)

        # 3. GOG Galaxy
        try:
            gog_games = self.scan_gog()
            register(gog_games)
            logger.info(f"GOG scan discovered {len(gog_games)} games.")
        except Exception as e:
            logger.error(f"GOG scan error: {e}", exc_info=True)

        # 4. Windows Uninstall Registry (Universal launcher-agnostic fallback)
        try:
            reg_games = self.scan_windows_uninstall()
            register(reg_games)
            logger.info(f"Windows Uninstall registry scan discovered {len(reg_games)} games.")
        except Exception as e:
            logger.error(f"Windows Uninstall registry scan error: {e}", exc_info=True)

        # 5. Custom user directories
        if custom_dirs:
            try:
                custom_games = self.scan_custom_directories(custom_dirs)
                register(custom_games)
                logger.info(f"Custom directories scan discovered {len(custom_games)} games.")
            except Exception as e:
                logger.error(f"Custom directories scan error: {e}", exc_info=True)

        all_games = sorted(discovered.values(), key=lambda x: x["name"].lower())

        # Atomic JSON persistence (.tmp -> os.replace)
        try:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            tmp_file = self.cache_file.with_suffix(".tmp")
            payload = [g.to_dict() for g in all_games]
            tmp_file.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp_file, self.cache_file)
            logger.info(f"Atomically saved {len(all_games)} installed games to {self.cache_file.name}")
        except Exception as e:
            logger.error(f"Failed to save installed_games.json: {e}", exc_info=True)

        return all_games

    async def scan_all_async(self, custom_dirs: list[str] | None = None) -> list[InstalledGame]:
        """Non-blocking async runner executing filesystem and registry I/O in worker thread."""
        async with self._lock:
            self._is_scanning = True
            try:
                return await asyncio.to_thread(self.scan_all_sync, custom_dirs)
            finally:
                self._is_scanning = False

    def clear_cache(self) -> None:
        """Clears the persisted installed games cache atomically."""
        try:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            self.cache_file.write_text("[]", encoding="utf-8")
            logger.info("Installed games cache successfully cleared.")
        except Exception as e:
            logger.error(f"Error clearing installed games cache: {e}", exc_info=True)

    def load_cached_games(self) -> list[InstalledGame]:
        if self.cache_file.exists():
            try:
                with open(self.cache_file, "r", encoding="utf-8", errors="replace") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        return [InstalledGame(item) for item in data if isinstance(item, dict) and item.get("name")]
            except Exception as e:
                logger.debug(f"Failed loading cache: {e}")
        return []

    def get_platform_telemetry(self, custom_dirs: list[str] | None = None) -> dict[str, Any]:
        """Returns status summary of launchers and directories on this machine."""
        steam_games = len(self.scan_steam())
        epic_games = len(self.scan_epic())
        gog_games = len(self.scan_gog())
        reg_games = len(self.scan_windows_uninstall())
        custom_games = len(self.scan_custom_directories(custom_dirs or []))

        return {
            "steam": {"detected": steam_games > 0, "games_count": steam_games},
            "epic": {"detected": epic_games > 0, "games_count": epic_games},
            "gog": {"detected": gog_games > 0, "games_count": gog_games},
            "registry": {"detected": reg_games > 0, "games_count": reg_games},
            "custom": {"directories_count": len(custom_dirs or []), "games_count": custom_games},
            "total_installed": steam_games + epic_games + gog_games + reg_games + custom_games,
        }

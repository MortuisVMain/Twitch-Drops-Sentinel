"""
Twitch Drops Sentinel v3.1 — Automated Portable Runtime Setup
Mortuis_V_Studio

Ensures portable_runtime/python is present for packaging standalone releases.
Used by GitHub Actions CI/CD and developer environments.
"""

import sys
import shutil
import zipfile
import urllib.request
import subprocess
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
PORTABLE_DIR = WORKSPACE / "portable_runtime"
PYTHON_DIR = PORTABLE_DIR / "python"
EMBED_URL = "https://www.python.org/ftp/python/3.12.8/python-3.12.8-embed-amd64.zip"

def setup_portable_runtime():
    if (PYTHON_DIR / "python.exe").exists():
        print("[OK] Portable runtime already exists at:", PYTHON_DIR)
        return

    print("=" * 65)
    print("  SETTING UP PORTABLE PYTHON 3.12 RUNTIME")
    print("=" * 65)

    PYTHON_DIR.mkdir(parents=True, exist_ok=True)
    zip_dest = PORTABLE_DIR / "python_embed.zip"

    print(f"[*] Downloading Python 3.12 embeddable from {EMBED_URL}...")
    urllib.request.urlretrieve(EMBED_URL, zip_dest)

    print("[*] Extracting embeddable runtime...")
    with zipfile.ZipFile(zip_dest, "r") as z:
        z.extractall(PYTHON_DIR)
    zip_dest.unlink(missing_ok=True)

    # Enable site-packages by uncommenting 'import site' in python312._pth
    pth_file = list(PYTHON_DIR.glob("*._pth"))
    if pth_file:
        pth = pth_file[0]
        content = pth.read_text(encoding="utf-8")
        lines = [line.strip() for line in content.splitlines()]
        if "import site" not in lines:
            lines.append("import site")
        pth.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Install pip requirements into Lib/site-packages
    site_packages = PYTHON_DIR / "Lib" / "site-packages"
    site_packages.mkdir(parents=True, exist_ok=True)

    req_file = WORKSPACE / "requirements.txt"
    if req_file.exists():
        print("[*] Installing requirements into portable runtime...")
        cmd = [
            sys.executable, "-m", "pip", "install",
            "--target", str(site_packages),
            "-r", str(req_file),
            "--no-warn-script-location"
        ]
        subprocess.check_call(cmd)

    print("[SUCCESS] Portable runtime initialized at:", PYTHON_DIR)

if __name__ == "__main__":
    setup_portable_runtime()

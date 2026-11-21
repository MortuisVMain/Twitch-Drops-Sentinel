"""Offline stand-in for the community script (`drops` / `library`), used only by the tests.

argv: <mode> <pidfile> <verb> [--expect=<id>]. The pidfile receives "<pid> <child pid>" so tests can prove the tree is gone.
"""
import json
import os
import subprocess
import sys
import time

mode, pidfile, verb = sys.argv[1], sys.argv[2], sys.argv[3]

DROPS = [
    {"appId": 730, "name": "Counter-Strike 2", "dropsRemaining": 3, "playtimeHours": 1017.5},
    {"appId": 570, "name": "Dota 2", "dropsRemaining": 0, "playtimeHours": 0},
    {"appId": 440, "name": "Team Fortress 2", "dropsRemaining": 1, "playtimeHours": 12},
]
LIBRARY = [
    {"appId": 440, "name": "Team Fortress 2", "playtimeMinutes": 720},
    {"appId": 570, "name": "Dota 2", "playtimeMinutes": 0},
]


def emit(value):
    print(json.dumps(value), flush=True)


if mode == "hang":
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(300)"])
    with open(pidfile, "w") as handle:
        handle.write(f"{os.getpid()} {child.pid}")
    time.sleep(300)

if mode == "noisy":
    for number in range(1, 31):
        print(f"diag line {number}", file=sys.stderr)
    print("cookie steamLoginSecure=76561198000000000%7C%7CSECRETVALUE123 sessionid=abcDEF0123456789", file=sys.stderr)
    print("Authorization: Bearer TOKENVALUE987 " + "x" * 600, file=sys.stderr, flush=True)
    emit({"status": "failed", "error": "unparsed_row"})
    sys.exit(4)

if mode == "signed_out":
    emit({"status": "signed_out"})
    sys.exit(3)
if mode == "failed":
    emit({"status": "failed", "error": "unparsed_row", "page": 2})
    sys.exit(4)
if mode == "garbage":
    print("not json", flush=True)
    sys.exit(0)

if mode == "mismatch":
    emit({"status": "account_mismatch"})
    sys.exit(5)
if mode == "needs_expect" and not (len(sys.argv) > 4 and sys.argv[4].startswith("--expect=")):
    emit({"status": "failed", "error": "no_expect"})
    sys.exit(4)
if verb == "status":
    emit({"status": "signed_in"})
    sys.exit(0)

if verb == "drops":
    games, field = [dict(g) for g in DROPS], "dropsRemaining"
    body = {"status": "complete", "pages": 1, "games": games}
else:
    games, field = [dict(g) for g in LIBRARY], "playtimeMinutes"
    body = {"status": "complete", "count": len(games), "games": games}

if mode == "empty":
    games.clear()
    if verb == "library":
        body["count"] = 0
elif mode == "boolint":
    games[0][field] = True
elif mode == "negative":
    games[0][field] = -1
elif mode == "dupe":
    games.append(dict(games[0]))
    if verb == "library":
        body["count"] = len(games)

emit(body)
if mode == "twolines":
    emit(body)
sys.exit(4 if mode == "badexit" else 0)

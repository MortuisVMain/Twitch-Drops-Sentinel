"""Offline stand-in for the native helper, used only by the tests.

argv: <mode> <pidfile> <command> <steamid64> [appid]. The pidfile receives
"<helper pid> <child pid>" so tests can prove a whole process tree is gone.
"""
import json
import subprocess
import sys
import time

VERSION = 2
mode, pidfile, command = sys.argv[1], sys.argv[2], sys.argv[3]


def out(**fields):
    print(json.dumps({"protocolVersion": VERSION, **fields}), flush=True)


def sleep_with_child():
    import os
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(300)"])
    with open(pidfile, "w") as handle:
        handle.write(f"{os.getpid()} {child.pid}")
    time.sleep(300)


if command == "apps":
    ids = [int(token) for token in sys.stdin.read().split()]
    if mode == "hang":
        sleep_with_child()
    if mode == "garbage":
        print("not json", flush=True)
        sys.exit(0)
    if mode == "failed":
        out(status="failed", error="identity_mismatch")
        sys.exit(4)
    for app_id in (ids[::-1] if mode == "badorder" else ids):
        if mode == "missingkey":
            out(appId=app_id, subscribed=True)
        else:
            out(appId=app_id, subscribed=app_id % 2 == 0, installed=False)
    if mode == "truncated":
        sys.exit(0)
    out(status="complete", count=len(ids) + (1 if mode == "badcount" else 0))
    sys.exit(3 if mode == "badexit" else 0)

if command == "hold":
    app_id = int(sys.argv[5])
    if mode == "early":
        sys.exit(2)
    if mode == "failed":
        out(status="failed", error="not_subscribed")
        sys.exit(4)
    if mode == "garbage":
        print("garbage", flush=True)
        sleep_with_child()
    if mode == "hang":
        sleep_with_child()
    out(status="holding", appId=app_id + 1 if mode == "wrongapp" else app_id)
    if mode == "ignorestop":
        sleep_with_child()
    for line in sys.stdin:
        if line.strip() == "stop":
            break
    out(status="released")
    sys.exit(0)

sys.exit(64)

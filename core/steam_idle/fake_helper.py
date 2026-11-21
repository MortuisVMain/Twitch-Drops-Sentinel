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


def spawn_child():
    import os
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(300)"])
    with open(pidfile, "w") as handle:
        handle.write(f"{os.getpid()} {child.pid}")


def sleep_with_child():
    spawn_child()
    time.sleep(300)


def carriage_return_failure():
    out(status="failed", error="carriage_return")
    sys.exit(4)


if command == "apps":
    data = sys.stdin.buffer.read()  # bytes: text mode would hide a carriage return
    ids = [int(token) for token in data.split()]
    if mode == "nocr" and b"\r" in data:
        carriage_return_failure()
    if mode == "hang":
        sleep_with_child()
    if mode == "orphan":  # garbage, then exit while a grandchild is still running
        spawn_child()
        print("not json", flush=True)
        sys.exit(0)
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
        spawn_child()  # before the output, so the pidfile exists whenever the controller reacts
        print("garbage", flush=True)
        time.sleep(300)
    if mode == "hang":
        sleep_with_child()
    if mode == "ignorestop":
        spawn_child()  # before the output, so the pidfile exists whenever the controller reacts
    out(status="holding", appId=app_id + 1 if mode == "wrongapp" else app_id)
    if mode == "ignorestop":
        time.sleep(300)
    for line in sys.stdin.buffer:
        if mode == "nocr" and b"\r" in line:
            carriage_return_failure()
        if line.strip() == b"stop":
            break
    if mode == "failonstop":
        out(status="failed", error="release_denied")
        sys.exit(4)
    out(status="released")
    sys.exit(0)

sys.exit(64)

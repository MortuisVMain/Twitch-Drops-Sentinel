"""Offline stand-in for the helper's WRITE `unlock` command, used only by the tests.

argv: <mode> <pidfile> unlock <steamid64> <appid>. Names arrive on stdin (UTF-8, one per line). The mode names the
answer, or the defect, that the real parent would print.
"""
import json
import os
import subprocess
import sys
import time

mode, pidfile, command, steam_id, app = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
assert command == "unlock" and steam_id == "76561198000000001", sys.argv
CYCLE = ["unlocked", "already", "unknown", "unconfirmed"]


def out(*values):
    for value in values:
        print(value if isinstance(value, str) else json.dumps(value), flush=True)


def failed(code, exit_code=4, **extra):
    out({"protocolVersion": 2, "status": "failed", "error": code, **extra})
    sys.exit(exit_code)


def sleep_with_child():
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(300)"])
    with open(pidfile, "w") as handle:
        handle.write(f"{child.pid}")
    time.sleep(300)


if mode == "exit_early":  # answers and exits without ever reading stdin
    failed("write_not_allowed")
if mode == "no_read":  # never reads stdin, never answers
    sleep_with_child()
data = sys.stdin.buffer.read()
names = data.decode("utf-8").split("\n")[:-1]


def line(name, result):
    return {"protocolVersion": 2, "apiName": name, "result": result}


def end(results, stored, **changes):
    value = {"protocolVersion": 2, "status": "complete", "appId": app, "requested": len(names),
             "unlocked": results.count("unlocked"), "stored": stored}
    value.update(changes)
    return value


def answer(results, stored, **changes):
    out(*(line(name, result) for name, result in zip(names, results)), end(results, stored, **changes))


mixed = [CYCLE[i % 4] for i in range(len(names))]
if mode == "ok":
    answer(mixed, "yes")
elif mode == "all_unlocked":
    answer(["unlocked"] * len(names), "yes")
elif mode.startswith("combo:"):  # combo:<stored>:<result>, every name gets the same result
    _, combo_stored, combo_result = mode.split(":")
    answer([combo_result] * len(names), combo_stored)
elif mode.startswith("failed_exit_"):  # a bare failed line with an unusual exit code
    failed("invalid_name_list" if mode.endswith("_2") else "stats_unavailable", int(mode[-1]))
elif mode == "flood_then_hang":  # far more lines than names + 1, then silence
    out(*(line(names[0], "already") for _ in range(len(names) + 50)))
    sleep_with_child()
elif mode == "echo":  # the raw stdin bytes are kept next to the pidfile
    with open(pidfile + ".stdin", "wb") as handle:
        handle.write(data)
    answer(["already"] * len(names), "not_needed")
elif mode == "env":
    failed("gate_" + os.environ.get("SENTINEL_STEAM_IDLE_ALLOW_WRITE", "unset"))
elif mode == "not_needed":
    answer(["already"] * len(names), "not_needed")
elif mode == "rejected":
    answer(["rejected"] * len(names), "not_needed")
elif mode == "pending":
    answer(["pending"] * len(names), "timeout")
elif mode == "store_failed":
    answer(["store_failed"] * len(names), "no")
elif mode == "failed":
    failed("stats_unavailable")
elif mode == "failed_wrote":
    failed("worker_failed", wrote=True)
elif mode == "failed_wrote_false":
    failed("worker_failed", wrote=False)
elif mode == "failed_bad_code":
    failed("Bad Code!")
elif mode == "failed_after_item":
    out(line(names[0], "already"))
    failed("worker_failed")
elif mode == "garbage":
    out("not json")
elif mode == "nothing":
    pass
elif mode == "hang":
    sleep_with_child()
elif mode == "bad_exit":
    answer(mixed, "yes")
    sys.exit(3)
elif mode == "after_complete":
    answer(mixed, "yes")
    out(line(names[0], "already"))
elif mode == "no_complete":
    out(*(line(name, result) for name, result in zip(names, mixed)))
elif mode == "truncated":
    out(line(names[0], "already"))
elif mode == "swapped":  # the right lines in the wrong order
    out(*(line(name, "already") for name in names[::-1]), end(["already"] * len(names), "not_needed"))
elif mode == "wrong_name":
    out(line(names[0] + "X", "already"), end(["already"], "not_needed"))
elif mode.startswith("mut_"):
    results = ["unlocked"] * len(names)
    stored = "yes"
    changes = {}
    first = line(names[0], "unlocked")
    kind = mode[4:]
    if kind == "version":
        first["protocolVersion"] = 1
    elif kind == "extra_key":
        first["x"] = 1
    elif kind == "missing_key":
        del first["result"]
    elif kind == "name_int":
        first["apiName"] = 1
    elif kind == "result_unknown":
        first["result"] = "done"
    elif kind == "result_int":
        first["result"] = 1
    elif kind == "count_plus":
        changes["requested"] = len(names) + 1
    elif kind == "unlocked_wrong":
        changes["unlocked"] = 0
    elif kind == "app_wrong":
        changes["appId"] = app + 1
    elif kind == "stored_bad":
        changes["stored"] = "maybe"
    elif kind == "stored_int":
        changes["stored"] = 1
    elif kind == "end_extra_key":
        changes["x"] = 1
    elif kind == "bool_count":
        changes["requested"] = True
    elif kind == "unlocked_but_not_needed":
        stored = "not_needed"
    elif kind == "needed_but_nothing_written":
        results = ["already"] * len(names)
        first = line(names[0], "already")
    elif kind == "pending_but_yes":
        results = ["pending"] * len(names)
        first = line(names[0], "pending")
    elif kind == "unlocked_but_timeout":
        stored = "timeout"
    elif kind == "store_failed_with_pending":
        results = ["store_failed"] + ["pending"] * (len(names) - 1)
        first = line(names[0], "store_failed")
        stored = "no"
    else:
        sys.exit(64)
    out(first, *(line(name, result) for name, result in list(zip(names, results))[1:]), end(results, stored, **changes))
else:
    sys.exit(64)

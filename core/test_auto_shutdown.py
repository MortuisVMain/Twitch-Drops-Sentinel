"""The power action behind auto-shutdown: every mode the UI offers does something, an unknown one says so."""
import logging

import auto_shutdown


def run(mode):
    spawned, locked = [], []
    auto_shutdown.run_power_action(mode, popen=spawned.append, lock_workstation=lambda: locked.append(True))
    return spawned, locked


def test_shutdown_and_sleep_spawn_their_commands():
    assert run("shutdown") == ([["shutdown", "/s", "/t", "0"]], [])
    assert run("sleep") == ([["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"]], [])


def test_lock_locks_the_workstation_and_spawns_nothing():
    assert run("lock") == ([], [True])


def test_an_unknown_mode_is_logged_and_does_nothing(caplog):
    with caplog.at_level(logging.WARNING):
        assert run("hibernate-ish") == ([], [])
    assert any(rec.levelname == "WARNING" and "hibernate-ish" in rec.getMessage() for rec in caplog.records)

"""load_trophies re-reads Trophies.md only when its (mtime, size) changed."""
import builtins
import os

import sentinel_service as s

HEADER = "| Date | Game | Drop | Campaign | Status |\n|:---|:---|:---|:---|:---|\n"


def row(game, status="Claimed"):
    return f"| 2026-01-01 | **{game}** | Drop | Camp | {status} |\n"


def count_opens(monkeypatch, path):
    opens = []
    real_open = builtins.open

    def spy(file, *args, **kwargs):
        if str(file) == str(path):
            opens.append(file)
        return real_open(file, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", spy)
    return opens


def test_unchanged_file_is_parsed_once(tmp_path, monkeypatch):
    f = tmp_path / "Trophies.md"
    f.write_text(HEADER + row("A") + row("B"), encoding="utf-8")
    monkeypatch.setattr(s, "TROPHIES_FILE", f)
    opens = count_opens(monkeypatch, f)
    first = s.SentinelSupervisor.load_trophies(None)
    second = s.SentinelSupervisor.load_trophies(None)
    assert [t["game"] for t in first] == ["B", "A"] and second == first
    assert len(opens) == 1


def test_changed_file_is_reparsed(tmp_path, monkeypatch):
    f = tmp_path / "Trophies.md"
    f.write_text(HEADER + row("A"), encoding="utf-8")
    monkeypatch.setattr(s, "TROPHIES_FILE", f)
    assert [t["game"] for t in s.SentinelSupervisor.load_trophies(None)] == ["A"]
    f.write_text(HEADER + row("A") + row("C"), encoding="utf-8")
    st = f.stat()
    os.utime(f, ns=(st.st_atime_ns, st.st_mtime_ns + 5_000_000_000))
    assert [t["game"] for t in s.SentinelSupervisor.load_trophies(None)] == ["C", "A"]


def test_callers_cannot_corrupt_the_cache(tmp_path, monkeypatch):
    f = tmp_path / "Trophies.md"
    f.write_text(HEADER + row("A"), encoding="utf-8")
    monkeypatch.setattr(s, "TROPHIES_FILE", f)
    s.SentinelSupervisor.load_trophies(None).clear()
    assert len(s.SentinelSupervisor.load_trophies(None)) == 1


def test_missing_file_is_empty_and_recovers(tmp_path, monkeypatch):
    f = tmp_path / "Trophies.md"
    monkeypatch.setattr(s, "TROPHIES_FILE", f)
    assert s.SentinelSupervisor.load_trophies(None) == []
    f.write_text(HEADER + row("A"), encoding="utf-8")
    assert len(s.SentinelSupervisor.load_trophies(None)) == 1
    f.unlink()
    assert s.SentinelSupervisor.load_trophies(None) == []

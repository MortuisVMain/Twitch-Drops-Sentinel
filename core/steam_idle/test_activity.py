"""The activity log: ring buffer, logging handler, privacy filter."""
import logging
import re
import threading
import unittest
from datetime import datetime

from steam_idle import activity
from steam_idle.activity import ActivityHandler, ActivityLog, sanitize

STEAM_ID = "76561198012345678"


class SanitizeTests(unittest.TestCase):
    def test_steam_id_is_masked(self):
        self.assertEqual(sanitize(f"account {STEAM_ID} read"), "account <steamid> read")

    def test_windows_paths_are_masked_up_to_whitespace_or_quote(self):
        self.assertEqual(sanitize(r"cannot open C:\Users\bob\AppData\x.json now"), "cannot open <path> now")
        self.assertEqual(sanitize(r"file 'D:\a\b.txt' missing"), "file '<path>' missing")
        self.assertEqual(sanitize(r'file "\\server\share\a b" x'), 'file "<path> b" x')

    def test_unc_path_is_masked(self):
        self.assertEqual(sanitize(r"bad \\nas\share\file.bin end"), "bad <path> end")

    def test_forward_slash_windows_path_is_masked(self):
        self.assertEqual(sanitize("at C:/Users/bob/x.json ok"), "at <path> ok")

    def test_login_secure_cookie_and_tokens_are_redacted(self):
        self.assertEqual(sanitize("sent steamLoginSecure=7656119801234567%7C%7Cabc.def; next"), "sent <redacted>; next")
        self.assertEqual(sanitize("Cookie: sessionid=abc123; foo=bar"), "<redacted>")
        self.assertEqual(sanitize("token=eyJhbGciOi.payload.sig fin"), "<redacted> fin")
        self.assertEqual(sanitize("access_token: abcdef1234 fin"), "<redacted> fin")

    def test_quoted_and_json_secrets_are_redacted(self):
        for text, leaked in ((' body {"token": "abc123"} ', "abc123"), ("{'sessionid': 'abc987'}", "abc987"),
                             ('token="a b-secretpart" fin', "secretpart"), ('"api_key":"k3y-value"', "k3y-value")):
            self.assertNotIn(leaked, sanitize(text), text)

    def test_bearer_and_bare_jwt_are_redacted(self):
        self.assertNotIn("abcDEF123", sanitize("Authorization-ish: Bearer abcDEF123.x-y_z end"))
        self.assertEqual(sanitize("got Bearer abcDEF123 fin"), "got <redacted> fin")
        self.assertEqual(sanitize("jwt eyJhbGciOi.eyJzdWIi-x_y.sig_nat-ure fin"), "jwt <redacted> fin")

    def test_user_name_with_spaces_does_not_leak(self):
        out = sanitize(r"C:\Users\John Doe\AppData\x.exe failed")
        self.assertNotIn("Doe", out)
        self.assertNotIn("John", out)
        self.assertEqual(out, "<path> failed")
        out = sanitize("opened file:///C:/Users/John Doe/AppData/x.json ok")
        self.assertNotIn("Doe", out)
        self.assertNotIn("John", out)

    def test_new_range_steam_ids_are_masked(self):
        self.assertEqual(sanitize("account 76561200000000001 read"), "account <steamid> read")
        self.assertEqual(sanitize("account 76561198012345678 read"), "account <steamid> read")

    def test_plain_text_is_unchanged(self):
        text = "Idling Portal 2 (620), 3 drops left"
        self.assertEqual(sanitize(text), text)


class LogTests(unittest.TestCase):
    def test_entries_have_seq_iso_utc_ts_level_and_text(self):
        log = ActivityLog()
        log.add("info", "hello")
        (entry,) = log.since(None)
        self.assertEqual(set(entry), {"seq", "ts", "level", "text"})
        self.assertEqual((entry["seq"], entry["level"], entry["text"]), (1, "info", "hello"))
        stamp = datetime.fromisoformat(entry["ts"].replace("Z", "+00:00"))
        self.assertEqual(stamp.utcoffset().total_seconds(), 0)

    def test_since_returns_only_newer_entries(self):
        log = ActivityLog()
        for i in range(3):
            log.add("info", str(i))
        self.assertEqual([e["text"] for e in log.since(1)], ["1", "2"])
        self.assertEqual(log.since(3), [])
        self.assertEqual(log.last_seq, 3)

    def test_ring_drops_oldest_beyond_500(self):
        log = ActivityLog()
        for i in range(520):
            log.add("info", str(i))
        entries = log.since(None)
        self.assertEqual(len(entries), 500)
        self.assertEqual((entries[0]["seq"], entries[-1]["seq"]), (21, 520))

    def test_clear_empties_but_seq_keeps_growing(self):
        log = ActivityLog()
        log.add("info", "a")
        log.clear()
        self.assertEqual(log.since(None), [])
        log.add("info", "b")
        self.assertEqual(log.since(None)[0]["seq"], 2)
        self.assertEqual(log.last_seq, 2)

    def test_text_is_sanitized_before_storing(self):
        log = ActivityLog()
        log.add("error", f"read {STEAM_ID} from C:\\x\\y.json")
        self.assertEqual(log.since(None)[0]["text"], "read <steamid> from <path>")

    def test_seq_is_unique_across_threads(self):
        log = ActivityLog()
        workers = [threading.Thread(target=lambda: [log.add("info", "x") for _ in range(50)]) for _ in range(4)]
        for w in workers:
            w.start()
        for w in workers:
            w.join()
        seqs = [e["seq"] for e in log.since(None)]
        self.assertEqual(seqs, list(range(1, 201)))


class HandlerTests(unittest.TestCase):
    def setUp(self):
        self.log = ActivityLog()
        self.logger = logging.getLogger("steam_idle.test_activity_probe")
        self.logger.setLevel(logging.DEBUG)
        self.handler = ActivityHandler(self.log)
        self.logger.addHandler(self.handler)
        self.addCleanup(self.logger.removeHandler, self.handler)

    def test_info_and_above_map_to_levels_and_debug_is_dropped(self):
        self.logger.debug("d")
        self.logger.info("i %s", 1)
        self.logger.warning("w")
        self.logger.error("e")
        self.logger.critical("c")
        self.assertEqual([(e["level"], e["text"]) for e in self.log.since(None)],
                         [("info", "i 1"), ("warning", "w"), ("error", "e"), ("error", "c")])

    def test_exc_info_appends_type_and_message_without_traceback(self):
        try:
            raise ValueError("boom")
        except ValueError:
            self.logger.error("step failed", exc_info=True)
        (entry,) = self.log.since(None)
        self.assertEqual(entry["text"], "step failed (ValueError: boom)")
        self.assertNotIn("Traceback", entry["text"])

    def test_handler_text_is_sanitized(self):
        self.logger.info("account %s", STEAM_ID)
        self.assertEqual(self.log.since(None)[0]["text"], "account <steamid>")


class AttachTests(unittest.TestCase):
    def test_attach_is_idempotent_and_adds_one_handler_to_steam_idle(self):
        parent = logging.getLogger("steam_idle")
        before = [h for h in parent.handlers if isinstance(h, ActivityHandler)]
        self.addCleanup(lambda: [parent.removeHandler(h) for h in parent.handlers[:] if isinstance(h, ActivityHandler)
                                 and h not in before])
        activity.attach()
        activity.attach()
        after = [h for h in parent.handlers if isinstance(h, ActivityHandler)]
        self.assertEqual(len(after), max(len(before), 1))

    def test_attached_handler_collects_child_logger_info_records(self):
        parent = logging.getLogger("steam_idle")
        activity.attach()
        marker = f"probe-{id(self)}"
        logging.getLogger("steam_idle.farm").info(marker)
        self.assertIn(marker, [e["text"] for e in activity.LOG.since(None)])
        self.assertTrue(parent.isEnabledFor(logging.INFO))


if __name__ == "__main__":
    unittest.main()

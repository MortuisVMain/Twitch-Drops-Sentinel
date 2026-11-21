"""Lost sign-ins: announced once when a source that had an account is now known to be signed out."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from signin_watch import SignInWatch, lost_signins, lost_text


class LostSignins(unittest.TestCase):
    def test_only_a_known_sign_out_after_an_account_counts(self):
        prev = {"twitch": "mortuis", "epic": "me@x", "gog": None, "fab": "me"}
        cur = {"twitch": None, "epic": "me@x", "gog": None}  # fab unknown now: not a loss
        self.assertEqual(lost_signins(prev, cur), [("twitch", "mortuis")])

    def test_text_names_the_service_and_the_consequence(self):
        self.assertEqual(lost_text("epic", "me@x"), "Слетел вход в Epic Games (me@x): раздачи Epic не забираются. Войдите снова.")
        self.assertIn("Steam IDLE остановлен", lost_text("steam_idle", "Steam IDLE"))


class Watch(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="signin_"))
        self.store = self.dir / "signin_state.json"

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_a_loss_is_reported_once_and_a_new_sign_in_rearms_it(self):
        w = SignInWatch(self.store)
        self.assertEqual(w.observe({"epic": "me"}), [])
        self.assertEqual(w.observe({"epic": None}), [("epic", "me")])
        self.assertEqual(w.observe({"epic": None}), [], "still signed out: said already")
        w.observe({"epic": "me"})
        self.assertEqual(w.observe({"epic": None}), [("epic", "me")])

    def test_a_loss_while_the_app_was_closed_is_reported_at_the_next_start(self):
        SignInWatch(self.store).observe({"twitch": "mortuis", "gog": "g"})
        self.assertEqual(json.loads(self.store.read_text(encoding="utf-8")), {"twitch": "mortuis", "gog": "g"})
        restarted = SignInWatch(self.store)
        self.assertEqual(restarted.observe({"twitch": None}), [("twitch", "mortuis")])
        self.assertEqual(restarted.observe({"gog": None}), [("gog", "g")], "unknown sources keep their last value")

    def test_unreadable_state_starts_empty(self):
        self.store.write_text("{broken", encoding="utf-8")
        with self.assertLogs("TwitchDrops", level="WARNING"):
            w = SignInWatch(self.store)
        self.assertEqual(w.observe({"epic": None}), [])


if __name__ == "__main__":
    unittest.main()

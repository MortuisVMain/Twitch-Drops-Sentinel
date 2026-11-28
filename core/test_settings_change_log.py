"""Every settings change is logged as old -> new (lists as added/removed), so "who set this?" has an answer in the log.
Secrets (tokens, webhooks) are never written."""
import inspect
import unittest

import sentinel_service as s


class SettingsChangeLines(unittest.TestCase):
    def test_scalars_lists_new_keys_and_unchanged_values(self):
        old = {"health_watch_hours": 24, "priority_games": ["A", "B"], "ui_theme": "luna-mint"}
        new = {"health_watch_hours": 1, "priority_games": ["A", "C"], "ui_theme": "luna-mint", "pause_on_battery": True}
        lines = s.settings_change_lines(old, new)
        self.assertIn("health_watch_hours: 24 -> 1", lines)
        self.assertIn("priority_games: +['C'] -['B']", lines)
        self.assertIn("pause_on_battery: None -> True", lines)
        self.assertFalse(any(line.startswith("ui_theme") for line in lines), "an unchanged value is not logged")

    def test_secrets_are_masked(self):
        lines = s.settings_change_lines({"telegram_bot_token": "old-secret"}, {"telegram_bot_token": "new-secret",
                                                                            "discord_webhook_url": "https://x/y"})
        joined = "\n".join(lines)
        self.assertNotIn("secret", joined)
        self.assertNotIn("https://x/y", joined)
        self.assertIn("telegram_bot_token: changed", joined)

    def test_the_settings_route_logs_them(self):
        self.assertIn("settings_change_lines(", inspect.getsource(s.SentinelSupervisor.handle_post_settings))


if __name__ == "__main__":
    unittest.main()

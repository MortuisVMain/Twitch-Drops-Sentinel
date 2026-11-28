"""A counter status ("... (5/104)") is logged at INFO only when it ends: every inventory sync used to write 105 INFO lines."""
import logging
import unittest

from gui_headless import STATE_BRIDGE, HeadlessStatus

LOGGER = "TwitchDrops.HeadlessGUI"


class CounterStatusLog(unittest.TestCase):
    def info_lines(self, texts):
        with self.assertLogs(LOGGER, level=logging.DEBUG) as logs:
            for text in texts:
                HeadlessStatus().update(text)
        return [r.getMessage() for r in logs.records if r.levelno >= logging.INFO]

    def test_only_the_last_step_of_a_counter_reaches_info(self):
        lines = self.info_lines([f"Добавление кампаний в инвентарь... ({i}/3)" for i in range(4)])
        self.assertEqual(lines, ["[STATUS] Добавление кампаний в инвентарь... (3/3)"])
        self.assertEqual(STATE_BRIDGE.status_text, "Добавление кампаний в инвентарь... (3/3)")

    def test_the_dashboard_still_gets_every_step(self):
        HeadlessStatus().update("Добавление кампаний в инвентарь... (1/3)")
        self.assertEqual(STATE_BRIDGE.status_text, "Добавление кампаний в инвентарь... (1/3)")

    def test_a_plain_status_stays_at_info(self):
        self.assertEqual(self.info_lines(["fetching inventory"]), ["[STATUS] Синхронизация инвентаря наград Twitch..."])


if __name__ == "__main__":
    unittest.main()

"""Offline provider-contract checks; no Steam APIs or account access."""
import threading
import unittest

from steam_idle.inventory import InventoryError, InventoryStore, aggregate


def item(app_id=10, **changes):
    return dict(app_id=app_id, name="Example", ownership="unknown", installed=False, **changes)


def page(items=(), cursor=None, next_cursor=None, complete=True):
    return {"items": list(items), "cursor": cursor, "next_cursor": next_cursor, "complete": complete}


def switched(store, fail):
    store.switch_epoch("new")
    if fail:
        raise OSError("fixture failure after switch")
    yield page([item()])


class InventoryTests(unittest.TestCase):
    def test_complete_empty_requires_explicit_terminal_page(self):
        self.assertEqual(aggregate("fixture", "epoch", [page()]).status, "complete")
        self.assertEqual(aggregate("fixture", "epoch", []).status, "unknown")
        self.assertEqual(aggregate("fixture", "epoch", [page(complete=False)]).status, "partial")

    def test_pagination_and_duplicates(self):
        result = aggregate("fixture", "epoch", [page([item(20)], next_cursor="b", complete=False),
                           page([item(10), item(20)], cursor="b")])
        self.assertEqual([row.app_id for row in result.items], [10, 20])
        truncated = aggregate("fixture", "epoch", [page(next_cursor="b", complete=False)])
        self.assertEqual(truncated.status, "partial")
        for pages in ([page(next_cursor="b", complete=False), page(cursor="wrong")],
                      [page(), page()], [page(next_cursor="b")],
                      [page(next_cursor="b", complete=False), page(cursor="b", next_cursor="b", complete=False)]):
            with self.subTest(pages=pages), self.assertRaises(InventoryError):
                aggregate("fixture", "epoch", pages)

    def test_installed_is_separate_from_ownership(self):
        row = item()
        row["installed"] = True
        result = aggregate("fixture", "epoch", [page([row])])
        self.assertTrue(result.items[0].installed)
        self.assertEqual(result.items[0].ownership, "unknown")
        row["ownership"] = "subscribed"
        self.assertEqual(aggregate("fixture", "epoch", [page([row])]).items[0].ownership, "subscribed")

    def test_invalid_required_fields_and_conflicts(self):
        rows = [{"app_id": 1}, item(True), item(-1), item(2**32), item()]
        rows[-1]["installed"] = 1
        for row in rows:
            with self.subTest(row=row), self.assertRaises(InventoryError):
                aggregate("fixture", "epoch", [page([row])])
        changed = item()
        changed["ownership"] = "owned"
        with self.assertRaises(InventoryError):
            aggregate("fixture", "epoch", [page([item(), changed])])

    def test_failure_partial_and_account_epoch(self):
        store = InventoryStore("fixture", "one")
        self.assertEqual(store.current.status, "unknown")
        complete = store.refresh("one", [page([item()])])
        partial = store.refresh("one", [page(complete=False)])
        self.assertEqual(partial.status, "partial")
        self.assertEqual(store.last_complete, complete)
        self.assertEqual(store.fallback.status, "stale")
        with self.assertRaises(InventoryError):
            store.refresh("one", [{}])
        self.assertEqual(store.current.status, "unknown")
        self.assertEqual(store.fallback.items, complete.items)
        store.switch_epoch("two")
        self.assertIsNone(store.last_complete)
        with self.assertRaises(InventoryError):
            store.refresh("one", [page()])
        self.assertEqual(store.current.account_epoch, "two")
        self.assertEqual(store.current.status, "unknown")

    def test_provider_failure_after_page_and_limits(self):
        def failed():
            yield page([item()], next_cursor="b", complete=False)
            raise OSError("fixture failed")
        store = InventoryStore("fixture", "epoch")
        store.refresh("epoch", [page([item()])])
        with self.assertRaises(InventoryError):
            store.refresh("epoch", failed())
        self.assertEqual(store.fallback.status, "stale")
        with self.assertRaises(InventoryError):
            aggregate("fixture", "epoch", [page([item()] * 10001)])

    def test_switch_during_enumeration_cannot_restore_old_epoch(self):
        for fail in (False, True):
            store = InventoryStore("fixture", "old")
            with self.subTest(fail=fail), self.assertRaises(InventoryError):
                store.refresh("old", switched(store, fail))
            self.assertEqual(store.current.account_epoch, "new")
            self.assertIsNone(store.last_complete)

    def test_returning_to_the_same_account_cannot_revive_a_stale_refresh(self):
        store = InventoryStore("fixture", "A")

        def stale():
            store.switch_epoch("B")
            store.switch_epoch("A")  # the caller identity repeats, the internal token must not
            yield page([item()])

        with self.assertRaises(InventoryError):
            store.refresh("A", stale())
        self.assertEqual(store.current.status, "unknown")
        self.assertIsNone(store.last_complete)
        self.assertEqual(store.refresh("A", [page([item(7)])]).status, "complete")

    def test_stale_failure_does_not_clobber_the_new_generation(self):
        store = InventoryStore("fixture", "A")
        store.refresh("A", [page([item()])])

        def stale_fail():
            store.switch_epoch("B")
            store.switch_epoch("A")
            store.refresh("A", [page([item(9)])])
            raise OSError("fixture failure")
            yield

        with self.assertRaises(InventoryError):
            store.refresh("A", stale_fail())
        self.assertEqual([row.app_id for row in store.current.items], [9])

    def test_refresh_and_switch_are_safe_across_threads(self):
        store = InventoryStore("fixture", "e0")
        errors = []

        def refresher():
            for _ in range(200):
                try:
                    store.refresh(store.current.account_epoch, [page([item()])])
                except InventoryError:
                    pass  # rejected by a concurrent switch: expected
                except Exception as error:  # noqa: BLE001 - any other type is a defect
                    errors.append(error)

        thread = threading.Thread(target=refresher)
        thread.start()
        for index in range(1, 200):
            store.switch_epoch(f"e{index}")
        thread.join()
        self.assertEqual(errors, [])

    def test_large_library_and_malformed_page(self):
        result = aggregate("fixture", "epoch", [page([item(app_id) for app_id in range(1, 9001)])])
        self.assertEqual(len(result.items), 9000)
        for malformed in (None, {}, page(items=[None]), page(next_cursor=""),
                          dict(page(), complete=1), dict(page(), items="bad")):
            with self.subTest(page=malformed), self.assertRaises(InventoryError):
                aggregate("fixture", "epoch", [malformed])


if __name__ == "__main__":
    unittest.main()

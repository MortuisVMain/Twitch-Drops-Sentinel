"""Provider-neutral inventory ingestion, independently authored for G1a.

Mappings here are an internal adapter contract, NOT a Steam response schema.
An adapter must establish completeness and ownership evidence independently.
`subscribed` is a subscription observation, not permanent ownership. Installed
state never supplies ownership evidence. No status authorizes game actions.
"""
import threading
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace
from typing import Literal

Status = Literal["complete", "partial", "stale", "unknown"]
Ownership = Literal["owned", "subscribed", "not_owned", "unknown"]
MAX_ITEMS = 10000
MAX_PAGES = 1000


class InventoryError(ValueError):
    """Invalid, interrupted, oversized, or conflicting provider observation."""


@dataclass(frozen=True)
class LibraryItem:
    app_id: int
    name: str
    ownership: Ownership
    installed: bool


@dataclass(frozen=True)
class Snapshot:
    source: str
    account_epoch: str
    status: Status
    items: tuple[LibraryItem, ...] = ()


def _text(value: object, limit: int) -> bool:
    return isinstance(value, str) and 0 < len(value) <= limit and bool(value.strip())


def _item(raw: object) -> LibraryItem:
    if not isinstance(raw, Mapping):
        raise InventoryError("item must be a mapping")
    try:
        app_id, name = raw["app_id"], raw["name"]
        ownership, installed = raw["ownership"], raw["installed"]
    except KeyError as error:
        raise InventoryError("missing required item field") from error
    if (type(app_id) is not int or not 0 < app_id < 2**32
            or not _text(name, 512) or type(installed) is not bool
            or ownership not in ("owned", "subscribed", "not_owned", "unknown")):
        raise InventoryError("invalid required item field")
    return LibraryItem(app_id, name, ownership, installed)


def aggregate(source: str, account_epoch: str, pages: Iterable[Mapping]) -> Snapshot:
    """Consume bounded, ordered pages; incomplete sequences remain partial.

    Each page requires items (list/tuple), cursor (None on first page),
    next_cursor (None or a bounded nonempty string), and complete (bool).
    Complete is valid only on a terminal page. A terminal incomplete page
    explicitly means an unverified/truncated result. Zero pages is unknown.
    Identical duplicate items collapse; conflicting observations fail closed.
    Iterator failures abort the entire observation, including after a terminal
    page: exhaustion is required before completeness can be accepted.
    """
    if not _text(source, 128) or not _text(account_epoch, 128):
        raise InventoryError("source and account epoch required")
    rows: dict[int, LibraryItem] = {}
    expected = None
    seen: set[str] = set()
    terminal = False
    status: Status = "unknown"
    count = 0
    try:
        for index, page in enumerate(pages):
            if index >= MAX_PAGES or terminal or not isinstance(page, Mapping):
                raise InventoryError("invalid page sequence")
            try:
                cursor, following = page["cursor"], page["next_cursor"]
                complete, items = page["complete"], page["items"]
            except KeyError as error:
                raise InventoryError("missing required page field") from error
            if (cursor != expected or type(complete) is not bool
                    or not isinstance(items, (list, tuple))
                    or (following is not None and not _text(following, 512))
                    or (complete and following is not None)):
                raise InventoryError("invalid required page field")
            if following is not None:
                if following in seen:
                    raise InventoryError("repeated pagination cursor")
                seen.add(following)
            count += len(items)
            if count > MAX_ITEMS:
                raise InventoryError("inventory item limit exceeded")
            for raw in items:
                row = _item(raw)
                if row.app_id in rows and rows[row.app_id] != row:
                    raise InventoryError("conflicting duplicate app ID")
                rows[row.app_id] = row
            expected = following
            terminal = following is None
            status = "complete" if complete else "partial"
    except InventoryError:
        raise
    except Exception as error:
        raise InventoryError("provider page enumeration failed") from error
    return Snapshot(source, account_epoch, status, tuple(rows[key] for key in sorted(rows)))


class InventoryStore:
    """Single active source/epoch; caller switches epoch before account change.

    Epochs identify login generations, not just account IDs. Old asynchronous
    results are rejected; callers must serialize refreshes within an epoch.
    Last complete data survives failures as explicitly stale fallback only.
    No persistence, time-based expiry or account identity validation is implied.
    Threading: refresh may run in a worker thread while switch_epoch runs on the event loop;
    the check-and-assign steps hold a lock, enumeration itself runs outside it.
    Staleness is judged by an internal monotonic token, so an account identity may repeat (A, B, A).
    """
    def __init__(self, source: str, account_epoch: str):
        self._lock = threading.Lock()
        self._generation = 0
        self.current = aggregate(source, account_epoch, ())
        self.last_complete: Snapshot | None = None

    def switch_epoch(self, account_epoch: str) -> None:
        fresh = aggregate(self.current.source, account_epoch, ())
        with self._lock:
            if account_epoch == self.current.account_epoch:
                raise InventoryError("account change requires a new epoch")
            self._generation += 1
            self.current = fresh
            self.last_complete = None

    @property
    def fallback(self) -> Snapshot:
        if self.last_complete is not None:
            status = "complete" if self.current.status == "complete" else "stale"
            return replace(self.last_complete, status=status)
        return self.current

    def refresh(self, account_epoch: str, pages: Iterable[Mapping]) -> Snapshot:
        with self._lock:
            if account_epoch != self.current.account_epoch:
                raise InventoryError("inactive account epoch")
            token = self._generation
        source = self.current.source
        try:
            snapshot = aggregate(source, account_epoch, pages)
        except InventoryError:
            with self._lock:
                if token == self._generation:
                    self.current = Snapshot(source, account_epoch, "unknown")
            raise
        # A provider iterator may have yielded control to an account switch.
        with self._lock:
            if token != self._generation:
                raise InventoryError("account epoch changed during enumeration")
            self.current = snapshot
            if snapshot.status == "complete":
                self.last_complete = snapshot
        return snapshot

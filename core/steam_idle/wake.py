"""Lets a command end a run loop's sleep at once; set() may be called from any thread."""
import asyncio
import logging
from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)


class Wake:
    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._event: asyncio.Event | None = None

    def bind(self) -> None:
        """Called by the loop, on the event loop, before its first step; a command before that is seen by that step."""
        self._loop, self._event = asyncio.get_running_loop(), asyncio.Event()

    def set(self) -> None:
        loop, event = self._loop, self._event
        if loop is None or event is None:
            return
        try:
            loop.call_soon_threadsafe(event.set)
        except RuntimeError:  # the loop is closed: nothing sleeps on it any more
            logger.debug("wake skipped, the event loop is closed")

    def clear(self) -> None:
        self._event.clear()

    async def sleep(self, sleep: Callable[[float], Awaitable[None]], seconds: float) -> None:
        """`sleep(seconds)` or until set(), whichever comes first; a set() already pending ends it at once."""
        event = self._event
        tasks = [asyncio.ensure_future(sleep(seconds)), asyncio.ensure_future(event.wait())]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        if not tasks[0].cancelled():
            tasks[0].result()  # a failing sleep still fails the loop, as it did before

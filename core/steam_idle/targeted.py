"""Folding a read of a few games into the last read of every badge."""
from collections.abc import Iterable, Sequence
from dataclasses import replace

from .community import GameDrops


def merge_games(last: Sequence[GameDrops], got: Iterable[GameDrops], asked: Iterable[int]) -> list[GameDrops]:
    """`last` with the games in `got` replacing their old entries (a card page without a name keeps the old one).
    A game that was asked for and not answered is gone from the list, as a badge page that no longer lists it would
    say; a game that is answered and was not in `last` is appended."""
    fresh = {game.app_id: game for game in got}
    asked = set(asked)
    merged = []
    for old in last:
        if old.app_id not in asked:
            merged.append(old)
        elif (new := fresh.get(old.app_id)) is not None:
            merged.append(replace(new, name=new.name or old.name))
    known = {game.app_id for game in last}
    merged.extend(game for game in fresh.values() if game.app_id not in known)
    return merged

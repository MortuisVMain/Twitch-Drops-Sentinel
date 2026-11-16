// Pure layout rules of the dashboard (queue grouping, off-queue order, the one primary chip). Types only, no imports.

type QueueRowLike = { state: { kind: string } };

export interface QueueSplit<T> {
  live: T[]; // rows with a running campaign or one that needs a link, in queue order
  waiting: T[]; // rows without a campaign (grouped only under the "all" filter)
  finished: T[]; // everything already received
  expandWaiting: boolean; // every row is waiting: a collapsed group would make the queue look empty
}

/** "All" puts rows without a campaign into their own group after the live ones; any explicit filter lists its rows plainly. */
export const splitQueueRows = <T extends QueueRowLike>(visible: T[], filter: string): QueueSplit<T> => {
  const finished = visible.filter((r) => r.state.kind === 'done');
  const rest = visible.filter((r) => r.state.kind !== 'done');
  if (filter !== 'all') return { live: rest, waiting: [], finished, expandWaiting: false };
  const waiting = rest.filter((r) => r.state.kind === 'none');
  const live = rest.filter((r) => r.state.kind !== 'none');
  return { live, waiting, finished, expandWaiting: visible.length > 0 && waiting.length === visible.length };
};

/** Stable sort by rank; cards that cannot make the deadline go after all the others, keeping their own order. */
export const sortOffQueue = <T>(items: T[], rank: (item: T) => number, isLate: (item: T) => boolean): T[] =>
  items
    .map((item, index) => ({ item, index, late: isLate(item) ? 1 : 0, rank: rank(item) }))
    .sort((a, b) => a.late - b.late || a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);

/** Index of the first card that can be started now (not late, not in focus, not finished): the only one with the tinted chip. */
export const primaryChipIndex = (cards: Array<{ late: boolean; forced: boolean; finished: boolean }>): number =>
  cards.findIndex((c) => !c.late && !c.forced && !c.finished);

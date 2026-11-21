// Queue games whose campaign closes before the queue gets to finish them. Mirrors core/utils.py queue_deadline_risks.
// rows: queue order, { key, endAtIso, watchMinutes }. Games are farmed one at a time, so each waits for the watching
// still needed by every game above it. Unknown or zero watching adds nothing and is never flagged. An estimate.
// Returns Map key -> { watchMinutes, aheadMinutes, msLeft, alone } for late rows only.
export function queueDeadlineRisks(rows, now) {
  const risks = new Map();
  let ahead = 0;
  for (const row of rows) {
    const watch = typeof row.watchMinutes === 'number' && Number.isFinite(row.watchMinutes) ? row.watchMinutes : 0;
    if (watch <= 0) continue;
    const end = row.endAtIso ? new Date(row.endAtIso).getTime() : NaN;
    if (!Number.isNaN(end)) {
      const msLeft = end - now;
      if (msLeft <= 0) continue; // closed: the engine will not watch it, so it holds nobody up
      if ((ahead + watch) * 60000 > msLeft) {
        risks.set(row.key, { watchMinutes: watch, aheadMinutes: ahead, msLeft, alone: watch * 60000 > msLeft });
      }
    }
    ahead += watch;
  }
  return risks;
}

// The "other copies in autostart" block of Settings: reading the service answer and ordering it. Pure: no imports.
// Run: node --test tools/engine_tests/startup_copies_ui.test.mjs

const KIND_ORDER = { process: 0, run_value: 1, hklm_run: 2, startup_link: 3, scheduler_task: 4 };

const isCopy = (x) => Boolean(x) && typeof x === 'object' && typeof x.dir === 'string' && x.dir.length > 0;
const cleanCopy = (x) => ({
  dir: x.dir, version: typeof x.version === 'string' ? x.version : null,
  running: Boolean(x.running), exists: Boolean(x.exists), importable: Boolean(x.importable),
});

/** The service answer made safe to render, or null when it is not a state answer (an older service, an error). */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || raw.status !== 'ok' || !Array.isArray(raw.findings)) return null;
  return {
    findings: raw.findings.filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.kind === 'string'),
    autostartOwner: raw.autostartOwner && typeof raw.autostartOwner === 'object' ? raw.autostartOwner : null,
    copies: Array.isArray(raw.copies) ? raw.copies.filter(isCopy).map(cleanCopy) : [],
    thisVersion: typeof raw.thisVersion === 'string' ? raw.thisVersion : '',
    thisDir: typeof raw.thisDir === 'string' ? raw.thisDir : '',
    ownData: { nonDefaultConfig: Boolean(raw.ownData?.nonDefaultConfig), signedIn: Boolean(raw.ownData?.signedIn) },
    installerHint: { show: Boolean(raw.installerHint?.show), url: typeof raw.installerHint?.url === 'string' ? raw.installerHint.url : '' },
  };
}

/** Running copies first, then by folder, then by kind. */
export function sortFindings(findings) {
  const rank = (x) => (x.kind === 'process' ? 0 : 1);
  return [...findings].sort((a, b) => rank(a) - rank(b)
    || String(a.copyDir || '').localeCompare(String(b.copyDir || ''))
    || (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
}

export function removableCount(findings) {
  return findings.filter((x) => x.removable).length;
}

/** Copies whose data can be imported, once per folder. */
export function importCandidates(copies) {
  const seen = new Set();
  return copies.filter((c) => {
    if (!c.importable || seen.has(c.dir)) return false;
    seen.add(c.dir);
    return true;
  });
}

/** An import replaces this copy's settings and sign-ins: ask first when there is anything of its own to lose. */
export function needsOwnDataConfirm(ownData) {
  return Boolean(ownData && (ownData.nonDefaultConfig || ownData.signedIn));
}

/** Numbers requests: only the answer to the newest one may change the screen (a slow rescan must not undo a later action). */
export function createSequencer() {
  let latest = 0;
  return { next: () => ++latest, isLatest: (id) => id === latest };
}

/** What "remove all" reports: how many went, and a note when some did not (each failure is in the service log). */
export function removalMessage(body) {
  const results = Array.isArray(body?.results) ? body.results : [];
  const failed = results.filter((r) => r && r.ok === false).length;
  if (failed === 0) return { text: 'Записи убраны, оригиналы сохранены', error: false };
  return { text: `Убрано ${results.length - failed} из ${results.length}; не удалось убрать остальные, подробности в журнале`, error: true };
}

export function errorMessage(body, status) {
  return body && typeof body.message === 'string' && body.message ? body.message : `HTTP ${status}`;
}

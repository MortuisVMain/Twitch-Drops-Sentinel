import { SteamIdleAchievement, SteamIdleAchievements, SteamIdleLibraryGame, SteamIdleLibraryStatus } from '../../types';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isGame = (g: unknown): g is Rec => isRec(g) && isNum(g.appId) && typeof g.name === 'string';

export const LIBRARY_STATUSES: readonly string[] = ['none', 'scanning', 'ready', 'failed'];
const RUN_STATES = ['idle', 'scanning', 'unlocking', 'waiting', 'paused', 'suspended', 'done', 'stopped'];
const MODES = ['selected', 'game', 'library'];
const INTERRUPTED_KINDS = MODES;
const TOTAL_KEYS = ['unlocked', 'already', 'skipped', 'rejected', 'failed'];

const isRun = (r: unknown): boolean => isRec(r)
  && typeof r.state === 'string' && RUN_STATES.includes(r.state)
  && (r.mode === null || (typeof r.mode === 'string' && MODES.includes(r.mode)))
  && (r.current === null || (isGame(r.current) && isNum(r.current.done) && isNum(r.current.total)))
  && (r.nextUnlockInSeconds === null || isNum(r.nextUnlockInSeconds))
  && Array.isArray(r.queue) && r.queue.every(isGame)
  && Array.isArray(r.finished) && r.finished.every((g) => isGame(g) && isNum(g.unlocked) && isNum(g.skipped) && isNum(g.failed) && (g.note === null || typeof g.note === 'string'))
  && isRec(r.totals) && TOTAL_KEYS.every((k) => isNum((r.totals as Rec)[k]))
  && (r.lastError === null || typeof r.lastError === 'string')
  && typeof r.paused === 'boolean' && typeof r.suspended === 'boolean';

/** The whole `achievements` key of GET /state; null when it does not match the contract. */
export const parseAchievements = (v: unknown): SteamIdleAchievements | null => {
  if (!isRec(v) || typeof v.acknowledged !== 'boolean' || !isRec(v.settings) || !isRun(v.run)) return null;
  const st = v.settings;
  if (!isNum(st.minMinutes) || !isNum(st.maxMinutes) || typeof st.skipHidden !== 'boolean') return null;
  const i = v.interrupted;  // absent on an older service; otherwise null or the summary of the recorded run
  if (i !== undefined && i !== null && !(isRec(i) && typeof i.kind === 'string' && INTERRUPTED_KINDS.includes(i.kind)
    && isNum(i.startedAt) && isNum(i.gamesDone) && isNum(i.gamesTotal) && isNum(i.unlocked))) return null;
  return v as unknown as SteamIdleAchievements;
};

export const isLibraryStatus = (v: unknown): v is SteamIdleLibraryStatus => typeof v === 'string' && LIBRARY_STATUSES.includes(v);

export const parseLibrary = (json: unknown): SteamIdleLibraryGame[] | null => {
  if (!isRec(json) || !Array.isArray(json.games)) return null;
  return json.games.every((g) => isGame(g) && isNum(g.playtimeMinutes)) ? (json.games as SteamIdleLibraryGame[]) : null;
};

export const parseAchievementList = (json: unknown): SteamIdleAchievement[] | null => {
  if (!isRec(json) || !Array.isArray(json.achievements)) return null;
  const ok = json.achievements.every((a) => isRec(a) && typeof a.apiName === 'string' && typeof a.name === 'string'
    && typeof a.description === 'string' && typeof a.hidden === 'boolean' && typeof a.achieved === 'boolean'
    && (a.unlockTime === null || a.unlockTime === undefined || isNum(a.unlockTime)));
  return ok ? (json.achievements as SteamIdleAchievement[]) : null;
};

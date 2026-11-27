export interface ActiveDrop {
  id: string;
  name: string;
  game: string;
  game_box_art?: string;
  current_minutes: number;
  required_minutes: number;
  progress_percent: number;
  remaining_seconds: number;
  channel_name: string;
  channel_id: string;
  is_claimed: boolean;
  can_claim: boolean;
  preview_url?: string;
  source?: 'local'; // set while a reward campaign is watched and no Twitch drop is linked yet: the numbers are the local estimate
  reward?: boolean; // the hero shows a reward campaign watch, not a drops campaign
}

export interface FarmSchedule {
  enabled: boolean;
  days: number[]; // Monday = 0
  start: string; // "HH:MM", local time
  end: string; // end <= start runs past midnight; equal = the whole day
}

export interface HardwareGuard {
  is_gaming: boolean;
  detected_game: string | null;
  on_battery: boolean;
  is_paused: boolean;
  schedule_paused?: boolean; // paused because now is outside the farm schedule
  schedule_next?: string | null; // local ISO time the schedule next starts or stops farming
  ping_ms: number | null; // null = not measured
  cpu_percent: number;
  gpu_percent: number | null; // null = not measured
}

export interface SentinelStats {
  traffic_saved_mb: number;
  total_drops_claimed: number;
  channel_points_earned: number;
  total_farm_hours: number;
}

export interface AvailableChannel {
  id: string;
  name: string;
  game: string;
  viewers: number;
  drops_enabled: boolean;
  online: boolean;
  acl_based: boolean;
}

export interface GameItem {
  id: string;
  name: string;
  is_installed: boolean;
  install_path?: string;
  has_drops: boolean;
  box_art?: string;
  box_art_sources?: string[];
  category?: string;
  drops_start_at?: string;
  drops_end_at?: string;
  is_active_now?: boolean;
  rewards_count?: number;
  is_account_connected?: boolean;
  account_link_url?: string;
  is_finished?: boolean;
  progress_percent?: number;
  claimed_drops?: number;
  total_drops?: number;
  allowed_channels?: string[];
  farmable?: boolean; // the engine's own verdict: can this campaign be farmed now
  not_farmable_reason?: string;
  remaining_watch_minutes?: number; // minutes of watching still needed for everything left; absent when the engine does not know
}

export interface TrophyItem {
  id: string;
  date: string;
  game: string;
  drop_name: string;
  campaign: string;
  status: string;
}

export interface SentinelSettings {
  auto_shutdown_on_complete: boolean;
  auto_shutdown_mode: 'shutdown' | 'sleep' | 'lock';
  pause_on_gaming: boolean;
  pause_on_battery: boolean;
  native_toasts: boolean;
  health_watch_enabled?: boolean; // background "Проверка работы"; default true
  health_watch_hours?: 1 | 4 | 12 | 24; // how often it runs; default 1
  update_channel?: 'stable' | 'beta'; // beta: pre-releases are offered too
  farm_schedule?: FarmSchedule; // quiet hours: farm only inside the window
  ui_sound_enabled?: boolean;
  claim_channel_points?: boolean;
  auto_claim_drops?: boolean;
  giveaways_enabled?: boolean;
  reward_campaigns_enabled?: boolean; // show Twitch reward campaigns and farm their watch time (subscriptions are never bought)
  reward_daily_slot?: boolean; // default true: a queued reward campaign takes the daily slot before drops until today's goal is reached
  reward_auto_queue?: boolean; // default false: new farmable reward campaigns are appended to the end of the queue
  hidden_reward_campaigns?: string[]; // campaign ids the user hid: still in the state with hidden=true, never farmed (post the whole list)
  reward_campaign_categories?: Record<string, string>; // campaign id -> category name chosen by the user (post the whole map; an empty name removes an entry)
  disabled_tabs?: ('shelf' | 'steamidle' | 'dimmer')[]; // optional tabs turned off; Giveaways follows giveaways_enabled
  giveaways_selected_stores?: StoreId[];
  giveaways_headless?: boolean;
  streamer_watchdog_enabled?: boolean;
  game_directories?: string[];
  priority_games: string[];
  excluded_games: string[];
  user_linked_games?: string[];
  priority_mode?: number; // 0 = PRIORITY_ONLY, 1 = ENDING_SOONEST, 2 = LOW_AVBL_FIRST
  hardware_guard_enabled?: boolean;
  ignored_channels?: { name: string; until?: number; reason?: 'snooze2h' | 'permaban' }[];
  ui_theme?: 'titanium' | 'luna-mint' | 'gradient' | 'cyberpunk' | 'light' | 'copper' | 'apple-luna' | 'midnight' | 'graphite' | 'paper' | 'sakura';
  ui_backdrop_type?: '3d' | '2d-honeycomb' | '2d-lava' | '2d-dots' | '2d-carbon' | 'smooth' | 'photo';
  /** for 'photo' backdrops: an id from PHOTO_BACKDROPS (src/components/PhotoBackdrop.tsx) */
  ui_relief_mode?: 'hex-magma' | 'hex-theme' | 'tectonic-lava' | 'topo-damascus' | 'carbon-weave' | 'pcb-3d' | 'liquid-silk' | 'apple-luna' | 'none' | (string & {});
  ui_relief_opacity?: number;
}

export interface SentinelLogEntry {
  time: string;
  level: string;
  message: string;
  timestamp?: string;
  category?: string;
  /** Set by the service: the number of the line, when it was written (epoch seconds) and the older line a folded counter line replaces. */
  seq?: number;
  ts?: number;
  replaces?: number | null;
}

/** One reward group of a reward campaign: what has to be done (watch minutes or subscriptions) and what it gives. Subscriptions are display-only. */
export interface RewardGroup {
  goalKind: 'watch' | 'subs' | 'other';
  minutes: number; // 0 when the group has no watch goal
  subs: number; // 0 when the group has no subscription goal
  rewards: { name: string; image?: string | null; earnableUntil?: string | null }[];
}

/** The category a reward campaign is watched in: source game (Twitch names it), user (chosen in settings) or guess (found in the texts and checked with Twitch). */
export interface RewardCategory {
  name: string;
  slug: string;
  source: 'game' | 'guess' | 'user';
}

/** A Twitch reward campaign (quest or brand offer) as the service trims it; its watch time is farmed in `category`. */
export interface RewardCampaign {
  id: string;
  name: string;
  brand?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  summary?: string | null;
  instructions?: string | null;
  url?: string | null; // https only
  game?: string | null;
  image?: string | null; // https only
  rewards?: { name: string; image?: string | null; earnableUntil?: string | null }[];
  minutesGoal?: number | null;
  subsGoal?: number | null;
  groups?: RewardGroup[];
  sitewide?: boolean; // not tied to one game
  category?: RewardCategory | null; // null: no category could be found, so it cannot be farmed (the user can set one)
  farmable?: boolean; // a watch group with minutes AND a category
  watchedToday?: number; // whole minutes watched today (UTC day), counted by the app
  dailyGoal?: number | null; // minutes of the watch group, null without one
  doneToday?: boolean; // dailyGoal reached today: it is eligible again from the next UTC day
  earned?: boolean; // Twitch said the reward was earned
  dailyRewardToday?: boolean; // today's daily reward (a badge a day) was received
  twitchMinutes?: number | null; // minutes Twitch itself reports for the linked drop today, null while it reports none
  progressSource?: 'twitch' | 'local'; // whose number watchedToday is: Twitch's, or the local count when Twitch reports nothing
  cappedToday?: boolean; // given up for today: Twitch's counter did not finish after the local safety cap
  daysDone?: number; // UTC days on which the watch goal was reached
  daysTotal?: number | null; // days the campaign runs when its summary says so ("six different days")
  hidden?: boolean; // the user hid it: shown by the page only on request, never farmed
}

export interface FullSentinelState {
  version?: string;
  connected: boolean;
  user_id: string;
  username: string;
  status_text?: string;
  watching_channel?: string | null;
  available_channels?: AvailableChannel[];
  active_drop: ActiveDrop | null;
  hardware: HardwareGuard;
  stats: SentinelStats;
  settings: SentinelSettings;
  health_watch?: { enabled: boolean; hours: number; problems: number; fails?: number; lastRun: number | null; lastManual?: number | null }; // problems = fail + warn of the last background or manual check
  reward_campaigns?: RewardCampaign[]; // empty while the setting is off
  reward_watching?: { id: string; name: string } | null; // the reward campaign being watched right now
  slot_minutes_today?: number; // minutes the daily reward slot took today (UTC), before drops
  slot_budget_today?: number; // minutes it may take today: the largest queued daily goal, at most 60; 0 while the slot is off
  installed_games: GameItem[];
  all_catalog_games: GameItem[];
  ignored_games?: string[];
  covers?: Record<string, string>; // cover found by name for games shown without working art
  trophies: TrophyItem[];
  recent_logs?: SentinelLogEntry[];
  /** Cursor of the journal: the console asks GET /api/logs?after=<log_seq>&session=<log_session> when it moves. */
  log_seq?: number;
  log_session?: string;
  watchdog_status?: string | null;
  oauth_code?: string | null;
  oauth_uri?: string | null;
  forced_game?: string | null;
}

export type StoreId = 'epic' | 'gog' | 'steam' | 'fab' | 'unity' | 'itch' | 'prime';
export type ClaimStatus = 'claimed' | 'existed' | string;
export type RunnerState = 'idle' | 'running' | 'aborting' | 'external_running';

export interface ClaimedGameItem {
  id: string;
  store: StoreId;
  account: string;
  slug: string;
  title: string;
  claimedAt: string;
  timestampMs: number;
  url: string;
  status: ClaimStatus;
}

export interface StoreTelemetry {
  store: StoreId;
  displayName: string;
  claimedCount: number;
  existedCount: number;
  lastClaimedAt: string | null;
  dbFileExists: boolean;
  account?: string | null;
  loginConfirmedAt?: number | null;
}

// starting: the local service has not answered yet (within the grace period); unavailable: it never did, or it was lost
export type ConnectionPhase = 'starting' | 'connected' | 'unavailable';

export interface SchedulerTelemetry {
  taskName: string;
  exists: boolean;
  // The Windows scheduler did not answer: `exists: false` then says nothing about the task
  queryFailed?: boolean;
  // The service could not bring the task in line with this install at startup
  repairError?: string | null;
  lastRunFailed?: boolean;
  // The last run ended with STATUS_CONTROL_C_EXIT (0xC000013A); the code does not know why
  lastRunInterrupted?: boolean;
  // A log file that exists, or null
  logFile?: string | null;
  state: 'Ready' | 'Running' | 'Disabled' | 'Unknown';
  lastRunTime: string | null;
  nextRunTime: string | null;
  lastTaskResult: number | null;
  daysOfWeek?: number | null;
  activeDays?: string[];
}

export interface GiveawaysLogEntry {
  line: string;
  ts: string;
}

export interface GiveawaysStateResponse {
  runner: {
    state: RunnerState;
    activeStores: StoreId[];
    pid: number | null;
    startedAt: string | null;
    headless: boolean;
  };
  scheduler: SchedulerTelemetry;
  stores: Record<StoreId, StoreTelemetry>;
  inventory: ClaimedGameItem[];
  recentLogs: GiveawaysLogEntry[];
  lastLogFile: string | null;
  fgcInstalled: boolean;
  totalClaimed: number;
}

export type NavTab = 'dashboard' | 'shelf' | 'giveaways' | 'steamidle' | 'dimmer' | 'settings';

export type SteamIdleFarmState = 'idle' | 'scanning' | 'farming' | 'waiting' | 'paused' | 'suspended' | 'needs_login' | 'done' | 'stopped' | 'batching';
export type SteamIdleCommunitySession = 'unknown' | 'checking' | 'signed_in' | 'signed_out' | 'login_open' | 'account_mismatch' | 'engine_missing' | 'error';

export interface SteamIdleQueuedGame { appId: number; name: string; dropsRemaining: number }
export interface SteamIdleCurrentGame extends SteamIdleQueuedGame { heldSeconds: number }
/** A game collecting playtime in the hours phase: playtimeHours counts toward the stored hoursUntilDrops. */
export interface SteamIdleBatchGame { appId: number; name: string; dropsRemaining: number; playtimeHours: number }
export interface SteamIdleFailedGame { appId: number; name: string; reason: string }
/** A game kept out of the queue because it may still be refundable. */
export interface SteamIdleHeldGame { appId: number; name: string; reason: 'refund_window'; daysLeft: number }

export type SteamIdlePreviewStatus = 'none' | 'scanning' | 'ready' | 'failed';
export interface SteamIdlePreviewGame { appId: number; name: string; dropsRemaining: number; playtimeHours: number }
/** Farmable games read on demand; absent when the service is older than the scan command. */
export interface SteamIdlePreview {
  status: SteamIdlePreviewStatus;
  ageSeconds: number | null;
  error: string | null;
  games: SteamIdlePreviewGame[];
  totalDropsRemaining: number;
}

export interface SteamIdleState {
  available: boolean;
  unavailableReason: 'helper_missing' | 'node_missing' | 'unsupported' | 'module_disabled' | null;
  riskAcknowledged: boolean;
  /** True while the farm or an achievements run is active: turning the tab off would stop it. Absent in an older service. */
  busy?: boolean;
  steam: { running: boolean; signedIn: boolean };
  community: { session: SteamIdleCommunitySession; checkedAgeSeconds: number | null };
  farm: {
    state: SteamIdleFarmState;
    current: SteamIdleCurrentGame | null;
    queue: SteamIdleQueuedGame[];
    done: { appId: number; name: string }[];
    failed: SteamIdleFailedGame[];
    totalDropsRemaining: number;
    lastReadAgeSeconds: number | null;
    lastError: string | null;
    paused: boolean;
    suspended: boolean;
    refundHeld: SteamIdleHeldGame[];
    /** 'hours' while batching, 'cards' while farming one game. Absent in an older service. */
    phase?: 'hours' | 'cards' | null;
    batch?: SteamIdleBatchGame[];
    /** Playtime a game needs before cards drop (0..10, 0 = the hours phase is off). Absent in an older service: the setting is then hidden. */
    hoursUntilDrops?: number;
    /** 'no_hours': Steam did not count playtime, the run switched to one game at a time. */
    batchDisabled?: string | null;
    /** Cards left and a rough time to farm them (half an hour a card plus the playtime still needed). Absent in an older service. */
    estimate?: { dropsRemaining: number; hours: number };
    /** Cards that dropped today for this account, and in the current run. Absent in an older service. */
    droppedToday?: number;
    droppedThisRun?: number;
    /** What the first card drops say about the account: set this many hours (0 = no restriction). Null/absent: nothing to suggest. */
    thresholdSuggestion?: { kind: 'restricted' | 'unrestricted'; suggestedHours: number; samples: number } | null;
    /** The farm paused itself because the user plays a game; it resumes when that game closes. Null/absent: not paused by the watch. */
    autoPause?: { reason: 'user_playing'; appId: number; since: number } | null;
    /** The two switches of the farm settings. Absent in an older service: the switches are then hidden. */
    pauseWhilePlaying?: boolean;
    notify?: boolean;
  };
  library: { count: number | null; status?: SteamIdleLibraryStatus; ageSeconds?: number | null; achievementsChecking?: boolean; achievementsVersion?: number };
  preview?: SteamIdlePreview;
  /** Absent when the service is older than achievements: the Achievements switch item is then hidden. */
  achievements?: SteamIdleAchievements;
  /** The user's own anti-cheat list. Absent in an older service: the block is then hidden. */
  denylist?: SteamIdleDenylist;
}

export interface SteamIdleDenylist { max: number; builtinCount: number; entries: { appId: number; name: string | null }[] }

export type SteamIdleLibraryStatus = 'none' | 'scanning' | 'ready' | 'failed';
export type SteamIdleAchRunState = 'idle' | 'scanning' | 'unlocking' | 'waiting' | 'paused' | 'suspended' | 'done' | 'stopped';
export interface SteamIdleAchSettings { minMinutes: number; maxMinutes: number; skipHidden: boolean }
export interface SteamIdleAchTotals { unlocked: number; already: number; skipped: number; rejected: number; failed: number }
export interface SteamIdleAchGame { appId: number; name: string }
export interface SteamIdleAchFinished extends SteamIdleAchGame { unlocked: number; skipped: number; failed: number; already?: number; rejected?: number; note: string | null }
export interface SteamIdleAchRun {
  state: SteamIdleAchRunState;
  mode: 'selected' | 'game' | 'library' | null;
  current: (SteamIdleAchGame & { done: number; total: number }) | null;
  nextUnlockInSeconds: number | null;
  queue: SteamIdleAchGame[];
  finished: SteamIdleAchFinished[];
  totals: SteamIdleAchTotals;
  lastError: string | null;
  paused: boolean;
  suspended: boolean;
}
/** A run the last session did not finish; nothing resumes by itself. */
export interface SteamIdleAchInterrupted { kind: 'game' | 'selected' | 'library'; startedAt: number; gamesDone: number; gamesTotal: number; unlocked: number }
export interface SteamIdleAchievements { acknowledged: boolean; settings: SteamIdleAchSettings; run: SteamIdleAchRun; interrupted?: SteamIdleAchInterrupted | null }

/** One owned game from GET /library. */
export interface SteamIdleLibraryGame {
  appId: number; name: string; playtimeMinutes: number;
  /** Anti-cheat by the built-in table or the user's list; absent in an older service. */
  protected?: boolean;
  /** On the user's own list; absent in an older service. */
  userDenied?: boolean;
  /** Whether the game has Steam achievements (store data); null while unknown, absent in an older service. */
  hasAchievements?: boolean | null;
  /** The account's progress from the last time the game's list was read; null when it was never read. */
  achievements?: { achieved: number; total: number } | null;
}
/** One achievement from GET /achievements. */
export interface SteamIdleAchievement { apiName: string; name: string; description: string; hidden: boolean; achieved: boolean; unlockTime: number | null }

export interface DisplayMonitor {
  id: string;
  name: string;
  device_name: string;
  is_primary: boolean;
  is_laptop_internal: boolean;
  current_brightness: number;
  baseline_brightness?: number;
  min_brightness: number;
  max_brightness: number;
  supports_control: boolean;
}

export interface DimmerState {
  monitors: DisplayMonitor[];
  master_brightness: number;
  is_dimmed: boolean;
  is_blackout: boolean;
  solo_screen_index: number | null;
  sleep_timer_minutes: number;
  sleep_timer_remaining?: number;
  away_mode_active: boolean;
  mute_audio_on_blackout: boolean;
  ultra_dark_active?: boolean;
  ultra_dark_tint?: number;
  has_baseline_saved?: boolean;
}

export interface UpdateCheckResult {
  update_available: boolean;
  local_version: string;
  remote_version: string;
  release_name: string;
  release_notes: string;
  published_at: string;
  download_url: string;
  asset_api_url?: string;
  html_url: string;
  prerelease?: boolean; // the offered version is a GitHub pre-release (beta channel)
  channel?: 'stable' | 'beta';
  /** Why the check failed; the other fields then hold the last known result */
  error?: string;
}

export interface UpdateProgressStatus {
  is_updating: boolean;
  stage: 'idle' | 'downloading' | 'extracting' | 'done' | 'error';
  percent: number;
  downloaded_bytes: number;
  total_bytes: number;
  downloaded_mb: number;
  total_mb: number;
  speed_mbps: number;
  error_message?: string;
}

// GET /api/v1/giveaways/readiness: statuses and data only, the interface writes all the text
export type ReadinessStatus = 'ok' | 'todo' | 'warning' | 'info';
export type ReadinessItemId = 'module' | 'node' | 'engine' | 'browser' | 'selection' | 'login' | 'site' | 'scheduler';

export type ReadinessAction =
  | { kind: 'open_url'; url: string }
  | { kind: 'install_engine' }
  | { kind: 'sign_in'; store: StoreId }
  | { kind: 'enable_giveaways' }
  | { kind: 'enable_scheduler' };

export interface ReadinessItem {
  id: ReadinessItemId;
  status: ReadinessStatus;
  params: Record<string, any>;
  action: ReadinessAction | null;
  store?: StoreId;
}

export interface ReadinessResponse {
  ready: boolean;
  remaining: number;
  checkedAt: string;
  /** false: quick check, no `site` items */
  full: boolean;
  engineInstall: { running: boolean; error: string | null };
  items: ReadinessItem[];
}

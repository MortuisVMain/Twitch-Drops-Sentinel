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
}

export interface HardwareGuard {
  is_gaming: boolean;
  detected_game: string | null;
  on_battery: boolean;
  is_paused: boolean;
  ping_ms: number;
  cpu_percent: number;
  gpu_percent: number;
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
  ui_sound_enabled?: boolean;
  claim_channel_points?: boolean;
  auto_claim_drops?: boolean;
  giveaways_enabled?: boolean;
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
  installed_games: GameItem[];
  all_catalog_games: GameItem[];
  ignored_games?: string[];
  trophies: TrophyItem[];
  recent_logs?: SentinelLogEntry[];
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
}

export interface SchedulerTelemetry {
  taskName: string;
  exists: boolean;
  // The Windows scheduler did not answer: `exists: false` then says nothing about the task
  queryFailed?: boolean;
  // The service could not bring the task in line with this install at startup
  repairError?: string | null;
  lastRunFailed?: boolean;
  logFile?: string;
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

export type NavTab = 'dashboard' | 'shelf' | 'giveaways' | 'dimmer' | 'settings';

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

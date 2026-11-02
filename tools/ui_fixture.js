// Offline fixture for UI checks: stubs fetch/EventSource with a populated state (long names on purpose) so
// screens can be inspected without the local service. Inlined into a COPY of dist/index.html by build_ui_harness.mjs.
// Query: ?lang=ru|en&scale=100|115|130 are written to localStorage before the app starts.
(function () {
  var q = new URLSearchParams(location.search);
  try {
    if (q.get('lang')) localStorage.setItem('sentinel_ui_lang', q.get('lang'));
    if (q.get('scale')) localStorage.setItem('sentinel_ui_text_scale', q.get('scale'));
  } catch (e) { /* storage blocked: defaults apply */ }

  var LONG = [
    'The Elder Scrolls Online: Gold Road Anniversary Edition', 'Warhammer 40,000: Space Marine 2 — Deluxe', 'Rust', 'Path of Exile 2',
    'Pokémon Trading Card Game Live', 'World of Warships: Legends', 'Call of Duty: Black Ops Cold War Zombies', 'Escape from Tarkov: Arena',
    'Лига Легенд: Wild Rift (русская версия)', 'Mount & Blade II: Bannerlord', 'Dead by Daylight', 'Apex Legends', 'Marvel Rivals', 'Fortnite',
  ];
  var games = LONG.map(function (name, i) {
    return {
      id: 'g' + i, name: name, is_installed: i % 3 === 0, has_drops: i % 4 !== 3, category: 'Game',
      drops_start_at: '2026-10-20T10:00:00Z', drops_end_at: '2026-11-0' + (2 + (i % 6)) + 'T20:00:00Z', is_active_now: i % 4 !== 3,
      rewards_count: 3 + i, is_account_connected: i % 2 === 0, is_finished: false, progress_percent: (i * 7) % 100,
      claimed_drops: i % 4, total_drops: 4 + (i % 3), farmable: true, allowed_channels: [],
    };
  });
  var state = {
    version: '3.5.0', connected: true, user_id: '1', username: 'A_Very_Long_Twitch_Username_2026',
    status_text: 'Фарм: ' + LONG[0], watching_channel: 'extraordinarilylongchannelnamethatgoesonandon',
    available_channels: [1, 2, 3].map(function (n) {
      return { id: 'c' + n, name: 'long_streamer_channel_name_number_' + n, game: LONG[n], viewers: 12345 * n, drops_enabled: true, online: true, acl_based: false };
    }),
    active_drop: {
      id: 'd1', name: 'Legendary Collector’s Edition Golden Dragon Mount of the Eternal Frost', game: LONG[0], current_minutes: 87,
      required_minutes: 240, progress_percent: 36, remaining_seconds: 9180, channel_name: 'extraordinarilylongchannelnamethatgoesonandon',
      channel_id: 'c1', is_claimed: false, can_claim: false,
    },
    hardware: { is_gaming: false, detected_game: null, on_battery: false, is_paused: false, ping_ms: 48, cpu_percent: 12, gpu_percent: 7 },
    stats: { traffic_saved_mb: 12345.6, total_drops_claimed: 128, channel_points_earned: 987654, total_farm_hours: 1234.5 },
    settings: {
      auto_shutdown_on_complete: false, auto_shutdown_mode: 'sleep', pause_on_gaming: true, pause_on_battery: true, native_toasts: true,
      priority_games: [LONG[0], LONG[1], LONG[2]], excluded_games: [LONG[7]], user_linked_games: [LONG[2]], priority_mode: 1,
      game_directories: ['D:\\Games\\Steam\\steamapps\\common\\A Very Long Directory Name For Testing Overflow'], ui_theme: 'titanium',
      language: q.get('lang') === 'en' ? 'English' : 'Русский',
    },
    installed_games: games.filter(function (g) { return g.is_installed; }), all_catalog_games: games, ignored_games: [],
    trophies: [1, 2, 3, 4].map(function (n) {
      return { id: 't' + n, date: '2026-10-2' + n + ' 18:3' + n, game: LONG[n], drop_name: 'Reward number ' + n + ' with a really long descriptive name', campaign: 'Campaign ' + n, status: 'claimed' };
    }),
    recent_logs: [{ time: '12:00:00', level: 'INFO', message: 'Фарм начат: ' + LONG[0] + ' на канале extraordinarilylongchannelname', category: 'farm' }],
  };
  var dimmer = {
    monitors: [0, 1, 2].map(function (n) {
      return { id: 'm' + n, name: 'Dell UltraSharp U3224KB 32-inch 6K Display #' + n, device_name: '\\\\.\\DISPLAY' + (n + 1), is_primary: n === 0,
        is_laptop_internal: n === 2, current_brightness: 40 + n * 20, baseline_brightness: 70, min_brightness: 0, max_brightness: 100, supports_control: true };
    }),
    master_brightness: 55, is_dimmed: false, is_blackout: false, solo_screen_index: null, sleep_timer_minutes: 0,
    away_mode_active: false, mute_audio_on_blackout: false, ultra_dark_active: false, ultra_dark_tint: 30, has_baseline_saved: true,
  };
  var giveaways = {
    runner: { state: 'idle', activeStores: [], pid: null, startedAt: null, headless: true },
    scheduler: { taskName: 'SentinelGiveaways', exists: true, state: 'Ready', lastRunTime: '2026-10-31T10:00:00Z', nextRunTime: '2026-11-02T10:00:00Z', lastTaskResult: 0, daysOfWeek: 21, activeDays: ['Вт', 'Пт', 'Вс'] },
    stores: {}, inventory: [1, 2, 3, 4, 5].map(function (n) {
      return { id: 'i' + n, store: ['epic', 'gog', 'steam', 'itch', 'prime'][n - 1], account: 'long.account.name.number' + n + '@example.com', slug: 's' + n,
        title: 'A Free Game With An Extremely Long Title Number ' + n + ': Definitive Edition', claimedAt: '2026-10-2' + n, timestampMs: 1790000000000 + n, url: 'https://example.com/' + n, status: 'claimed' };
    }),
    recentLogs: [{ line: 'Claimed: A Free Game With An Extremely Long Title', ts: '2026-10-31T10:00:00Z' }], lastLogFile: null, fgcInstalled: true, totalClaimed: 5,
  };
  ['epic', 'gog', 'steam', 'fab', 'unity', 'itch', 'prime'].forEach(function (id) {
    giveaways.stores[id] = { store: id, displayName: id, claimedCount: 3, existedCount: 1, lastClaimedAt: '2026-10-30', dbFileExists: true, account: 'acc@example.com' };
  });
  var routes = { '/api/state': state, '/api/v1/dimmer/state': dimmer, '/api/v1/giveaways/state': giveaways, '/api/game-directories': { directories: state.settings.game_directories } };
  window.fetch = function (url) {
    var path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    var body = routes[path] || { status: 'ok' };
    // the dimmer normally gets its state from the WebView2 host: replay it as a window message
    if (path === '/api/v1/dimmer/state') setTimeout(function () { window.postMessage({ type: 'DIMMER_STATE_CHANGED', state: dimmer }, '*'); }, 30);
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(body); }, text: function () { return Promise.resolve(JSON.stringify(body)); } });
  };
  window.EventSource = function () { this.addEventListener = function () {}; this.close = function () {}; };
})();

// Offline fixture for UI checks: stubs fetch/EventSource with a populated state (long names on purpose) so
// screens can be inspected without the local service. Inlined into a COPY of dist/index.html by build_ui_harness.mjs.
// Query: ?lang=ru|en&scale=100|115|130 are written to localStorage before the app starts.
// ?giveaways=slow|empty|500|500once|failafter|neterror|badshape and ?dimmer=slow|empty|none steer the loading states: slow answers after 8 s, empty is a real empty answer,
// 500once fails the first request only (retry works), failafter fails every poll after the first, badshape answers {}; dimmer none never gets a message from the shell.
// ?theme=light|titanium|... picks the interface theme (light is Daylight).
// ?update=1 serves an available update, so the header shows its widest state (update button).
// ?readiness=clean serves a clean machine for the giveaways readiness window (default: everything ready); ?readiness=error makes the check fail.
// ?browser=auto|chrome|msedge|chromium is the browser chosen in the readiness window (default auto); ?browsers=edge-only offers auto, Edge and Chromium only; ?browserstate=missing makes the chosen browser missing; ?browserpost=refuse answers the change with 409. Posts land in window.__browserPosts. A choice other than auto/chrome starts with no sign-ins (its own profile).
// ?service=slow|down makes fetch of /api/state and /api/updates/check reject (the local service is not up yet): slow for the first 5 s, then it answers; down always. Startup states: tools/check_startup_states.cjs.
// ?grace=<ms> shortens the start grace period of the connection check (the app reads window.__SENTINEL_START_GRACE_MS, which only this fixture sets).
// ?pip=short serves short game/reward/channel names, ?pip=idle serves no active drop and no channel (default: the long names above), for the mini-window checks (tools/check_pip_layout.cjs).
// ?games=<n> serves n campaigns instead of 14 (the extra ones have drops and no queue slot), for the off-queue panel checks (tools/check_override_cards.cjs).
// ?logs=5h|<n> serves a journal of n lines (default 3000) spread over the last ~5 hours through GET /api/logs?after=<seq>&session=<id> like the service does, while /api/state carries
// only its last 50 lines and the cursor (log_seq, log_session). Requests land in window.__logRequests; window.__pushLog(k) adds k lines, window.__restartLogs() simulates a service restart (new session, numbers start again). tools/check_console_logs.cjs.
// ?steamidle=ack|signedout|idle|farming|suspended|paused|done|error|unavailable|mismatch|enginemissing serves the Steam IDLE tab in that scenario (default farming; enginemissing has community.session "engine_missing": the browser engine of the giveaways is not installed); slow answers the first state after 8 s, down never answers; hang (farming) never answers any command; badstate has farm.state "exploding"; nolibrary (farming) omits the library key; idle also serves a ready card-games preview of 6 games, previewempty|previewscanning|previewfailed serve the other preview states and POST scan moves none -> scanning -> ready (1.5 s).
// ?steamidle=farmingmore is the farming scenario plus two refund-held games (card with the "Фармить всё равно" button) and two failed ones (reasons no_progress and presence_lost).
// ?steamidle=achgate|achidle|achrunning|achwaiting|achstopped|achdone|achnolib|achbig|achbadshape|noach serves the Achievements section (open it with the switch under the readiness row): achgate has achievements.acknowledged false; achidle is ready with a 30-game library (game 1: 40 achievements, 12 achieved, 6 hidden, long texts; game 2: 5; game 3: none); achrunning unlocking 3 of 9 with a queue of 4; achwaiting waiting 720 s; achstopped stopped with unlock_uncertain; achdone a finished list of 5 notes; achnolib library status none (POST /library/scan: none -> scanning -> ready in 1.5 s); achbig every game has 260 locked achievements; achbadshape has achievements.run.state "exploding" (the section is hidden, the Cards section still renders); noach omits the achievements key (older service: no switch).
// ?steamidlepost=<code> (for example busy, steam_not_running) makes every Steam IDLE command (ack, login, check, the farm ones and the achievements ones) answer 409 with that code. Commands land in window.__steamIdlePosts, with their bodies in window.__steamIdleBodies.
// ?steamidleget=<code> makes GET /library and GET /achievements (answered after 400 ms) answer 409 with that code (for example not_ready, steam_not_running).
// ?tabsoff=shelf,giveaways,steamidle,dimmer serves settings with those header tabs turned off (giveaways through giveaways_enabled: false, the others through disabled_tabs); any subset works. window.__fixtureSettings is the settings object the next state poll serves: change disabled_tabs on it to turn a tab off while the page runs.
// POST /api/settings merges the posted fields into window.__fixtureSettings, so a switch in Settings holds across state polls. ?steamidlebusy=1|0 sets busy on GET /api/v1/steam-idle/state (default: true while the farm is farming, paused or suspended).
// ?rewards=1 serves reward_campaigns_enabled: true with six synthetic reward campaigns carrying the farming fields (one with a game, one subs-only, one with a very long name that is done today, one farmable with a guessed category, one with category null, one hidden); ?rewards=empty turns it on with an empty list. Without it the setting is absent (off) and reward_campaigns is [], like the service; switching it in Settings serves the campaigns (or none for empty), as the service does.
// ?host=1 fakes the WebView2 host: window.chrome.webview.postMessage records every message in window.__hostMessages.
(function () {
  var q = new URLSearchParams(location.search);
  if (q.get('host') === '1') {
    window.__hostMessages = [];
    window.chrome = Object.assign(window.chrome || {}, { webview: { postMessage: function (m) { window.__hostMessages.push(m); }, addEventListener: function () {}, removeEventListener: function () {} } });
  }
  if (q.get('grace') && isFinite(Number(q.get('grace')))) window.__SENTINEL_START_GRACE_MS = Number(q.get('grace'));
  var serviceMode = q.get('service'), serviceUpAt = Date.now() + 5000;
  try {
    if (q.get('lang')) localStorage.setItem('sentinel_ui_lang', q.get('lang'));
    if (q.get('scale')) localStorage.setItem('sentinel_ui_text_scale', q.get('scale'));
    if (q.get('theme')) localStorage.setItem('sentinel_theme', q.get('theme'));
  } catch (e) { /* storage blocked: defaults apply */ }

  var LONG = [
    'The Elder Scrolls Online: Gold Road Anniversary Edition', 'Warhammer 40,000: Space Marine 2 — Deluxe', 'Rust', 'Path of Exile 2',
    'Pokémon Trading Card Game Live', 'World of Warships: Legends', 'Call of Duty: Black Ops Cold War Zombies', 'Escape from Tarkov: Arena',
    'Лига Легенд: Wild Rift (русская версия)', 'Mount & Blade II: Bannerlord', 'Dead by Daylight', 'Apex Legends', 'Marvel Rivals', 'Fortnite',
  ];
  // Three off-queue campaigns end within a day, relative to the page load, one per deadline verdict:
  // enough (5h48m left, 2h to watch), late (1h left, 2h to watch), unknown (no remaining_watch_minutes in the payload).
  var SOON = { 4: [348, 120], 5: [60, 120], 6: [540, undefined] };
  var games = LONG.map(function (name, i) {
    var soon = SOON[i];
    var game = {
      id: 'g' + i, name: name, is_installed: i % 3 === 0, has_drops: i % 4 !== 3, category: 'Game',
      drops_start_at: '2026-10-20T10:00:00Z', drops_end_at: '2026-11-0' + (2 + (i % 6)) + 'T20:00:00Z', is_active_now: i % 4 !== 3,
      rewards_count: 3 + i, is_account_connected: i % 2 === 0, is_finished: false, progress_percent: (i * 7) % 100,
      claimed_drops: i % 4, total_drops: 4 + (i % 3), farmable: true, allowed_channels: [],
    };
    if (soon) {
      game.drops_end_at = new Date(Date.now() + soon[0] * 60000).toISOString();
      if (soon[1] !== undefined) game.remaining_watch_minutes = soon[1];
    }
    return game;
  });
  for (var extra = games.length; extra < (Number(q.get('games')) || 0); extra++) {
    games.push({ id: 'g' + extra, name: 'Extra Campaign Number ' + extra, is_installed: false, has_drops: true, category: 'Game', drops_start_at: '2026-10-20T10:00:00Z',
      drops_end_at: '2026-11-1' + (extra % 5) + 'T20:00:00Z', is_active_now: true, rewards_count: 3, is_account_connected: true, is_finished: false, progress_percent: 0,
      claimed_drops: 0, total_drops: 4, farmable: true, allowed_channels: [] });
  }
  var state = {
    version: '3.7.0', connected: true, user_id: '1', username: 'A_Very_Long_Twitch_Username_2026',
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
  if (q.get('pip') === 'short') {
    Object.assign(state.active_drop, { name: 'Gold Skin', game: 'Rust', channel_name: 'rustfan' });
    state.watching_channel = 'rustfan';
  } else if (q.get('pip') === 'idle') {
    state.active_drop = null;
    state.watching_channel = null;
  }
  var tabsOff = (q.get('tabsoff') || '').split(',');
  state.settings.disabled_tabs = tabsOff.filter(function (t) { return t === 'shelf' || t === 'steamidle' || t === 'dimmer'; });
  if (tabsOff.indexOf('giveaways') >= 0) state.settings.giveaways_enabled = false;
  var rewardsMode = q.get('rewards');
  var REWARD_SAMPLES = rewardsMode === 'empty' ? [] : [
    { id: 'rc1', name: 'Synthetic Launch Celebration', brand: 'Example Brand', startsAt: '2026-11-01T00:00:00Z', endsAt: new Date(Date.now() + 9 * 86400000).toISOString(), summary: 'Watch and get a thing.', instructions: 'Do the steps.',
      url: 'https://example.test/promo', game: 'Synthetic Game', image: null, rewards: [{ name: 'Synthetic Skin', image: null, earnableUntil: null }], minutesGoal: 30, subsGoal: null,
      sitewide: false, groups: [{ goalKind: 'watch', minutes: 30, subs: 0, rewards: [{ name: 'Synthetic Skin', image: null, earnableUntil: null }] }],
      category: { name: 'Synthetic Game', slug: 'synthetic-game', source: 'game' }, farmable: true, watchedToday: 12, dailyGoal: 30, doneToday: false, earned: false, hidden: false },
    { id: 'rc2', name: 'Sitewide Spring Quest', brand: null, startsAt: null, endsAt: new Date(Date.now() + 20 * 86400000).toISOString(), summary: null, instructions: null,
      url: null, game: null, image: null, rewards: [], minutesGoal: null, subsGoal: 1,
      sitewide: true, groups: [{ goalKind: 'subs', minutes: 0, subs: 1, rewards: [{ name: 'Sub Emote Chest', image: null, earnableUntil: null }] }],
      category: null, farmable: false, watchedToday: 0, dailyGoal: null, doneToday: false, earned: false, hidden: false },
    { id: 'rc3', name: 'A Campaign With An Extremely Long Name That Keeps Going To Check How The Row Wraps And Clips In A Narrow Column Of The Queue', brand: 'An Equally Long Brand Name Incorporated International',
      startsAt: null, endsAt: new Date(Date.now() + 3 * 86400000).toISOString(), summary: null, instructions: null, url: 'https://example.test/long', game: 'Synthetic Game With A Long Title', image: null, rewards: [], minutesGoal: 120, subsGoal: 2,
      sitewide: false, groups: [{ goalKind: 'watch', minutes: 120, subs: 0, rewards: [] }, { goalKind: 'subs', minutes: 0, subs: 2, rewards: [] }],
      category: { name: 'Synthetic Game With A Long Title', slug: 'synthetic-game-with-a-long-title', source: 'user' }, farmable: true, watchedToday: 120, dailyGoal: 120, doneToday: true, earned: false, hidden: false },
    // farmable: sitewide, no game, the category was guessed from its texts (GTAVI -> Grand Theft Auto VI) and checked with Twitch
    { id: 'rc4', name: 'GTAVI Launch Celebration', brand: null, startsAt: '2026-11-18T00:00:00Z', endsAt: new Date(Date.now() + 11 * 86400000).toISOString(),
      summary: 'Unlock six Bling Badge viewership badges by watching GTAVI streamers for one hour each day on six different days. Subscribe three times to streamers in the GTAVI Category.', instructions: null,
      url: 'https://example.test/gta', game: null, image: null, rewards: [{ name: 'GTA DVD Chest', image: null, earnableUntil: null }, { name: 'GTA Sub Emote Chest', image: null, earnableUntil: null }], minutesGoal: 60, subsGoal: 1,
      sitewide: true, groups: [{ goalKind: 'watch', minutes: 60, subs: 0, rewards: [{ name: 'GTA DVD Chest', image: null, earnableUntil: null }] }, { goalKind: 'subs', minutes: 0, subs: 1, rewards: [{ name: 'GTA Sub Emote Chest', image: null, earnableUntil: null }] }],
      category: { name: 'Grand Theft Auto VI', slug: 'grand-theft-auto-vi', source: 'guess' }, farmable: true, watchedToday: 23, dailyGoal: 60, doneToday: false, earned: false, hidden: false },
    // a watch goal but no category could be found: not farmable until the user sets one
    { id: 'rc5', name: 'Pokemon Night Out', brand: null, startsAt: null, endsAt: new Date(Date.now() + 6 * 86400000).toISOString(), summary: 'Watch streamers for an hour.', instructions: null,
      url: null, game: null, image: null, rewards: [{ name: 'Pikachu Emote', image: null, earnableUntil: null }], minutesGoal: 60, subsGoal: null,
      sitewide: true, groups: [{ goalKind: 'watch', minutes: 60, subs: 0, rewards: [{ name: 'Pikachu Emote', image: null, earnableUntil: null }] }],
      category: null, farmable: false, watchedToday: 0, dailyGoal: 60, doneToday: false, earned: false, hidden: false },
    // hidden by the user: in the list with hidden: true, the page filters it
    { id: 'rc6', name: 'Hidden Brand Offer', brand: 'Example Brand', startsAt: null, endsAt: new Date(Date.now() + 14 * 86400000).toISOString(), summary: null, instructions: null,
      url: null, game: 'Synthetic Game', image: null, rewards: [{ name: 'Hidden Reward', image: null, earnableUntil: null }], minutesGoal: 45, subsGoal: null,
      sitewide: false, groups: [{ goalKind: 'watch', minutes: 45, subs: 0, rewards: [{ name: 'Hidden Reward', image: null, earnableUntil: null }] }],
      category: { name: 'Synthetic Game', slug: 'synthetic-game', source: 'game' }, farmable: true, watchedToday: 0, dailyGoal: 45, doneToday: false, earned: false, hidden: true },
  ];
  function syncRewards() { state.reward_campaigns = state.settings.reward_campaigns_enabled === true ? REWARD_SAMPLES : []; }
  if (rewardsMode === '1' || rewardsMode === 'empty') state.settings.reward_campaigns_enabled = true;
  syncRewards();
  window.__fixtureSettings = state.settings;
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
  // ?demo=1: tidy names for README screenshots (the default keeps long names on purpose to catch overflow)
  if (q.get('demo') === '1') {
    var NAMES = ['Warhammer 40,000: Space Marine 2', 'Hunt: Showdown 1896', 'Path of Exile 2', 'The Witcher 3', 'Black Desert',
      'Battlefield 6', 'Stardew Valley', 'Terraria', 'Hades II', 'RimWorld', 'Dredge', 'Stellaris', 'The Division 2', 'EVE Online'];
    games.forEach(function (g, i) { g.name = NAMES[i]; });
    state.username = 'sentinel_demo'; state.status_text = 'Фарм: ' + NAMES[0]; state.watching_channel = 'demo_streamer';
    state.available_channels.forEach(function (c, i) { c.name = ['demo_streamer', 'night_raider', 'arctic_fox_tv'][i]; c.game = NAMES[i]; });
    Object.assign(state.active_drop, { name: 'Ultramarines Armour Set', game: NAMES[0], channel_name: 'demo_streamer' });
    Object.assign(state.settings, { priority_games: NAMES.slice(0, 3), excluded_games: [NAMES[7]], user_linked_games: [NAMES[0]], game_directories: ['D:\Games'] });
    state.trophies.forEach(function (t, i) { t.game = NAMES[i + 1]; t.drop_name = ['Weapon Charm', 'Banner Frame', 'Supply Crate', 'Emote'][i]; });
    state.recent_logs = [{ time: '12:00:00', level: 'INFO', message: q.get('lang') === 'en' ? 'Farming started: ' + NAMES[0] + ' on demo_streamer' : 'Фарм начат: ' + NAMES[0] + ' на канале demo_streamer', category: 'farm' }];
    giveaways.inventory.forEach(function (it, i) { it.title = ['Celeste', 'Hollow Knight', 'Into the Breach', 'Dredge', 'Tunic'][i]; it.account = 'demo@example.com'; });
    dimmer.monitors.forEach(function (m, i) { m.name = ['Dell U2723QE', 'LG 27GP850', 'Built-in Display'][i]; });
  }
  // Readiness window: statuses and data only (the interface writes the text). Default = ready, clean = a fresh PC
  var STORE_IDS = ['epic', 'gog', 'steam', 'fab', 'unity', 'itch', 'prime'];
  var browserChoice = q.get('browser') || 'auto';
  window.__browserPosts = [];
  function browserItem(clean) {
    var missing = q.get('browserstate') === 'missing' && browserChoice !== 'auto';
    var options = q.get('browsers') === 'edge-only' ? ['auto', 'msedge', 'chromium'] : ['auto', 'chrome', 'msedge', 'chromium'];
    if (missing) options = options.filter(function (id) { return id !== browserChoice; });
    var params = { found: clean ? null : 'edge', choice: browserChoice, options: options, chromiumInstalled: q.get('browsers') !== 'edge-only', reason: missing ? 'selected_missing' : null };
    var status = missing ? 'todo' : clean && browserChoice === 'auto' ? 'warning' : 'ok';
    return { id: 'browser', status: status, params: params, action: null };
  }
  function readinessBody(kind, quick) {
    var clean = kind === 'clean';
    var items = [
      { id: 'module', status: 'ok', params: { path: 'C:\Sentinel\core\free-games-claimer' }, action: null },
      clean ? { id: 'node', status: 'todo', params: { reason: 'missing', version: null, required: 20 }, action: { kind: 'open_url', url: 'https://nodejs.org' } }
            : { id: 'node', status: 'ok', params: { reason: null, version: 'v20.18.0', required: 20 }, action: null },
      clean ? { id: 'engine', status: 'todo', params: {}, action: null } : { id: 'engine', status: 'ok', params: {}, action: null },
      browserItem(clean),
      { id: 'selection', status: 'ok', params: { reason: null, stores: STORE_IDS }, action: null },
    ];
    var freshProfile = browserChoice === 'msedge' || browserChoice === 'chromium';
    STORE_IDS.forEach(function (id) {
      items.push(clean || freshProfile ? { id: 'login', status: 'todo', params: {}, action: { kind: 'sign_in', store: id }, store: id }
        : { id: 'login', status: 'ok', params: { account: 'long.account.name.number@example.com', confirmedAt: Date.parse('2026-10-30T18:20:00Z') }, action: null, store: id });
    });
    if (!quick) STORE_IDS.forEach(function (id, i) {
      items.push({ id: 'site', status: clean && i === 3 ? 'warning' : 'ok', params: {}, action: null, store: id });
    });
    items.push(clean ? { id: 'scheduler', status: 'info', params: { reason: 'not_created' }, action: { kind: 'enable_scheduler' } }
      : { id: 'scheduler', status: 'ok', params: { reason: null, lastRunTime: '2026-10-31T10:00:00Z', nextRunTime: '2026-11-02T10:00:00Z', activeDays: ['Tuesday', 'Friday', 'Sunday'], logFile: null }, action: null });
    var remaining = items.filter(function (it) { return it.status === 'todo'; }).length;
    return { ready: remaining === 0, remaining: remaining, checkedAt: '2026-11-03T12:00:00Z', full: !quick, engineInstall: { running: false, error: null }, items: items };
  }
  // The journal behind /api/logs (see the header): lines, a cursor and a session, like the service keeps them
  var logsMode = q.get('logs');
  var journal = { session: 's1', seq: 0, entries: [] };
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clock(ms) { var d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }
  function journalLine(n, total, ts) {
    var level = n % 40 === 0 ? 'CLAIM' : n % 10 === 0 ? 'WATCH' : n % 25 === 0 ? 'CORE' : 'INFO';
    var text = n === 1 ? 'Журнал: самая старая строка (около 5 часов назад)' : n === total ? 'Журнал: самая новая строка'
      : level === 'CLAIM' ? '[CLAIM] Получен трофей номер ' + n : level === 'WATCH' ? '[WATCH] Просмотр канала: demo_streamer_' + n : level === 'CORE' ? '[CORE] Проверка ядра ' + n : 'Строка журнала ' + n + ' с текстом обычной длины для проверки';
    return { time: clock(ts), level: level, message: text, ts: ts / 1000, seq: ++journal.seq };
  }
  function syncJournalState() {
    state.recent_logs = journal.entries.slice(-50); state.log_seq = journal.seq; state.log_session = journal.session;
  }
  if (logsMode) {
    var total = logsMode === '5h' ? 3000 : Math.max(1, Number(logsMode) || 3000), now0 = Date.now(), span = 4.95 * 3600 * 1000;
    for (var ln = 1; ln <= total; ln++) journal.entries.push(journalLine(ln, total, now0 - span + (ln - 1) * (span / Math.max(1, total - 1))));
    syncJournalState();
    window.__logRequests = [];
    window.__pushLog = function (count) {
      for (var k = 0; k < count; k++) { var added = journalLine(7, -1, Date.now()); added.message = 'Новая строка ' + k; journal.entries.push(added); }
      journal.entries[journal.entries.length - 1].message = 'Новая строка после загрузки';
      syncJournalState();
    };
    window.__restartLogs = function () {
      journal = { session: 's2', seq: 0, entries: [] };
      for (var r = 1; r <= 5; r++) { var e = journalLine(7, -1, Date.now()); e.message = 'После перезапуска ' + r; journal.entries.push(e); }
      syncJournalState();
    };
  }
  function logsAnswer(url) {
    var params = new URLSearchParams(String(url).split('?')[1] || ''), after = Number(params.get('after') || 0), session = params.get('session');
    window.__logRequests.push(String(url));
    var reset = (session !== null && session !== journal.session) || after > journal.seq;
    if (reset) after = 0;
    return { session: journal.session, last_seq: journal.seq, reset: reset, entries: journal.entries.filter(function (e) { return e.seq > after; }) };
  }
  var update = q.get('update') === '1' ? { update_available: true, local_version: '3.7.0', remote_version: '3.8.0', release_notes: '', error: null } : { update_available: false, local_version: '3.7.0', remote_version: '3.7.0', error: null };
  // the plain-text diagnostic report: many lines, a few of them very long (paths, URLs), like the real one
  function diagReport() {
    var out = ['==================================================', 'TWITCH DROPS SENTINEL v3.7.0 - DIAGNOSTIC REPORT', '==================================================', 'OS: Windows 11 (Build 10.0.26300)', 'Active Drop Name: Pouch of Violet Dust', 'RECENT LOGS:'];
    for (var n = 0; n < 120; n++) out.push('[06:' + (10 + n % 50) + ':00] [INFO] Line ' + n + (n % 17 === 0 ? ' C:/Users/someone/AppData/Local/Programs/TwitchDropsSentinel/core/cookies.jar [PRESENT] ' + new Array(12).join('segment-of-a-very-long-unbroken-path-name/') : ''));
    out.push('END OF DIAGNOSTIC REPORT');
    return out.join('\n');
  }
  // Steam IDLE tab: invented games and no account data. The commands move the fake farm along like the real one would.
  var SI_NAMES = ['Lanternfall Chronicles', 'Brass Meridian', 'Hollow Orchard Tactics', 'Saltmarsh Cartographer: Extended Survey Edition With A Deliberately Long Title For Wrapping', 'Quiet Foundry', 'Pale Harbor', 'Ember Ledger'];
  var siMode = q.get('steamidle') || 'farming', siCalls = 0, siStart = Date.now();
  window.__steamIdlePosts = [];
  window.__steamIdleBodies = [];
  function siGame(i, drops) { return { appId: 910000 + i, name: SI_NAMES[i], dropsRemaining: drops }; }
  function siDone(i) { return { appId: 910000 + i, name: SI_NAMES[i] }; }
  var si = {
    available: true, unavailableReason: null, riskAcknowledged: true, steam: { running: true, signedIn: true },
    community: { session: 'signed_in', checkedAgeSeconds: 40 },
    farm: { state: 'idle', current: null, queue: [], done: [], failed: [], totalDropsRemaining: 0, lastReadAgeSeconds: null, lastError: null, paused: false, suspended: false },
    library: { count: 30, status: 'ready', ageSeconds: 120 },
    achievements: {
      acknowledged: true, settings: { minMinutes: 0, maxMinutes: 0, skipHidden: true },
      run: { state: 'idle', mode: null, current: null, nextUnlockInSeconds: null, queue: [], finished: [], totals: { unlocked: 0, already: 0, skipped: 0, rejected: 0, failed: 0 }, lastError: null, paused: false, suspended: false },
    },
    preview: { status: 'none', ageSeconds: null, error: null, games: [], totalDropsRemaining: 0 },
  };
  function siPreviewGames() {
    return [[0, 1, 0.4], [1, 2, 12.5], [2, 2, 3], [3, 3, 56], [4, 3, 110.2], [5, 4, 7]].map(function (r) { return { appId: 910000 + r[0], name: SI_NAMES[r[0]], dropsRemaining: r[1], playtimeHours: r[2] }; });
  }
  function siPreviewReady(games) {
    si.preview = { status: 'ready', ageSeconds: 0, error: null, games: games, totalDropsRemaining: games.reduce(function (n, g) { return n + g.dropsRemaining; }, 0) };
  }
  function siTotal() {
    var f = si.farm;
    f.totalDropsRemaining = f.queue.reduce(function (n, g) { return n + g.dropsRemaining; }, 0) + (f.current ? f.current.dropsRemaining : 0);
  }
  function siHold() {
    var f = si.farm;
    if (!f.queue.length) { f.current = null; f.state = 'done'; siTotal(); return; }
    f.current = Object.assign({ heldSeconds: 0 }, f.queue.shift());
    f.state = 'farming'; f.paused = false; f.suspended = false; f.lastError = null; siTotal();
  }
  function siFill() {
    var f = si.farm;
    f.queue = [siGame(0, 3), siGame(1, 4), siGame(2, 2), siGame(3, 3), siGame(4, 2)];
    f.done = [siDone(5), siDone(6)]; f.failed = []; f.lastReadAgeSeconds = 95;
  }
  var SI_LIB_NAMES = ['Lanternfall Chronicles', 'Brass Meridian', 'Hollow Orchard Tactics', SI_NAMES[3], 'Quiet Foundry', 'Pale Harbor', 'Ember Ledger', 'Tidewrack', 'Copper Orchard', 'Veil of Marrow',
    'Ninefold Station', 'Glasswater', 'Ashen Courier', 'Mossbridge', 'Paper Lighthouse', 'Kestrel Row', 'Dust Cathedral', 'Harrowmere', 'Old Salt Radio', 'Lowtide Ferry',
    'Ironbark Dispatch', 'Sundial Heist', 'Fennel & Flint', 'Cinder Choir', 'Westerly', 'Halcyon Mine', 'Thistledown', 'Orrery', 'Nightjar Yard', 'Underhill Post'];
  function siLibGames() { return SI_LIB_NAMES.map(function (n, i) { return { appId: 910100 + i, name: n, playtimeMinutes: (i * 137) % 2400 }; }); }
  function siLibGame(i) { return { appId: 910100 + i, name: SI_LIB_NAMES[i] }; }
  var SI_ACH_BASE = ['First light', 'Quiet hands', 'Tide table', 'Lamp keeper', 'Ledger balanced', 'Under the bridge', 'Last ferry', 'Long way round'];
  var SI_ACH_LONG = 'Collected every lantern in the Drowned Archive without ever lighting the north beacon or waking the keeper';
  var SI_ACH_LONG_DESC = 'Return to the archive after the third flood, carry all forty lanterns across the lower stacks in a single visit, and leave through the east gate before the bells finish ringing.';
  function siAchList(appId, big) {
    var n = big ? 260 : appId === 910100 ? 40 : appId === 910102 ? 0 : 8, out = [];
    for (var i = 0; i < n; i++) {
      var hidden = big ? i % 10 === 0 : appId === 910100 ? i % 7 === 4 : i === 3;
      var achieved = !big && (appId === 910100 ? i % 3 === 0 && i < 36 : i % 3 === 0);
      out.push({
        apiName: 'ACH_' + appId + '_' + i,
        name: i % 9 === 5 ? SI_ACH_LONG : SI_ACH_BASE[i % 8] + ' ' + (i + 1),
        description: hidden && i % 2 === 1 ? '' : i % 8 === 2 ? SI_ACH_LONG_DESC : 'Finish part ' + (i + 1) + ' of the story.',
        hidden: hidden, achieved: achieved, unlockTime: achieved ? 1700000000 + i * 259200 : 0,
      });
    }
    return out;
  }
  function siAchRun() { return si.achievements.run; }
  function siAchNext() {
    var r = siAchRun();
    if (r.queue.length) { var g = r.queue.shift(); r.current = { appId: g.appId, name: g.name, done: 0, total: 5 }; r.state = 'unlocking'; r.paused = false; }
    else { r.current = null; r.state = 'done'; }
  }
  function siAchFill(state) {
    var r = siAchRun();
    r.state = state; r.mode = 'selected';
    r.current = { appId: 910100, name: SI_LIB_NAMES[0], done: 3, total: 9 };
    r.queue = [1, 2, 3, 4].map(siLibGame);
    r.finished = [{ appId: 910107, name: SI_LIB_NAMES[7], unlocked: 4, skipped: 0, failed: 0, note: null }];
    r.totals = { unlocked: 7, already: 2, skipped: 1, rejected: 0, failed: 0 };
  }
  var siBig = siMode === 'achbig';
  if (siMode.indexOf('ach') === 0) { si.library = { count: 30, status: 'ready', ageSeconds: 300 }; }
  if (siMode === 'achgate') si.achievements.acknowledged = false;
  else if (siMode === 'achbadshape') si.achievements.run.state = 'exploding';
  else if (siMode === 'achnolib') si.library = { count: null, status: 'none', ageSeconds: null };
  else if (siMode === 'achrunning') siAchFill('unlocking');
  else if (siMode === 'achwaiting') { siAchFill('waiting'); si.achievements.settings.minMinutes = 10; si.achievements.settings.maxMinutes = 20; siAchRun().nextUnlockInSeconds = 720; }
  else if (siMode === 'achstopped') { siAchFill('stopped'); siAchRun().current = null; siAchRun().queue = []; siAchRun().lastError = 'unlock_uncertain'; }
  else if (siMode === 'achdone') {
    var rd = siAchRun();
    rd.state = 'done'; rd.mode = 'library';
    rd.finished = [
      { appId: 910100, name: SI_LIB_NAMES[0], unlocked: 28, skipped: 0, failed: 0, note: null },
      { appId: 910101, name: SI_LIB_NAMES[1], unlocked: 0, skipped: 0, failed: 0, note: 'no_achievements' },
      { appId: 910102, name: SI_LIB_NAMES[2], unlocked: 0, skipped: 0, failed: 0, note: 'nothing_missing' },
      { appId: 910103, name: SI_LIB_NAMES[3], unlocked: 0, skipped: 0, failed: 0, note: 'read_failed' },
      { appId: 910104, name: SI_LIB_NAMES[4], unlocked: 2, skipped: 6, failed: 1, already: 3, rejected: 1, note: 'skipped_by_user' },
    ];
    rd.totals = { unlocked: 30, already: 11, skipped: 6, rejected: 1, failed: 1 };
  } else if (siMode === 'noach') delete si.achievements;
  if (siMode === 'idle') { siPreviewReady(siPreviewGames()); si.preview.ageSeconds = 240; }
  else if (siMode === 'previewempty') { siPreviewReady([]); si.preview.ageSeconds = 240; }
  else if (siMode === 'previewscanning') si.preview.status = 'scanning';
  else if (siMode === 'previewfailed') { siPreviewReady(siPreviewGames().slice(0, 3)); si.preview.status = 'failed'; si.preview.error = 'timeout'; si.preview.ageSeconds = 900; }
  if (siMode === 'ack') si.riskAcknowledged = false;
  else if (siMode === 'signedout') { si.community = { session: 'signed_out', checkedAgeSeconds: 12 }; si.farm.state = 'needs_login'; }
  else if (siMode === 'mismatch') si.community = { session: 'account_mismatch', checkedAgeSeconds: 12 };
  else if (siMode === 'enginemissing') si.community = { session: 'engine_missing', checkedAgeSeconds: null };
  else if (siMode === 'unavailable') { si.available = false; si.unavailableReason = 'helper_missing'; si.steam = { running: false, signedIn: false }; si.community = { session: 'unknown', checkedAgeSeconds: null }; si.library = { count: null, status: 'none', ageSeconds: null }; }
  else if (siMode === 'badstate') { siFill(); si.farm.state = 'exploding'; siTotal(); }
  else if (siMode === 'farming' || siMode === 'slow' || siMode === 'hang' || siMode === 'nolibrary') { siFill(); siHold(); si.farm.current.heldSeconds = 1840; si.farm.current.dropsRemaining = 3; siTotal(); si.farm.totalDropsRemaining = 14; }
  else if (siMode === 'farmingmore') {
    siFill(); siHold(); si.farm.current.heldSeconds = 1840; siTotal();
    si.farm.refundHeld = [{ appId: 910007, name: 'Tidewrack', reason: 'refund_window', daysLeft: 1.4 }, { appId: 910008, name: SI_NAMES[3], reason: 'refund_window', daysLeft: 6 }];
    si.farm.failed = [{ appId: 910009, name: 'Copper Orchard', reason: 'no_progress' }, { appId: 910010, name: SI_NAMES[2], reason: 'presence_lost' }];
  }
  else if (siMode === 'suspended') { siFill(); si.farm.state = 'suspended'; si.farm.suspended = true; siTotal(); }
  else if (siMode === 'paused') { siFill(); si.farm.state = 'paused'; si.farm.paused = true; siTotal(); }
  else if (siMode === 'done') { si.farm.state = 'done'; si.farm.done = [0, 1, 2, 3, 4].map(siDone); si.farm.lastReadAgeSeconds = 20; }
  else if (siMode === 'error') { si.farm.state = 'stopped'; si.farm.lastError = 'read_failed'; si.farm.done = [siDone(5)]; si.farm.failed = [{ appId: 910003, name: SI_NAMES[3], reason: 'no_progress' }]; si.farm.lastReadAgeSeconds = 400; }
  function siReply(status, body) {
    return Promise.resolve({ ok: status < 400, status: status, json: function () { return Promise.resolve(body); }, text: function () { return Promise.resolve(JSON.stringify(body)); } });
  }
  function siCommand(cmd) {
    var f = si.farm;
    if (cmd === 'ack') si.riskAcknowledged = true;
    else if (cmd === 'login') si.community = { session: 'login_open', checkedAgeSeconds: null };
    else if (cmd === 'scan') {
      if (si.preview.status !== 'scanning') {
        si.preview.status = 'scanning'; si.preview.error = null;
        setTimeout(function () { siPreviewReady(siPreviewGames()); }, 1500);
      }
    }
    else if (cmd === 'check') si.community = { session: si.community.session === 'login_open' ? 'login_open' : 'signed_in', checkedAgeSeconds: 0 };
    else if (cmd === 'farm/start') { if (!f.queue.length && !f.current) siFill(); f.done = f.done.slice(0, 2); f.failed = []; siHold(); }
    else if (cmd === 'farm/stop') { f.state = 'stopped'; f.current = null; f.paused = false; }
    else if (cmd === 'farm/pause') { if (f.current) f.queue.unshift({ appId: f.current.appId, name: f.current.name, dropsRemaining: f.current.dropsRemaining }); f.current = null; f.state = 'paused'; f.paused = true; }
    else if (cmd === 'farm/resume') siHold();
    else if (cmd === 'farm/skip') { if (f.current) f.done.push({ appId: f.current.appId, name: f.current.name }); siHold(); }
    siTotal();
  }
  // The achievements commands: returns an error code and status for a refusal, null when the command went through.
  function siAchCommand(cmd, body) {
    var a = si.achievements, r = a.run, active = ['scanning', 'unlocking', 'waiting', 'paused', 'suspended'].indexOf(r.state) >= 0;
    if (cmd === 'achievements/ack') { a.acknowledged = !!(body && body.accepted); if (!a.acknowledged && active) { r.state = 'stopped'; r.current = null; r.queue = []; } }
    else if (cmd === 'achievements/settings') {
      var ok = body && [body.minMinutes, body.maxMinutes].every(function (n) { return typeof n === 'number' && n % 1 === 0 && n >= 0 && n <= 1440; }) && body.minMinutes <= body.maxMinutes && typeof body.skipHidden === 'boolean'
        && Object.keys(body).sort().join(',') === 'maxMinutes,minMinutes,skipHidden';
      if (!ok) return [400, 'invalid_request'];
      a.settings = { minMinutes: body.minMinutes, maxMinutes: body.maxMinutes, skipHidden: body.skipHidden };
    } else if (cmd === 'library/scan') {
      if (si.library.status !== 'scanning') {
        si.library = { count: null, status: 'scanning', ageSeconds: null };
        setTimeout(function () { si.library = { count: 30, status: 'ready', ageSeconds: 0 }; }, 1500);
      }
    } else if (cmd === 'achievements/start') {
      if (!a.acknowledged) return [409, 'achievements_not_acknowledged'];
      if (active) return [409, 'busy'];
      var b = body || {};
      // exactly the keys of one contract shape: an extra key is a client bug the service would refuse
      if (['appId,names', 'all,appId', 'confirm,exclude,library'].indexOf(Object.keys(b).sort().join(',')) < 0) return [400, 'invalid_request'];
      if (b.library === true) {
        if (b.confirm !== 'ALL' || !Array.isArray(b.exclude)) return [400, 'invalid_request'];
        r.mode = 'library';
        r.queue = siLibGames().filter(function (g) { return b.exclude.indexOf(g.appId) < 0; }).map(function (g) { return { appId: g.appId, name: g.name }; });
      } else if (typeof b.appId === 'number' && ((Array.isArray(b.names) && b.names.length >= 1 && b.names.length <= 200) || b.all === true)) {
        r.mode = b.all ? 'game' : 'selected';
        r.queue = [{ appId: b.appId, name: SI_LIB_NAMES[b.appId - 910100] || 'Game' }];
      } else return [400, 'invalid_request'];
      r.finished = []; r.totals = { unlocked: 0, already: 0, skipped: 0, rejected: 0, failed: 0 }; r.lastError = null; r.nextUnlockInSeconds = null;
      siAchNext();
      if (r.current && Array.isArray(b.names)) r.current.total = b.names.length;
    } else if (cmd === 'achievements/pause') { if (r.current) { r.state = 'paused'; r.paused = true; } }
    else if (cmd === 'achievements/resume') { if (r.state === 'paused') { r.state = 'unlocking'; r.paused = false; } }
    else if (cmd === 'achievements/skip') {
      if (r.current) { r.finished.unshift({ appId: r.current.appId, name: r.current.name, unlocked: r.current.done, skipped: r.current.total - r.current.done, failed: 0, note: 'skipped_by_user' }); r.totals.skipped += r.current.total - r.current.done; siAchNext(); }
    } else if (cmd === 'achievements/stop') { r.state = 'stopped'; r.current = null; r.queue = []; r.paused = false; r.nextUnlockInSeconds = null; }
    return null;
  }
  function steamIdleFetch(path, init, fullUrl) {
    var cmd = path.slice('/api/v1/steam-idle/'.length);
    if (init && init.method === 'POST') {
      window.__steamIdlePosts.push(cmd);
      var posted = init.body ? JSON.parse(init.body) : null;
      window.__steamIdleBodies.push({ cmd: cmd, body: posted });
      if (siMode === 'hang') return new Promise(function (res, rej) {
        if (init.signal) init.signal.addEventListener('abort', function () { rej(new DOMException('Aborted', 'AbortError')); });
      });
      if (q.get('steamidlepost')) return siReply(409, { error: q.get('steamidlepost') });
      if (si.achievements && (cmd.indexOf('achievements/') === 0 || cmd === 'library/scan')) {
        var refused = siAchCommand(cmd, posted);
        if (refused) return siReply(refused[0], { error: refused[1] });
      } else siCommand(cmd);
      return siReply(cmd === 'library/scan' ? 202 : 200, { ok: true });
    }
    siCalls += 1;
    if (siMode === 'down') return Promise.reject(new TypeError('Failed to fetch'));
    if (cmd === 'library' || cmd === 'achievements') {
      var code = q.get('steamidleget');
      if (code) return siReply(409, { error: code });
      // like the service: no reads through the helper while a run holds it
      if (si.achievements && ['scanning', 'unlocking', 'waiting', 'paused', 'suspended'].indexOf(si.achievements.run.state) >= 0) return siReply(409, { error: 'busy' });
      if (cmd === 'library') return si.library.status === 'ready' ? siReply(200, { games: siLibGames() }) : siReply(409, { error: 'not_ready' });
      if (!si.achievements || !si.achievements.acknowledged) return siReply(409, { error: 'achievements_not_acknowledged' });
      var wanted = Number(new URLSearchParams(String(fullUrl).split('?')[1] || '').get('appId'));
      return new Promise(function (res) { setTimeout(function () { res(siReply(200, { appId: wanted, achievements: siAchList(wanted, siBig) })); }, 400); });
    }
    var body = JSON.parse(JSON.stringify(si));
    body.busy = q.get('steamidlebusy') ? q.get('steamidlebusy') === '1' : ['farming', 'paused', 'suspended'].indexOf(si.farm.state) >= 0;
    if (siMode === 'nolibrary') delete body.library;
    if (siMode === 'slow' && siCalls === 1) return new Promise(function (res) { setTimeout(function () { res(siReply(200, body)); }, SLOW_MS); });
    return siReply(200, body);
  }
  var routes = { '/api/updates/check': update, '/api/state': state, '/api/v1/dimmer/state': dimmer, '/api/v1/giveaways/state': giveaways, '/api/game-directories': { directories: state.settings.game_directories } };
  var gMode = q.get('giveaways'), dMode = q.get('dimmer'), gCalls = 0, SLOW_MS = 8000;
  function failing(status) { return Promise.resolve({ ok: false, status: status, json: function () { return Promise.resolve({}); }, text: function () { return Promise.resolve(''); } }); }
  window.fetch = function (url, init) {
    var path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (path.indexOf('/api/v1/steam-idle/') === 0) return steamIdleFetch(path, init, url);
    if (path === '/api/settings' && init && init.method === 'POST') { Object.assign(state.settings, JSON.parse(init.body)); syncRewards(); return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ status: 'ok' }); }, text: function () { return Promise.resolve('{}'); } }); }
    if (path === '/api/v1/giveaways/browser' && init && init.method === 'POST') {
      var posted = JSON.parse(init.body);
      window.__browserPosts.push(posted);
      if (q.get('browserpost') === 'refuse') return failing(409);
      browserChoice = posted.browser;
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ status: 'ok', browser: browserChoice }); }, text: function () { return Promise.resolve('{}'); } });
    }
    if ((path === '/api/state' || path === '/api/updates/check') && (serviceMode === 'down' || (serviceMode === 'slow' && Date.now() < serviceUpAt))) return Promise.reject(new TypeError('Failed to fetch'));
    if (path === '/api/v1/giveaways/state' && gMode) {
      gCalls += 1;
      if (gMode === '500' || (gMode === '500once' && gCalls === 1) || (gMode === 'failafter' && gCalls > 1)) return failing(500);
      if (gMode === 'neterror') return Promise.reject(new TypeError('Failed to fetch'));
      var gBody = gMode === 'badshape' ? {} : gMode === 'empty'
        ? { runner: { state: 'idle', activeStores: [], pid: null, startedAt: null, headless: true }, scheduler: giveaways.scheduler, stores: {}, inventory: [], recentLogs: [], lastLogFile: null, fgcInstalled: true, totalClaimed: 0 }
        : giveaways;
      var gReply = { ok: true, status: 200, json: function () { return Promise.resolve(gBody); }, text: function () { return Promise.resolve(JSON.stringify(gBody)); } };
      return gMode === 'slow' ? new Promise(function (res) { setTimeout(function () { res({ ok: true, status: 200, json: function () { return Promise.resolve(giveaways); }, text: function () { return Promise.resolve(''); } }); }, SLOW_MS); }) : Promise.resolve(gReply);
    }
    if (path === '/api/logs' && logsMode) { var answer = logsAnswer(url); return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(answer); }, text: function () { return Promise.resolve(JSON.stringify(answer)); } }); }
    if (path === '/api/diagnostic-report') return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); }, text: function () { return Promise.resolve(diagReport()); } });
    var body = path === '/api/v1/giveaways/readiness' ? readinessBody(q.get('readiness'), /[?&]quick=1/.test(String(url))) : routes[path] || { status: 'ok' };
    if (path === '/api/state' && logsMode) body = JSON.parse(JSON.stringify(body));
    if (path === '/api/v1/giveaways/readiness' && q.get('readiness') === 'error') return Promise.resolve({ ok: false, status: 500, json: function () { return Promise.resolve({}); }, text: function () { return Promise.resolve(''); } });
    // the dimmer normally gets its state from the WebView2 host: replay it as a window message
    if (path === '/api/v1/dimmer/state' && dMode !== 'none') {
      var dState = dMode === 'empty' ? Object.assign({}, dimmer, { monitors: [] }) : dimmer;
      setTimeout(function () { window.postMessage({ type: 'DIMMER_STATE_CHANGED', state: dState }, '*'); }, dMode === 'slow' ? SLOW_MS : 30);
    }
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(body); }, text: function () { return Promise.resolve(JSON.stringify(body)); } });
  };
  window.EventSource = function () { this.addEventListener = function () {}; this.close = function () {}; };
})();

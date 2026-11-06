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
    version: '3.5.16', connected: true, user_id: '1', username: 'A_Very_Long_Twitch_Username_2026',
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
  var update = q.get('update') === '1' ? { update_available: true, local_version: '3.5.16', remote_version: '3.6.0', release_notes: '', error: null } : { update_available: false, local_version: '3.5.16', remote_version: '3.5.16', error: null };
  // the plain-text diagnostic report: many lines, a few of them very long (paths, URLs), like the real one
  function diagReport() {
    var out = ['==================================================', 'TWITCH DROPS SENTINEL v3.5.16 - DIAGNOSTIC REPORT', '==================================================', 'OS: Windows 11 (Build 10.0.26300)', 'Active Drop Name: Pouch of Violet Dust', 'RECENT LOGS:'];
    for (var n = 0; n < 120; n++) out.push('[06:' + (10 + n % 50) + ':00] [INFO] Line ' + n + (n % 17 === 0 ? ' C:/Users/someone/AppData/Local/Programs/TwitchDropsSentinel/core/cookies.jar [PRESENT] ' + new Array(12).join('segment-of-a-very-long-unbroken-path-name/') : ''));
    out.push('END OF DIAGNOSTIC REPORT');
    return out.join('\n');
  }
  var routes = { '/api/updates/check': update, '/api/state': state, '/api/v1/dimmer/state': dimmer, '/api/v1/giveaways/state': giveaways, '/api/game-directories': { directories: state.settings.game_directories } };
  var gMode = q.get('giveaways'), dMode = q.get('dimmer'), gCalls = 0, SLOW_MS = 8000;
  function failing(status) { return Promise.resolve({ ok: false, status: status, json: function () { return Promise.resolve({}); }, text: function () { return Promise.resolve(''); } }); }
  window.fetch = function (url, init) {
    var path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
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

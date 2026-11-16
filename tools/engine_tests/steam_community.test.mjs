// Steam Community session script: only the pure parts are tested (no browser is started, no network is used).
// Run: node --test tools/engine_tests/steam_community.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINE = path.join(ROOT, 'giveaways_engine');
const sc = await import(pathToFileURL(path.join(ENGINE, 'steam-community.js')).href);

test('parseArgs: login and status take no argument, dump needs exactly one outDir, anything else is rejected', () => {
  assert.deepEqual(sc.parseArgs(['login']), { command: 'login' });
  assert.deepEqual(sc.parseArgs(['status']), { command: 'status' });
  assert.deepEqual(sc.parseArgs(['dump', 'D:\\scratch\\x']), { command: 'dump', outDir: 'D:\\scratch\\x' });
  for (const bad of [[], ['dump'], ['dump', 'a', 'b'], ['login', 'x'], ['status', 'x'], ['nope'], ['']]) {
    assert.equal(sc.parseArgs(bad).error, 'usage', JSON.stringify(bad));
  }
});

test('outDir inside the engine folder is refused, a sibling or outside folder is allowed', () => {
  assert.equal(sc.isInside(ENGINE, ENGINE), true);
  assert.equal(sc.isInside(path.join(ENGINE, 'data', 'x'), ENGINE), true);
  assert.equal(sc.isInside(path.join(ENGINE, '..', 'giveaways_engine_other'), ENGINE), false);
  assert.equal(sc.isInside(path.join(ENGINE, '..'), ENGINE), false);
  assert.equal(sc.isInside(path.join(path.parse(ENGINE).root, 'scratch', 'x'), ENGINE), false);
});

test('isBadgesUrl: only /id/<x>/badges and /profiles/<n>/badges on steamcommunity.com', () => {
  const ok = [
    'https://steamcommunity.com/id/someone/badges',
    'https://steamcommunity.com/id/someone/badges/',
    'https://steamcommunity.com/profiles/76561190000000000/badges/?p=2',
    'https://steamcommunity.com/id/x/badges?p=1',
  ];
  const bad = [
    'https://steamcommunity.com/login/home/?goto=my%2Fbadges',
    'https://steamcommunity.com/my/badges',
    'https://steamcommunity.com/id//badges',
    'https://steamcommunity.com/id/x/badges/extra',
    'https://steamcommunity.com/id/x/games',
    'https://evil.example/id/x/badges',
    'https://steamcommunity.com.evil.example/id/x/badges',
    'https://store.steampowered.com/id/x/badges',
    'not a url',
    '',
  ];
  for (const url of ok) assert.equal(sc.isBadgesUrl(url), true, url);
  for (const url of bad) assert.equal(sc.isBadgesUrl(url), false, url);
});

test('isLoginUrl: a login path on steamcommunity.com', () => {
  assert.equal(sc.isLoginUrl('https://steamcommunity.com/login/home/?goto=x'), true);
  assert.equal(sc.isLoginUrl('https://steamcommunity.com/id/x/badges'), false);
});

test('page helpers: badge rows and the next-page link', () => {
  assert.equal(sc.hasBadgeRows('<div class="badge_row is_link">'), true);
  assert.equal(sc.hasBadgeRows('<div class="badge_empty"></div>'), false);
  assert.equal(sc.hasNextPage('<a class="pagebtn" href="https://x/badges/?p=2">&gt;</a>', 1), true);
  assert.equal(sc.hasNextPage('<span class="pagebtn disabled">&gt;</span>', 1), false);
  assert.equal(sc.hasNextPage('<a href="/badges/?p=12">', 1), false, 'p=12 is not p=1+1');
});

test('exitCode: ok 0, signed out 3, failure 4', () => {
  for (const s of ['signed_in', 'complete']) assert.equal(sc.exitCode(s), 0, s);
  for (const s of ['signed_out', 'closed']) assert.equal(sc.exitCode(s), 3, s);
  for (const s of ['failed', 'anything-else']) assert.equal(sc.exitCode(s), 4, s);
});

// ---- drops and library: pure parsing (fixtures are sanitized or synthetic, see the file headers) ----
const parse = await import(pathToFileURL(path.join(ENGINE, 'src', 'steam_community_parse.js')).href);
const fixture = name => readFileSync(path.join(ROOT, 'tools', 'engine_tests', 'fixtures', 'steam', name), 'utf8');

test('parseArgs: drops and library take no argument', () => {
  assert.deepEqual(sc.parseArgs(['drops']), { command: 'drops' });
  assert.deepEqual(sc.parseArgs(['library']), { command: 'library' });
  assert.equal(sc.parseArgs(['drops', 'x']).error, 'usage');
  assert.equal(sc.parseArgs(['library', 'x']).error, 'usage');
});

test('parseDropsText: the three English forms, anything else is null', () => {
  assert.equal(parse.parseDropsText('No card drops remaining'), 0);
  assert.equal(parse.parseDropsText('  1 card drop remaining\n\t'), 1);
  assert.equal(parse.parseDropsText('5 card drops remaining'), 5);
  assert.equal(parse.parseDropsText('1,234 card drops remaining'), 1234);
  for (const bad of ['', 'Карточки больше не выпадут', 'Card drops remaining: 3', '0 card drops remaining', 'no card drops', null, undefined]) {
    assert.equal(parse.parseDropsText(bad), null, String(bad));
  }
});

test('parseHours: commas and decimals, anything else is null', () => {
  assert.equal(parse.parseHours('&nbsp; 1,017 hrs on record'), 1017);
  assert.equal(parse.parseHours('0.3 hrs on record'), 0.3);
  assert.equal(parse.parseHours('1 hr on record'), 1);
  assert.equal(parse.parseHours('1,234.5 hrs on record'), 1234.5);
  for (const bad of ['', '1,017 ч. всего', 'hrs on record', null]) assert.equal(parse.parseHours(bad), null, String(bad));
});

test('decodeEntities: named, decimal and hex references', () => {
  assert.equal(parse.decodeEntities('Tom &amp; Jerry&#39;s &quot;Q&quot; &lt;b&gt; &#x41;&#66; &nbsp;x'), 'Tom & Jerry\'s "Q" <b> AB  x');
  assert.equal(parse.decodeEntities('&amp;amp;'), '&amp;', 'decoded once');
});

test('parseBadgesPage: the real no-drops page yields one game row and skips the community badge', () => {
  const page = parse.parseBadgesPage(fixture('badges-no-drops.html'));
  assert.deepEqual(page.rows, [{ appId: 386180, name: 'Crossout Remastered', dropsRemaining: 0, playtimeHours: 1017 }]);
  assert.equal(page.hasNext, false);
});

test('parseBadgesPage: synthetic page with 5 / 1 / 0 drops, entities, comma hours and a next link', () => {
  const page = parse.parseBadgesPage(fixture('badges-synthetic.html'));
  assert.deepEqual(page.rows, [
    { appId: 1000, name: 'Tom & Jerry\'s "Quest"', dropsRemaining: 5, playtimeHours: 1234.5 },
    { appId: 2000, name: 'Second Game', dropsRemaining: 1, playtimeHours: 0.3 },
    { appId: 3000, name: 'Third Game', dropsRemaining: 0, playtimeHours: 12 },
  ]);
  assert.equal(page.hasNext, true);
  assert.equal(parse.parseBadgesPage(fixture('badges-synthetic.html'), 2).hasNext, false, 'no p=3 link');
});

test('parseBadgesPage: unknown drops text, missing appId, missing name and bad hours fail with unparsed_row', () => {
  const synthetic = fixture('badges-synthetic.html');
  const cases = {
    unknown: fixture('badges-unknown-drops.html'),
    noAppId: synthetic.replace('/gamecards/1000/', '/gamecards/'),
    noName: synthetic.replace('Third Game', ''),
    badHours: synthetic.replace('12 hrs on record', '12 ч. всего'),
  };
  for (const [label, html] of Object.entries(cases)) {
    assert.throws(() => parse.parseBadgesPage(html), error => error.code == 'unparsed_row', label);
  }
});

test('parseBadgesPage: foil rows are skipped, a duplicate appId keeps the first, a row without playtime is 0 hours', () => {
  const row = (id, extra, hours = '<div class="badge_title_stats_playtime">&nbsp; 3 hrs on record</div>') => `<div class="badge_row is_link"><a class="badge_row_overlay" href="https://steamcommunity.com/profiles/P/gamecards/${id}/${extra}"></a>`
    + `${hours}<div class="badge_title_stats_drops"><span class="progress_info_bold">2 card drops remaining</span></div>`
    + `<div class="badge_title">G${id} &nbsp;<span class="badge_view_details">x</span></div></div>`;
  const page = parse.parseBadgesPage(row(7, '?border=1') + row(8, '') + row(8, '') + row(9, '', ''));
  assert.deepEqual(page.rows.map(r => r.appId), [8, 8, 9], 'dedupe is the caller job; foil 7 skipped');
  assert.equal(page.rows[2].playtimeHours, 0);
});

test('parseBadgesPage: a login page has no rows', () => {
  assert.deepEqual(parse.parseBadgesPage(fixture('login-page.html')), { rows: [], hasNext: false });
  assert.equal(sc.hasBadgeRows(fixture('login-page.html')), false);
});

test('parseLibrary: three games from the embedded data, sorted by appId', () => {
  assert.deepEqual(parse.parseLibrary(fixture('library-sample.html')), [
    { appId: 730, name: 'Counter-Strike 2', playtimeMinutes: 61222 },
    { appId: 8500, name: 'EVE Online', playtimeMinutes: 0 },
    { appId: 230410, name: 'Warframe', playtimeMinutes: 61018 },
  ]);
});

const libraryHtml = (data, key = 'OwnedGames') => {
  const queryData = JSON.stringify({ queries: [{ queryKey: [key, 'P', 'english'], state: { data } }] });
  return `<script type="application/json" id="valve-ssr-data">${JSON.stringify({ renderContext: { queryData } })}</script>`;
};

test('parseLibrary: zero games is valid, absent or malformed data is library_unparsed', () => {
  assert.deepEqual(parse.parseLibrary(libraryHtml([])), []);
  const g = { appid: 1, name: 'A', playtime_forever: 5 };
  const bad = {
    noScript: '<html></html>',
    notJson: '<script type="application/json" id="valve-ssr-data">{oops</script>',
    noQuery: libraryHtml([g], 'Other'),
    notArray: libraryHtml({ games: [g] }),
    boolAppId: libraryHtml([{ ...g, appid: true }]),
    floatAppId: libraryHtml([{ ...g, appid: 1.5 }]),
    zeroAppId: libraryHtml([{ ...g, appid: 0 }]),
    noName: libraryHtml([{ appid: 1, playtime_forever: 5 }]),
    noPlaytime: libraryHtml([{ appid: 1, name: 'A' }]),
    negativePlaytime: libraryHtml([{ ...g, playtime_forever: -1 }]),
    stringPlaytime: libraryHtml([{ ...g, playtime_forever: '5' }]),
  };
  for (const [label, html] of Object.entries(bad)) {
    assert.throws(() => parse.parseLibrary(html), error => error.code == 'library_unparsed', label);
  }
  assert.deepEqual(parse.parseLibrary(libraryHtml([g, { ...g, name: 'dup' }])), [{ appId: 1, name: 'A', playtimeMinutes: 5 }], 'duplicate keeps first');
});

// ---- command-level mapping with an injected page fetcher ----
const noDelay = async () => {};
const fetcher = pages => {
  const urls = [];
  const fn = async url => {
    urls.push(url);
    const next = pages.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  fn.urls = urls;
  return fn;
};
const rowHtml = (id, drops, next = false) => `<div class="badge_row is_link"><a href="https://steamcommunity.com/profiles/P/gamecards/${id}/"></a>`
  + `<div class="badge_title_stats_playtime">1 hr on record</div><div class="badge_title_stats_drops"><span class="progress_info_bold">${drops}</span></div>`
  + `<div class="badge_title">G${id} &nbsp;<span class="badge_view_details">x</span></div></div>${next ? `<a class="pagebtn" href="https://x/badges/?p=${next}">&gt;</a>` : ''}`;

test('collectDrops: walks the pages with l=english, lists every row, keeps the first duplicate', async () => {
  const fetch = fetcher([rowHtml(1, '2 card drops remaining', 2), rowHtml(2, 'No card drops remaining') + rowHtml(1, '9 card drops remaining')]);
  const result = await sc.collectDrops(fetch, noDelay);
  assert.deepEqual(result, { status: 'complete', pages: 2, games: [
    { appId: 1, name: 'G1', dropsRemaining: 2, playtimeHours: 1 },
    { appId: 2, name: 'G2', dropsRemaining: 0, playtimeHours: 1 },
  ] });
  assert.deepEqual(fetch.urls, ['https://steamcommunity.com/my/badges/?p=1&l=english', 'https://steamcommunity.com/my/badges/?p=2&l=english']);
});

test('collectDrops: signed out, a failing page, an unparsed row, an empty page and the page cap all fail the whole command', async () => {
  assert.deepEqual(await sc.collectDrops(fetcher([null]), noDelay), { status: 'signed_out' });
  assert.deepEqual(await sc.collectDrops(fetcher([rowHtml(1, '1 card drop remaining', 2), null]), noDelay), { status: 'signed_out' });
  const http = Object.assign(new Error('x'), { code: 'http_503' });
  assert.deepEqual(await sc.collectDrops(fetcher([rowHtml(1, '1 card drop remaining', 2), http]), noDelay), { status: 'failed', error: 'http_503', page: 2 });
  assert.deepEqual(await sc.collectDrops(fetcher([rowHtml(1, 'Soon', 0)]), noDelay), { status: 'failed', error: 'unparsed_row', page: 1 });
  assert.deepEqual(await sc.collectDrops(fetcher([fixture('login-page.html')]), noDelay), { status: 'failed', error: 'no_badge_rows', page: 1 });
  const endless = Array.from({ length: 60 }, (_, i) => rowHtml(i + 1, '1 card drop remaining', i + 2));
  assert.deepEqual(await sc.collectDrops(fetcher(endless), noDelay), { status: 'failed', error: 'page_cap', page: 40 });
});

test('collectLibrary: complete, signed out, load failure and unparsed data', async () => {
  const ok = await sc.collectLibrary(fetcher([fixture('library-sample.html')]));
  assert.equal(ok.status, 'complete');
  assert.equal(ok.count, 3);
  assert.deepEqual(ok.games.map(g => g.appId), [730, 8500, 230410]);
  assert.deepEqual(await sc.collectLibrary(fetcher([libraryHtml([])])), { status: 'complete', count: 0, games: [] });
  assert.deepEqual(await sc.collectLibrary(fetcher([null])), { status: 'signed_out' });
  assert.deepEqual(await sc.collectLibrary(fetcher([Object.assign(new Error('x'), { code: 'load_failed' })])), { status: 'failed', error: 'load_failed', page: 'games' });
  assert.deepEqual(await sc.collectLibrary(fetcher(['<html></html>'])), { status: 'failed', error: 'library_unparsed', page: 'games' });
  const fetch = fetcher([libraryHtml([])]);
  await sc.collectLibrary(fetch);
  assert.deepEqual(fetch.urls, ['https://steamcommunity.com/my/games/?tab=all&l=english']);
});

// ---- account match: --expect=<steamid64> compared with the id embedded in the fetched page ----
const FAKE_ID = '76561190000000001';
const OTHER_ID = '76561190000000002';
const withId = (id, html) => `<script>g_steamID = "${id}";</script>${html}`;

test('extractSteamId: the 17-digit g_steamID of the page, null for a signed-out page or anything else', () => {
  assert.equal(parse.extractSteamId(fixture('badges-synthetic.html')), FAKE_ID);
  assert.equal(parse.extractSteamId(fixture('library-sample.html')), FAKE_ID);
  assert.equal(parse.extractSteamId(fixture('login-page.html')), null);
  for (const bad of ['', 'g_steamID = "123";', 'g_steamID = "765611900000000011";', 'var other = "76561190000000001";', null]) {
    assert.equal(parse.extractSteamId(bad), null, String(bad));
  }
});

test('parseArgs: --expect needs 17 digits and only status, drops and library accept it', () => {
  for (const command of ['status', 'drops', 'library']) {
    assert.deepEqual(sc.parseArgs([command, `--expect=${FAKE_ID}`]), { command, expect: FAKE_ID });
  }
  for (const bad of [['drops', '--expect='], ['drops', '--expect=123'], ['login', `--expect=${FAKE_ID}`],
    ['dump', 'x', `--expect=${FAKE_ID}`], ['drops', `--expect=${FAKE_ID}`, 'x'], ['drops', `--other=${FAKE_ID}`]]) {
    assert.equal(sc.parseArgs(bad).error, 'usage', JSON.stringify(bad));
  }
});

test('exitCode: account_mismatch is 5', () => {
  assert.equal(sc.exitCode('account_mismatch'), 5);
});

test('collectDrops with expect: a match passes, another or a missing id is account_mismatch without the id in the result', async () => {
  const page = withId(FAKE_ID, rowHtml(1, '1 card drop remaining'));
  assert.equal((await sc.collectDrops(fetcher([page]), noDelay, FAKE_ID)).status, 'complete');
  const other = await sc.collectDrops(fetcher([page]), noDelay, OTHER_ID);
  const none = await sc.collectDrops(fetcher([rowHtml(1, '1 card drop remaining')]), noDelay, FAKE_ID);
  assert.deepEqual([other, none], [{ status: 'account_mismatch' }, { status: 'account_mismatch' }]);
});

test('collectDrops with expect: signed out stays signed_out, without expect the id is not checked', async () => {
  assert.deepEqual(await sc.collectDrops(fetcher([null]), noDelay, FAKE_ID), { status: 'signed_out' });
  assert.equal((await sc.collectDrops(fetcher([rowHtml(1, '1 card drop remaining')]), noDelay)).status, 'complete');
});

test('collectLibrary with expect: match, mismatch and signed out', async () => {
  assert.equal((await sc.collectLibrary(fetcher([fixture('library-sample.html')]), FAKE_ID)).status, 'complete');
  assert.deepEqual(await sc.collectLibrary(fetcher([fixture('library-sample.html')]), OTHER_ID), { status: 'account_mismatch' });
  assert.deepEqual(await sc.collectLibrary(fetcher([null]), FAKE_ID), { status: 'signed_out' });
});

test('collectStatus: signed_in only for the expected id, signed_out on a login page, failures keep their code', async () => {
  const page = withId(FAKE_ID, '<html></html>');
  assert.deepEqual(await sc.collectStatus(fetcher([page]), FAKE_ID), { status: 'signed_in' });
  assert.deepEqual(await sc.collectStatus(fetcher([page]), OTHER_ID), { status: 'account_mismatch' });
  assert.deepEqual(await sc.collectStatus(fetcher([null]), FAKE_ID), { status: 'signed_out' });
  assert.deepEqual(await sc.collectStatus(fetcher([Object.assign(new Error('x'), { code: 'http_503' })]), FAKE_ID), { status: 'failed', error: 'http_503', page: 1 });
});

// Shapes seen on a real account with many games: a never-played game has an empty playtime cell, and a game with no
// drops left has an empty drops cell instead of "No card drops remaining".
test('parseBadgesPage: an empty playtime cell is 0 hours and an empty drops cell is 0 drops', () => {
  const row = (id, playtime, drops) => `<div class="badge_row is_link"><a class="badge_row_overlay" href="https://steamcommunity.com/profiles/P/gamecards/${id}/"></a>`
    + `<div class="badge_title_stats_playtime"> ${playtime} </div><div class="badge_title_stats_drops"> ${drops} </div>`
    + `<div class="badge_title">G${id} &nbsp;<span class="badge_view_details">View details</span></div></div>`;
  const page = parse.parseBadgesPage(row(1, '&nbsp;', '<span class="progress_info_bold">6 card drops remaining</span>') + row(2, '&nbsp; 4,114 hrs on record', ''));
  assert.deepEqual(page.rows, [
    { appId: 1, name: 'G1', dropsRemaining: 6, playtimeHours: 0 },
    { appId: 2, name: 'G2', dropsRemaining: 0, playtimeHours: 4114 },
  ]);
});

// A library of thousands of games is a page of tens of megabytes: a navigated page loses its body, a request does not.
test('fetchHtml reads the page through the context request API with the browser cookies', async () => {
  const calls = [];
  const reply = (url, status, body) => ({ url: () => url, status: () => status, text: async () => body });
  const page = answer => ({ context: () => ({ request: { get: async (url, options) => { calls.push([url, options?.timeout]); return answer(url); } } }) });
  const BADGES = 'https://steamcommunity.com/my/badges/?l=english';
  assert.equal(await sc.fetchHtml(page(url => reply(url, 200, '<html>ok</html>')), BADGES), '<html>ok</html>');
  assert.equal(calls[0][0], BADGES);
  assert.ok(calls[0][1] > 0, 'a timeout is passed');
  assert.equal(await sc.fetchHtml(page(() => reply('https://steamcommunity.com/login/home/?goto=my', 200, 'login')), BADGES), null);
  await assert.rejects(sc.fetchHtml(page(url => reply(url, 503, '')), BADGES), error => error.code == 'http_503');
  await assert.rejects(sc.fetchHtml(page(() => { throw new Error('net down'); }), BADGES), error => error.code == 'load_failed');
});

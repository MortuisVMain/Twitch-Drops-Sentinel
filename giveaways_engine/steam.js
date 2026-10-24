// Steam periodically runs "Free to Keep" promotions: a normally paid game is 100% off for a few days
// and can permanently be added to your account while the promotion lasts. This script signs in
// interactively (with Steam Guard support), finds those games and claims them.
// Permanently free-to-play games are not claimed (excluded via `hidef2p=1`).

import { launchContext } from './src/browser.js';
import { jsonDb, datetime, filenamify, prompt, confirm, notify, html_game_list, handleSIGINT } from './src/util.js';
import { cfg } from './src/config.js';
import chalk from 'chalk';

const lavender = chalk.hex('#b57edc'); // color for game names
const pastelGreen = chalk.hex('#77dd77'); // color for "already in library" messages

console.log(datetime(), 'started checking steam');

const db = await jsonDb('steam.json', {});

// Pre-flight check: query Steam search API for 100% off games before launching browser
if (!cfg.show && !process.env.FGC_FORCE) {
  try {
    const searchUrl = 'https://store.steampowered.com/search/results/?query=&start=0&count=50&maxprice=free&specials=1&hidef2p=1&ndl=1&category1=998&cc=us&l=english&json=1';
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && (!data.items || data.items.length === 0)) {
        console.log('[Pre-Flight] Currently no 100% discount free-to-keep games on Steam.');
        console.log('[Pre-Flight] Skipping browser launch (fast exit in <500ms).');
        await new Promise(r => setTimeout(r, 50));
        process.exit(0);
      }
    }
  } catch {
    // Fall through to browser check if network check fails
  }
}

const URL_STORE = 'https://store.steampowered.com/?cc=us&l=english';
const URL_LOGIN = 'https://store.steampowered.com/login/';
// `specials=1` + `maxprice=free` -> only items that are currently 100% off; `hidef2p=1` excludes permanently
// free-to-play games, `category1=998` limits the results to games (no software/soundtracks)
const URL_FREE = 'https://store.steampowered.com/search/?sort_by=Reviews_DESC&maxprice=free&specials=1&hidef2p=1&ndl=1&category1=998&cc=us&l=english';

const context = await launchContext(cfg, {
  channel: 'chrome',
  headless: cfg.headless,
  locale: 'en-US',
  viewport: { width: cfg.width, height: cfg.height },
  recordVideo: cfg.record ? { dir: 'data/record/', size: { width: cfg.width, height: cfg.height } } : undefined,
  recordHar: cfg.record ? { path: `data/record/steam-${filenamify(datetime())}.har` } : undefined,
  handleSIGINT: false,
});
handleSIGINT(context);

if (!cfg.debug) context.setDefaultTimeout(cfg.timeout);

const page = context.pages().length ? context.pages()[0] : await context.newPage(); // should always exist

// The store's global header shows the account when signed in and a "sign in" link when not
const isSignedIn = async () => await page.locator('#account_pulldown').count() > 0;

// Steam's new login form uses hashed CSS-module classes, but the visible label texts are stable,
// so use accessible names instead of the generated class names
const signIn = async () => {
  console.error('Not signed in anymore.');
  await page.goto(URL_LOGIN, { waitUntil: 'domcontentloaded' });
  if (!cfg.debug) context.setDefaultTimeout(cfg.login_timeout); // give the user extra time to log in
  console.info(`Login timeout is ${cfg.login_timeout / 1000} seconds!`);
  if (cfg.steam_username && cfg.steam_password) console.info('Using account name and password from environment.');
  else console.info('Press ESC to skip the prompts if you want to login in the browser (not possible in headless mode).');
  const username = cfg.steam_username || await prompt({ message: 'Enter Steam account name' });
  const password = username && (cfg.steam_password || await prompt({ type: 'password', message: 'Enter password' }));
  if (!password) {
    console.log('Waiting for you to login in the browser.');
    await notify('steam: no longer signed in and not enough options set for automatic login.');
  } else {
    await page.getByLabel(/account name/i).fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Steam Guard can require a code sent by email (#authcode), a code from the mobile authenticator
    // (#twofactorcode_entry), or an approval in the Steam mobile app (no input field at all).
    console.log('Waiting for Steam Guard: approve the logon in your Steam mobile app, or enter the code if Steam asks for one.');
    await Promise.any([
      page.locator('#authcode').waitFor({ state: 'visible' }),
      page.locator('#twofactorcode_entry').waitFor({ state: 'visible' }),
      page.locator('#account_pulldown').waitFor({ state: 'attached' }), // no Steam Guard required
    ]).catch(_ => { }); // none appeared (yet), e.g. waiting for approval in the mobile app or a wrong password
    const twoFactor = page.locator('#twofactorcode_entry');
    const emailCode = page.locator('#authcode');
    if (await twoFactor.isVisible().catch(_ => false) || await emailCode.isVisible().catch(_ => false)) {
      const useEmailCode = !await twoFactor.isVisible().catch(_ => false);
      console.log(useEmailCode ? 'Steam Guard - Enter the code sent to your email.' : 'Steam Guard - Enter the code from your mobile authenticator.');
      const code = await prompt({ message: 'Enter Steam Guard code' });
      const field = useEmailCode ? emailCode : twoFactor;
      await field.fill(code);
      await field.press('Enter');
    } else if (!await isSignedIn()) {
      console.log('No code requested - approve the logon in your Steam mobile app. Waiting until signed in...');
    }
  }
  // wait until we are signed in again, no matter whether automatically or manually in the browser
  await page.waitForSelector('#account_pulldown', { timeout: cfg.login_timeout }).catch(_ => { });
};

const notify_games = [];
let user;

try {
  await page.goto(URL_STORE, { waitUntil: 'domcontentloaded' });
  if (!await isSignedIn()) await signIn();
  // `persona_name` is the public name (e.g. 'Ralf'), but `account_name` in the dropdown is the unique account
  user = (await page.locator('#account_pulldown').textContent()).trim();
  console.log(`Signed in as ${user}`);
  db.data[user] ||= {};

  // find free-to-keep games
  console.log('Checking free-to-keep games...');
  await page.goto(URL_FREE, { waitUntil: 'domcontentloaded' });

  // extract listing URLs; returns an empty list when no games match the search
  const urls = await page.$$eval('#search_resultsRows a', els => els.map(a => a.href));
  console.log(`Found ${urls.length} games.`);

  for (const url of urls) {
    // Steam product URLs have the form: https://store.steampowered.com/app/<id>/<slug>/
    const [, , , , game_id, slug] = url.split('/');
    db.data[user][game_id] ||= { title: slug, time: datetime(), url, status: 'failed' };
    const notify_game = { title: slug, url, status: 'failed' };
    notify_games.push(notify_game);

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Age check: Steam asks "Please enter your birth date to continue:" on some store pages
    if (await page.locator('#ageDay').count() > 0) {
      await page.selectOption('#ageYear', '1990');
      await page.locator('#view_product_page_btn').click();
      await page.waitForLoadState('domcontentloaded');
    }

    // find the free purchase option on the game's page
    // permanently free-to-play games show "Free to Play", promotions show "100% off"
    const isFreeToKeep = await page.locator('.discount_pct:has-text("-100%")').count() > 0;
    const isAlreadyInLibrary = await page.locator('.game_area_already_owned').count() > 0;
    const title = await page.locator('.apphub_AppName').textContent().then(t => t.trim()).catch(_ => slug);
    notify_game.title = title;
    db.data[user][game_id].title = title;

    if (isAlreadyInLibrary) {
      console.log(pastelGreen(`  Already in library: "${title}"`));
      db.data[user][game_id].status = 'existed';
      notify_game.status = 'existed';
      continue;
    }

    if (!isFreeToKeep) {
      console.log(`  Not free to keep: "${title}"`);
      db.data[user][game_id].status = 'not_free';
      notify_game.status = 'not_free';
      continue;
    }

    console.log(lavender(`  Claiming free game: "${title}"...`));
    if (cfg.dryrun) {
      console.log('    DRYRUN=1 -> Skip claim!');
      notify_game.status = 'skipped';
      continue;
    }

    // click the "Add to Account" button on the 100% off package
    const claimBtn = page.locator('.game_area_purchase_game_wrapper:has(.discount_pct:has-text("-100%")) .btn_addtocart').first();
    await claimBtn.click();

    // wait for confirmation on the next page
    await page.waitForSelector('#add_to_cart_dialog, .game_purchase_action, #account_pulldown', { timeout: 15000 }).catch(_ => { });
    console.log(pastelGreen(`  >>> Claimed successfully: "${title}"!`));
    db.data[user][game_id].status = 'claimed';
    db.data[user][game_id].time = datetime();
    notify_game.status = 'claimed';
  }
} catch (error) {
  process.exitCode ||= 1;
  console.error('--- Exception in Steam claimer:', error);
  if (error.message && process.exitCode != 130) {
    notify(`Steam claimer failed: ${error.message.split('\n')[0]}`);
  }
} finally {
  await db.write();
  if (notify_games.filter(g => g.status != 'existed').length) {
    notify(`Steam (${user}):<br>${html_game_list(notify_games)}`);
  }
  await context.close();
}

console.log(datetime(), 'finished checking steam');

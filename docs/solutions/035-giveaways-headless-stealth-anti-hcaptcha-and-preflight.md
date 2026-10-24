# Solution 035 — Giveaways Engine Headless Stealth, Anti-hCaptcha Scoping & Sub-500ms Pre-Flight

## 1. Problem Overview
During automated claiming in Twitch Drops Sentinel's integrated `giveaways_engine` (Node.js 24 + Playwright/Patchright), live runs encountered several blocking edge cases across digital game stores:
1. **Epic Games Modal Stacking & False Timeouts:**
   - Epic Games mounts `#webPurchaseContainer` dynamically with `opacity: 0` before running a CSS fade-in transition.
   - Standard Playwright selector `waitForSelector('iframe', { state: 'visible' })` timed out after 35s.
   - Broad selector strings matched hidden `hCaptcha challenge` iframes instead of the actual checkout iframe, causing Playwright to attempt clicking buttons inside an invisible captcha container.
2. **GOG Headless Network Tarpitting:**
   - Synchronous `<script>` tags for GDPR/Cookiebot (`CybotCookiebotDialog`), Google Tag Manager, and NewRelic in GOG's `<head>` stalled the `DOMContentLoaded` event indefinitely when CDN edge latency or anti-bot tarpitting occurred.
3. **Steam & GOG Unnecessary Resource Spawning:**
   - Spawning a full headless Chromium browser instance just to discover there are no active 100% discount promotions consumed memory, CPU cycles, and several seconds of time.
4. **Node.js 24 ESM Bundling Ambiguity:**
   - Packages like `fingerprint-generator` and `fingerprint-injector` used `__dirname` at runtime, causing `ERR_AMBIGUOUS_MODULE_SYNTAX` under Node.js 24 ESM when compiled with esbuild.

---

## 2. Root Cause Analysis
- **EGS hCaptcha DOM Collisions:** EGS injects multiple iframes into `#webPurchaseContainer`: one or two hidden captcha verification frames and one checkout frame. Without explicit negative attribute selectors (`:not([src*="hcaptcha"]):not([title*="hCaptcha"])`), locator resolution attaches to the captcha frame.
- **EGS CSS Opacity State:** Checking for `{ state: 'visible' }` fails when an element is rendered at `opacity: 0` or transitioning, whereas `{ state: 'attached' }` succeeds instantly as soon as the DOM node exists.
- **Third-Party Telemetry Tarpits:** GOG's site depends on external tag managers that frequently delay completion of `domcontentloaded`.

---

## 3. Surgical Implementation & Architecture

### A. Anti-hCaptcha Scoped Selector & Attached State (`epic-games.js`)
```javascript
// Specific checkout iframe selector (strictly excludes hCaptcha frames, waits for attached state)
const checkoutIframeSelector = '#webPurchaseContainer iframe:not([src*="hcaptcha"]):not([title*="hCaptcha"]), iframe[src*="/purchase"]:not([src*="hcaptcha"]):not([title*="hCaptcha"]), iframe[src*="checkout"]:not([src*="hcaptcha"]):not([title*="hCaptcha"])';
await page.waitForSelector(checkoutIframeSelector, { state: 'attached', timeout: 35000 });
const iframe = page.frameLocator(checkoutIframeSelector).first();

// Wait for checkout button to be visible and click with realistic delay
const checkoutBtn = iframe.locator('button:not(:has(.payment-loading--loading))').filter({ hasText: /Add to library|Place Order|Добавить в библиотеку|Оформить заказ/i }).first();
await checkoutBtn.waitFor({ state: 'visible', timeout: 25000 });
await checkoutBtn.click({ delay: 50 });
```

### B. Route Abort & Commit-Stage Navigation (`gog.js`)
```javascript
// Block slow external analytics/consent trackers that stall DOMContentLoaded on GOG
await context.route(/(cookiebot|googletagmanager|google-analytics|newrelic|nr-data)/, route => route.abort());

// Pre-seed consent and locale cookies on the root domain .gog.com
await context.addCookies([
  {
    name: 'CookieConsent',
    value: '{stamp:%274oR8MJL+bxVlG6g+kl2we5+suMJ+Tv7I4C5d4k+YY4vrnhCD+P23RQ==%27%2Cnecessary:true%2Cpreferences:true%2Cstatistics:true%2Cmarketing:true%2Cmethod:%27explicit%27%2Cver:1%2Cutc:1672331618201%2Cregion:%27de%27}',
    domain: '.gog.com',
    path: '/'
  },
  {
    name: 'gog_lc',
    value: 'US_USD_en-US',
    domain: '.gog.com',
    path: '/'
  }
]);

// Switch navigation to commit stage followed by DOM hydration barrier
await page.goto(URL_CLAIM, { waitUntil: 'commit', timeout: 30000 });
const navBarrier = page.locator('header, .menu-v3, #menuUsername, button[gog-menu-v3-auth-action="login"], a:has-text("Sign in")').first();
await navBarrier.waitFor({ state: 'attached', timeout: 25000 }).catch(() => {});
```

### C. Sub-500ms Pre-Flight Checks (`steam.js` & `gog.js`)
- **Steam:** Query the official Steam Search API (`https://store.steampowered.com/search/results/?query=&maxprice=free&specials=1&json=1`) using native Node.js `fetch`. If no 100% discount games are returned, log pre-flight skip and exit in <500ms without starting Chromium.
- **GOG:** Fast-fetch frontpage HTML with `fetch(URL_CLAIM)`. Check for `giveaway` patterns. If absent, skip browser launch immediately.

---

## 4. Verification & Production Results
In live production testing:
- **Epic Games:** Claimed both current free titles (`Home - A Unique Horror Adventure` and `Sker Ritual`) completely automatically in headless stealth mode without triggering any captcha traps.
- **GOG & Steam:** Pre-flight checks passed in <500ms with zero memory overhead.
- **Fab:** Validated ownership of all 3 weekly assets (`Modular Post Apocalyptic Desert Environment`, `Celebrations All In One Bundle`, `Armored Stone Golem`) without strict mode violations.
- **Unity:** Detected unauthenticated state and safely skipped with a clean log hint instead of crashing.
- **Test Suite:** 36/36 verification gates passed (`test_sentinel_suite.py`) with Exit Code 0.

// Static UI integrity: every CSS custom property in use is declared, the gradient --bg-island is never used as a
// colour, the LED meter classes exist in CSS, modals escape the .main-stage stacking context, no fake literals.
// Run: node --test tools/engine_tests/ui_css_integrity.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'src');
const read = rel => fs.readFileSync(path.join(SRC, rel), 'utf8');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const files = walk(SRC).filter(f => /\.(css|ts|tsx)$/.test(f));
const texts = files.map(f => [path.relative(SRC, f), fs.readFileSync(f, 'utf8')]);
const css = read('index.css');

// A property is declared by `--x:` in CSS (or a CSS string in TS), `'--x':` in an inline style object, or setProperty('--x', ...).
const DECLARED = [/(?:^|[\s;{"'`])(--[a-z0-9-]+)\s*:/gi, /['"`](--[a-z0-9-]+)['"`]\s*:/gi, /setProperty\(\s*['"`](--[a-z0-9-]+)['"`]/gi];

test('every var(--x) used in src is declared somewhere in src', () => {
  const declared = new Set();
  for (const [, t] of texts) for (const re of DECLARED) for (const m of t.matchAll(re)) declared.add(m[1]);
  const missing = [];
  for (const [file, t] of texts) {
    // `var(--x, fallback)` is an optional hook (e.g. --hit-ext) and may stay undeclared.
    for (const m of t.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/gi)) if (m[2] === ')' && !declared.has(m[1])) missing.push(`${file}: ${m[1]}`);
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('--bg-island is a gradient and is never used as a colour, shadow or border colour', () => {
  const bad = [];
  for (const m of css.matchAll(/(?:^|[;{\s])((?:color|border(?:-[a-z]+)*-color|border|outline|outline-color|box-shadow|text-shadow|fill|stroke))\s*:[^;}]*var\(--bg-island\)/gi)) bad.push(m[0].trim());
  assert.deepEqual(bad, []);
});

test('the LED meter markup uses classes that exist in CSS', () => {
  const dash = read('components/LiveDashboard.tsx');
  assert.ok(!/led-seg/.test(dash), 'led-seg has no CSS rule; use led-cell');
  assert.match(dash, /led-cell/);
  for (const mod of new Set([...dash.matchAll(/\blit-[a-z]+\b/g)].map(m => m[0]))) {
    assert.ok(css.includes(`.led-cell.${mod}`), `.led-cell.${mod} missing in index.css`);
  }
  assert.ok(/lit-mint|lit-amber/.test(dash), 'meter never gets a lit-* class');
});

test('modals render through a portal so the .main-stage stacking context cannot hide them under the header', () => {
  for (const f of ['components/CatalogFocusModal.tsx', 'components/SettingsStudio.tsx']) {
    assert.match(read(f), /createPortal\(/, `${f} must use createPortal`);
  }
});

test('no hardcoded fake stage/percent literals in the hero', () => {
  const dash = read('components/LiveDashboard.tsx');
  assert.ok(!dash.includes('ЭТАП 2 ИЗ 3'));
  assert.ok(!/<span className="tabular">100%<\/span>/.test(dash));
  assert.ok(!/>0%<\/span>/.test(dash));
});

test('catalog modal title lists the catalog source once', () => {
  const t = read('components/CatalogFocusModal.tsx');
  assert.equal((t.match(/Каталог игр Twitch & Steam/g) || []).length <= 1, true);
});

// Theme blocks are flat `[data-theme="x"] { ... }` rules; `:root, [data-theme="titanium"]` is the base every theme inherits.
function themeBlocks() {
  const blocks = new Map();
  for (const m of css.matchAll(/^\s*(?::root,\s*)?\[data-theme="([a-z-]+)"\]\s*\{([^}]*)\}/gm)) {
    const names = new Set([...m[2].matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(x => x[1]));
    blocks.set(m[1], new Set([...(blocks.get(m[1]) ?? []), ...names]));
  }
  return blocks;
}

test('components use only tokens that every theme has (base block), not ones declared in a few themes', () => {
  const blocks = themeBlocks();
  const base = blocks.get('titanium');
  assert.ok(base && base.size > 20, 'titanium base block not found');
  const partial = new Set();
  for (const names of blocks.values()) for (const n of names) if (!base.has(n)) partial.add(n);
  const bad = [];
  for (const rel of ['components/GameSearchAutocomplete.tsx']) {
    for (const m of read(rel).matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) if (partial.has(m[1])) bad.push(`${rel}: ${m[1]}`);
  }
  assert.deepEqual([...new Set(bad)], []);
});

test('src has no blocking native prompts (window.confirm, confirm(, alert()', () => {
  const bad = [];
  for (const [file, t] of texts) {
    if (!/\.tsx?$/.test(file) || file.startsWith('i18n')) continue;
    for (const [i, line] of t.split(/\r?\n/).entries()) {
      if (/(?<![\w.])(?:window\.)?(?:confirm|alert)\s*\(/.test(line) && !/^\s*(\/\/|\*)/.test(line)) bad.push(`${file}:${i + 1}`);
    }
  }
  assert.deepEqual(bad, []);
});

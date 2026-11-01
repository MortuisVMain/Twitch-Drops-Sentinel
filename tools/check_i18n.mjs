// Fails when a Russian string in src/ has no English translation (src/i18n/en, src/i18n/patterns.ts).
// Usage: node tools/check_i18n.mjs [file-substring ...]   (no arguments = every file in src/)
import ts from 'typescript';
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');
const filters = process.argv.slice(2);
const cyrillic = /[А-Яа-яЁё]/;
// Intentionally left as is: each language names itself in its own language
const KEEP = new Set(['Русский']);
// Plural-form helpers return bare Russian words that only ever appear glued to a number; PATTERNS translate the whole phrase
const PLURAL_FORMS = new Set(['игра', 'игры', 'игр', 'дроп', 'дропа', 'дропов', 'кампания', 'кампании', 'кампаний', 'монитор', 'монитора', 'мониторов']);
// Templates whose placeholders hold Russian words: a realistic rendered sample instead of "1"
const TEMPLATE_SAMPLES = {
  '⭐ Приоритет обновлен: ': '⭐ Приоритет обновлен: Rust перемещен выше',
  'Ни для одной из ': 'Ни для одной из 3 игр очереди нет доступных кампаний',
  'Доступно вне очереди: ': 'Доступно вне очереди: 3 кампании',
};

globalThis.localStorage = { getItem: () => 'en', setItem() {} };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'i18n_check_')), 'i18n.mjs');
await build({ entryPoints: [path.join(srcDir, 'i18n', 'index.ts')], bundle: true, format: 'esm', outfile: bundle, logLevel: 'silent' });
const { translate } = await import(pathToFileURL(bundle).href);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (e.name === 'i18n' ? [] : walk(path.join(dir, e.name))) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []);

const inConsole = (node) => {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && ts.isIdentifier(p.expression.expression) && p.expression.expression.text === 'console') return true;
    if (ts.isJsxElement(p) || ts.isBlock(p)) return false;
  }
  return false;
};

const problems = [];
let checked = 0;
for (const file of walk(srcDir)) {
  const rel = path.relative(srcDir, file).split(path.sep).join('/');
  if (filters.length && !filters.some((f) => rel.includes(f))) continue;
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const report = (node, text) => problems.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}  ${JSON.stringify(text)}`);
  const visit = (node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && cyrillic.test(node.text) && !inConsole(node)) {
      checked++;
      const text = node.text.trim();
      if (!KEEP.has(text) && !PLURAL_FORMS.has(text) && cyrillic.test(translate(text))) report(node, text);
    } else if (ts.isJsxText(node) && cyrillic.test(node.text)) {
      checked++;
      const text = node.text.replace(/[ \t\r\n]+/g, ' ').trim();
      if (!KEEP.has(text) && cyrillic.test(translate(text))) report(node, text);
    } else if (ts.isTemplateExpression(node) && !inConsole(node)) {
      const rendered = node.head.text + node.templateSpans.map((s) => '1' + s.literal.text).join('');
      const sample = Object.entries(TEMPLATE_SAMPLES).find(([head]) => node.head.text.startsWith(head))?.[1] ?? rendered;
      if (cyrillic.test(sample)) {
        checked++;
        if (cyrillic.test(translate(sample.trim()))) report(node, sample.trim());
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (problems.length) {
  console.error(`i18n: ${problems.length} untranslated string(s):\n` + problems.join('\n'));
  process.exit(1);
}
console.log(`i18n: ${checked} Russian strings checked, all have an English translation.`);

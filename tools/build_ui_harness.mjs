// Writes a COPY of dist/index.html with tools/ui_fixture.js and tools/check_overflow.js inlined, for the browser pane.
// Usage: node tools/build_ui_harness.mjs <out-dir>     then serve <out-dir> and open /index.html?lang=en&scale=130
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
if (!out) {
  console.error('usage: node tools/build_ui_harness.mjs <out-dir>');
  process.exit(2);
}
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('dist/index.html');
const inject = `<script>${read('tools/ui_fixture.js')}</script><script>${read('tools/check_overflow.js')}</script>`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html.replace('<head>', '<head>' + inject));
for (const f of fs.readdirSync(path.join(root, 'dist'))) if (f !== 'index.html') fs.copyFileSync(path.join(root, 'dist', f), path.join(out, f));
console.log('harness written to ' + out);

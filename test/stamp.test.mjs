// The deploy stamp must be current, or phones keep running cached modules (GitHub Pages max-age=600).
import assert from 'node:assert'; import { readFileSync } from 'node:fs';
import { computeStamp } from '../scripts/stamp.mjs';
const root = new URL('..', import.meta.url).pathname, s = computeStamp();
assert.equal(readFileSync(root + 'app.html', 'utf8'), s.html, 'app.html import map is stale: run node scripts/stamp.mjs');
assert.equal(readFileSync(root + 'index.html', 'utf8'), s.gateHtml, 'index.html gate values are stale: run node scripts/stamp.mjs');
assert.equal(readFileSync(root + 'js/build.js', 'utf8'), s.buildJs, 'js/build.js is stale: run node scripts/stamp.mjs');
assert.equal(readFileSync(root + 'version.json', 'utf8'), s.version, 'version.json is stale: run node scripts/stamp.mjs');
const map = JSON.parse(s.html.match(/<script type="importmap">(.*?)<\/script>/)[1]).imports;
for (const f of ['./config.js', './js/main.js', './js/storage.js', './js/vendor/supabase.js', './js/build.js']) assert.match(map[f], /\?v=[0-9a-f]{10}$/, f + ' is versioned');
assert.ok(s.html.indexOf('type="importmap"') < s.html.indexOf('type="module"'), 'import map precedes the module script');
console.log('ok deploy stamp current, build', s.build);

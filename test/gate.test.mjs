// Pre-launch gate config: the root (index.html) stays a passcode screen until LAUNCH_AT unless prelaunchLock is flipped off.
import assert from 'node:assert'; import { readFileSync } from 'node:fs';
import { FEATURES, LAUNCH_AT, TEAM_PASS_HASH, GM_PASS_HASH } from '../config.js';
import { computeStamp } from '../scripts/stamp.mjs';
const root = new URL('..', import.meta.url).pathname, s = computeStamp();
assert.equal(FEATURES.prelaunchLock, true, 'pre-launch lock is on');
assert.equal(LAUNCH_AT, '2026-10-22T15:30:00Z', 'gate auto-opens Thu Oct 22, 10:30 AM CT');
assert.equal(new Date(LAUNCH_AT).toLocaleString('en-US', { timeZone: 'America/Chicago' }), '10/22/2026, 10:30:00 AM');
assert.match(TEAM_PASS_HASH, /^[0-9a-f]{64}$/); assert.notEqual(TEAM_PASS_HASH, GM_PASS_HASH);
assert.deepEqual(s.G, { lock: true, at: LAUNCH_AT, h: [TEAM_PASS_HASH, GM_PASS_HASH] }, 'stamp copies the gate values from config.js');
const gate = readFileSync(root + 'index.html', 'utf8');
for (const bad of ['type="module"', 'importmap', 'style.css', 'supabase', 'js/', 'fonts.g', 'Floor', 'boss', 'hero', 'guild']) assert.ok(!gate.includes(bad), `gate page must not reference "${bad}"`);
assert.equal((gate.match(/<input/g) || []).length, 1, 'gate has a single field');
const app = readFileSync(root + 'app.html', 'utf8');
assert.ok(app.indexOf('<!--gate-->') < app.indexOf('<link') && app.indexOf('<!--gate-->') < app.indexOf('type="importmap"'), 'app.html guard runs before any asset or module');
console.log('ok pre-launch gate config');

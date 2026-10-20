// GM raid softener (client mirror): staff damage to the shared boss ≤ GM_SOFTEN_MULT × refPlayerDps(floor) × secs.
import assert from 'node:assert';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const L = await import('../js/loot.js'); const G = await import('../js/gm.js'); const { GM_SOFTEN_MULT } = await import('../config.js'); const fs = await import('node:fs');
assert.equal(GM_SOFTEN_MULT, 1.5); assert(Math.abs(L.REF_BASE - G.GM_STATS.atk) < 1e-9, 'reference base = class average');
assert(L.refPlayerDps(15) > L.refPlayerDps(11) && L.refPlayerDps(11) > 200);
assert.equal(L.softenGm(1e12, 60, 11, 1.5), Math.floor(1.5 * L.refPlayerDps(11) * 60)); assert.equal(L.softenGm(100, 60, 11), 100, 'below the cap: unchanged'); assert.equal(L.softenGm(5, 0, 11), 0);
const m = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
assert(/if \(!sanc && gmValid\) p\.damage = softenGm/.test(m) && /if \(!sanc0 && gmValid\) p\.damage = softenGm/.test(m), 'live and offline paths softened, never in the Sanctum');
const sql = fs.readFileSync(new URL('../supabase/schema-addendum-gm-softener-prelaunch.sql', import.meta.url), 'utf8'); assert(/gm_soft_mult numeric not null default 1\.5/.test(sql), 'server default matches config');
console.log('softener tests passed');

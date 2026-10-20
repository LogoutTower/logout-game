// Staff Sanctum client logic: gating, construct, DPS meters, sanitize. Server rules: schema-sanctum.pglite.mjs.
import assert from 'node:assert';
import { sanctumAllowed, inSanctum, newConstruct, hitConstruct, dpsMeters, SANCTUM, constructSprite } from '../js/sanctum.js'; import { sanitizeSave } from '../js/gm.js'; import { newHero } from '../js/game.js';
assert(!sanctumAllowed({ gmValid: false, serverRole: true }), 'needs the staff check'); assert(!sanctumAllowed({ gmValid: true, serverRole: false, local: false }), 'online: needs the server gm role');
assert(sanctumAllowed({ gmValid: true, serverRole: true })); assert(sanctumAllowed({ gmValid: true, local: true }), 'offline mode');
assert(!inSanctum({ sanctum: true }, false), 'flag alone does nothing'); assert(inSanctum({ sanctum: true }, true));
const c = newConstruct(10, 2), c2 = newConstruct(10, 1); assert.equal(c.max, 2 * c2.max); assert(newConstruct(150).max > newConstruct(100).max);
let t = 0; for (let i = 0; i < 20; i++) { t += 1000; hitConstruct(c, 100, t); } const m = dpsMeters(c, t); assert(Math.abs(m.live - 100) < 15, `live ${m.live}`); assert(Math.abs(m.avg - 100) < 10); assert.equal(m.total, 2000);
assert.equal(hitConstruct(c, c.max * 2.5, t + 1), 2, 'breaks and re-forms'); assert(c.hp > 0);
const s = { heroes: [newHero('P', 'Blade')], inv: [], sanctum: true }; sanitizeSave(s, false); assert(!('sanctum' in s), 'players are stripped of the flag');
assert(SANCTUM.alt.length >= 2 && constructSprite().startsWith('url('));
console.log('sanctum tests passed');

import assert from 'node:assert';
import { newHero, computeProgress, heroDps, applyXp } from '../js/game.js';
const h = newHero('T', 'Blade'), d = heroDps(h);
let p = computeProgress([h], 0, 3600e3, 12); assert.equal(p.secs, 3600); assert.equal(p.damage, Math.floor(d * 3600)); assert(!p.capped);
p = computeProgress([h], 0, 48 * 3600e3, 12); assert.equal(p.secs, 12 * 3600); assert(p.capped);
assert.equal(computeProgress([h], 1000, 500).damage, 0);
assert.deepEqual(computeProgress([h], 0, 1e6), computeProgress([h], 0, 1e6));
applyXp([h], 1000); assert(h.level > 1);
console.log('all offline tests passed');
// overflow damage carries to next floor
import { LocalBackend } from '../js/storage.js';
import { floorBossHp } from '../js/game.js';
const mem = {}; globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => mem[k] = v };
const be = new LocalBackend();
mem['logout.v1.world'] = JSON.stringify({ floor: 1, hp: 100, dmg: {}, t: Date.now() });
const r = await be.submitDamage('T', 600); assert.equal(r.floor, 2); const fakeSum = async () => (await be.leaderboard()).reduce((s, e) => s + e.damage, 0);
assert.equal(r.hp + await fakeSum(), floorBossHp(2) - 500);
assert.equal(r.clears[0].floor, 1); assert.equal(r.clears[0].dmg.T, 600);
mem['logout.v1.world'] = JSON.stringify({ floor: 1, hp: 1, dmg: {}, t: Date.now() });
const r2 = await be.submitDamage('T', 1 + floorBossHp(2) + 10); assert.equal(r2.floor, 3); const s2 = Object.entries(r2.clears[1].dmg).filter(([n]) => n !== 'T').reduce((x, [, d]) => x + d, 0);
assert.equal(r2.hp + await fakeSum(), floorBossHp(3) - 10 - s2);
// head start: new floors arrive pre-damaged by simulated players
mem['logout.v1.world'] = JSON.stringify({ floor: 1, hp: 1, dmg: {}, t: Date.now() });
const hs = await be.submitDamage('T', 1); assert.equal(hs.floor, 2); assert(hs.hp < floorBossHp(2) * 0.9 && hs.hp > floorBossHp(2) * 0.7, 'head start 10-30%');
delete mem['logout.v1.world']; const f0 = await be.getFloor(); assert(f0.hp < f0.maxHp * 0.9, 'fresh world has head start');
console.log('overflow tests passed');
// legacy handles in an old saved world are renamed to fantasy handles
mem['logout.v1.world'] = JSON.stringify({ floor: 1, hp: 5000, dmg: { 'kaito.exe': 7, Byte: 3, T: 1 }, t: Date.now() });
const names = (await be.leaderboard()).map(e => e.name);
assert(!names.includes('kaito.exe') && !names.includes('Byte') && names.includes('Kaelith') && names.includes('Ironbough'), 'legacy handles migrated');
console.log('legacy handle migration passed');

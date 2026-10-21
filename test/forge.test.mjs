import assert from 'node:assert';
import { upCost, forgeLocal, gainMats, nextCost, canForge, matName, dropTable } from '../js/forge.js';
import { heroDps, newHero } from '../js/game.js';
const W = (o = {}) => ({ id: 'w1', slot: 'weapon', rarity: 'rare', floor: 13, name: 'Blade', stats: { dps: 5 }, ...o });
for (let t = 1; t <= 5; t++) { const c = upCost(W(), t); assert.deepEqual(c.mats, {}); assert.equal(c.rate, 100); }
assert.deepEqual(upCost(W(), 6).mats, { shard: 10, ess2: 3 }); assert.deepEqual(upCost(W(), 10).mats, { core13: 6 }); assert.deepEqual(upCost(W(), 11).mats, { sigil20: 1 });
assert(!canForge({ slot: 'weapon', gm: true })); assert(!canForge({ slot: 'weapon', id: 'gm-katana' })); assert(!canForge({ slot: 'armor' }));
assert.equal(matName('ess1'), 'Ashen Essence'); assert.equal(matName('core7'), 'Floor 7 Core');
// local: fail keeps gold, level; burns mats
const h = newHero('A', 'Blade'); h.equip = { weapon: W({ up: 5 }) }; const s = { gold: 1e9, mats: { shard: 10, ess2: 3 }, heroes: [h] };
const d0 = heroDps(h); let r = forgeLocal(s, () => 99); assert(!r.ok); assert.equal(h.equip.weapon.up, 5); assert.equal(s.gold, 1e9); assert.equal(s.mats.shard, 0);
assert.throws(() => forgeLocal(s, () => 0), /materials/);
s.mats = { shard: 10, ess2: 3 }; r = forgeLocal(s, () => 0); assert(r.ok); assert.equal(h.equip.weapon.up, 6); assert(heroDps(h) > d0);
h.equip.weapon = W({ up: 10 }); s.mats.sigil20 = 1; r = forgeLocal(s, () => 50); assert(r.ok && h.equip.weapon.evo && h.equip.weapon.name.startsWith('Tideforged') === false);
assert.equal(nextCost(h.equip.weapon), null);
// GM gear never gains the upgrade multiplier
const g = newHero('G', 'Blade'); g.equip = { weapon: { slot: 'weapon', gm: true, up: 10, stats: { dps: 5 } } }; const g2 = newHero('G', 'Blade'); g2.equip = { weapon: { slot: 'weapon', gm: true, stats: { dps: 5 } } }; assert.equal(heroDps(g), heroDps(g2));
// drops: deterministic from time, no cores outside farm
const m = { }; gainMats(m, 3600, 5); assert.deepEqual(m.mats, { shard: 6, ess1: 1 }); gainMats(m, 3600, 5); assert.equal(m.mats.ess1, 3);
assert(!Object.keys(dropTable(5, false)).some(k => /core|sigil/.test(k))); assert('sigil10' in dropTable(10, true)); assert(!('sigil10' in dropTable(9, true)));
console.log('forge ok');

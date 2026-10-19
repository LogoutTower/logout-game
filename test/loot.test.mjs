import assert from 'node:assert';
import { rollDrops, rollItem, grantDrops, equipItem, salvageItem, salvageValue, rarityWeights, gearChance, RARITIES, INV_SIZE, COSMETIC_CHANCE } from '../js/loot.js';
import { migrateSave, SAVE_VERSION, DROP_COSMETICS, isUnlocked, byId } from '../js/cosmetics.js';
import { heroDps, newHero, gearBonus, offlineCap, computeProgress } from '../js/game.js';
import { rng, isUniqueSlot, bossInfo } from '../js/floors.js';
// reproducible: same inputs → identical drops
for (const f of [1, 7, 10, 37, 100]) assert.deepEqual(rollDrops({ heroId: 'x', floor: f, share: 0.08, seq: 3 }), rollDrops({ heroId: 'x', floor: f, share: 0.08, seq: 3 }));
assert.notDeepEqual(JSON.stringify([0, 1, 2, 3, 4, 5].map(s => rollDrops({ heroId: 'x', floor: 37, share: 0.5, seq: s }))), JSON.stringify([0, 1, 2, 3, 4, 5].map(() => rollDrops({ heroId: 'x', floor: 37, share: 0.5, seq: 0 }))), 'seq varies rolls');
// drop rate tracks damage share; zero share = no loot; unique floors better
const rate = (floor, share, N = 4000) => { let n = 0, c = 0; for (let s = 0; s < N; s++) { const d = rollDrops({ heroId: 'r', floor, share, seq: s }); n += d.items.length; c += d.cosmetic ? 1 : 0; } return { items: n / N, cos: c / N }; };
assert.equal(rate(5, 0, 500).items, 0); assert.equal(rate(5, 0, 500).cos, 0);
const lo = rate(5, 0.01), hi = rate(5, 0.12), uq = rate(20, 0.01);
assert(Math.abs(lo.items - gearChance(0.01, 5)) < 0.03, `low share rate ${lo.items}`); assert(Math.abs(hi.items - gearChance(0.12, 5)) < 0.03, `high share rate ${hi.items}`);
assert(hi.items > lo.items && uq.items > lo.items * 1.5, 'more share / unique floor → more drops');
assert(lo.cos > 0.01 && lo.cos < 0.05, `cosmetic chance ~3% (${lo.cos})`); assert(uq.cos > lo.cos * 0.9, 'unique floors cosmetic odds not lower');
// rarity weights: empirical distribution matches 60/25/10/4/1, unique floors shift up
const dist = floor => { const r = rng(99), c = RARITIES.map(() => 0), N = 20000; for (let i = 0; i < N; i++) { const id = rollItem(r, floor, 'fire', i).rarity; c[RARITIES.findIndex(x => x.id === id)]++; } return c.map(x => x / N); };
const dn = dist(5), w = rarityWeights(5), tot = w.reduce((a, b) => a + b);
dn.forEach((p, i) => assert(Math.abs(p - w[i] / tot) < 0.015, `rarity ${RARITIES[i].id} ${p}`));
const du = dist(50); assert(du[0] < dn[0] - 0.1 && du[4] > dn[4] * 1.5, 'unique floor rarity luck');
assert(isUniqueSlot(50) && !isUniqueSlot(5));
// items: base stat scales with floor, element tag matches the boss, 0-2 affixes
const a = rollItem(rng(1), 3, 'fire', 0), b = rollItem(rng(1), 60, 'fire', 0); assert.equal(a.slot, b.slot); assert(Object.values(b.stats)[0] > Object.values(a.stats)[0], 'floor scaling');
for (let f = 1; f <= 100; f++) { const d = rollDrops({ heroId: 'e', floor: f, share: 1, seq: 0 }); for (const it of d.items) { assert.equal(it.element, bossInfo(f).lootElement); assert(it.affixes.length <= 2); } }
// every element has a themed cosmetic drop, 6+ in total
assert(DROP_COSMETICS.length >= 6); for (const el of ['fire', 'frost', 'void', 'storm', 'venom', 'holy', 'blood', 'shadow']) assert(DROP_COSMETICS.some(c => c.unlock.drop === el), el);
// salvage: positive, increasing by rarity and floor
const it = r => ({ rarity: r, floor: 5 }); const vals = RARITIES.map(r => salvageValue(it(r.id))); vals.forEach((v, i) => i && assert(v > vals[i - 1])); assert(salvageValue({ rarity: 'rare', floor: 50 }) > salvageValue({ rarity: 'rare', floor: 5 }));
// migration v2 → v3 keeps progress, adds bag/equip/drops/aura
const v2 = { version: 2, gold: 9, lastTick: 1, heroes: [{ id: 'h', name: 'W', cls: 'Blade', level: 4, xp: 2, gear: 1, look: { skin: 'skin-1' } }], progress: { cleared: [1, 2], top3: [1], rank1: 1 } };
const s = migrateSave(v2); assert.equal(s.version, SAVE_VERSION); assert(SAVE_VERSION >= 3); assert.deepEqual(s.inv, []); assert.equal(s.lootSeq, 0);
assert.deepEqual(s.heroes[0].equip, { weapon: null, armor: null, trinket: null }); assert.equal(s.heroes[0].look.aura, 'au-none'); assert.deepEqual(s.progress.cleared, [1, 2]); assert.deepEqual(s.progress.drops, []);
const v1 = migrateSave({ heroes: [{ id: 'q', name: 'Q', cls: 'Vanguard', level: 1, xp: 0, gear: 0 }], gold: 0, lastTick: 1 }); assert.equal(v1.version, SAVE_VERSION); assert(v1.heroes[0].equip && v1.inv);
// grant, bag cap + auto-salvage, equip raises DPS, salvage pays gold, cosmetic unlocks
const before = heroDps(s.heroes[0]);
for (let i = 0; i < 80; i++) grantDrops(s, 10, 1);
assert.equal(s.inv.length, INV_SIZE, 'bag capped'); assert(s.gold > 9, 'overflow auto-salvaged to gold');
const wi = s.inv.findIndex(x => x.slot === 'weapon'); equipItem(s, wi); assert(heroDps(s.heroes[0]) > before, 'equipped weapon adds DPS'); assert.equal(s.inv.length, INV_SIZE - 1);
const g0 = s.gold, v = salvageValue(s.inv[0]); assert.equal(salvageItem(s, 0), v); assert.equal(s.gold, g0 + v);
const tri = s.inv.findIndex(x => x.slot === 'trinket'); if (tri >= 0) { equipItem(s, tri); const p = computeProgress(s.heroes, 0, 3600e3); assert(p.gold > Math.floor(p.damage * 0.1), 'trinket boosts gold'); }
assert(offlineCap(s.heroes, 12) >= 12 + gearBonus(s.heroes[0]).capH - 1e-9);
const owned = s.progress.drops; for (const id of owned) assert(isUnlocked(byId(id), s.progress));
console.log('loot tests passed');

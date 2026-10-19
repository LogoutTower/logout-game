// Unique rarity: generated one-of-a-kind weapons (rate, trickle exclusion, auto-salvage protection, names, every ability/drawback, forbidden pairs).
import assert from 'node:assert';
import { newHero, simulate, effectiveDps, heroDps, offlineCap, effectsOf, heroMaxHp, LOW_MUL, DRAIN_SECS } from '../js/game.js';
import { RARITIES, rarityWeights, rollItem, grantDrops, trickleDrops, TRICKLE, INV_SIZE, ABILITIES, ARMOR_ABILITIES, DRAWBACKS, FORBIDDEN, allowedPair, forgeUnique, salvageGold, salvageValue, equipItem } from '../js/loot.js';
import { innCost } from '../js/town.js';
import { rng } from '../js/floors.js';
import { migrateSave } from '../js/cosmetics.js';
const mk = () => migrateSave({ version: 2, heroes: [newHero('U', 'Blade')], gold: 0, lastTick: 0, progress: { cleared: [], top3: [], rank1: 0 } });
const U = RARITIES.findIndex(r => r.id === 'unique');
assert.equal(U, RARITIES.length - 1, 'Unique is the top tier');
// ---- rate over many seeded rolls: ~0.05% normal floors, ~0.15% special floors
const rate = (floor, N) => { const r = rng(7 + floor); let n = 0; for (let i = 0; i < N; i++) if (rollItem(r, floor, 'void', i).rarity === 'unique') n++; return n / N; };
const w5 = rarityWeights(5), w50 = rarityWeights(50), p5 = w5[U] / w5.reduce((a, b) => a + b), p50 = w50[U] / w50.reduce((a, b) => a + b);
assert(Math.abs(p5 - 0.0005) < 0.00001 && Math.abs(p50 - 0.0015) < 0.00001, `exact odds ${p5} ${p50}`);
const r5 = rate(5, 400000), r50 = rate(50, 200000);
assert(Math.abs(r5 - p5) < p5 * 0.25, `normal-floor unique rate ${r5}`); assert(Math.abs(r50 - p50) < p50 * 0.25, `special-floor unique rate ${r50}`);
// ---- never from the trickle (weights and a long simulated session)
assert.equal(TRICKLE.weights[U], 0);
{ const s = mk(); let got = 0; for (let k = 0; k < 4000; k++) { const out = trickleDrops(s, TRICKLE.secs, 50, Infinity); got += out.filter(i => i.rarity === 'unique').length; s.inv.length = 0; } assert.equal(got, 0, 'trickle never yields Unique'); }
// ---- boss kill: protected from auto-salvage even with a full bag
{ let found = null;
  for (let seq = 0; seq < 20000 && !found; seq++) { const s = mk(); s.lootSeq = seq; for (let i = 0; i < INV_SIZE; i++) s.inv.push(rollItem(rng(i), 1, 'fire', i, [1, 0, 0, 0, 0, 0]));
    const g0 = s.gold, d = grantDrops(s, 50, 1); if (d.items.some(i => i.rarity === 'unique')) found = { s, d, g0 }; }
  assert(found, 'a seeded boss kill yields a Unique');
  const u = found.d.items.find(i => i.rarity === 'unique');
  assert(found.s.inv.includes(u), 'Unique kept in bag'); assert(found.s.inv.length > INV_SIZE || found.d.items.length === 1, 'bag may overflow for Unique');
  assert(['weapon', 'armor'].includes(u.slot)); assert(u.stamp.includes('Floor 50') && u.serial && u.lore.startsWith('System notice'), 'stamp + serial + lore');
  // same seed → same Unique (reproducible)
  const t = mk(); t.heroes[0].id = found.s.heroes[0].id; t.lootSeq = found.s.lootSeq - 1; for (let i = 0; i < INV_SIZE; i++) t.inv.push(found.s.inv[i]); const again = grantDrops(t, 50, 1).items.find(i => i.rarity === 'unique'); assert.deepEqual(again, u);
}
// ---- generated names: distinct across seeds; ids/serials one of a kind; stats beat a Legendary of the same floor
{ const names = new Set(), ids = new Set(), N = 300; let legDps = 0;
  for (let i = 0; i < N; i++) { const it = rollItem(rng(1000 + i), 20, ['fire', 'frost', 'void', 'storm'][i % 4], i, [0, 0, 0, 0, 0, 1]); assert.equal(it.rarity, 'unique'); names.add(it.name); ids.add(it.id);
    assert(/^\S+ \S+ of the .+$/.test(it.name), `name shape: ${it.name}`); }
  assert(names.size >= N * 0.95, `names mostly unique (${names.size}/${N})`); assert.equal(ids.size, N, 'every id unique');
  for (let i = 0; i < 300; i++) { const it = rollItem(rng(i), 20, 'fire', i, [0, 0, 0, 0, 1, 0]); if (it.slot === 'weapon') legDps = Math.max(legDps, it.stats.dps); }
  assert(forgeUnique(20, 'fire', 'tenth', 'whisper').stats.dps > legDps, 'Unique base stats above Legendary');
}
// ---- forbidden pairs never roll; every ability and drawback can roll
{ const seenA = new Set(), seenD = new Set();
  for (let i = 0; i < 6000; i++) { const it = rollItem(rng(i * 31 + 5), 10, 'holy', i, [0, 0, 0, 0, 0, 1]); seenA.add(it.ability.id); seenD.add(it.drawback.id); assert(allowedPair(it.ability.id, it.drawback.id), `forbidden ${it.ability.id}+${it.drawback.id}`); }
  assert.equal(seenA.size, ABILITIES.length + ARMOR_ABILITIES.length); assert.equal(seenD.size, DRAWBACKS.length);
  assert(!allowedPair('lifesteal', 'drain') && !allowedPair('gold', 'poor') && !allowedPair('vigil', 'shortCap') && !allowedPair('scholar', 'dull'));
  for (const [a, ds] of Object.entries(FORBIDDEN)) { assert([...ABILITIES, ...ARMOR_ABILITIES].some(x => x.id === a)); for (const d of ds) assert(DRAWBACKS.some(x => x.id === d)); }
}
// ---- every ability and drawback applies (vs. the same weapon with neutral effect ids)
const withW = (ab, dr, ctx) => { const s = mk(), it = forgeUnique(10, 'storm', ab, dr); s.heroes[0].equip.weapon = it; if (ctx) s.ctx = ctx; return s; };
const neutral = (ab, dr, ctx) => { const s = withW(ab, dr, ctx), w = s.heroes[0].equip.weapon; s.heroes[0].equip.weapon = { ...w, stats: { dps: w.stats.dps, dpsPct: w.stats.dpsPct }, ability: { id: 'x' }, drawback: { id: 'y' } }; return s; };
const near = (a, b, msg, tol = 1e-6) => assert(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const ratio = (f, ab, dr, ctx) => f(withW(ab, dr, ctx)) / f(neutral(ab, dr, ctx));
const dps = s => effectiveDps(s), gold = s => simulate(s, 60).gold, xp = s => simulate(s, 60).xp, loss = s => { const m = heroMaxHp(s.heroes[0]); simulate(s, 100); return m - s.heroes[0].hp; };
near(ratio(dps, 'lastLayer', 'whisper', { bossPct: 0.1 }), 1.3, 'lastLayer on last layer'); near(ratio(dps, 'lastLayer', 'whisper', { bossPct: 0.6 }), 1, 'lastLayer off');
near(ratio(dps, 'tenth', 'whisper'), 1.1, 'tenth', 1e-3);
assert.equal(offlineCap(withW('vigil', 'whisper').heroes) - offlineCap(neutral('vigil', 'whisper').heroes), 6, 'vigil +6h');
{ const s = withW('ledger', 'whisper'), it = forgeUnique(5, 'fire', 'gold', 'heavy'); assert.equal(salvageGold(s, it), salvageValue(it) * 3, 'ledger x3'); }
{ const a = withW('hearth', 'whisper'), b = neutral('hearth', 'whisper'); a.buffs = { rested: 600 }; b.buffs = { rested: 600 };
  simulate(a, 60); simulate(b, 60); assert.equal(a.buffs.rested, 600, 'hearth: rested frozen above 50% HP'); near(b.buffs.rested, 540, 'rested decays normally');
  const c = withW('hearth', 'whisper'); c.heroes[0].hp = heroMaxHp(c.heroes[0]) * 0.4; c.buffs = { rested: 600 }; simulate(c, 60); near(c.buffs.rested, 540, 'hearth: decays below 50%'); }
near(ratio(loss, 'lifesteal', 'whisper'), 0.65, 'lifesteal slows drain');
{ let a = 0, b = 0; for (let seq = 0; seq < 4000; seq++) { const s = withW('luck', 'whisper'), t = neutral('luck', 'whisper'); s.lootSeq = t.lootSeq = seq; a += grantDrops(s, 5, 0.02).items.length; b += grantDrops(t, 5, 0.02).items.length; }
  assert(a / b > 1.15 && a / b < 1.35, `luck +25% drops (${(a / b).toFixed(3)})`); }
near(ratio(dps, 'momentum', 'whisper', { sessionSecs: 600 }), 1.1, 'momentum 10 min'); near(ratio(dps, 'momentum', 'whisper', { sessionSecs: 99999 }), 1.3, 'momentum cap');
near(ratio(dps, 'momentum', 'whisper', {}), 1, 'momentum resets (no session)');
near(ratio(dps, 'milestone', 'whisper', { special: true }), 1.5, 'milestone on special floor'); near(ratio(dps, 'milestone', 'whisper', { special: false }), 1, 'milestone off');
near(ratio(gold, 'gold', 'whisper'), 1.4, 'gold +40%'); near(ratio(xp, 'scholar', 'whisper'), 1.4, 'scholar +40%');
{ const w = s => { s.heroes[0].hp = 1; return effectiveDps(s); }; near(ratio(w, 'steady', 'whisper'), 0.85 / LOW_MUL, 'steady worn penalty'); }
near(ratio(loss, 'tenth', 'drain'), 1.2, 'drain +20%');
near(ratio(gold, 'lastLayer', 'poor'), 0.9, 'poor -10% gold');
{ const s = withW('lastLayer', 'innTax'); assert(innCost(30, s) > innCost(30), 'innTax'); near(innCost(30, s) / innCost(30), 1.25, 'innTax +25%', 0.02); }
assert.equal(offlineCap(withW('lastLayer', 'shortCap').heroes) - offlineCap(neutral('lastLayer', 'shortCap').heroes), -1, 'shortCap -1h');
near(ratio(xp, 'lastLayer', 'dull'), 0.95, 'dull -5% xp');
assert(effectsOf(withW('tenth', 'whisper').heroes[0]).has('whisper'), 'whisper flagged (UI chronicle quirk)');
{ const s = mk(), t = rollItem(rng(3), 5, 'fire', 't', [1, 0, 0, 0, 0, 0]); t.slot = 'trinket'; s.heroes[0].equip.trinket = t; s.inv.push(forgeUnique(5, 'fire', 'tenth', 'jealous'));
  assert(equipItem(s, 0)); assert.equal(s.heroes[0].equip.trinket, null, 'jealous unequips trinket'); assert(s.inv.includes(t));
  assert.equal(equipItem(s, s.inv.indexOf(t)), false, 'cannot equip trinket alongside'); }
near(heroDps(withW('gold', 'heavy').heroes[0]) / heroDps(neutral('gold', 'heavy').heroes[0]), 0.95, 'heavy -5% DPS', 1e-3);
console.log('unique tests passed');

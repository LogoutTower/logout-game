// Talent trees: point accrual, gating, rank caps, respec, every node's effect, offline parity, migration.
import assert from 'node:assert';
import { newHero, heroDps, heroMaxHp, simulate, effectiveDps, offlineCap, accrue, offlineProgress, restedMul, isWorn, LOW_MUL, RESTED, DRAIN_SECS } from '../js/game.js';
import { TREES, KEYS, nodeById, talentBonus, totalPoints, freePoints, canLearn, learn, spentIn, respec, respecCost } from '../js/talents.js';
import { innCost, rest, shopStock, priceFor, buy } from '../js/town.js';
import { grantDrops, salvageGold, salvageValue, rollItem } from '../js/loot.js';
import { migrateSave, SAVE_VERSION } from '../js/cosmetics.js';
import { rng } from '../js/floors.js';
const mk = (cls = 'Blade', level = 1) => { const h = newHero('T', cls); h.level = level; h.id = 'tal'; h.hp = null; return migrateSave({ version: 2, heroes: [h], gold: 1e9, lastTick: 0, progress: { cleared: [], top3: [], rank1: 0 } }); };
// ---- structure: 3 classes × 3 branches × ~5 nodes, unique ids, rank caps 1-3, gated tiers, capstones
assert.deepEqual(Object.keys(TREES), ['Vanguard', 'Blade', 'Arcanist']);
const ids = new Set();
for (const [cls, bs] of Object.entries(TREES)) { assert.equal(bs.length, 3, cls);
  for (const b of bs) { assert(b.nodes.length >= 4 && b.nodes.length <= 6); b.nodes.forEach((n, i) => { assert(!ids.has(n.id)); ids.add(n.id); assert(n.max >= 1 && n.max <= 3); assert.equal(n.req, i * 2); assert(n.desc.includes('System notice'));
    for (const k of Object.keys(n.eff)) assert(KEYS.includes(k), k); }); assert(b.nodes.at(-1).capstone && b.nodes.at(-1).max === 1); } }
assert.deepEqual(TREES.Vanguard.map(b => b.name), ['Bulwark', 'Warlord', 'Quartermaster']); assert.deepEqual(TREES.Blade.map(b => b.name), ['Edge', 'Shadowstep', 'Plunder']); assert.deepEqual(TREES.Arcanist.map(b => b.name), ['Ember', 'Ward', 'Scholar']);
// ---- point accrual: 1 per level from level 2
assert.equal(totalPoints(mk('Blade', 1).heroes[0]), 0); assert.equal(totalPoints(mk('Blade', 2).heroes[0]), 1); assert.equal(totalPoints(mk('Blade', 12).heroes[0]), 11);
// ---- gating + rank caps + class lock
{ const h = mk('Blade', 20).heroes[0];
  assert.equal(canLearn(h, 'ed-flurry'), 'needs 2 points in branch'); assert.equal(canLearn(h, 'vg-thick'), 'other class');
  assert(learn(h, 'ed-hone')); assert(learn(h, 'ed-hone')); assert(learn(h, 'ed-hone')); assert.equal(canLearn(h, 'ed-hone'), 'max rank'); assert(!learn(h, 'ed-hone'));
  assert.equal(spentIn(h, 'edge'), 3); assert(learn(h, 'ed-flurry')); assert.equal(canLearn(h, 'ed-cuts'), 'needs 8 points in branch');
  const p = mk('Blade', 1).heroes[0]; assert.equal(canLearn(p, 'ed-hone'), 'no points'); }
// ---- respec: first free, then gold scaled by floor
{ const s = mk('Blade', 10), h = s.heroes[0]; learn(h, 'ed-hone'); assert.equal(respecCost(h, 5), 0); const g = s.gold; assert(respec(s, 5)); assert.equal(s.gold, g); assert.equal(freePoints(h), 9);
  learn(h, 'ed-hone'); const c5 = respecCost(h, 5), c50 = respecCost(h, 50); assert(c5 > 0 && c50 > c5, 'paid respec scales with floor'); assert(respec(s, 5)); assert.equal(s.gold, g - c5);
  s.gold = 0; learn(h, 'ed-hone'); assert(!respec(s, 5), 'cannot afford'); }
// ---- Scholar bonus points add to the pool
{ const h = mk('Arcanist', 10).heroes[0]; ['sc-study', 'sc-study'].forEach(id => learn(h, id)); assert(learn(h, 'sc-margin')); assert.equal(totalPoints(h), 10); assert.equal(freePoints(h), 7); }
// ---- every node's effect applies (compare a hero with rank r vs none)
const withNode = (id, r, ctx) => { const n = nodeById(id), cls = Object.entries(TREES).find(([, bs]) => bs.some(b => b.id === n.branch))[0], s = mk(cls, 30); s.heroes[0].talents = { [id]: r }; if (ctx) s.ctx = ctx; return s; };
const base = (id, ctx) => { const s = withNode(id, 1, ctx); s.heroes[0].talents = {}; return s; };
const near = (a, b, m, tol = 1e-6) => assert(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const weap = (s, el) => { s.heroes[0].equip.weapon = { ...rollItem(rng(1), 5, el, 'w', [1, 0, 0, 0, 0, 0]), slot: 'weapon', element: el }; return s; };
for (const n of Object.values(TREES).flatMap(bs => bs.flatMap(b => b.nodes))) {
  const r = n.max, e = n.eff, tb = talentBonus(withNode(n.id, r).heroes[0]);
  for (const [k, v] of Object.entries(e)) assert.equal(tb[k], v * r, `${n.id} ${k}`);
  const S = (ctx) => withNode(n.id, r, ctx), Z = (ctx) => base(n.id, ctx);
  if (e.dpsPct || e.rallyPct || e.doublePct) near(heroDps(S().heroes[0]) / heroDps(Z().heroes[0]), (1 + ((e.dpsPct || 0) + (e.rallyPct || 0)) * r / 100) * (1 + (e.doublePct || 0) * r / 100), n.id, 1e-3);
  if (e.goldPct) { const a = simulate(S(), 60).gold, b = simulate(Z(), 60).gold; assert(a > b, n.id + ' gold'); }
  if (e.xpPct) { const a = simulate(S(), 60).xp, b = simulate(Z(), 60).xp; assert(a > b, n.id + ' xp'); }
  if (e.capH) assert.equal(offlineCap(S().heroes) - offlineCap(Z().heroes), e.capH * r, n.id);
  if (e.hpPct) near(heroMaxHp(S().heroes[0]) / heroMaxHp(Z().heroes[0]), 1 + e.hpPct * r / 100, n.id, 0.01);
  if (e.drainPct || e.regenPct) { const loss = s => { const m = heroMaxHp(s.heroes[0]); simulate(s, 120); return (m - s.heroes[0].hp) / m; }; assert(loss(S()) < loss(Z()), n.id + ' drain'); }
  if (e.layerPct) { near(effectiveDps(S({ bossPct: 0.1 })) / effectiveDps(Z({ bossPct: 0.1 })) / (heroDps(S().heroes[0]) / heroDps(Z().heroes[0])), 1 + e.layerPct * r / 100, n.id, 1e-3); near(effectiveDps(S({ bossPct: 0.9 })), heroDps(S().heroes[0]), n.id + ' off', 1e-3); }
  if (e.elementPct) { const a = weap(S({ element: 'fire' }), 'fire'), b = weap(Z({ element: 'fire' }), 'fire'); near(effectiveDps(a) / effectiveDps(b) / (heroDps(a.heroes[0]) / heroDps(b.heroes[0])), 1 + e.elementPct * r / 100, n.id, 1e-3);
    const c = weap(S({ element: 'frost' }), 'fire'); near(effectiveDps(c), heroDps(c.heroes[0]), n.id + ' mismatch', 1e-3); }
  if (e.lowMulPct) { const a = S(), b = Z(); a.heroes[0].hp = b.heroes[0].hp = 1; near(effectiveDps(a) / heroDps(a.heroes[0]), LOW_MUL + e.lowMulPct / 100, n.id); }
  if (e.innPct) near(innCost(50, S()) / innCost(50), 1 - e.innPct * r / 100, n.id, 0.02);
  if (e.shopPct) { const it = shopStock(50, 0).items[2]; near(priceFor(S(), it) / it.price, 1 - e.shopPct * r / 100, n.id, 0.02); }
  if (e.restedPct) { const a = S(); a.heroes[0].hp = 1; rest(a, 1); near(a.buffs.rested, Math.round(RESTED.secs * (1 + e.restedPct * r / 100)), n.id); }
  if (e.restedMulPct) near(restedMul(S().heroes[0]) - 1, (RESTED.mul - 1) * 2, n.id);
  if (e.salvagePct) { const it = rollItem(rng(2), 20, 'fire', 's', [0, 0, 1, 0, 0, 0]); near(salvageGold(S(), it) / salvageValue(it), 1 + e.salvagePct * r / 100, n.id, 0.02); }
  if (e.lootPct) { let a = 0, b = 0; for (let q = 0; q < 3000; q++) { const x = S(), y = Z(); x.lootSeq = y.lootSeq = q; a += grantDrops(x, 5, 0.01).items.length; b += grantDrops(y, 5, 0.01).items.length; } assert(a / b > 1 + e.lootPct * r / 100 * 0.6, `${n.id} loot ${a / b}`); }
  if (e.offlinePct) { const a = S(), b = Z(); a.lastTick = b.lastTick = 0; const pa = offlineProgress(a, 3600e3), pb = offlineProgress(b, 3600e3); near(pa.damage / pb.damage, 1 + e.offlinePct * r / 100, n.id, 0.01); }
}
// ---- offline parity: talents apply identically in offline maths and in live ticks (non-offline nodes)
{ const mkT = () => { const s = mk('Vanguard', 25); s.heroes[0].talents = { 'vg-thick': 3, 'vg-brace': 3, 'vg-second': 2, 'wl-rally': 3, 'wl-banner': 2 }; s.lastTick = 0; return s; };
  const off = mkT(), live = mkT(), p = offlineProgress(off, 1800e3); let d = 0, g = 0, x = 0; for (let t = 1; t <= 1800; t++) { const q = accrue(live, t * 1000); d += q.damage; g += q.gold; x += q.xp; }
  near(p.damage, d, 'offline damage parity', 1e-3); near(p.gold, g, 'gold', 2e-3); near(p.xp, x, 'xp', 2e-3); near(off.heroes[0].hp, live.heroes[0].hp, 'hp parity', 1e-6); }
// ---- migration: v4 save → v5, existing heroes get points for their level
{ const old = { version: 4, heroes: [{ id: 'o', name: 'Old', cls: 'Arcanist', level: 9, xp: 0, gear: 2, look: {}, equip: {}, hp: null }], gold: 5, lastTick: 0, inv: [], lootSeq: 0, progress: { cleared: [], top3: [], rank1: 0, drops: [] }, buffs: { rested: 0, elixir: 0, vigil: 0 } };
  const s = migrateSave(old); assert.equal(s.version, SAVE_VERSION); assert.equal(SAVE_VERSION, 5); assert.deepEqual(s.heroes[0].talents, {}); assert.equal(s.heroes[0].respecs, 0); assert.equal(freePoints(s.heroes[0]), 8); }
console.log('talent tests passed');

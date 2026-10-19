import assert from 'node:assert';
import { newHero, simulate, accrue, offlineProgress, heroMaxHp, heroHp, isWorn, effectiveDps, totalDps, DRAIN_SECS, LOW_HP, LOW_MUL, RESTED } from '../js/game.js';
import { innCost, rest, shopStock, buy, soldOut, SHOP_BUCKET_MS, npcGrid } from '../js/town.js';
import { migrateSave, SAVE_VERSION } from '../js/cosmetics.js';
const mk = (cls = 'Blade') => migrateSave({ version: 2, heroes: [newHero('W', cls)], gold: 0, lastTick: 0, progress: { cleared: [], top3: [], rank1: 0 } });
// ---- HP drain + DPS penalty
{ const s = mk(), h = s.heroes[0], max = heroMaxHp(h), dps = totalDps(s.heroes);
  assert.equal(heroHp(h), max);
  const tLow = (1 - LOW_HP) * DRAIN_SECS; // seconds until worn down
  const a = simulate(s, tLow - 10); assert(!isWorn(h)); assert(Math.abs(a.dmg - dps * (tLow - 10)) < 1e-6, 'full DPS above 30% HP'); assert.equal(a.lowSecs, 0);
  const b = simulate(s, 1000); assert(isWorn(h)); assert(Math.abs(b.dmg - (dps * 10 + dps * LOW_MUL * 990)) < 1e-6, 'DPS halves below 30%'); assert(Math.abs(b.lowSecs - 990) < 1e-6);
  assert(Math.abs(effectiveDps(s) - dps * LOW_MUL) < 1e-9);
  simulate(s, 100 * 3600); assert.equal(h.hp, 1, 'HP never below 1 (no death)'); assert(h.level >= 1);
}
// offline = live: one 3h offline chunk equals 3h of 1s ticks
{ const A = mk(), B = mk(); A.lastTick = B.lastTick = 1e6;
  const off = offlineProgress(A, 1e6 + 3 * 3600e3, 12); let live = { damage: 0, gold: 0, xp: 0 };
  for (let t = 1; t <= 3 * 3600; t++) { const p = accrue(B, 1e6 + t * 1000, 12); live.damage += p.damage; live.gold += p.gold; live.xp += p.xp; }
  for (const k of ['damage', 'gold', 'xp']) assert(Math.abs(off[k] - live[k]) <= 1, `offline ${k} ${off[k]} vs live ${live[k]}`);
  assert(Math.abs(A.heroes[0].hp - B.heroes[0].hp) < 1e-6); assert(isWorn(A.heroes[0]), 'long absence ends worn down'); assert(off.lowSecs > 0);
}
// ---- inn: cost scales with floor; rest heals + Well Rested; buff expires inside offline maths
{ assert.equal(innCost(1), 30); assert(innCost(10) > innCost(5) && innCost(5) > innCost(1));
  const s = mk(); s.gold = 10; simulate(s, 3000); assert(!rest(s, 1), 'cannot afford'); s.gold = 1000;
  assert(rest(s, 1)); assert.equal(s.gold, 970); assert.equal(heroHp(s.heroes[0]), heroMaxHp(s.heroes[0])); assert.equal(s.buffs.rested, RESTED.secs);
  const dps = totalDps(s.heroes), r = simulate(s, 3600); // 1800s rested (full HP), then 1800s plain; HP stays above 30% all hour? no: drop to 50% at 1800s, worn at 2520s
  const tLow = (1 - LOW_HP) * DRAIN_SECS, dmg = dps * tLow + dps * LOW_MUL * (3600 - tLow);
  assert(Math.abs(r.dmg - dmg) < 1e-6); const gold = dps * 1800 * 0.1 * RESTED.mul + (dmg - dps * 1800) * 0.1; assert(Math.abs(r.gold - gold) < 1e-6, 'rested bonus only for 30 min');
  assert.equal(s.buffs.rested, 0, 'buff expired');
  // offline: rested applies to the first 30 min of absence only
  const o = mk(); o.lastTick = 0; o.gold = 100; rest(o, 1); const p = offlineProgress(o, 2 * 3600e3, 12); assert.equal(o.buffs.rested, 0);
  const plain = mk(); plain.lastTick = 0; const q = offlineProgress(plain, 2 * 3600e3, 12); assert(p.gold > q.gold && p.gold < q.gold * 1.15, 'partial rested bonus');
}
// ---- Scroll of Vigil: +4h cap once
{ const s = mk(); s.lastTick = 0; s.buffs.vigil = 4; const p = offlineProgress(s, 20 * 3600e3, 12); assert.equal(p.secs, 16 * 3600); assert(p.vigilUsed); assert.equal(s.buffs.vigil, 0);
  const t = mk(); t.lastTick = 0; t.buffs.vigil = 4; const q = offlineProgress(t, 2 * 3600e3, 12); assert(!q.vigilUsed && t.buffs.vigil === 4, 'kept when not needed'); }
// ---- shop determinism + rotation + buying
{ const now = 1_800_000_000_000, a = shopStock(7, now), b = shopStock(7, now + 1000);
  assert.deepEqual(a, b, 'same floor+bucket → same stock'); assert.notDeepEqual(shopStock(7, now + SHOP_BUCKET_MS).items, a.items, 'rotates'); assert.notDeepEqual(shopStock(8, now).items, a.items, 'per floor');
  assert.deepEqual(a.items.slice(0, 3).map(i => i.kind), ['potion', 'elixir', 'vigil']); assert.equal(a.items.filter(i => i.kind === 'gear').length, 3);
  const s = mk(); s.gold = 1e9; const gi = a.items.findIndex(i => i.kind === 'gear');
  assert(buy(s, 7, now, gi)); assert.equal(s.inv.length, 1); assert(soldOut(s, a, gi)); assert.equal(buy(s, 7, now, gi), null, 'gear once per rotation');
  assert.equal(buy(s, 7, now, 0), null, 'no potion at full HP'); simulate(s, 2000); const hp = heroHp(s.heroes[0]); assert(buy(s, 7, now, 0)); assert(heroHp(s.heroes[0]) > hp);
  assert(buy(s, 7, now, 1)); assert(s.buffs.elixir > 0); assert(buy(s, 7, now, 2)); assert.equal(buy(s, 7, now, 2), null, 'one vigil at a time');
  const poor = mk(); assert.equal(buy(poor, 7, now, 0), null);
}
// ---- migration v3 → v4 and NPC sprites
{ const s = migrateSave({ version: 3, gold: 1, lastTick: 1, inv: [], lootSeq: 0, heroes: [{ id: 'a', name: 'A', cls: 'Vanguard', level: 5, xp: 0, gear: 0, look: {}, equip: { weapon: null, armor: null, trinket: null } }], progress: { cleared: [], top3: [], rank1: 0, drops: [] } });
  assert.equal(s.version, SAVE_VERSION); assert.deepEqual(s.buffs, { rested: 0, elixir: 0, vigil: 0 }); assert.equal(heroHp(s.heroes[0]), heroMaxHp(s.heroes[0]), 'migrated heroes start at full HP');
  for (const k of ['innkeeper', 'merchant']) { const g = npcGrid(k); assert.equal(g.rows.length, 32); for (const ch of g.rows.join('')) assert(ch === '.' || g.pal[ch]); } }
console.log('town tests passed');

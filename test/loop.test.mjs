// Background-tab catch-up (a 60s gap between ticks == continuous play) and the regular-play loot trickle.
import assert from 'node:assert';
import { newHero, accrue, heroHp } from '../js/game.js';
import { migrateSave } from '../js/cosmetics.js';
import { trickleDrops, TRICKLE, INV_SIZE } from '../js/loot.js';
const mk = () => { const s = migrateSave({ version: 2, heroes: [newHero('W', 'Blade')], gold: 0, lastTick: 1e6, progress: { cleared: [], top3: [], rank1: 0 } }); s.heroes[0].id = 'fixed'; return s; };
const play = (s, steps) => { const tot = { damage: 0, gold: 0, xp: 0, items: 0 }; let t = s.lastTick; for (const dt of steps) { t += dt * 1000; const p = accrue(s, t, 12); tot.damage += p.damage; tot.gold += p.gold; tot.xp += p.xp; tot.items += trickleDrops(s, p.secs, 3, p.secs > 2 ? TRICKLE.offlineMax : Infinity).length; } return tot; };
// #5: 10s of ticks, a 60s throttled gap, 10s more  ==  80 one-second ticks
for (const [a, b] of [[[...Array(10).fill(1), 60, ...Array(10).fill(1)], Array(80).fill(1)], [[1, 1, 59.5, 0.5, 1, 1, 16], Array(80).fill(1)], [[600], Array(600).fill(1)]]) {
  const A = mk(), B = mk(), ra = play(A, a), rb = play(B, b);
  for (const k of ['damage', 'gold', 'xp', 'items']) assert(Math.abs(ra[k] - rb[k]) <= 1, `${k}: gap ${ra[k]} vs continuous ${rb[k]}`);
  assert(Math.abs(heroHp(A.heroes[0]) - heroHp(B.heroes[0])) < 1e-6, 'same HP'); assert.equal(A.lastTick, B.lastTick);
}
// #6: trickle ≈ one Common/Uncommon per 150s of fighting, seeded, capped offline
{ const s = mk(), items = trickleDrops(s, 3 * 600, 3); assert.equal(items.length, Math.floor(1800 / TRICKLE.secs)); assert(items.every(i => ['common', 'uncommon'].includes(i.rarity)));
  assert.equal(s.inv.length, items.length); assert(trickleDrops(s, 149, 3).length === 0 && trickleDrops(s, 1, 3).length === 1, 'accumulates across calls');
  const again = mk(); assert.deepEqual(trickleDrops(again, 1800, 3).map(i => i.id + i.rarity + i.name), items.map(i => i.id + i.rarity + i.name), 'seeded');
  const off = mk(); assert.equal(trickleDrops(off, 12 * 3600, 3, TRICKLE.offlineMax).length, TRICKLE.offlineMax, 'offline capped'); assert(off.trickle.secs < TRICKLE.secs);
  const full = mk(); full.inv = Array(INV_SIZE).fill({}); const g = full.gold; const x = trickleDrops(full, 300, 3); assert(x.every(i => i.salvaged) && full.gold > g && full.inv.length === INV_SIZE, 'full bag auto-salvages');
  let n = 0; for (let k = 0; k < 2000; k++) { const z = mk(); z.heroes[0].id = 'h' + k; n += trickleDrops(z, 150, 5).filter(i => i.rarity === 'uncommon').length; } assert(n > 450 && n < 750, `uncommon share ~30% (${n / 2000})`);
}
console.log('loop + trickle tests passed');

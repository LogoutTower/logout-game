// Regression: a fresh low-DPS hero must earn gold, XP and damage, and show on the leaderboard, within ~10s of live play.
// (Bug: per-tick Math.floor turned 0.65 gold/s into 0 gold forever.)
import assert from 'node:assert';
const mem = {}; globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => mem[k] = v };
const { newHero, accrue, applyXp, heroDps } = await import('../js/game.js');
const { LocalBackend } = await import('../js/storage.js');
for (const cls of ['Vanguard', 'Blade', 'Arcanist']) {
  for (const k of Object.keys(mem)) delete mem[k];
  const be = new LocalBackend(), h = newHero('Tester', cls); let t = 1_000_000;
  const save = { version: 2, heroes: [h], gold: 0, lastTick: t, progress: { cleared: [], top3: [], rank1: 0 } };
  await be.getFloor(); let pending = 0, total = 0;
  for (let s = 1; s <= 10; s++) { // ten 1-second ticks, synced every 5s like main.js
    t += 1000 + (s % 3) * 7; const p = accrue(save, t); save.gold += p.gold; applyXp(save.heroes, p.xp); pending += p.damage; total += p.damage;
    if (s % 5 === 0) { await be.submitDamage(h.name, pending); pending = 0; }
  }
  assert(save.gold > 0, `${cls}: gold > 0`); assert(h.xp > 0 || h.level > 1, `${cls}: xp > 0`);
  assert(total >= Math.floor(heroDps(h) * 10) - 1, `${cls}: no damage lost to rounding`);
  const lb = await be.leaderboard(h.name), me = lb.find(r => r.name === h.name);
  assert(me && me.damage > 0 && me.rank >= 1, `${cls}: player on leaderboard with damage`);
}
console.log('live progression regression passed');

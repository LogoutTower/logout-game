import assert from 'node:assert';
import { bossInfo, bossGrid, bossShape, baseHp, floorBossHp, isSpecialSlot, isMilestone, PLAN_FLOORS } from '../js/floors.js';
import { BOSSES } from '../js/bosses.js';
const ALL = Array.from({ length: PLAN_FLOORS }, (_, i) => i + 1);
// floors 1-10 unchanged: the original hand-made bosses
BOSSES.forEach((b, i) => assert.equal(bossInfo(i + 1).name, b.name));
// deterministic: fresh module instance gives identical plan and pixels
const again = await import('../js/floors.js?fresh=1');
for (const f of ALL) { assert.deepEqual(again.bossInfo(f), bossInfo(f), `floor ${f} stable`); assert.deepEqual(again.bossGrid(f), bossGrid(f), `floor ${f} sprite stable`); }
// special slots are never generated and are flagged placeholder_special
for (const f of ALL) {
  const i = bossInfo(f);
  if (isSpecialSlot(f)) { assert.notEqual(i.kind, 'generated', `floor ${f} must not be generated`); assert.equal(i.placeholder_special, true); }
  else if (f > 9) assert.equal(i.kind, 'generated');
}
for (const f of [10, 20, 30, 40, 50, 60, 70, 80, 90, ...Array.from({ length: 10 }, (_, i) => 91 + i)]) assert(isSpecialSlot(f));
assert.equal(bossInfo(100).name, 'The Last Warden');
// no adjacent repeats of base or element (generated neighbours)
for (let f = 2; f <= PLAN_FLOORS; f++) { const a = bossInfo(f - 1), b = bossInfo(f); assert.notEqual(a.base, b.base, `floors ${f - 1}/${f} share base`); if (a.kind === 'generated' || b.kind === 'generated') assert.notEqual(a.element, b.element); }
// generated names and titles
for (const f of ALL) { const i = bossInfo(f); assert(i.name.length > 3); assert.equal(i.title, `Guardian of Floor ${f}`); }
// valid 32x32 sprite for all 100
for (const f of ALL) { const g = bossGrid(f); assert.equal(g.rows.length, 32); g.rows.forEach(r => assert.equal(r.length, 32)); for (const ch of g.rows.join('')) assert(ch === '.' || /^#[0-9a-f]{6}$/.test(g.pal[ch]), `floor ${f} palette ${ch}`); assert(bossShape(f).rows.join('').replace(/\./g, '').length > 150); }
// HP: base curve strictly increasing; non-milestone floors increasing; milestones 2-3x their base and above both neighbours
for (let f = 2; f <= PLAN_FLOORS; f++) assert(baseHp(f) > baseHp(f - 1), `baseHp ${f}`);
const plain = ALL.filter(f => !isMilestone(f)); for (let i = 1; i < plain.length; i++) assert(floorBossHp(plain[i]) > floorBossHp(plain[i - 1]));
const ms = ALL.filter(isMilestone); for (let i = 1; i < ms.length; i++) assert(floorBossHp(ms[i]) > floorBossHp(ms[i - 1]));
for (const f of ms) { const r = floorBossHp(f) / baseHp(f); assert(r >= 2 && r <= 3); assert(floorBossHp(f) > floorBossHp(f - 1)); if (f < PLAN_FLOORS) assert(floorBossHp(f) > floorBossHp(f + 1)); }
assert(Number.isSafeInteger(floorBossHp(100)) && floorBossHp(100) < 1e10, 'floor 100 HP stays sane');
console.log('floor plan tests passed');

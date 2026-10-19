import assert from 'node:assert';
import { bossInfo, bossGrid, bossShape, baseHp, floorBossHp, isSpecialSlot, isMilestone, PLAN_FLOORS, arcHpMul, mechText, MID_SPECIALS } from '../js/floors.js';
import { BOSSES, ARC2 } from '../js/bosses.js';
const ALL = Array.from({ length: PLAN_FLOORS }, (_, i) => i + 1);
// floors 1-10 unchanged: the original hand-made bosses
BOSSES.forEach((b, i) => assert.equal(bossInfo(i + 1).name, b.name));
// deterministic: fresh module instance gives identical plan and pixels
const again = await import('../js/floors.js?fresh=1');
for (const f of ALL) { assert.deepEqual(again.bossInfo(f), bossInfo(f), `floor ${f} stable`); assert.deepEqual(again.bossGrid(f), bossGrid(f), `floor ${f} sprite stable`); }
// special slots are never generated and are flagged placeholder_special
for (const f of ALL) {
  const i = bossInfo(f);
  if (f >= 11 && f <= 20) { assert.equal(i.kind, 'handmade'); assert.equal(i.name, ARC2[f - 11].name, `arc 2 floor ${f}`); }
  else if (isSpecialSlot(f)) { assert.notEqual(i.kind, 'generated', `floor ${f} must not be generated`); assert.equal(i.placeholder_special, true); }
  else if (f > 9) assert.equal(i.kind, 'generated');
}
for (const f of [10, 20, 30, 40, 50, 60, 70, 80, 90, ...Array.from({ length: 10 }, (_, i) => 91 + i)]) assert(isSpecialSlot(f));
assert.equal(bossInfo(100).name, 'The Last Warden');
// no adjacent repeats of base or element (generated neighbours)
for (let f = 2; f <= PLAN_FLOORS; f++) { const a = bossInfo(f - 1), b = bossInfo(f); assert.notEqual(a.base, b.base, `floors ${f - 1}/${f} share base`); if (a.kind === 'generated' || b.kind === 'generated') assert.notEqual(a.element, b.element); }
// generated names and titles
for (const f of ALL) { const i = bossInfo(f); assert(i.name.length > 3); if (f < 11 || f > 20) assert.equal(i.title, `Guardian of Floor ${f}`); }
// arc 2: unique bosses with title, element, lore, a signature mechanic and 1-2 signature drops; 15 special, 20 the big finale
assert.equal(new Set(ARC2.map(b => b.name)).size, 10); assert.deepEqual(MID_SPECIALS, [15]); assert(isSpecialSlot(15) && isSpecialSlot(20) && !isSpecialSlot(16));
for (let f = 11; f <= 20; f++) { const i = bossInfo(f); assert(i.title && !/Guardian of Floor/.test(i.title)); assert(/^System notice: /.test(i.lore)); assert(mechText(i.mech).length > 10, `mechanic ${f}`); assert(i.sig.length >= 1 && i.sig.length <= 2); assert(i.lootElement); }
assert(bossInfo(20).finale && bossInfo(20).big); assert(!bossInfo(19).finale);
// valid 32x32 sprite for all 100
for (const f of ALL) { const g = bossGrid(f); assert.equal(g.rows.length, 32); g.rows.forEach(r => assert.equal(r.length, 32)); for (const ch of g.rows.join('')) assert(ch === '.' || /^#[0-9a-f]{6}$/.test(g.pal[ch]), `floor ${f} palette ${ch}`); assert(bossShape(f).rows.join('').replace(/\./g, '').length > 150); }
// HP: base curve strictly increasing; non-milestone floors increasing; milestones 2-3x their base and above both neighbours
for (let f = 2; f <= PLAN_FLOORS; f++) assert(baseHp(f) > baseHp(f - 1), `baseHp ${f}`);
const plain = ALL.filter(f => !isMilestone(f)); for (let i = 1; i < plain.length; i++) assert(floorBossHp(plain[i]) > floorBossHp(plain[i - 1]));
const ms = ALL.filter(isMilestone); for (let i = 1; i < ms.length; i++) assert(floorBossHp(ms[i]) > floorBossHp(ms[i - 1]));
for (const f of ms) { const r = floorBossHp(f) / (baseHp(f) * arcHpMul(f)); assert(r >= 2 && r <= 3); assert(floorBossHp(f) > floorBossHp(f - 1)); if (f < PLAN_FLOORS && f !== 10) assert(floorBossHp(f) > floorBossHp(f + 1)); } // floor 11 opens arc 2 with a step up
assert(Number.isSafeInteger(floorBossHp(100)) && floorBossHp(100) < 1e13, 'floor 100 HP stays sane (arc 3+ to be tuned)');
for (let f = 1; f <= 10; f++) assert.equal(arcHpMul(f), 1, 'arc 1 HP unchanged');
console.log('floor plan tests passed');

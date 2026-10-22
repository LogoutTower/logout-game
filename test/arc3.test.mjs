// Arc 3 preview (FEATURES.arc3 = 'gm'): Floors 21-30 Tidewire Depths. Off = the plan is unchanged; on = Wisp's 10 bosses, tide + undertow mechanics.
import assert from 'node:assert';
import * as F from '../js/floors.js';
import { arcOf, arenaBgOf, sceneOf } from '../js/arcs.js';
import { BOSSES_21_30 } from '../js/bosses-21-30.js';
import { featureOn } from '../js/features.js';
import { FEATURES, MAX_FLOOR, ARC3_UNLOCK_AFTER, ARC3_CAP } from '../config.js';
const { arc3Unlocked, bossInfo, bossGrid, bossShape, bossV2Grid, setArc3Preview, isSpecialSlot, mechDps, mechDrain, mechText, floorBossHp } = F;
// flag: staff preview only; floor cap unchanged
// shipped locked: flag on for everyone, but the gate opens only past the unlock floor (server floor), staff always; caps 20 -> 30
assert.equal(FEATURES.arc3, 'all'); assert.equal(MAX_FLOOR, 20); assert.equal(ARC3_UNLOCK_AFTER, 20); assert.equal(ARC3_CAP, 30);
const on = featureOn(FEATURES, 'arc3', false);
for (const f of [0, 1, 10, 19, 20]) assert.equal(arc3Unlocked(f, false, on, ARC3_UNLOCK_AFTER), false, `locked at server floor ${f}`);
for (const f of [21, 25, 30]) assert.equal(arc3Unlocked(f, false, on, ARC3_UNLOCK_AFTER), true, `open at server floor ${f}`);
assert.equal(arc3Unlocked(1, true, featureOn(FEATURES, 'arc3', true), 20), true, 'staff: open at any floor');
assert.equal(arc3Unlocked(25, false, false, 20), false, 'flag off: never'); assert.equal(arc3Unlocked(25, false, featureOn({ arc3: 'gm' }, 'arc3', false), 20), false, "'gm': players never");
assert.equal(arc3Unlocked(1, false, on, 20), false, 'after a tower reset (Floor 1) it locks again');
// off: identical plan to a fresh module; no arc 3 scene/art/name
const fresh = await import('../js/floors.js?off=1');
const snap = () => Array.from({ length: 100 }, (_, i) => bossInfo(i + 1));
const off = snap(); for (let f = 1; f <= 100; f++) assert.deepEqual(off[f - 1], fresh.bossInfo(f), `off: floor ${f} unchanged`);
assert.equal(arcOf(25).name, 'Arc 3'); assert.equal(arenaBgOf(25), null); assert(!isSpecialSlot(25)); assert.equal(bossInfo(21).kind, 'generated');
const hpOff = Array.from({ length: 30 }, (_, i) => floorBossHp(i + 1));
// on
setArc3Preview(true);
assert.equal(BOSSES_21_30.length, 10);
for (let f = 21; f <= 30; f++) { const i = bossInfo(f), b = BOSSES_21_30[f - 21];
  assert.equal(i.kind, 'handmade'); assert.equal(i.name, b.name); assert.equal(i.base, b.key); assert.equal(i.lootElement, b.element); assert.equal(i.mech, b.mech);
  assert(i.title && !/Guardian of Floor/.test(i.title)); assert(/^System notice: /.test(i.lore)); assert(mechText(i.mech).length > 10, `mech text ${f}`);
  const g = bossV2Grid(f); assert.equal(g.rows.length, 96); assert(g.rows.every(r => r.length === 96)); assert(g.rows[95].replace(/\./g, '').length > 0, `F${f} stands on the floor line`);
  assert.deepEqual(bossGrid(f, 1, true), g); const s = bossGrid(f); assert.equal(s.rows.length, 32); assert(s.rows.every(r => r.length === 32)); assert(bossShape(f).rows.join('').replace(/\./g, '').length > 150);
  for (const ch of g.rows.join('')) if (ch !== '.') assert(/^#[0-9a-f]{6}$/i.test(g.pal[ch])); }
assert(isSpecialSlot(25) && bossInfo(30).big && bossInfo(30).finale && !bossInfo(29).finale); assert.equal(new Set(BOSSES_21_30.map(b => b.name)).size, 10);
assert.equal(arcOf(25).name, 'Tidewire Depths'); assert.equal(arcOf(25).particles, 'bubbles'); assert.equal(sceneOf(30).particles, 'bubbles'); assert.equal(arenaBgOf(21), 'assets/bg/arc-3.png');
assert.equal(arcOf(15).name, 'Rimegear Ascent'); assert.equal(arenaBgOf(31), null, 'arc 4 not wired');
// floors 1-20 untouched by the preview; HP curve unchanged
for (let f = 1; f <= 20; f++) assert.deepEqual(bossInfo(f), off[f - 1]);
assert.deepEqual(Array.from({ length: 30 }, (_, i) => floorBossHp(i + 1)), hpOff);
// tide: layers 5,3,1 +10%, 4,2 -10%; no drain change
const c = (mech, bossPct) => ({ mech, bossPct });
assert.equal(mechDps(c('tide', 1)), 1.1); assert.equal(mechDps(c('tide', 0.7)), 0.9); assert.equal(mechDps(c('tide', 0.5)), 1.1); assert.equal(mechDps(c('tide', 0.3)), 0.9); assert.equal(mechDps(c('tide', 0.1)), 1.1); assert.equal(mechDrain(c('tide', 0.5)), 1);
// undertow: none above 50%, pull below 50%, riptide below 20%; peaks never above existing maxima
assert.equal(mechDps(c('undertow', 0.8)), 1); assert.equal(mechDrain(c('undertow', 0.8)), 1);
assert.equal(mechDps(c('undertow', 0.4)), 1.1); assert.equal(mechDrain(c('undertow', 0.4)), 1.25);
assert.equal(mechDps(c('undertow', 0.1)), 1.15); assert.equal(mechDrain(c('undertow', 0.1)), 1.4);
assert.equal(mechDps({ mech: 'undertow' }), 1, 'offline/no context: neutral');
const maxD = Math.max(...['casing', 'stillHour', 'overclock'].flatMap(m => [0.05, 0.3, 0.5, 0.9].map(p => mechDps(c(m, p))))), maxDr = Math.max(...['frostbite', 'enrage', 'overclock'].flatMap(m => [0.05, 0.3, 0.9].map(p => mechDrain(c(m, p)))));
for (const p of [0.05, 0.3, 0.5, 0.9]) { assert(mechDps(c('undertow', p)) <= maxD && mechDps(c('tide', p)) <= maxD); assert(mechDrain(c('undertow', p)) <= maxDr); }
// off again: back to the classic plan
setArc3Preview(false); for (let f = 1; f <= 100; f++) assert.deepEqual(bossInfo(f), off[f - 1]); assert.equal(arenaBgOf(25), null);
console.log('arc 3 preview tests passed');

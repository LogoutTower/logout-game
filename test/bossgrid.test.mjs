// Size-agnostic boss grids: a `rows` shape of any square N composes, takes add-ons and shades to an N x N sprite; 32 draw() shapes unchanged.
import assert from 'node:assert';
import { SHAPES, composeShape, shadeShape } from '../js/bosses.js';
for (const N of [32, 48, 96]) {
  const rows = Array.from({ length: N }, (_, y) => [...Array(N)].map((_, x) => (Math.hypot(x - N / 2, y - N / 2) < N / 3 ? (x + y) % 9 ? 'B' : 'E' : '.')).join(''));
  SHAPES['t' + N] = { key: 't' + N, pal: { B: '#6b2e18', E: '#5ff6ff', k: '#12062a' }, rows };
  for (const addons of [[], ['wings', 'aura', 'crown', 'horns', 'plates', 'chains']]) { const s = composeShape('t' + N, addons.length ? 'fire' : null, addons), g = shadeShape(s);
    assert.equal(g.rows.length, N); g.rows.forEach(r => assert.equal(r.length, N)); for (const ch of g.rows.join('')) assert(ch === '.' || g.pal[ch], `palette ${ch}`); }
}
SHAPES.bad = { key: 'bad', pal: {}, rows: ['..', '...'] }; assert.throws(() => composeShape('bad'), /square/);
for (const k of ['t32', 't48', 't96', 'bad']) delete SHAPES[k];
console.log('boss grid tests passed');
// boss art v2: pre-shaded grids drawn as-is behind the flag, 32x32 fallback otherwise
const { prepV2 } = await import('../js/bosses.js'); const { bossGrid, bossInfo } = await import('../js/floors.js'); const { BOSSES_V2 } = await import('../js/bosses-v2.js');
const { featureOn } = await import('../js/features.js');
assert.equal(featureOn({ bossV2: 'gm' }, 'bossV2', false), false); assert.equal(featureOn({ bossV2: 'gm' }, 'bossV2', true), true); assert.equal(featureOn({ bossV2: true }, 'bossV2'), true); assert.equal(featureOn({ bossV2: false }, 'bossV2', true), false);
for (const [k, e] of Object.entries(BOSSES_V2)) { assert.equal(k, e.key, `registry key ${k}`); assert(SHAPES[k], `${k} is a boss key in js/bosses.js`); const g = prepV2(e); assert.equal(g.rows.length, e.size); }
const { BOSSES, ARC2 } = await import('../js/bosses.js'); const bossKeys = new Set([...BOSSES, ...ARC2].map(b => b.key));
for (const k of Object.keys(BOSSES_V2)) assert(bossKeys.has(k), `BOSSES_V2 key '${k}' is not a boss key in js/bosses.js`);
assert.equal(Object.keys(BOSSES_V2).length, 20, 'launch set: Floors 1-20');
for (let f = 1; f <= 20; f++) { const i = bossInfo(f), e = BOSSES_V2[i.base]; assert(e, `floor ${f} (${i.base}) has v2 art`); assert.equal(e.floor, f); assert.equal(e.name, i.name, `floor ${f} name`); assert.equal(bossGrid(f, 1, true).rows.length, 96); assert.equal(!!e.big, !!i.big, `floor ${f} big`); }
assert.equal(bossGrid(1).rows.length, 32, 'flag off: classic path'); assert.equal(bossGrid(21, 1, true).rows.length, 32, 'no v2 entry: classic path'); assert.equal(bossGrid(91, 1, true).rows.length, 32, 'placeholder reusing a v2 shape stays classic'); assert.equal(bossGrid(20, 2, true).rows.length, 32, 'phase 2 classic');
for (let f = 21; f <= 100; f++) assert.equal(bossGrid(f, 1, true).rows.length, 32, `floor ${f} keeps 32x32 (generated/placeholder floors never pick up v2 art)`);
const N = 96, rows = Array.from({ length: N }, (_, y) => [...Array(N)].map((_, x) => (x > 20 && x < 76 && y > 10 ? '1' : '.')).join(''));
{ const s = prepV2({ key: 'x', preshaded: true, pal: { 1: '#000000' }, rows }, { stripPedestal: true }); assert.equal(s.dropped, 14, 'no keys: row cut at 82, then grounded'); assert.equal(s.rows[24], '.'.repeat(N)); assert.notEqual(s.rows[95], '.'.repeat(N)); }
for (const e of Object.values(BOSSES_V2)) { const g = bossGrid(e.floor, 1, true); assert.notEqual(g.rows[95], '.'.repeat(96), `F${e.floor} grounded`); const glow = new Set(['K', 'P', 'Q'].filter(c => /pedestal (edge|tile)/i.test(e.keys?.[c] || '') && !/merged/.test(e.keys[c]))); for (const r of g.rows.slice(70)) for (const ch of r) assert(!glow.has(ch), `F${e.floor}: pedestal tile/edge left`); }
assert.throws(() => prepV2({ key: 'y', preshaded: false, pal: {}, rows }), /pre-shaded/); assert.throws(() => prepV2({ key: 'z', preshaded: true, pal: {}, rows }), /colour/);
console.log('boss v2 tests passed');

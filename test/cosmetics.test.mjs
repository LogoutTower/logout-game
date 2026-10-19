import assert from 'node:assert';
import { CATALOG, migrateSave, recordClear, isUnlocked, equip, defaultLook, byId, heroGrid, fakeProfile, unlockText, itemsFor } from '../js/cosmetics.js';
const fresh = () => migrateSave({ heroes: [{ id: 'a', name: 'K', cls: 'Blade', level: 3, xp: 5, gear: 1 }], gold: 42, lastTick: 1 });
// migration of v1 save
let s = fresh();
assert.equal(s.version, 2); assert.equal(s.gold, 42); assert.equal(s.heroes[0].level, 3);
assert.deepEqual(s.heroes[0].look, defaultLook('Blade')); assert.deepEqual(s.progress, { cleared: [], top3: [], rank1: 0 });
assert.deepEqual(migrateSave(JSON.parse(JSON.stringify(s))), s, 'migration idempotent');
assert.equal(migrateSave(null), null);
// all catalog ids unique, every floor 1-10 unlocks something
assert.equal(new Set(CATALOG.map(i => i.id)).size, CATALOG.length);
for (let f = 1; f <= 10; f++) assert(CATALOG.some(i => i.unlock?.floor === f), `floor ${f} has an unlock`);
// locked items cannot be equipped
assert(!equip(s, 't-f1')); assert(!isUnlocked(byId('t-f1'), s.progress));
// floor clear unlocks
let got = recordClear(s, 1, 0); assert.deepEqual(got.map(i => i.id), ['t-f1']); assert(equip(s, 't-f1')); assert.equal(s.heroes[0].look.title, 't-f1');
assert.deepEqual(recordClear(s, 1, 0), [], 'no double unlock');
// top-3 and rank-1
got = recordClear(s, 2, 1).map(i => i.id);
for (const id of ['hc-silver', 'hc-neon', 't-top', 't-first', 'wc-first']) assert(got.includes(id), id);
got = recordClear(s, 3, 3).map(i => i.id); assert(got.includes('tr-gold') && got.includes('tr-blood'));
assert(!recordClear(s, 4, 4).some(i => i.id === 'nc-pink'), 'rank 4 not top-3');
assert(recordClear(s, 5, 2).some(i => i.id === 'nc-pink'));
// class-locked weapons
recordClear(s, 6, 0); assert(!equip(s, 'w-v-tower')); assert(equip(s, 'w-b-scythe'));
// sprite grid sanity for every combo of shapes
for (const cls of ['Vanguard', 'Blade', 'Arcanist']) for (const w of itemsFor('weapon', cls)) for (const hs of itemsFor('hairStyle')) for (const os of itemsFor('outfitStyle')) {
  const g = heroGrid({ ...defaultLook(cls), weapon: w.id, hairStyle: hs.id, outfitStyle: os.id }, cls);
  assert.equal(g.rows.length, 32); g.rows.forEach(r => assert.equal(r.length, 32)); assert(Object.values(g.pal).every(c => /^#[0-9a-f]{6}$/.test(c)), 'hex colours'); for (const ch of g.rows.join('')) assert(ch === '.' || g.pal[ch], `palette ${ch}`);
}
assert.deepEqual(fakeProfile('Byte'), fakeProfile('Byte')); assert.equal(unlockText({ floor: 3 }), 'Clear Floor 3');
// minimum damage share gates rank unlocks
const t = fresh();
assert(!recordClear(t, 1, 1, 0.01).some(i => ['t-first', 't-top'].includes(i.id)), 'low share: no rank unlocks');
assert.deepEqual(t.progress.top3, []); assert.equal(t.progress.rank1, 0); assert(t.progress.cleared.includes(1));
const got2 = recordClear(t, 2, 1, 0.05).map(i => i.id); assert(got2.includes('t-first') && got2.includes('t-top'));
// every colour option shades to a valid 32x32 sprite
for (const slot of ['skin', 'hairColor', 'outfitColor', 'trim', 'weaponColor']) for (const it of itemsFor(slot)) {
  const g = heroGrid({ ...defaultLook('Blade'), [slot]: it.id }, 'Blade'); assert.equal(g.rows.length, 32); for (const ch of g.rows.join('')) assert(ch === '.' || g.pal[ch]);
}
// bosses: 10 valid 32x32 sprites, several distinct silhouettes
const { bossGrid, bossShape } = await import('../js/sprites.js');
const shapes = new Set();
for (let f = 1; f <= 10; f++) { const g = bossGrid(f); assert.equal(g.rows.length, 32); g.rows.forEach(r => assert.equal(r.length, 32)); for (const ch of g.rows.join('')) assert(ch === '.' || g.pal[ch]); shapes.add(bossShape(f).rows.map(r => r.replace(/[^.]/g, '#')).join('|')); }
assert.equal(shapes.size, 10, 'every floor boss has its own silhouette');
for (let f = 1; f <= 10; f++) { const filled = bossShape(f).rows.join('').replace(/\./g, '').length; assert(filled > 200, `boss ${f} is a substantial sprite`); }
console.log('cosmetics tests passed');

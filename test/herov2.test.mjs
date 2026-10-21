// Hero sprites v2 (24x24 → 48x48): every shape combo × body × race, colour slots, staff hero, origin migration, race perks.
import assert from 'node:assert';
import { CATALOG, migrateSave, equip, defaultLook, byId, heroGrid, itemsFor, ORIGIN_SLOTS, SKINS } from '../js/cosmetics.js';
import { heroSprite, setHeroV2 } from '../js/sprites.js';
import { simulate, offlineProgress, racePerk, effectiveDps } from '../js/game.js';
import { RACE_PERKS, FEATURES } from '../config.js';
import { LOOK_KEYS_FOR_TEST } from '../js/idcard.js';
import { GM_CLASS, GM_LOOK } from '../js/gm.js';
const ok = (g, n = 48) => { assert.equal(g.rows.length, n); g.rows.forEach(r => assert.equal(r.length, n)); assert(Object.values(g.pal).every(c => /^#[0-9a-f]{6}$/.test(c)), 'hex'); for (const ch of g.rows.join('')) assert(ch === '.' || g.pal[ch], `palette ${ch}`); };
const bodies = itemsFor('body'), races = itemsFor('race');
assert.deepEqual(bodies.map(i => i.id), ['body-m', 'body-f']); assert.deepEqual(races.map(i => i.id), ['race-human', 'race-sylvan', 'race-beastkin', 'race-shade']);
for (const r of races) assert(RACE_PERKS[r.id], `perk for ${r.id}`);
assert.equal(FEATURES.heroV2, 'gm', 'v2 stays staff-only until it is flipped on');
const flat = g => g.rows.join('');
for (const cls of ['Vanguard', 'Blade', 'Arcanist']) for (const w of itemsFor('weapon', cls)) for (const hs of itemsFor('hairStyle')) for (const os of itemsFor('outfitStyle')) for (const b of bodies) for (const r of races)
  ok(heroGrid({ ...defaultLook(cls), weapon: w.id, hairStyle: hs.id, outfitStyle: os.id, body: b.id, race: r.id }, cls, true));
for (const slot of ['skin', 'hairColor', 'outfitColor', 'trim', 'weaponColor']) for (const it of itemsFor(slot)) ok(heroGrid({ ...defaultLook('Blade'), [slot]: it.id }, 'Blade', true));
for (const sk of Object.keys(SKINS)) { assert(SKINS[sk].draw24, sk); for (const b of bodies) ok(heroGrid({ ...defaultLook('Vanguard'), skinSet: sk, body: b.id }, 'Vanguard', true)); }
// bodies and races are visibly distinct; v1 fallback is untouched (32x32)
const base = { ...defaultLook('Blade') }, m = flat(heroGrid(base, 'Blade', true)), f = flat(heroGrid({ ...base, body: 'body-f' }, 'Blade', true));
assert.notEqual(m.replace(/[^.]/g, '#'), f.replace(/[^.]/g, '#'), 'female silhouette differs');
const sil = new Set(races.map(r => flat(heroGrid({ ...base, race: r.id }, 'Blade', true))));
assert.equal(sil.size, 4, 'each race renders differently');
ok(heroGrid(base, 'Blade', false), 32);
// staff hero: hooded coat at 48, ignores body/race
const gm = heroGrid(GM_LOOK, GM_CLASS, true); ok(gm); assert.equal(flat(gm), flat(heroGrid({ ...GM_LOOK, body: 'body-f', race: 'race-shade' }, GM_CLASS, true)));
setHeroV2(true); assert.notEqual(heroSprite(base, 'Blade'), heroSprite(base, 'Blade', false)); setHeroV2(false);
// migration: old saves get body-m + race-human and nothing is lost
const s = migrateSave({ version: 5, heroes: [{ id: 'a', name: 'Old', cls: 'Arcanist', level: 9, xp: 1, gear: 2, look: { hairStyle: 'hs-long', skin: 'skin-3' } }], gold: 7, lastTick: 1, progress: { cleared: [], top3: [], rank1: 0, drops: [] } });
assert.equal(s.heroes[0].look.body, 'body-m'); assert.equal(s.heroes[0].look.race, 'race-human'); assert.equal(s.heroes[0].look.hairStyle, 'hs-long'); assert.equal(s.heroes[0].look.skin, 'skin-3');
// one free origin change, then locked
assert(equip(s, 'race-shade') && equip(s, 'body-f')); s.heroes[0].originSet = true; assert(!equip(s, 'race-human')); assert.equal(s.heroes[0].look.race, 'race-shade');
assert(LOOK_KEYS_FOR_TEST.includes('body') && LOOK_KEYS_FOR_TEST.includes('race'), 'ID cards carry origin');
// race perks: off without the flag, never for staff, tiny when on
const mk = (race, v2 = true, cls = 'Blade') => { const h = { id: 'x', name: 'P', cls, level: 5, xp: 0, gear: 0, hp: null, look: { ...defaultLook(cls), race }, equip: { weapon: null, armor: null, trinket: null }, talents: {} };
  return { heroes: [h], gold: 0, lastTick: 0, buffs: { rested: 0, elixir: 0, vigil: 0 }, ctx: { heroV2: v2 } }; };
assert.equal(racePerk(mk('race-human', false), 'goldPct'), 0); assert.equal(racePerk(mk('race-human'), 'goldPct'), 2); assert.equal(racePerk(mk('race-human', true, GM_CLASS), 'goldPct'), 0);
const run = (race, v2) => simulate(mk(race, v2), 600), h0 = run('race-shade', true);
const close = (a, b, r) => assert(Math.abs(a / b - r) < 1e-9, `${a / b} vs ${r}`);
close(run('race-human', true).gold, h0.gold, 1.02); close(run('race-sylvan', true).xp, h0.xp, 1.02); close(run('race-beastkin', true).dmg, h0.dmg, 1.02);
close(run('race-human', false).gold, h0.gold, 1); close(effectiveDps(mk('race-beastkin')), effectiveDps(mk('race-beastkin', false)), 1.02);
const off = (race, v2) => offlineProgress(mk(race, v2), 48 * 3600e3, 12).cap;
assert.equal(off('race-shade', true), 12.24); assert.equal(off('race-shade', false), 12); assert.equal(off('race-human', true), 12);
console.log('hero v2 tests passed');

// Late-game sinks + pets: client mirror (prices, perks, clamps, skins, names). Server rules are in schema-shop.pglite.mjs.
import assert from 'node:assert';
import { SHOP, DECOR, PETS, PERKS, PET_RARITY, petPerk, petBonus, prestigePrice, memorialPrice, PET_GRIDS, EQUINOX } from '../js/prestige.js';
import { rollPet, nameOk } from '../js/shoplocal.js'; import { GM_ITEMS } from '../js/gm.js'; import { heroGrid16, defaultLook, titleOf } from '../js/cosmetics.js';
import { newHero, accrue, applyXp, levelCap } from '../js/game.js'; import { sanitizeSave } from '../js/gm.js';
assert(!SHOP.some(i => GM_ITEMS.some(g => g.id === i.id) || /equinox|vesper|sigil/i.test(i.id)), 'no staff items for sale');
assert.equal(memorialPrice(3), 1e5); assert.equal(memorialPrice(15), 1e6); assert(prestigePrice(SHOP.find(i => i.id === 'pt-patron'), 5) > 3.5e6);
for (const p of PETS) { assert.equal(PET_GRIDS[p.sp].length, 8); for (const r of PET_RARITY) assert(petPerk(p.sp, r).v >= 0); }
assert(Math.max(...PERKS.dpsPct) <= 3, 'DPS perk stays tiny'); assert.equal(petPerk('wisp', 'rare').v, 0);
assert.deepEqual(petBonus({ pets: [{ id: 1, perk: { k: 'goldPct', v: 999 } }], activePet: 1 }), { goldPct: 12 }, 'client clamps a tampered perk');
let u = 0; for (let i = 0; i < 2000; i++) if (rollPet(1).rarity === 'unique') u++; assert(u < 15);
assert.equal(rollPet(2, ['Cinderwake', 'Hollowlight', 'Gearheart', 'Rimesong', 'Lastlantern', 'Stonewhisper', 'Brassveil', 'Emberhush'], (() => { let k = 0; return () => [0.999, 0.1][k++ % 2]; })()).rarity, 'legendary', 'unique names exhausted → legendary');
for (const bad of ['a', 'Tower Staff', 'www.x.io', 'GM Kit']) assert(!nameOk(bad), bad); assert(nameOk('Brave Kit'));
// perks: gold up, XP still capped
const mk = pet => ({ gold: 0, heroes: [newHero('P', 'Blade')], lastTick: 0, ctx: {}, pets: pet ? [{ id: 1, perk: pet }] : [], activePet: 1 });
const a = accrue(mk(null), 3600e3), b = accrue(mk({ k: 'goldPct', v: 12 }), 3600e3); assert(b.gold > a.gold * 1.1 && b.gold < a.gold * 1.13);
const s = mk({ k: 'xpPct', v: 12 }); const x = accrue(s, 3600e3); applyXp(s.heroes, x.xp * 1e6, levelCap(1)); assert.equal(s.heroes[0].level, 11, 'pet XP stops at the level cap');
// Equinox: never stacks past the Decree, eclipse only for staff
const g = mk(null); g.ctx = { gm: true, decree: true }; g.equinox = true; const g1 = accrue(g, 3600e3); const g2s = mk(null); g2s.ctx = { gm: true, decree: true }; const g2 = accrue(g2s, 3600e3); assert.equal(g1.gold, g2.gold, "Architect's Light doesn't stack on the Decree");
const pl = mk(null); pl.equinox = true; pl.ctx = { eclipse: true }; assert.equal(accrue(pl, 3600e3).xp, accrue(mk(null), 3600e3).xp, 'a player save with the flag gets nothing');
const sv = { heroes: [newHero('Q', 'Blade')], inv: [], equinox: true, pets: [{ sp: 'equinox' }, { sp: 'pup' }] }; sanitizeSave(sv, false); assert(!sv.equinox && sv.pets.length === 1);
// skins + prestige titles
const look = { ...defaultLook() }; const base = heroGrid16(look, 'Blade'); look.skinSet = 'sk-stonekeep'; assert.notDeepEqual(heroGrid16(look, 'Blade'), base);
const h = { look: { ...defaultLook(), ptitle: 'pt-patron' } }; assert.equal(titleOf(h), 'Tower Patron');
assert(EQUINOX.label && DECOR.length === 4);
console.log('prestige tests passed');

// Hair v2 (FEATURES.hairV2 = 'gm'): 8 new styles + Jet. Flag off = no change for anyone; legacy looks render identically either way.
import assert from 'node:assert';
import { CATALOG, itemsFor, equip, setHairV2, heroGridV2, heroGrid16, defaultLook, byId } from '../js/cosmetics.js';
import * as H from '../js/hero64.js'; import * as HL from '../js/healer64.js'; import { composeHeroV2, HAIR_V2, JET_RAMP } from '../js/hair64.js';
import { FEATURES } from '../config.js';
assert.equal(FEATURES.hairV2, 'gm');
const NEW = ['hs-locs', 'hs-locs-short', 'hs-loc-bun', 'hs-box-braids', 'hs-afro', 'hs-cornrows', 'hs-twists', 'hs-high-top'];
for (const id of [...NEW, 'hc-jet']) assert(byId(id)?.hairV2, id);
assert.deepEqual(NEW.map(id => byId(id).value).sort(), Object.keys(HAIR_V2).sort());
const save = () => ({ heroes: [{ cls: 'Vanguard', look: defaultLook('Vanguard') }], progress: { cleared: [], top3: [], rank1: 0, drops: [] } });
// off: hidden and refused; drawn as a classic style
setHairV2(false);
assert(!itemsFor('hairStyle').some(i => i.hairV2) && !itemsFor('hairColor').some(i => i.hairV2));
{ const s = save(); assert.equal(equip(s, 'hs-afro'), false); assert.equal(equip(s, 'hc-jet'), false); assert.equal(s.heroes[0].look.hairStyle, 'hs-short'); }
{ const l = { ...defaultLook('Blade'), hairStyle: 'hs-locs' }; assert.deepEqual(heroGridV2(l, 'Blade'), heroGridV2({ ...l, hairStyle: 'hs-long' }, 'Blade')); assert.deepEqual(heroGrid16(l, 'Blade'), heroGrid16({ ...l, hairStyle: 'hs-long' }, 'Blade')); }
// legacy looks: identical with the flag off and on (every classic style x colour x race x body x class x shop skin)
const legacy = []; for (const hs of ['hs-short', 'hs-long', 'hs-spiky', 'hs-hood', 'hs-crown']) for (const hc of itemsFor('hairColor').map(i => i.id)) for (const race of ['race-human', 'race-sylvan', 'race-beastkin', 'race-shade'])
  for (const body of ['body-m', 'body-f']) for (const cls of ['Vanguard', 'Blade', 'Arcanist']) for (const skinSet of [undefined, 'sk-stonekeep', 'sk-clockfrost']) legacy.push([{ ...defaultLook(cls), hairStyle: hs, hairColor: hc, race, body, skinSet }, cls]);
const off = legacy.map(([l, c]) => JSON.stringify(heroGridV2(l, c)));
setHairV2(true); legacy.forEach(([l, c], i) => assert.equal(JSON.stringify(heroGridV2(l, c)), off[i], 'legacy look changed'));
// Wisp's verify, on the synced repo copies: composeHeroV2 == approved compose for every legacy combo
let n = 0; const P = { S: '#5a3825', H: '#b0282e', O: '#8a5634', T: '#c9a24a', W: '#dfe6f0' };
for (const body of 'mf') for (const hair of ['short', 'long', 'spiky', 'hood', 'crown']) for (const race of Object.keys(H.RACE)) for (const cls of ['', 'Vanguard', 'Blade', 'Arcanist']) for (const weapon of H.WEAPONS) for (const skinSet of [undefined, 'sk-stonekeep', 'sk-clockfrost']) {
  const look = { body, hair, race, cls, weapon, mount: 'hand', skinSet, outfit: 'tunic', ...P }; assert.deepEqual(composeHeroV2(look), H.composeHero64(look)); n++; }
assert(n > 1000);
// on: listed, equippable, all styles render 64x64 on every race/body/class; Jet uses its own ramp except on Shade or a skin that sets hair
assert.equal(itemsFor('hairStyle').filter(i => i.hairV2).length, 8); assert(itemsFor('hairColor').some(i => i.id === 'hc-jet'));
{ const s = save(); assert(equip(s, 'hs-afro') && equip(s, 'hc-jet')); }
for (const hs of NEW) for (const race of ['race-human', 'race-sylvan', 'race-beastkin', 'race-shade']) for (const body of ['body-m', 'body-f']) for (const cls of ['Vanguard', 'Blade', 'Arcanist']) {
  const g = heroGridV2({ ...defaultLook(cls), hairStyle: hs, hairColor: 'hc-jet', race, body }, cls); assert.equal(g.rows.length, 64); assert(g.rows.every(r => r.length === 64));
  const cols = new Set(Object.values(g.pal)); assert.equal(JET_RAMP.slice(0, 3).some(c => cols.has(c)), race !== 'race-shade', `${hs} ${race}: Jet ramp`); assert(heroGrid16({ ...defaultLook(cls), hairStyle: hs }, cls).rows.length === 16); }
assert(!new Set(Object.values(heroGridV2({ ...defaultLook('Vanguard'), hairStyle: 'hs-afro', hairColor: 'hc-jet', skinSet: 'sk-stonekeep' }, 'Vanguard').pal)).has(JET_RAMP[1]), 'skin sets hair: no Jet ramp');
{ const c = new Set(Object.values(heroGridV2({ ...defaultLook('Vanguard'), hairStyle: 'hs-long', hairColor: 'hc-jet' }, 'Vanguard').pal)); assert(JET_RAMP.some(x => c.has(x)), 'Jet on classic styles too'); }
setHairV2(false); console.log('hair v2 tests passed', n, 'legacy combos');
// hats: only a class whose head layer draws pixels (Arcanist) gets the under-hat variant; Vanguard/Blade keep full volume (artist rev 4)
{ const top = cls => composeHeroV2({ body: 'm', hair: 'afro', race: Object.keys(H.RACE)[0], cls, weapon: H.WEAPONS[0], mount: 'hand', outfit: 'tunic', ...P }).rows.slice(0, 20).join('\n');
  const H0 = top(''); assert.equal(top('Vanguard'), H0, 'Vanguard afro full volume'); assert.equal(top('Blade'), H0, 'Blade afro full volume'); assert.notEqual(top('Arcanist'), H0, 'Arcanist uses the hat variant'); }

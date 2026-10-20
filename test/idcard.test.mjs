// Player ID card (js/idcard.js): card shape, staff stripping, rendering, rarity colours, cache TTL, no private fields.
import assert from 'node:assert';
const C = await import('../js/idcard.js'); const { newHero } = await import('../js/game.js'); const { RARITIES, forgeUnique } = await import('../js/loot.js'); const { GM_TITLE, GM_CLASS } = await import('../js/gm.js'); const { SPIRIT } = await import('../js/prestige.js');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const h = newHero('Tess', 'Blade'); h.level = 9; h.gear = 3; h.look = { title: 't-novice', nameColor: 'nc-ember', skinSet: 'sk-stonekeep' };
h.equip = { weapon: forgeUnique(5, 'fire', 'lastLayer', 'drain'), armor: { id: 'a1', slot: 'armor', rarity: 'epic', name: 'Frost <Mail>', floor: 4, element: 'frost', stats: { dpsPct: 9 } }, trinket: null };
const save = { heroes: [h], gold: 123456, pets: [{ id: 7, sp: 'owl', rarity: 'rare', perk: { k: 'lootPct', v: 8 } }], activePet: 7, email: 'x@example.test', wallet: 'W4LLET' };
const card = C.cardFromSave(save, { guild: { tag: 'LW', name: 'Lantern Watch' } });
const txt = JSON.stringify(card); for (const bad of ['example.test', 'W4LLET', '123456']) assert(!txt.includes(bad), `no private field: ${bad}`);
assert.equal(card.level, 9); assert.equal(card.equip.armor.rarity, 'epic'); assert.equal(card.pet.sp, 'owl'); assert(!card.st);
const html = C.cardHtml(card, { esc, fmt: String });
assert.match(html, /Tess/); assert.match(html, /Lv 9/); assert.match(html, /Stone-Keep Knight/); assert.match(html, /Gear Owl/); assert.match(html, /\[LW\]/);
assert(html.includes(RARITIES.find(r => r.id === 'epic').color), 'epic colour'); assert(html.includes(RARITIES.find(r => r.id === 'unique').color), 'unique colour');
assert.match(html, /Frost &#60;Mail&#62;/, 'names are escaped'); assert.match(html, /30% DPS/, 'unique ability listed'); assert.match(html, /DPS<\/small><b>[\d.]+/);
// a player card that somehow carries staff gear, a staff title or the spirit renders without them
const forged = { name: 'Faker', cls: GM_CLASS, level: 5, equip: { weapon: { name: 'Eventide', slot: 'weapon', rarity: 'unique', gm: true, id: 'gm-eventide', stats: { dps: 999 } } }, look: { title: 'gm-title', aura: 'gm-aura' }, spirit: true, pet: { sp: 'solumbra', rarity: 'divine' } };
const fh = C.cardHtml(forged, { esc }); assert(!fh.includes('Eventide') && !fh.includes(GM_TITLE) && !fh.includes(SPIRIT.title) && !fh.includes('Tower Staff'), 'no staff content on a non-staff card');
// the staff card: Architect title + Solumbra, no role internals
const gm = C.cardHtml({ name: 'Staff', cls: GM_CLASS, level: 99, st: true, spirit: true, equip: {}, look: { title: 'gm-title' } }, { esc });
assert(gm.includes(GM_TITLE) && gm.includes(SPIRIT.title) && gm.includes('Tower Staff')); assert(!/role|passphrase|hash/i.test(gm));
// simulated players: deterministic, full gear
const f1 = C.fakeCard('Mossveil', 6), f2 = C.fakeCard('Mossveil', 6); assert.deepEqual(f1, f2); assert.equal(Object.keys(f1.equip).length, 3); assert(f1.sim);
assert.match(C.cardHtml(null), /No ID card/);
// cache: one fetch per TTL
let t = 0, n = 0; const cache = new C.CardCache(C.CARD_TTL, () => t); const fetcher = async () => ({ n: ++n });
await cache.get('n:A', fetcher); await cache.get('n:A', fetcher); assert.equal(n, 1); t += C.CARD_TTL - 1; await cache.get('n:A', fetcher); assert.equal(n, 1); t += 2; await cache.get('n:A', fetcher); assert.equal(n, 2);
assert.equal(C.CARD_TTL, 300000);
console.log('idcard tests passed');

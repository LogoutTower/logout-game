// Hero art v2 (64x64, artist modules synced into js/ by scripts/sync-art.sh): every combo renders, GM forms follow the tier, NPCs, catalog defaults.
import assert from 'node:assert/strict';
import { CATALOG, defaultLook, byId, heroGrid, itemsFor, migrateSave, SKINS, gmForm } from '../js/cosmetics.js';
import { CLASSES } from '../js/game.js'; import { GM_CLASS } from '../js/gm.js'; import { npcGridV2 } from '../js/npc64.js';
const ok = (g, n = 64) => { assert.equal(g.rows.length, n); for (const r of g.rows) assert.equal(r.length, n); for (const ch of g.rows.join('')) assert(ch === '.' || /^#[0-9a-f]{6}$/i.test(g.pal[ch]), `colour for ${ch}`); return g; };
const flat = g => g.rows.map(r => [...r].map(c => c === '.' ? '.' : g.pal[c]).join('')).join('|');
const of = t => CATALOG.filter(i => i.type === t); let n = 0;
for (const cls of Object.keys(CLASSES)) for (const w of itemsFor('weapon', cls)) for (const hs of of('hairStyle')) for (const os of of('outfitStyle')) for (const b of of('body')) for (const r of of('race')) for (const sk of [undefined, ...Object.keys(SKINS)]) {
  ok(heroGrid({ ...defaultLook(cls), weapon: w.id, hairStyle: hs.id, outfitStyle: os.id, body: b.id, race: r.id, skinSet: sk }, cls, true)); n++; }
for (const slot of ['skin', 'hairColor', 'outfitColor', 'trim', 'weaponColor']) for (const it of itemsFor(slot)) ok(heroGrid({ ...defaultLook('Blade'), [slot]: it.id }, 'Blade', true));
const base = defaultLook('Blade');
assert.notEqual(flat(heroGrid(base, 'Blade', true)), flat(heroGrid({ ...base, body: 'body-f' }, 'Blade', true)), 'male/female differ');
assert.equal(new Set(of('race').map(r => flat(heroGrid({ ...base, race: r.id }, 'Blade', true)))).size, 4, 'races differ');
assert.equal(heroGrid(base, 'Blade', false).rows.length, 32, 'flag off: classic 32x32');
// catalog: new colours + defaults for new heroes; old saves keep their own picks and get body/race defaults
for (const [id, hex] of [['hc-chestnut', '#4e3020'], ['hc-crimson', '#b0282e'], ['oc-saddle', '#8a5634'], ['tr-brass', '#c9a24a'], ['skin-peach', '#e8b896']]) assert.equal(byId(id)?.value, hex, id);
assert.deepEqual([base.skin, base.hairColor, base.outfitColor, base.trim], ['skin-peach', 'hc-chestnut', 'oc-saddle', 'tr-brass']);
// GM: tier form by level, Unsheathed codex skin, body/race ignored
assert.deepEqual([1, 29, 30, 44, 45, 59, 60, 99].map(l => gmForm({}, l)), ['form1', 'form1', 'form1glow', 'form1glow', 'form2', 'form2', 'form3', 'form3']);
assert.equal(gmForm({ weaponColor: 'gm-unsheathed' }, 60), 'unsheathed');
const forms = new Set([1, 30, 45, 60].map(l => flat(ok(heroGrid({}, GM_CLASS, true, l))))); assert.equal(forms.size, 4, 'four GM forms');
assert.equal(flat(heroGrid({ body: 'body-f', race: 'race-shade' }, GM_CLASS, true, 60)), flat(heroGrid({}, GM_CLASS, true, 60)));
assert.notEqual(flat(heroGrid({}, GM_CLASS, true, 60, { key: true })), flat(heroGrid({}, GM_CLASS, true, 60)), 'Root Key layer'); assert.notEqual(flat(heroGrid({}, GM_CLASS, true, 60, { key: true, keyDy: -1 })), flat(heroGrid({}, GM_CLASS, true, 60, { key: true })), 'key bob frame');
for (const k of ['innkeeper', 'merchant']) ok(npcGridV2(k));
console.log(`hero64 ok (${n} combos)`);

// Cosmetics: catalog, unlock rules, save migration, layered sprite grids. Pure (no DOM). No stat effects.
import { SHOP } from './prestige.js';
export const SAVE_VERSION = 5;
const I = (id, type, label, value, unlock = null, extra = {}) => ({ id, type, label, value, unlock, ...extra });
export const CATALOG = [
  // skin tones
  I('skin-1', 'skin', 'Pale', '#f1d1b5'), I('skin-2', 'skin', 'Sand', '#c9a27a'), I('skin-3', 'skin', 'Umber', '#8a5a3c'), I('skin-4', 'skin', 'Deep', '#5a3825'), I('skin-peach', 'skin', 'Peach', '#e8b896'),
  I('skin-ghost', 'skin', 'Ghost', '#b8f3ff', { floor: 7 }),
  // hair colour
  I('hc-ink', 'hairColor', 'Ink', '#3b2c66'), I('hc-rust', 'hairColor', 'Rust', '#b4532a'), I('hc-straw', 'hairColor', 'Straw', '#e8c35a'), I('hc-plum', 'hairColor', 'Plum', '#7a3d9e'), I('hc-chestnut', 'hairColor', 'Chestnut', '#4e3020'), I('hc-crimson', 'hairColor', 'Crimson', '#b0282e'),
  I('hc-silver', 'hairColor', 'Static Silver', '#d6e2ff', { floor: 2 }), I('hc-neon', 'hairColor', 'Neon Cyan', '#3ff7ff', { top3: 1 }),
  // hair style
  I('hs-short', 'hairStyle', 'Short', 'short'), I('hs-long', 'hairStyle', 'Long', 'long'), I('hs-spiky', 'hairStyle', 'Spiky', 'spiky'), I('hs-hood', 'hairStyle', 'Hood', 'hood'),
  I('hs-crown', 'hairStyle', 'Broken Crown', 'crown', { floor: 9 }),
  // Hair v2 (js/hair64.js, behind FEATURES.hairV2): listed, equippable and drawn only while setHairV2(true); otherwise hidden and drawn as a classic style.
  ...[['hs-locs', 'Locs', 'locs'], ['hs-locs-short', 'Shoulder Locs', 'locs-short'], ['hs-loc-bun', 'Loc Bun', 'loc-bun'], ['hs-box-braids', 'Box Braids', 'box-braids'], ['hs-afro', 'Afro', 'afro'],
    ['hs-cornrows', 'Cornrows', 'cornrows'], ['hs-twists', 'Two-Strand Twists', 'twists'], ['hs-high-top', 'High-Top Fade', 'high-top']].map(([id, n, v]) => I(id, 'hairStyle', n, v, null, { hairV2: true })),
  I('hc-jet', 'hairColor', 'Jet', '#231c22', null, { hairV2: true }),
  // outfit
  I('oc-cyan', 'outfitColor', 'Cyan', '#2bb8c9'), I('oc-magenta', 'outfitColor', 'Magenta', '#c2369e'), I('oc-violet', 'outfitColor', 'Violet', '#6a4bd8'), I('oc-saddle', 'outfitColor', 'Saddle Leather', '#8a5634'), I('oc-moss', 'outfitColor', 'Moss', '#4f8a4b'),
  I('oc-null', 'outfitColor', 'Null Black', '#26232e', { floor: 4 }),
  I('os-tunic', 'outfitStyle', 'Tunic', 'tunic'), I('os-robe', 'outfitStyle', 'Robe', 'robe'), I('os-plate', 'outfitStyle', 'Plate', 'plate'),
  I('os-wings', 'outfitStyle', 'Seraph Cloak', 'cloak', { floor: 8 }),
  // armor trim
  I('tr-steel', 'trim', 'Steel', '#9aa3b5'), I('tr-brass', 'trim', 'Brass', '#c9a24a'), I('tr-bronze', 'trim', 'Bronze', '#b07a3c'),
  I('tr-gold', 'trim', 'Guardian Gold', '#ffd84f', { floor: 3 }), I('tr-blood', 'trim', 'Blood Trim', '#ff3355', { top3: 2 }),
  // weapons per class (shape) + weapon colour
  I('w-v-sword', 'weapon', 'Longsword', 'sword', null, { cls: 'Vanguard' }), I('w-v-axe', 'weapon', 'Axe', 'axe', null, { cls: 'Vanguard' }),
  I('w-v-tower', 'weapon', 'Tower Lance', 'lance', { floor: 6 }, { cls: 'Vanguard' }),
  I('w-b-blade', 'weapon', 'Curved Blade', 'curve', null, { cls: 'Blade' }), I('w-b-dagger', 'weapon', 'Twin Daggers', 'dagger', null, { cls: 'Blade' }),
  I('w-b-scythe', 'weapon', 'Scythe', 'scythe', { floor: 6 }, { cls: 'Blade' }),
  I('w-a-staff', 'weapon', 'Staff', 'staff', null, { cls: 'Arcanist' }), I('w-a-orb', 'weapon', 'Orb Staff', 'orb', null, { cls: 'Arcanist' }),
  I('w-a-wand', 'weapon', 'Rune Wand', 'wand', { floor: 6 }, { cls: 'Arcanist' }),
  I('wc-steel', 'weaponColor', 'Steel', '#dfe6f0'), I('wc-void', 'weaponColor', 'Void', '#9a5cff', { floor: 5 }), I('wc-first', 'weaponColor', 'First Light', '#fff6a8', { rank1: 1 }),
  // titles
  I('t-trapped', 'title', 'Trapped', 'Trapped'), I('t-f1', 'title', 'Floor 1 Survivor', 'Floor 1 Survivor', { floor: 1 }),
  I('t-breaker', 'title', 'Guardian Breaker', 'Guardian Breaker', { floor: 5 }), I('t-unlogged', 'title', 'Unlogged', 'Unlogged', { floor: 10 }),
  I('t-top', 'title', 'Top Blade', 'Top Blade', { top3: 1 }), I('t-first', 'title', 'First Strike', 'First Strike', { rank1: 1 }),
  // name colours
  I('nc-white', 'nameColor', 'Plain', '#e6dcff'), I('nc-cyan', 'nameColor', 'Cyan', '#3ff7ff'),
  I('nc-gold', 'nameColor', 'Choir Gold', '#ffd84f', { floor: 8 }), I('nc-exit', 'nameColor', 'Exit Green', '#5cff8a', { floor: 10 }),
  I('nc-pink', 'nameColor', 'Blood Pink', '#ff4fd8', { top3: 3 }),
  // aura (rendered as a soft glow around the hero)
  I('au-none', 'aura', 'None', ''),
  // Tailor (gold only, js/sinks.js TAILOR): never staff items
  I('nc-ember', 'nameColor', 'Ember', '#ff8a3d', { shop: 1 }), I('nc-frost', 'nameColor', 'Hoarfrost', '#9fe6ff', { shop: 1 }), I('nc-moss', 'nameColor', 'Moss', '#8fd47f', { shop: 1 }),
  I('t-patron', 'title', 'Patron of the Hold', 'Patron of the Hold', { shop: 1 }), I('t-gearwright', 'title', 'Gearwright', 'Gearwright', { shop: 1 }), I('t-lamplighter', 'title', 'Lamplighter', 'Lamplighter', { shop: 1 }),
  I('au-ember', 'aura', 'Ember Halo', '#ff8a3d', { shop: 1 }),
  // day-7 login chest (js/daily.js CHEST_COSMETICS)
  I('nc-dawn', 'nameColor', 'Dawnstreak', '#ffc6a0', { chest: 1 }), I('t-faithful', 'title', 'Faithful Climber', 'Faithful Climber', { chest: 1 }), I('au-dawn', 'aura', 'Dawn Halo', '#ffc6a0', { chest: 1 }),
  // rare element-themed boss drops (2-5%)
  I('oc-ember', 'outfitColor', 'Ember Weave', '#e0502a', { drop: 'fire' }), I('au-frost', 'aura', 'Frost Aura', '#9fd8ff', { drop: 'frost' }),
  I('wc-voidshard', 'weaponColor', 'Voidshard', '#b06cff', { drop: 'void' }), I('hc-storm', 'hairColor', 'Stormlit', '#cfe0ff', { drop: 'storm' }),
  I('tr-venom', 'trim', 'Venom Gilt', '#8ae04a', { drop: 'venom' }), I('au-holy', 'aura', 'Hallowed Aura', '#fff3a0', { drop: 'holy' }),
  // origin (hero v2): body type + race, picked at creation (existing heroes get one free change in the Wardrobe). Race perks: config.js RACE_PERKS
  I('body-m', 'body', 'Male', 'm'), I('body-f', 'body', 'Female', 'f'),
  I('race-human', 'race', 'Human', 'human'), I('race-sylvan', 'race', 'Sylvan', 'sylvan'), I('race-beastkin', 'race', 'Beastkin', 'beastkin'), I('race-shade', 'race', 'Shade', 'shade'),
  I('au-blood', 'aura', 'Blood Aura', '#ff3355', { drop: 'blood' }), I('nc-shadow', 'nameColor', 'Shadowglass', '#a8a0c8', { drop: 'shadow' }),
];
export const DROP_COSMETICS = CATALOG.filter(i => i.unlock?.drop);
export const SLOTS = ['skin', 'hairColor', 'hairStyle', 'outfitColor', 'outfitStyle', 'trim', 'weapon', 'weaponColor', 'aura', 'title', 'nameColor'];
export const CREATION_SLOTS = ['skin', 'hairColor', 'hairStyle', 'outfitColor'];
export const ORIGIN_SLOTS = ['body', 'race']; // hero v2 only (FEATURES.heroV2)
export const byId = id => CATALOG.find(i => i.id === id) || GM_ITEMS.find(i => i.id === id); // staff items resolve for rendering only; never listed
let HAIRV2 = false; export const setHairV2 = on => { HAIRV2 = !!on; }; export const hairV2On = () => HAIRV2; // FEATURES.hairV2; main.js sets it once the staff check is known
export const itemsFor = (slot, cls) => CATALOG.filter(i => i.type === slot && (!i.cls || i.cls === cls) && (!i.hairV2 || HAIRV2));
// Flag off: a v2 style (e.g. on a staff look seen on an ID card) is drawn as the nearest classic style, and Jet with the plain ramp.
const HAIR_V1 = { locs: 'long', 'box-braids': 'long', twists: 'long' }; const hairOf = v => byId(v)?.hairV2 && !HAIRV2 ? HAIR_V1[byId(v).value] || 'short' : byId(v)?.value;
export function unlockText(u) {
  if (!u) return 'Available';
  if (u.floor) return `Clear Floor ${u.floor}`;
  if (u.top3) return u.top3 === 1 ? 'Top-3 damage on a floor kill' : `Top-3 damage on ${u.top3} floor kills`;
  if (u.rank1) return '#1 damage on a floor kill';
  if (u.drop) return `Rare drop from ${u.drop} bosses`;
  if (u.chest) return 'Day-7 login chest';
  if (u.shop) return 'Sold by the Tailor (Town · Goods)';
}
export function isUnlocked(item, progress) {
  const u = item.unlock; if (!u) return true;
  if (u.floor) return progress.cleared.includes(u.floor);
  if (u.top3) return progress.top3.length >= u.top3;
  if (u.rank1) return progress.rank1 >= u.rank1;
  if (u.drop || u.shop || u.chest) return (progress.drops || []).includes(item.id);
  return false;
}
export const unlockedIds = progress => CATALOG.filter(i => isUnlocked(i, progress)).map(i => i.id);
/** Record a floor clear (rank = player's 1-based damage rank, 0 if absent; share = player dmg / boss max HP). Returns newly unlocked items. */
export const MIN_RANK_SHARE = 0.05; // need >=5% of boss max HP for top-3/#1 unlocks
export function recordClear(save, floor, rank, share = 1) {
  if (share < MIN_RANK_SHARE) rank = 0;
  const p = save.progress, before = new Set(unlockedIds(p));
  if (!p.cleared.includes(floor)) p.cleared.push(floor);
  if (rank >= 1 && rank <= 3 && !p.top3.includes(floor)) p.top3.push(floor);
  if (rank === 1) p.rank1++;
  return CATALOG.filter(i => isUnlocked(i, p) && !before.has(i.id));
}
export function defaultLook(cls) {
  const w = (itemsFor('weapon', cls)[0] || itemsFor('weapon', 'Vanguard')[0]).id;
  return { skin: 'skin-peach', hairColor: 'hc-chestnut', hairStyle: 'hs-short', outfitColor: 'oc-saddle', outfitStyle: 'os-tunic', trim: 'tr-brass', weapon: w, weaponColor: 'wc-steel', title: 't-trapped', nameColor: 'nc-white', aura: 'au-none', body: 'body-m', race: 'race-human' };
}
/** Choose an item if unlocked & valid for the class; returns true on success. */
export function equip(save, id) {
  const it = byId(id), h = save.heroes[0];
  if (!it || !isUnlocked(it, save.progress) || (it.cls && it.cls !== h.cls) || (it.hairV2 && !HAIRV2)) return false;
  if (ORIGIN_SLOTS.includes(it.type) && h.originSet) return false; // origin is chosen once (creation or the one free Wardrobe change)
  h.look[it.type] = id; return true;
}
export function migrateSave(s) {
  if (!s) return s;
  if (!s.version || s.version < 2) {
    s.heroes.forEach(h => { h.look = { ...defaultLook(h.cls), ...(h.look || {}) }; });
    s.progress = s.progress || { cleared: [], top3: [], rank1: 0 };
    s.version = 2;
  }
  if (s.version < 3) { // v3: loot inventory, equipped gear, drop cosmetics, aura slot
    s.inv = s.inv || []; s.lootSeq = s.lootSeq || 0; s.progress.drops = s.progress.drops || [];
    s.heroes.forEach(h => { h.equip = h.equip || { weapon: null, armor: null, trinket: null }; h.look = { ...defaultLook(h.cls), ...(h.look || {}) }; h.look.aura = h.look.aura || 'au-none'; });
    s.version = 3;
  }
  if (s.version < 4) { // v4: hero HP, town buffs, shop purchases
    s.heroes.forEach(h => { if (h.hp == null) h.hp = null; }); // null = full HP (resolved against max HP at runtime)
    s.buffs = s.buffs || { rested: 0, elixir: 0, vigil: 0 }; s.shop = s.shop || null;
    s.version = 4;
  }
  if (s.version < 5) { // v5: talent trees (existing heroes get points for their level automatically: points = level − 1)
    for (const h of s.heroes || []) { h.talents = h.talents || {}; h.respecs = h.respecs || 0; }
    s.version = 5;
  }
  for (const h of s.heroes || []) h.look = { ...defaultLook(h.cls), ...(h.look || {}) }; // repair partial looks on any version
  return s;
}
export const titleOf = h => (h.look.ptitle && SHOP.find(i => i.id === h.look.ptitle && i.kind === 'prestige')?.label) || byId(h.look.title).value; // bought prestige title wins
export const nameColorOf = h => byId(h.look.nameColor).value;
// Deterministic fake profiles for simulated players.
export function fakeProfile(name) {
  let x = 0; for (const c of name) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  const t = itemsFor('title'), n = itemsFor('nameColor');
  return { title: t[x % t.length].value, color: n[(x >>> 4) % n.length].value };
}

import { shade } from './pixel.js';
import { GM_ITEMS, GM_CLASS } from './gm.js';
import { composeHero64 } from './hero64.js';
import { composeHeroV2 } from './hair64.js';
import { SIG_WEAPON, SIG_OUTFIT } from './drops-21-30.js';
import { WEAPON as W64, OUTFIT as O64 } from './hero64.js';
Object.assign(W64, SIG_WEAPON); Object.assign(O64, SIG_OUTFIT); // arc 3 signature layers (same as composeHeroSig's register)
/** Look overrides from equipped arc 3 signature weapon/armor (look.sig = { weapon, outfit, W, O, T }). */
export const sigLook = h => { const w = h?.equip?.weapon?.sigEquip, a = h?.equip?.armor?.sigEquip; return w || a ? { ...(a || {}), ...(w || {}), ...(w && a ? { T: w.T } : {}) } : null; };
import { composeGM, GM_TIERS as GM_FORMS } from './gm64.js';
import { gmTier } from './gm.js';
// ---------- layered sprite: 16x16 layer grid, shaded/outlined to 32x32 ----------
export const HERO_SIZE = 32;
const BASE = [ // chibi proportions: big head (rows 2-8), small body (rows 9-15)
  '................', '................', '.....kkkkkk.....', '....kSSSSSSk....', '...kSSSSSSSSk...', '...kSSeSSeSSk...', '...kSSfSSfSSk...', '...kSmSSSSmSk...',
  '....kSSSSSSk....', '.....kOOOOk.....', '....kOOOOOOk....', '...SkOTOOTOkS...', '....kOOOOOOk....', '.....kTTTTk.....', '.....bb..bb.....', '.....bb..bb.....'];
const HAND_DY = 3; // weapons were authored for the old hand row; shift down to the chibi hand
const WEAPONS = { // [x,y,ch] lists drawn at the hero's right hand (col 12-15)
  sword: [[13,2,'W'],[13,3,'W'],[13,4,'W'],[13,5,'W'],[13,6,'W'],[12,7,'w'],[13,7,'w'],[14,7,'w'],[13,8,'w']],
  axe: [[13,3,'w'],[13,4,'w'],[13,5,'w'],[13,6,'w'],[13,7,'w'],[13,8,'w'],[14,3,'W'],[15,3,'W'],[14,4,'W'],[15,4,'W'],[14,5,'W']],
  lance: [[13,0,'W'],[13,1,'W'],[13,2,'W'],[13,3,'W'],[13,4,'W'],[13,5,'W'],[13,6,'w'],[13,7,'w'],[13,8,'w'],[13,9,'w'],[12,5,'W'],[14,5,'W']],
  curve: [[14,3,'W'],[14,4,'W'],[13,5,'W'],[13,6,'W'],[13,7,'w'],[13,8,'w']],
  dagger: [[13,6,'W'],[13,7,'W'],[13,8,'w'],[2,6,'W'],[2,7,'W'],[2,8,'w']],
  scythe: [[13,1,'w'],[13,2,'w'],[13,3,'w'],[13,4,'w'],[13,5,'w'],[13,6,'w'],[13,7,'w'],[13,8,'w'],[13,9,'w'],[12,1,'W'],[11,1,'W'],[10,2,'W'],[14,1,'W']],
  staff: [[13,2,'W'],[13,3,'w'],[13,4,'w'],[13,5,'w'],[13,6,'w'],[13,7,'w'],[13,8,'w'],[13,9,'w'],[13,10,'w']],
  orb: [[12,1,'W'],[13,1,'W'],[14,1,'W'],[12,2,'W'],[13,2,'p'],[14,2,'W'],[13,3,'w'],[13,4,'w'],[13,5,'w'],[13,6,'w'],[13,7,'w'],[13,8,'w'],[13,9,'w'],[13,10,'w']],
  wand: [[13,5,'W'],[14,4,'W'],[12,4,'W'],[13,3,'W'],[13,6,'w'],[13,7,'w'],[13,8,'w']],
};
const GM_GRID = [ // hooded long coat, face in full shadow with two faint cyan glints, gold trim, flared hem
  '................', '.....kkkkkk.....', '....kOOOOOOk....', '...kOOOOOOOOk...', '..kOOTTTTTTOOk..', '..kOTvvvvvvTOk..', '..kOTvcvvcvTOk..', '..kOTvvvvvvTOk..', '...kOTvvvvTOk...', '...kTOOOOOOTk...', '..kOOTOOOOTOOk..', '..kbOTOOOOTObk..', '..kOOTOOOOTOOk..', '.kOOOTOOOOTOOOk.', 'kOOOOTOOOOTOOOOk', 'kTTTTTkbbkTTTTTk'];
const GM_KATANA = [[14,0,'K'],[14,1,'K'],[15,1,'y'],[14,2,'K'],[14,3,'K'],[15,3,'y'],[14,4,'K'],[14,5,'K'],[15,5,'y'],[14,6,'K'],[14,7,'K'],[13,8,'y'],[14,8,'y'],[15,8,'y'],[14,9,'b'],[14,10,'b']]; // single void katana, gold spine + guard
/** Returns {rows: 32 strings of 32 chars, pal: char->colour} for a look + class. */
export const heroGrid = (look, cls, v2 = false, level = 1, gmOpt = {}) => v2 ? heroGridV2(look, cls, level, gmOpt) : shade(heroGrid16(look, cls).rows, heroGrid16(look, cls).pal, { flat: cls === GM_CLASS ? 'fmvcy' : 'fm' });
/** Hero art v2 (64x64, pre-shaded by the artist: drawn as-is, no shade()). js/hero64.js + js/gm64.js are synced copies (scripts/sync-art.sh).
 * The staff hero ignores body/race: its sword form follows the level tier (GM_TIERS), or the Unsheathed codex skin. */
export const gmForm = (look, level = 1) => look?.weaponColor === 'gm-unsheathed' ? 'unsheathed' : GM_FORMS[gmTier(level).n];
export function heroGridV2(look, cls, level = 1, { key = false, keyDy = 0 } = {}) { // key: the Root Key at the neck (only when it is equipped)
  if (cls === GM_CLASS) return composeGM(gmForm(look, level), { key, keyDy });
  const l = { ...defaultLook(cls), ...look }, v = id => byId(id)?.value, sg = l.sig || {};
  const P = { S: v(l.skin), H: v(l.hairColor), O: v(l.outfitColor), T: v(l.trim), W: v(l.weaponColor) };
  for (const k of ['W', 'O', 'T']) if (sg[k]) P[k] = sg[k];
  return (HAIRV2 ? composeHeroV2 : composeHero64)({ body: v(l.body) === 'f' ? 'f' : 'm', hair: hairOf(l.hairStyle) || 'short', race: v(l.race) || 'human', mount: l.sigMount === 'back' && sg.weapon ? 'back' : 'hand', weapon: sg.weapon || v(l.weapon) || 'sword',
    outfit: sg.outfit || v(l.outfitStyle), cls, skinSet: l.skinSet, ...P });
}
// Shop hero skins (owned server-side, see js/prestige.js): a palette plus a few arc-themed details over any look.
export const SKINS = {
  'sk-stonekeep': { pal: { O: '#8d8798', T: '#d9c48a', H: '#6d6878', W: '#cfd3dc', g: '#4b4656' }, draw: (set, fill) => { fill(3, 12, 2, 3, 'H'); fill(4, 11, 1, 1, 'H'); [5, 7, 8, 10].forEach(x => set(x, 4, 'H')); set(7, 3, 'T'); set(8, 3, 'T'); [5, 10].forEach(x => set(x, 11, 'g')); set(7, 12, 'g'); set(8, 13, 'g'); } },
  'sk-clockfrost': { pal: { O: '#7fd6ff', T: '#c9a25a', H: '#e8fbff', W: '#bff3ff', g: '#5d4a2b' }, draw: (set, fill) => { [[7, 11], [8, 11], [7, 12], [8, 12]].forEach(([x, y]) => set(x, y, 'T')); set(6, 11, 'g'); set(9, 12, 'g'); [4, 6, 9, 11].forEach(x => set(x, 1, 'H')); set(3, 10, 'T'); set(12, 10, 'T'); } },
};
export function heroGrid16(look, cls) {
  if (cls === GM_CLASS) { const g = GM_GRID.map(r => [...r]); for (const [x, y, c] of GM_KATANA) g[y][x] = c;
    return { rows: g.map(r => r.join('')), pal: { k: '#05030a', O: '#17131f', T: '#d9a93f', v: '#030106', c: '#5ff6ff', K: '#0a0710', y: '#ffd76a', b: '#241c30' } }; }
  const g = BASE.map(r => [...r]), set = (x, y, c) => { if (x >= 0 && x < 16 && y >= 0 && y < 16) g[y][x] = c; };
  const fill = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const style = byId(look.outfitStyle).value, hs0 = byId(look.hairStyle), hair = hs0?.hairV2 ? HAIR_V1[hs0.value] || 'short' : hs0.value; // classic 16x16: v2 styles map to the nearest classic one
  if (style === 'robe') { fill(4, 11, 13, 14, 'O'); fill(4, 11, 15, 15, 'T'); }
  if (style === 'plate') { [3, 4, 11, 12].forEach(x => set(x, 10, 'T')); set(6, 12, 'T'); set(9, 12, 'T'); }
  if (style === 'cloak') { fill(2, 2, 10, 14, 'O'); fill(13, 13, 10, 14, 'O'); set(1, 11, 'T'); set(14, 11, 'T'); }
  const top = () => { fill(4, 11, 2, 2, 'H'); fill(3, 12, 3, 3, 'H'); [3, 4, 5, 7, 9, 10, 11, 12].forEach(x => set(x, 4, 'H')); };
  if (hair === 'short') top();
  if (hair === 'long') { top(); fill(2, 3, 5, 10, 'H'); fill(12, 13, 5, 10, 'H'); }
  if (hair === 'spiky') { top(); [4, 6, 8, 10, 11].forEach(x => set(x, 1, 'H')); set(5, 0, 'H'); set(9, 0, 'H'); }
  if (hair === 'hood') { fill(5, 10, 1, 1, 'O'); fill(3, 12, 2, 2, 'O'); fill(2, 13, 3, 3, 'O'); fill(2, 3, 4, 9, 'O'); fill(12, 13, 4, 9, 'O'); [4, 5, 10, 11].forEach(x => set(x, 4, 'H')); }
  if (hair === 'crown') { top(); fill(4, 11, 1, 1, 'y'); [4, 7, 8, 11].forEach(x => set(x, 0, 'y')); }
  // class silhouettes
  if (cls === 'Vanguard') { fill(0, 3, 10, 14, 'T'); fill(1, 2, 11, 13, 'O'); set(3, 10, 'T'); set(12, 10, 'T'); } // kite shield + pauldrons
  if (cls === 'Blade') { [[4, 9], [3, 9], [2, 10], [1, 10], [1, 11], [0, 12]].forEach(([x, y]) => set(x, y, 'r')); } // trailing scarf
  if (cls === 'Arcanist' && hair !== 'hood' && hair !== 'crown') { set(10, 0, 'O'); set(11, 0, 'O'); fill(7, 9, 1, 1, 'O'); fill(5, 10, 2, 2, 'T'); fill(2, 13, 3, 3, 'O'); } // soft pointed hat
  for (const [x, y, c] of WEAPONS[byId(look.weapon).value] || []) set(x, y + HAND_DY, c);
  const sk = SKINS[look.skinSet]; if (sk) sk.draw(set, fill);
  const pal = { k: '#12062a', e: '#12062a', f: '#2a1d45', m: '#ff8fa8', r: '#ff3355', b: '#3a2a55', y: '#ffd84f', p: '#ff4fd8', S: byId(look.skin).value, H: byId(look.hairColor).value,
    O: byId(look.outfitColor).value, T: byId(look.trim).value, W: byId(look.weaponColor).value, w: '#6b4a2b' };
  if (sk) Object.assign(pal, sk.pal);
  return { rows: g.map(r => r.join('')), pal };
}

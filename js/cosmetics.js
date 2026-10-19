// Cosmetics: catalog, unlock rules, save migration, layered sprite grids. Pure (no DOM). No stat effects.
export const SAVE_VERSION = 2;
const I = (id, type, label, value, unlock = null, extra = {}) => ({ id, type, label, value, unlock, ...extra });
export const CATALOG = [
  // skin tones
  I('skin-1', 'skin', 'Pale', '#f1d1b5'), I('skin-2', 'skin', 'Sand', '#c9a27a'), I('skin-3', 'skin', 'Umber', '#8a5a3c'), I('skin-4', 'skin', 'Deep', '#5a3825'),
  I('skin-ghost', 'skin', 'Ghost', '#b8f3ff', { floor: 7 }),
  // hair colour
  I('hc-ink', 'hairColor', 'Ink', '#1b1030'), I('hc-rust', 'hairColor', 'Rust', '#b4532a'), I('hc-straw', 'hairColor', 'Straw', '#e8c35a'), I('hc-plum', 'hairColor', 'Plum', '#7a3d9e'),
  I('hc-silver', 'hairColor', 'Static Silver', '#d6e2ff', { floor: 2 }), I('hc-neon', 'hairColor', 'Neon Cyan', '#3ff7ff', { top3: 1 }),
  // hair style
  I('hs-short', 'hairStyle', 'Short', 'short'), I('hs-long', 'hairStyle', 'Long', 'long'), I('hs-spiky', 'hairStyle', 'Spiky', 'spiky'), I('hs-hood', 'hairStyle', 'Hood', 'hood'),
  I('hs-crown', 'hairStyle', 'Broken Crown', 'crown', { floor: 9 }),
  // outfit
  I('oc-cyan', 'outfitColor', 'Cyan', '#2bb8c9'), I('oc-magenta', 'outfitColor', 'Magenta', '#c2369e'), I('oc-violet', 'outfitColor', 'Violet', '#6a4bd8'), I('oc-moss', 'outfitColor', 'Moss', '#4f8a4b'),
  I('oc-null', 'outfitColor', 'Null Black', '#26232e', { floor: 4 }),
  I('os-tunic', 'outfitStyle', 'Tunic', 'tunic'), I('os-robe', 'outfitStyle', 'Robe', 'robe'), I('os-plate', 'outfitStyle', 'Plate', 'plate'),
  I('os-wings', 'outfitStyle', 'Seraph Cloak', 'cloak', { floor: 8 }),
  // armor trim
  I('tr-steel', 'trim', 'Steel', '#9aa3b5'), I('tr-bronze', 'trim', 'Bronze', '#b07a3c'),
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
];
export const SLOTS = ['skin', 'hairColor', 'hairStyle', 'outfitColor', 'outfitStyle', 'trim', 'weapon', 'weaponColor', 'title', 'nameColor'];
export const CREATION_SLOTS = ['skin', 'hairColor', 'hairStyle', 'outfitColor'];
export const byId = id => CATALOG.find(i => i.id === id);
export const itemsFor = (slot, cls) => CATALOG.filter(i => i.type === slot && (!i.cls || i.cls === cls));
export function unlockText(u) {
  if (!u) return 'Available';
  if (u.floor) return `Clear Floor ${u.floor}`;
  if (u.top3) return u.top3 === 1 ? 'Top-3 damage on a floor kill' : `Top-3 damage on ${u.top3} floor kills`;
  if (u.rank1) return '#1 damage on a floor kill';
}
export function isUnlocked(item, progress) {
  const u = item.unlock; if (!u) return true;
  if (u.floor) return progress.cleared.includes(u.floor);
  if (u.top3) return progress.top3.length >= u.top3;
  if (u.rank1) return progress.rank1 >= u.rank1;
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
  const w = itemsFor('weapon', cls)[0].id;
  return { skin: 'skin-2', hairColor: 'hc-ink', hairStyle: 'hs-short', outfitColor: 'oc-cyan', outfitStyle: 'os-tunic', trim: 'tr-steel', weapon: w, weaponColor: 'wc-steel', title: 't-trapped', nameColor: 'nc-white' };
}
/** Choose an item if unlocked & valid for the class; returns true on success. */
export function equip(save, id) {
  const it = byId(id), h = save.heroes[0];
  if (!it || !isUnlocked(it, save.progress) || (it.cls && it.cls !== h.cls)) return false;
  h.look[it.type] = id; return true;
}
export function migrateSave(s) {
  if (!s) return s;
  if (!s.version || s.version < 2) {
    s.heroes.forEach(h => { h.look = { ...defaultLook(h.cls), ...(h.look || {}) }; });
    s.progress = s.progress || { cleared: [], top3: [], rank1: 0 };
    s.version = 2;
  }
  return s;
}
export const titleOf = h => byId(h.look.title).value;
export const nameColorOf = h => byId(h.look.nameColor).value;
// Deterministic fake profiles for simulated players.
export function fakeProfile(name) {
  let x = 0; for (const c of name) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  const t = itemsFor('title'), n = itemsFor('nameColor');
  return { title: t[x % t.length].value, color: n[(x >>> 4) % n.length].value };
}

// ---------- layered 16x16 sprite ----------
const BASE = [
  '................', '................', '......kkkk......', '.....kSSSSk.....', '.....kSeSek.....', '.....kSSSSk.....', '......kSSk......',
  '....kOOOOOOk....', '...SkOTOOTOkS...', '...S.kOOOOk.S...', '....kOOOOOOk....', '.....kTTTTk.....', '.....kk..kk.....', '.....bb..bb.....', '................', '................'];
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
/** Returns {rows: 16 strings, pal: char->colour} for a look + class. */
export function heroGrid(look, cls) {
  const g = BASE.map(r => [...r]), set = (x, y, c) => { if (x >= 0 && x < 16 && y >= 0 && y < 16) g[y][x] = c; };
  const style = byId(look.outfitStyle).value, hair = byId(look.hairStyle).value;
  if (style === 'robe') { for (let y = 11; y <= 13; y++) for (let x = 5; x <= 10; x++) set(x, y, y === 13 ? 'T' : 'O'); set(4, 12, 'k'); set(11, 12, 'k'); }
  if (style === 'plate') { set(3, 7, 'T'); set(4, 7, 'T'); set(11, 7, 'T'); set(12, 7, 'T'); set(6, 9, 'T'); set(9, 9, 'T'); }
  if (style === 'cloak') { for (let y = 7; y <= 12; y++) { set(2, y, 'O'); set(13, y, 'O'); } set(1, 8, 'T'); set(14, 8, 'T'); }
  if (hair === 'short') { for (let x = 5; x <= 10; x++) set(x, 2, 'H'); set(5, 3, 'H'); set(10, 3, 'H'); }
  if (hair === 'long') { for (let x = 5; x <= 10; x++) set(x, 2, 'H'); for (let y = 3; y <= 8; y++) { set(4, y, 'H'); set(11, y, 'H'); } set(5, 3, 'H'); set(10, 3, 'H'); }
  if (hair === 'spiky') { for (let x = 5; x <= 10; x++) set(x, 2, 'H'); [5, 7, 9].forEach(x => set(x, 1, 'H')); [6, 8, 10].forEach(x => set(x, 0, 'H')); set(5, 3, 'H'); }
  if (hair === 'hood') { for (let x = 4; x <= 11; x++) set(x, 2, 'O'); for (let y = 3; y <= 6; y++) { set(4, y, 'O'); set(11, y, 'O'); } set(5, 1, 'O'); set(6, 1, 'O'); set(9, 1, 'O'); set(10, 1, 'O'); set(5, 3, 'H'); set(10, 3, 'H'); }
  if (hair === 'crown') { for (let x = 5; x <= 10; x++) set(x, 2, 'H'); [5, 7, 8, 10].forEach(x => set(x, 1, 'y')); set(7, 0, 'y'); }
  for (const [x, y, c] of WEAPONS[byId(look.weapon).value] || []) set(x, y, c);
  const pal = { k: '#12062a', e: '#12062a', b: '#3a2a55', y: '#ffd84f', p: '#ff4fd8', S: byId(look.skin).value, H: byId(look.hairColor).value,
    O: byId(look.outfitColor).value, T: byId(look.trim).value, W: byId(look.weaponColor).value, w: '#6b4a2b' };
  return { rows: g.map(r => r.join('')), pal };
}

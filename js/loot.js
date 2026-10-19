// Loot: seeded, reproducible boss drops (stat gear + rare element cosmetics), inventory, equip and salvage. Pure (no DOM, no Math.random).
import { rng, baseHp, isUniqueSlot, bossInfo } from './floors.js';
import { DROP_COSMETICS } from './cosmetics.js';
export const INV_SIZE = 20;
export const GEAR_SLOTS = ['weapon', 'armor', 'trinket'];
export const RARITIES = [
  { id: 'common', label: 'Common', color: '#c9c2d8', w: 60, mul: 1, affixes: 0 },
  { id: 'uncommon', label: 'Uncommon', color: '#5cff8a', w: 25, mul: 1.3, affixes: 1 },
  { id: 'rare', label: 'Rare', color: '#4fa8ff', w: 10, mul: 1.7, affixes: 1 },
  { id: 'epic', label: 'Epic', color: '#c26bff', w: 4, mul: 2.2, affixes: 2 },
  { id: 'legendary', label: 'Legendary', color: '#ffb02e', w: 1, mul: 3, affixes: 2 },
];
export const rarityOf = id => RARITIES.find(r => r.id === id);
/** Rarity weights; unique/milestone floors double every non-common weight. */
export const rarityWeights = floor => RARITIES.map((r, i) => r.w * (i > 0 && isUniqueSlot(floor) ? 2 : 1));
export const COSMETIC_CHANCE = { normal: 0.03, unique: 0.05 };
/** Chance of a gear drop for one kill, by damage share (0 share = no loot). */
export const gearChance = (share, floor) => share <= 0 ? 0 : Math.min(1, 0.3 + share * 5 + (isUniqueSlot(floor) ? 0.3 : 0));
const scale = f => Math.pow(baseHp(f) / baseHp(1), 0.6); // gear power grows slower than boss HP
const ELEMENT_WORD = { fire: 'Ember', frost: 'Frost', void: 'Void', storm: 'Storm', venom: 'Venom', holy: 'Hallowed', blood: 'Blood', shadow: 'Shadow' };
const NOUNS = { weapon: ['Blade', 'Edge', 'Glaive', 'Fang', 'Brand'], armor: ['Mail', 'Aegis', 'Cuirass', 'Mantle', 'Plate'], trinket: ['Charm', 'Sigil', 'Locket', 'Talisman', 'Band'] };
const AFFIXES = [
  { k: 'dpsPct', label: v => `+${v}% DPS`, roll: (r, m) => Math.round((2 + r() * 4) * m) },
  { k: 'goldPct', label: v => `+${v}% gold`, roll: (r, m) => Math.round((3 + r() * 5) * m) },
  { k: 'xpPct', label: v => `+${v}% XP`, roll: (r, m) => Math.round((3 + r() * 5) * m) },
  { k: 'capH', label: v => `+${v}h offline cap`, roll: (r, m) => Math.max(1, Math.round((0.5 + r()) * m)) },
];
export const statLabel = (k, v) => ({ dps: `+${v} DPS`, dpsPct: `+${v}% DPS`, goldPct: `+${v}% gold`, xpPct: `+${v}% XP`, capH: `+${v}h offline cap` })[k];
const weighted = (r, ws) => { let x = r() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < ws.length; i++) if ((x -= ws[i]) < 0) return i; return ws.length - 1; };
/** Roll one gear piece from a seeded rng. */
export function rollItem(r, floor, element, seq = 0) {
  const ri = weighted(r, rarityWeights(floor)), R = RARITIES[ri], slot = GEAR_SLOTS[Math.floor(r() * 3)], s = scale(floor);
  const stats = {};
  if (slot === 'weapon') stats.dps = +(1.5 * s * R.mul).toFixed(1);
  if (slot === 'armor') stats.dpsPct = Math.round((3 + floor / 8) * R.mul);
  if (slot === 'trinket') { stats.goldPct = Math.round((3 + floor / 12) * R.mul); stats.xpPct = stats.goldPct; }
  const pool = AFFIXES.map(a => a.k), picked = [];
  for (let i = 0; i < R.affixes; i++) { const k = pool.splice(Math.floor(r() * pool.length), 1)[0], a = AFFIXES.find(x => x.k === k), v = a.roll(r, R.mul); stats[k] = (stats[k] || 0) + v; picked.push(k); }
  const name = `${ELEMENT_WORD[element] || 'Tower'} ${pick(r, NOUNS[slot])}`;
  return { id: `i${floor}-${seq}-${ri}${slot[0]}`, slot, rarity: R.id, floor, element, name, stats, affixes: picked };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
/** Seeded drops for one boss kill. Same (heroId, floor, seq, share) always gives the same result. */
export function rollDrops({ heroId = 'hero', floor, share, seq = 0, owned = [] }) {
  const r = rng(hash(`${heroId}|${floor}|${seq}`)), element = bossInfo(floor).lootElement, uniq = isUniqueSlot(floor), items = [];
  const rolls = uniq ? 2 : 1;
  for (let i = 0; i < rolls; i++) if (r() < gearChance(share, floor)) items.push(rollItem(r, floor, element, `${seq}.${i}`));
  let cosmetic = null;
  if (share > 0 && r() < (uniq ? COSMETIC_CHANCE.unique : COSMETIC_CHANCE.normal)) { const c = DROP_COSMETICS.find(x => x.unlock.drop === element); if (c && !owned.includes(c.id)) cosmetic = c.id; }
  return { items, cosmetic, element };
}
export const salvageValue = it => Math.round(20 * Math.pow(RARITIES.findIndex(r => r.id === it.rarity) + 1, 2) * scale(it.floor));
/** Apply one kill's drops to a v3 save. Returns { items, cosmetic, salvaged } (salvaged = auto-salvaged gold when the bag is full). */
export function grantDrops(save, floor, share) {
  const h = save.heroes[0], d = rollDrops({ heroId: h.id, floor, share, seq: save.lootSeq++, owned: save.progress.drops });
  let salvaged = 0;
  for (const it of d.items) { if (save.inv.length < INV_SIZE) save.inv.push(it); else { const g = salvageValue(it); save.gold += g; salvaged += g; } }
  if (d.cosmetic) save.progress.drops.push(d.cosmetic);
  return { ...d, salvaged };
}
export function equipItem(save, invIndex) {
  const h = save.heroes[0], it = save.inv[invIndex]; if (!it) return false;
  const old = h.equip[it.slot]; h.equip[it.slot] = it; save.inv.splice(invIndex, 1); if (old) save.inv.push(old); return true;
}
export function salvageItem(save, invIndex) { const it = save.inv[invIndex]; if (!it) return 0; save.inv.splice(invIndex, 1); const g = salvageValue(it); save.gold += g; return g; }

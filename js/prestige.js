// Late-game gold sinks + pets. Prices, gating and perks are decided by the SERVER (supabase/schema-addendum-shop.sql); this file
// mirrors the catalog for display (a pglite test checks parity). Nothing here adds combat power except a pet's tiny, server-clamped DPS %.
// Staff-exclusive items (Vesperveil, the Floor Zero sigil, the Equinox pet) are never in this catalog.
export const ARC_PRICE = a => 10 ** (a - 1); // ×1 arc 1, ×10 arc 2
export const SHOP = [
  { id: 'tr-arc1', kind: 'trophy', arc: 1, price: 300000, label: 'Gatefall Hold Trophy', icon: '🏰' },
  { id: 'tr-arc2', kind: 'trophy', arc: 2, price: 3000000, label: 'Rimegear Ascent Trophy', icon: '⚙️' },
  { id: 'sk-stonekeep', kind: 'skin', arc: 1, price: 5000000, label: 'Stone-Keep Knight', desc: 'Gatefall Hold hero skin' },
  { id: 'sk-clockfrost', kind: 'skin', arc: 2, price: 12000000, label: 'Clockwork Frost Suit', desc: 'Rimegear Ascent hero skin' },
  { id: 'egg-arc1', kind: 'egg', arc: 1, price: 400000, label: 'Gatefall Pet Egg', desc: 'Random pet and rarity' },
  { id: 'egg-arc2', kind: 'egg', arc: 2, price: 4000000, label: 'Rimegear Pet Egg', desc: 'Random pet, better odds' },
  { id: 'tok-rename', kind: 'token', arc: 1, price: 250000, label: 'Rename Token', desc: 'Rename your hero (chat filters apply)' },
  { id: 'tok-reroll', kind: 'token', arc: 1, price: 100000, label: 'Re-roll Token', desc: 'Re-roll your look from unlocked colours' },
  { id: 'pt-patron', kind: 'prestige', arc: 1, price: 2000000, step: 1.12, label: 'Tower Patron' },
  { id: 'pt-benefactor', kind: 'prestige', arc: 1, price: 8000000, step: 1.12, label: 'Spire Benefactor' },
  { id: 'pt-lantern', kind: 'prestige', arc: 2, price: 25000000, step: 1.15, label: 'Keeper of the Lanterns' },
];
export const DECOR = [
  { id: 'dc-trophy', price: 150000, label: 'Trophy Stand', icon: '🏆' }, { id: 'dc-banners', price: 400000, label: 'Hall Banners', icon: '🎌' },
  { id: 'dc-throne', price: 1500000, label: 'Gatefall Throne', icon: '🪑' }, { id: 'dc-chandelier', price: 3000000, label: 'Rimegear Chandelier', icon: '🕯️' },
];
export const memorialPrice = f => 100000 * ARC_PRICE(Math.ceil(Math.max(1, f) / 10)); // 100k per arc-1 floor, 1M per arc-2 floor
export const MEMORIAL_SHOW = 12;
export const prestigePrice = (it, sold = 0) => Math.round(it.price * Math.pow(it.step, sold));
// ---- pets: one passive perk scaled by rarity (same tiers and colours as gear)
export const PET_RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'unique'];
export const PERKS = { goldPct: [2, 3, 5, 7, 10, 12], xpPct: [2, 3, 5, 7, 10, 12], drainPct: [5, 8, 12, 16, 20, 25], capH: [1, 1, 2, 3, 4, 5], lootPct: [3, 5, 8, 12, 16, 20], dpsPct: [0, 0, 0, 1, 2, 3] };
export const PETS = [
  { sp: 'torch', label: 'Torch Sprite', perk: 'goldPct', c: ['#ffb02e', '#ff6a2e'] }, { sp: 'moth', label: 'Lantern Moth', perk: 'capH', c: ['#ffe9a8', '#c9a0ff'] },
  { sp: 'owl', label: 'Gear Owl', perk: 'lootPct', c: ['#c9a25a', '#6f5a3a'] }, { sp: 'mote', label: 'Frost Mote', perk: 'drainPct', c: ['#bff3ff', '#5fc8ff'] },
  { sp: 'pup', label: 'Stone Pup', perk: 'xpPct', c: ['#9a94a8', '#5d5870'] }, { sp: 'wisp', label: 'Ember Wisp', perk: 'dpsPct', c: ['#ff5a3d', '#ffd76a'] },
];
export const petPerk = (sp, rarity) => { const p = PETS.find(x => x.sp === sp); const i = PET_RARITY.indexOf(rarity); return p && i >= 0 ? { k: p.perk, v: PERKS[p.perk][i] } : null; };
export const PERK_LABEL = { goldPct: v => `+${v}% gold`, xpPct: v => `+${v}% XP (level cap still applies)`, drainPct: v => `−${v}% HP drain`, capH: v => `+${v}h offline cap`, lootPct: v => `+${v}% loot find`, dpsPct: v => `+${v}% DPS` };
/** Bonus object for the active pet ({ goldPct, xpPct, drainPct, capH, lootPct, dpsPct }); perk values come from the server row. */
export function petBonus(save) { const p = (save?.pets || []).find(x => x.id === save.activePet); const b = {}; if (p?.perk?.k && PERKS[p.perk.k]) b[p.perk.k] = Math.min(p.perk.v, PERKS[p.perk.k][5]); return b; }
// 8×8 pixel pets (2 colours + eye). Light on performance: one cached data-URI per species, CSS bob animation.
export const PET_GRIDS = {
  torch: ['...a....', '..aab...', '..abb...', '...bb...', '...cc...', '...cc...', '...cc...', '........'],
  moth: ['........', 'a.....a.', 'aa.e.aa.', 'abbbbba.', '.abbba..', 'a..b..a.', '........', '........'],
  owl: ['.a....a.', '.aaaaaa.', 'aeaaeaa.', 'abbbbba.', 'abbbbba.', '.abbba..', '..c.c...', '........'],
  mote: ['...a....', '..aba...', '.abeba..', 'aabbbaa.', '.abbba..', '..aba...', '...a....', '........'],
  pup: ['........', 'a....a..', 'aa..aa..', 'aaaaaaa.', 'aeaaeab.', '.abbbb..', '.a..a...', '........'],
  wisp: ['...a....', '..aa.a..', '.aabaa..', '.abbba..', 'aabebaa.', '.abbba..', '..aaa...', '........'],
};
// Staff-only pet (rendered only for the staff hero; the server never grants it): the two halves orbit each other.
export const EQUINOX = { id: 'pet-equinox', label: 'Equinox', abilities: ["Architect's Light: the Shaper's Decree aura (+5% gold & XP for heroes on the floor) without stacking past it", "Umbra's Eclipse: every 10 min a 20 s eclipse; +3% XP for the staff hero only"] };
export const ECLIPSE = { everyMs: 600000, forMs: 20000, xpMul: 1.03 };

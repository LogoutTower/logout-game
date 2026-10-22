// Loot: seeded, reproducible boss drops (stat gear + rare element cosmetics), inventory, equip and salvage. Pure (no DOM, no Math.random).
import { GM_LUCK } from './gm.js';
import { talentBonus } from './talents.js';
import { petBonus } from './prestige.js';
import { rng, baseHp, isSpecialSlot, bossInfo } from './floors.js';
import { DROP_COSMETICS } from './cosmetics.js';
export const INV_SIZE = 20;
/** Bag size: 20, or 60 for a valid staff hero (save.ctx.gm is runtime-only). */
export const bagSize = save => save?.ctx?.gm ? 60 : INV_SIZE;
export const GEAR_SLOTS = ['weapon', 'armor', 'trinket'];
export const RARITIES = [
  { id: 'common', label: 'Common', color: '#c9c2d8', w: 60, mul: 1, affixes: 0 },
  { id: 'uncommon', label: 'Uncommon', color: '#5cff8a', w: 25, mul: 1.3, affixes: 1 },
  { id: 'rare', label: 'Rare', color: '#4fa8ff', w: 10, mul: 1.7, affixes: 1 },
  { id: 'epic', label: 'Epic', color: '#c26bff', w: 4, mul: 2.2, affixes: 2 },
  { id: 'legendary', label: 'Legendary', color: '#ffb02e', w: 1, mul: 3, affixes: 2 },
  { id: 'unique', label: 'Unique', color: '#7ff6ff', w: 0.05, wSpecial: 0.21, mul: 3.6, affixes: 0 }, // 0.05/100.05 ≈ 0.05% · special floors 0.21/140.21 ≈ 0.15%
];
export const UNIQUE_COLOR = '#7ff6ff';
// Unique: a randomly generated, one-of-a-kind WEAPON, seeded per drop. One strong ability + one mild drawback.
// Stat-type effects live in item.stats (goldPct/xpPct/capH, summed by gearBonus); the rest are effect ids read via effectsOf() in game.js.
export const ABILITIES = [
  { id: 'lastLayer', text: '+30% DPS while the guardian is on its last HP layer (<20%)' },
  { id: 'tenth', text: 'Every 10th hit lands twice (+10% average DPS)' },
  { id: 'vigil', text: '+6h offline cap', stats: { capH: 6 } },
  { id: 'ledger', text: 'Salvage pays ×3 gold' },
  { id: 'hearth', text: 'Well Rested does not run down while you are above 50% HP' },
  { id: 'lifesteal', text: 'Lifesteal: each hit restores HP, the guardian drains you 35% slower' },
  { id: 'luck', text: '+25% gear drop chance from guardian kills' },
  { id: 'momentum', text: '+1% DPS per minute this session, up to +30% (resets on reload)' },
  { id: 'milestone', text: '+50% DPS on milestone / special floors' },
  { id: 'gold', text: '+40% gold from everything', stats: { goldPct: 40 } },
  { id: 'scholar', text: '+40% XP from everything', stats: { xpPct: 40 } },
  { id: 'steady', text: 'Worn down only cuts DPS to 85% (not 50%)' },
];
export const DRAWBACKS = [
  { id: 'drain', text: '+20% HP drain' },
  { id: 'poor', text: '-10% gold', stats: { goldPct: -10 } },
  { id: 'innTax', text: 'Inn costs +25%' },
  { id: 'shortCap', text: '-1h offline cap', stats: { capH: -1 } },
  { id: 'dull', text: '-5% XP', stats: { xpPct: -5 } },
  { id: 'whisper', text: 'The weapon whispers in the Chronicle (cosmetic)' },
  { id: 'jealous', text: 'Jealous: no trinket can be worn alongside it' },
  { id: 'heavy', text: '-5% DPS' },
];
// Unique ARMOR: same rarity roll; when a Unique rolls it is a weapon or armor 50/50. Defensive / utility pool.
export const ARMOR_ABILITIES = [
  { id: 'thorns', text: 'Thorns: the guardian\'s blows rebound, +8% DPS' },
  { id: 'aegis', text: 'Aegis proc: a ward blocks the drain for 1 min in every 5 (−20% HP drain on average)' },
  { id: 'stillness', text: 'HP drains 35% slower' },
  { id: 'restful', text: 'While Well Rested, regenerate 1% max HP per minute' },
  { id: 'watch', text: '+1h offline cap', stats: { capH: 1 } },
  { id: 'tithe', text: 'Tithe of Blows: every blow you take pays out, +15% gold', stats: { goldPct: 15 } },
  { id: 'dodge', text: 'Dodge 10%: drain 10% slower and +3% DPS from footwork' },
  { id: 'innkeep', text: 'Innkeepers trust this armor: Inn costs −40%' },
];
/** Pairs that would cancel out or stack on the same axis, so they are never rolled together. */
export const FORBIDDEN = {
  lifesteal: ['drain'], steady: ['drain'], hearth: ['innTax', 'drain'], vigil: ['shortCap'], gold: ['poor'], ledger: ['poor'], scholar: ['dull'],
  lastLayer: ['heavy'], tenth: ['heavy'], momentum: ['heavy'], milestone: ['heavy'],
  // armor: never against its own axis; 'jealous' (trinket lock) is weapon-only
  thorns: ['heavy', 'jealous'], aegis: ['drain', 'jealous'], stillness: ['drain', 'jealous'], restful: ['drain', 'innTax', 'jealous'], watch: ['shortCap', 'jealous'],
  tithe: ['poor', 'jealous'], dodge: ['drain', 'heavy', 'jealous'], innkeep: ['innTax', 'jealous'],
};
export const allowedPair = (a, d) => !(FORBIDDEN[a] || []).includes(d);
const U_PRE = ['sung', 'bound', 'wrought', 'touched', 'born', 'kissed', 'veined', 'hewn'];
const U_ABASE = ['Aegis', 'Warplate', 'Hauberk', 'Bulwark', 'Carapace', 'Shroud', 'Cuirass', 'Brigandine'];
const U_BASE = ['Thornblade', 'Greatsword', 'Halberd', 'Warglaive', 'Moonsabre', 'Runeblade', 'Warpick', 'Spellstaff', 'Fangspear', 'Cleaver', 'Longbrand', 'Starhook'];
const U_EPI = ['the Ninth Bell', 'the Last Login', 'the Hollow Crown', 'the Quiet Server', 'the Unpatched Night', 'the Broken Compass', 'the Ashen Choir', 'the Final Layer',
  'the Lost Party', 'the Silent Admin', 'the Endless Queue', 'the Pale Dawn', 'the Severed Link', 'the Thousand Floors', 'the Empty Throne', 'the Frozen Clock'];
// Arc 2 (Rimegear Ascent, floors 11+) adds its own epithets to the pool.
const U_EPI2 = ['the Stopped Clock', 'the First Gear', 'the Long Winter', 'the Spent Hour', 'the Glass Pane', 'the Mainspring', 'the Rime Thread', 'the Thirteenth Chime'];
const U_LORE = ['This weapon does not exist in the item database. It exists anyway.', 'Forged once. The template was deleted afterwards.', 'No other player will ever hold this exact item.',
  'Checksum mismatch. The tower decided to let you keep it.', 'It remembers the guardian it was taken from.', 'Drop table entry: [REDACTED]. Congratulations.'];
export const uniqueSerial = (floor, r) => `F${floor}-${Math.floor(r() * 0x10000).toString(16).toUpperCase().padStart(4, '0')}`;
function makeUnique(r, floor, element, seq, ownedNames = [], force = {}) {
  const slot = force.slot || (force.ab ? (ARMOR_ABILITIES.some(a => a.id === force.ab) ? 'armor' : 'weapon') : r() < 0.5 ? 'weapon' : 'armor'), POOL = slot === 'armor' ? ARMOR_ABILITIES : ABILITIES;
  const ab = force.ab ? POOL.find(x => x.id === force.ab) : pick(r, POOL), okD = DRAWBACKS.filter(d => allowedPair(ab.id, d.id));
  const dr0 = force.dr ? DRAWBACKS.find(x => x.id === force.dr) : pick(r, okD), s = scale(floor);
  const dr = slot === 'armor' && dr0.id === 'whisper' ? { ...dr0, text: 'The armor whispers in the Chronicle (cosmetic)' } : dr0;
  let name, tries = 0;
  do name = `${ELEMENT_WORD[element] || 'Tower'}${pick(r, U_PRE)} ${pick(r, slot === 'armor' ? U_ABASE : U_BASE)} of ${pick(r, floor > 10 ? [...U_EPI, ...U_EPI2] : U_EPI)}`; while (ownedNames.includes(name) && ++tries < 20);
  const stats = slot === 'armor' ? { dpsPct: Math.round((3 + floor / 8) * 3 * 1.2) } // ~20% above a Legendary armor of the same floor
    : { dps: +(1.5 * s * 3.6).toFixed(1), dpsPct: Math.round((6 + r() * 6) * 1.2) }; // above a Legendary of the same floor (mul 3 → 3.6)
  for (const src of [ab.stats, dr.stats]) for (const [k, v] of Object.entries(src || {})) stats[k] = (stats[k] || 0) + v;
  const serial = uniqueSerial(floor, r);
  return { id: `u${floor}-${seq}-${serial}`, slot, rarity: 'unique', floor, element, name, serial, stamp: `Forged on Floor ${floor} · #${serial}`, stats, affixes: [],
    ability: { id: ab.id, text: ab.text }, drawback: { id: dr.id, text: dr.text }, lore: `System notice: ${pick(r, U_LORE)}` };
}
/** Dev/test helper: a Unique with a chosen ability and drawback. */
export const forgeUnique = (floor, element, ab, dr, seed = 1) => makeUnique(rng(seed), floor, element, 'forge', [], { ab, dr });
export { U_ABASE };
const ownedUniqueNames = save => [...save.inv, ...Object.values(save.heroes[0].equip || {})].filter(i => i?.rarity === 'unique').map(i => i.name);
const uniqueFx = save => new Set(['weapon', 'armor'].flatMap(k => { const w = save.heroes[0].equip?.[k]; return w?.rarity === 'unique' ? [w.ability.id, w.drawback.id] : []; }));
export const rarityOf = id => RARITIES.find(r => r.id === id);
/** Rarity weights; special/milestone floors double every non-common weight, and Unique uses its own wSpecial. */
export const rarityWeights = floor => RARITIES.map((r, i) => isSpecialSlot(floor) ? (r.wSpecial ?? r.w * (i > 0 ? 2 : 1)) : r.w);
export const COSMETIC_CHANCE = { normal: 0.03, special: 0.05 };
/** Chance of a gear drop for one kill, by damage share (0 share = no loot). */
export const gearChance = (share, floor) => share <= 0 ? 0 : Math.min(1, 0.3 + share * 5 + (isSpecialSlot(floor) ? 0.3 : 0));
const scale = f => Math.pow(baseHp(f) / baseHp(1), 0.6); // gear power grows slower than boss HP
const ELEMENT_WORD = { fire: 'Ember', frost: 'Frost', void: 'Void', storm: 'Storm', venom: 'Venom', holy: 'Hallowed', blood: 'Blood', shadow: 'Shadow' };
const NOUNS = { weapon: ['Blade', 'Edge', 'Glaive', 'Fang', 'Brand'], armor: ['Mail', 'Aegis', 'Cuirass', 'Mantle', 'Plate'], trinket: ['Charm', 'Sigil', 'Locket', 'Talisman', 'Band'] };
const AFFIXES = [
  { k: 'dpsPct', label: v => `+${v}% DPS`, roll: (r, m) => Math.round((2 + r() * 4) * m) },
  { k: 'goldPct', label: v => `+${v}% gold`, roll: (r, m) => Math.round((3 + r() * 5) * m) },
  { k: 'xpPct', label: v => `+${v}% XP`, roll: (r, m) => Math.round((3 + r() * 5) * m) },
  { k: 'capH', label: v => `+${v}h offline cap`, roll: (r, m) => Math.max(1, Math.round((0.5 + r()) * m)) },
];
export const statLabel = (k, v) => { const n = `${v < 0 ? '−' + -v : '+' + v}`; return ({ dps: `${n} DPS`, dpsPct: `${n}% DPS`, goldPct: `${n}% gold`, xpPct: `${n}% XP`, capH: `${n}h offline cap` })[k]; };
const weighted = (r, ws) => { let x = r() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < ws.length; i++) if ((x -= ws[i]) < 0) return i; return ws.length - 1; };
/** Roll one gear piece from a seeded rng. */
export function rollItem(r, floor, element, seq = 0, weights = null, owned = []) {
  const ri = weighted(r, weights || rarityWeights(floor)); if (RARITIES[ri].id === 'unique') return makeUnique(r, floor, element, seq, owned);
  const R = RARITIES[ri], slot = GEAR_SLOTS[Math.floor(r() * 3)], s = scale(floor);
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
// Signature drops (arc 2+): an Epic or Legendary piece in a slot the guardian has a signature for becomes that named item half the time.
// Same stats as the roll (no power creep); only the name, a flag and a lore line change.
export const SIGNATURE_RARITIES = ['epic', 'legendary'];
export function signature(r, floor, it) {
  const sig = bossInfo(floor).sig || []; if (!sig.length || !SIGNATURE_RARITIES.includes(it.rarity)) return it;
  const m = sig.find(x => x.slot === it.slot); if (!m || r() >= 0.5) return it;
  return { ...it, name: m.name, signature: true, lore: `System notice: signature drop of ${bossInfo(floor).name}, Floor ${floor}.`, ...(m.flavor ? { flavor: m.flavor } : {}), ...(m.equip ? { sigEquip: m.equip } : {}), ...(m.icon ? { sigIcon: 1 } : {}) };
}
export const signatureList = () => Array.from({ length: 100 }, (_, i) => bossInfo(i + 1)).flatMap(b => (b.sig || []).map(s => ({ floor: b.floor, boss: b.name, ...s })));
/** Seeded drops for one boss kill. Same (heroId, floor, seq, share) always gives the same result. */
export function rollDrops({ heroId = 'hero', floor, share, seq = 0, owned = [], ownedU = [], luck = 1 , elementOverride = null }) {
  const r = rng(hash(`${heroId}|${floor}|${seq}`)), element = elementOverride || bossInfo(floor).lootElement, special = isSpecialSlot(floor), items = [];
  const rolls = special ? 2 : 1;
  for (let i = 0; i < rolls; i++) if (r() < Math.min(1, gearChance(share, floor) * luck)) items.push(signature(r, floor, rollItem(r, floor, element, `${seq}.${i}`, null, ownedU)));
  let cosmetic = null;
  if (share > 0 && r() < (special ? COSMETIC_CHANCE.special : COSMETIC_CHANCE.normal)) { const c = DROP_COSMETICS.find(x => x.unlock.drop === element); if (c && !owned.includes(c.id)) cosmetic = c.id; }
  return { items, cosmetic, element };
}
/** Salvage gold for an item; Scrapper's Ledger (equipped) pays ×3. */
export const salvageGold = (save, it) => Math.round(salvageValue(it) * (uniqueFx(save).has('ledger') ? 3 : 1) * (1 + talentBonus(save.heroes[0]).salvagePct / 100));
export const salvageValue = it => Math.round(20 * Math.pow(RARITIES.findIndex(r => r.id === it.rarity) + 1, 2) * scale(it.floor));
/** Apply one kill's drops to a v3 save. Returns { items, cosmetic, salvaged } (salvaged = auto-salvaged gold when the bag is full). */
export function grantDrops(save, floor, share) {
  const h = save.heroes[0], d = rollDrops({ heroId: h.id, floor, share, seq: save.lootSeq++, owned: save.progress.drops, ownedU: ownedUniqueNames(save), elementOverride: takeDestiny(save), luck: (save.ctx?.gm ? 1 + GM_LUCK / 100 : 1) * (uniqueFx(save).has('luck') ? 1.25 : 1) * (1 + talentBonus(h).lootPct / 100) * (1 + (petBonus(save).lootPct || 0) / 100) });
  let salvaged = 0;
  for (const it of d.items) {
    if (it.rarity === 'unique') { save.inv.push(it); continue; } // never auto-salvaged (may exceed the bag)
    if (save.inv.length < bagSize(save)) save.inv.push(it); else { const g = salvagePay(save, it); save.gold += g; salvaged += g; }
  }
  if (d.cosmetic) save.progress.drops.push(d.cosmetic);
  return { ...d, salvaged };
}
// ---- Trickle: small seeded drops from regular fighting (~1 Common/Uncommon per 150s), so the bag fills early.
export const TRICKLE = { secs: 150, weights: [70, 30, 0, 0, 0, 0], offlineMax: 4 }; // never Rare+ and never Unique
/** Add `secs` of active fighting on `floor`; returns the trickle items granted (max `maxDrops`; time past the cap is discarded). */
export function trickleDrops(save, secs, floor, maxDrops = Infinity) {
  const t = save.trickle || (save.trickle = { secs: 0, seq: 0 }), out = [], h = save.heroes[0];
  t.secs += Math.max(0, secs); const every = TRICKLE.secs;
  while (t.secs >= every) {
    if (out.length >= maxDrops) { t.secs %= every; break; }
    t.secs -= every; const r = rng(hash(`${h.id}|trickle|${t.seq}`)), it = rollItem(r, floor, bossInfo(floor).lootElement, `t${t.seq}`, TRICKLE.weights); t.seq++;
    it.trickle = true; out.push(it);
    if (save.inv.length < bagSize(save)) save.inv.push(it); else { save.gold += salvagePay(save, it); it.salvaged = true; }
  }
  return out;
}
export function equipItem(save, invIndex) {
  const h = save.heroes[0], it = save.inv[invIndex]; if (!it) return false;
  if ((it.gm || String(it.id).startsWith('gm-')) && !save.ctx?.gm) return false; // staff items need a valid staff flag/role
  const w = h.equip.weapon, jealous = x => x?.rarity === 'unique' && x.drawback.id === 'jealous';
  if (it.slot === 'trinket' && jealous(w)) return false; // the jealous Unique refuses company
  const old = h.equip[it.slot]; h.equip[it.slot] = it; save.inv.splice(invIndex, 1); if (old) save.inv.push(old);
  if (it.rarity === 'unique') for (const k of GEAR_SLOTS) if (k !== it.slot && h.equip[k]?.rarity === 'unique') { save.inv.push(h.equip[k]); h.equip[k] = null; } // one-Unique rule: one equipped at a time
  if (jealous(it) && h.equip.trinket) { save.inv.push(h.equip.trinket); h.equip.trinket = null; }
  return true;
}
/** One-Unique rule on load: if two Uniques are somehow equipped, the armor goes back to the bag. */
export function enforceOneUnique(save) { const e = save?.heroes?.[0]?.equip; if (e?.weapon?.rarity === 'unique' && e?.armor?.rarity === 'unique') { save.inv.push(e.armor); e.armor = null; return true; } return false; }
export function salvageItem(save, invIndex) { const it = save.inv[invIndex]; if (!it || it.gm || String(it.id).startsWith('gm-')) return 0; /* staff items can't be salvaged */ const g = salvagePay(save, it); save.inv.splice(invIndex, 1); save.gold += g; return g; }
/** Base DPS of a Legendary weapon on floor f (parity reference for the staff weapon). */
export const legendaryWeaponDps = f => +(1.5 * scale(f) * 3).toFixed(1);
/** Base % DPS of a Legendary armor on floor f (parity reference for Vesperveil). */
export const legendaryArmorPct = f => Math.round((3 + f / 8) * 3);
// ---- GM raid softener reference: a strong normal player on floor f (class-average base, level cap f+10, forge cap f+8,
// Legendary weapon + armor of the floor, no talents). Mirrors public.ref_dps() in schema-addendum-gm-softener-prelaunch.sql.
export const REF_BASE = 5.866666666666667; // average atk×spd of the three public classes (= GM_STATS.atk, checked in tests)
export const refPlayerDps = f => { f = Math.max(1, Math.floor(f)); return (REF_BASE * (1 + 0.25 * (f + 9)) + legendaryWeaponDps(f)) * (1 + 0.15 * (f + 8)) * (1 + legendaryArmorPct(f) / 100); };
/** Cap the staff GM's damage to the shared boss over `secs` at mult × refPlayerDps(floor). Gold, XP, the Sanctum and displayed DPS are untouched. */
export const softenGm = (dmg, secs, floor, mult = 1.5) => Math.min(dmg, Math.floor(Math.max(0, mult) * refPlayerDps(floor) * Math.max(0, secs)));
export { AFFIXES, scale as gearScale, ELEMENT_WORD, U_PRE, U_BASE, U_EPI, U_EPI2 };

// ---- Codex hooks (staff only; talentBonus/hero class gate them, so they are inert for everyone else)
/** Salvage payout incl. Second Draft (seeded chance to pay double). */
export function salvagePay(save, it) { const c = talentBonus(save.heroes[0]).salvageDblPct; let g = salvageGold(save, it);
  if (c > 0) { save.salvSeq = (save.salvSeq || 0) + 1; if (rng(hash(`${save.heroes[0].id}|salv|${save.salvSeq}`))() < c / 100) g *= 2; } return g; }
/** Shaper of Destiny: the chosen element is used by the next boss drop, then cleared. */
export function takeDestiny(save) { const d = save.destiny; if (!d?.element || save.heroes[0].cls !== 'GameMaster') return null; save.destiny = { ...d, element: null }; return d.element; }
export const DESTINY_MS = 24 * 3600e3;
export function chooseDestiny(save, element, now = Date.now()) { if (save.destiny?.at && now - save.destiny.at < DESTINY_MS) return false; save.destiny = { element, at: now }; return true; }
/** Master Plan: reroll one non-Unique, non-staff item's stats (same slot family, rarity, floor), once per floor. */
export function rerollItem(save, invIndex, floor) {
  const it = save.inv[invIndex]; if (!it || it.gm || it.rarity === 'unique' || save.planFloor === floor) return null;
  const ri = RARITIES.findIndex(r => r.id === it.rarity), w = RARITIES.map((_, i) => i === ri ? 1 : 0);
  save.planSeq = (save.planSeq || 0) + 1; const n = rollItem(rng(hash(`${it.id}|plan|${save.planSeq}`)), it.floor, it.element, `p${save.planSeq}`, w);
  n.id = `${it.id}~p${save.planSeq}`; if (it.customName) n.customName = it.customName; save.inv[invIndex] = n; save.planFloor = floor; return n;
}

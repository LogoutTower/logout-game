// Staff ("gm") package: hidden class, look, weapon, perks and the local unlock. Pure (no DOM).
import { CODEX_NAMES, isCodexId } from './codex.js';
// Everything here is excluded from every generator, pool, picker and Wardrobe list (see test/gm.test.mjs).
import { CLASSES, STAFF_CLASSES } from './game.js';
export const GM_CLASS = 'GameMaster';
// Staff luck: +50% gear-drop chance (rarity tables and staff/Divine rules unchanged) and the Glitch Den edge (schema-addendum-gm-luck.sql). Never boss damage.
export const GM_LUCK = 50;
const avg = k => Object.values(CLASSES).reduce((s, c) => s + c[k], 0) / Object.keys(CLASSES).length;
const avgDps = Object.values(CLASSES).reduce((s, c) => s + c.atk * c.spd, 0) / Object.keys(CLASSES).length;
/** Combat parity: base DPS and HP equal the average of the three public classes. */
export const GM_STATS = { icon: '◆', atk: avgDps, spd: 1, hp: avg('hp') };
STAFF_CLASSES[GM_CLASS] = GM_STATS;
export const GM_TITLE = 'The Architect of the Cosmos: Shaper of Destiny';
export const GM_SIGIL = '◆';
export const GM_ITEMS = [ // cosmetic ids (all prefixed gm-) rendered only for a valid staff hero
  { id: 'gm-title', type: 'title', label: 'Architect', value: GM_TITLE },
  { id: 'gm-name', type: 'nameColor', label: 'Void Gold', value: '#0b0812' },
  { id: 'gm-coat', type: 'outfitStyle', label: 'Vesperveil, Mantle of the Unwritten', value: 'gm-coat', lore: 'System notice: wearer identity not found. The tower stopped asking.', ability: "The Unwritten Hour: when the floor guardian falls below 10% HP while the Architect is on the floor, every hero there deals +5% damage until it dies, under a starlit night." },
  { id: 'gm-hood', type: 'hairStyle', label: 'Shadow Hood', value: 'gm-hood' },
  { id: 'gm-black', type: 'outfitColor', label: 'Void Leather', value: '#17131f' },
  { id: 'gm-gold', type: 'trim', label: 'Architect Gold', value: '#d9a93f' },
  { id: 'gm-katana', type: 'weapon', label: 'Eventide', value: 'gm-katana' },
  { id: 'gm-edge', type: 'weaponColor', label: 'Void Edge', value: '#0a0710' },
  { id: 'gm-unsheathed', type: 'weaponColor', label: 'Eventide, Unsheathed', value: '#ffd76a', codex: 'cx-longnight' }, // Long Night skin (gold-dominant blade)
  { id: 'gm-aura', type: 'aura', label: 'Galaxy of the Unwritten', value: '#ffd76a' }, // grows with level: see js/galaxy.js
];
export const GM_LOOK = { skin: 'skin-1', hairColor: 'hc-ink', hairStyle: 'gm-hood', outfitColor: 'gm-black', outfitStyle: 'gm-coat', trim: 'gm-gold', weapon: 'gm-katana', weaponColor: 'gm-edge', aura: 'gm-aura', title: 'gm-title', nameColor: 'gm-name' };
export const EVENTIDE = { id: 'gm-eventide', name: 'Eventide, the Final Shape', lore: 'System notice: this object has no origin. It was here before the tower.', ability: "Shaper's Decree: while you fight on a floor, every hero there gets +5% XP and gold." };
export const DECREE_MUL = 1.05;
export const VESPERVEIL = GM_ITEMS.find(i => i.id === 'gm-coat');
export const GM_NAMES = ['GameMaster', 'Architect of the Cosmos', 'Shaper of Destiny', 'Eventide', 'Final Shape', "Shaper's Decree", 'Vesperveil', 'Mantle of the Unwritten', 'Galaxy of the Unwritten', 'Unsheathed', 'The Unwritten Hour', 'Unwritten Hour', 'The Root Key', 'Root Key', 'Every Door', 'Dusk Remembered', 'Gilded Unwriting', 'Divine Awakening', ...CODEX_NAMES];
export const isGmId = id => typeof id === 'string' && id.startsWith('gm-');
/** Eventide: a Legendary-parity weapon of the given floor (base stat only, no Unique ability). */
// Staff items DISPLAY as Unique (label, colour, shimmer) but stay rarity 'legendary' underneath: Legendary-parity stats, no generated
// ability/drawback/serial, never in a pool or the Unique generator, outside the one-Unique rule and never sellable.
export const STAFF_STAMP = 'Forged before Floor 1';
// ---- Level tiers for Eventide + Vesperveil (staff hero level): I < 30, II from 30 (glow), III from 45 (enhanced sprite), IV = Divine Awakening from 60.
// Stat bumps stay inside the Unique band (Unique mul 3.6 vs Legendary 3 = 1.2x): II 1.06x, III 1.12x, Awakened 1.2x, plus a small passive each.
// Boss damage is still held by the raid softener (server + client); the GM is off every reward ranking.
export const GM_TIERS = [{ n: 1, min: 1, label: 'Tier I', mul: 1 }, { n: 2, min: 30, label: 'Tier II', mul: 1.06 }, { n: 3, min: 45, label: 'Tier III', mul: 1.12 }, { n: 4, min: 60, label: 'Divine Awakening', mul: 1.2 }];
export const gmTier = level => [...GM_TIERS].reverse().find(t => (level | 0) >= t.min) || GM_TIERS[0];
export const AWAKENED = {
  weapon: { name: 'Eventide, Awakened', lore: 'System notice: origin found. It was the first shape the dusk ever took, and it remembers.', power: 'Dusk Remembered: +3% damage (still held by the raid softener).', stats: { dpsPct: 3 } },
  armor: { name: 'Vesperveil, Awakened', lore: 'System notice: wearer identity found. The tower bows and writes the name in gold.', power: 'Gilded Unwriting: +3% gold.', stats: { goldPct: 3 } } };
export const GM_GEAR_NAMES = [EVENTIDE.name, 'Vesperveil, Mantle of the Unwritten', AWAKENED.weapon.name, AWAKENED.armor.name];
const tiered = (it, tier, slot) => { const t = GM_TIERS[Math.min(4, Math.max(1, tier | 0)) - 1]; it.tier = t.n; it.tierLabel = t.label;
  for (const k of Object.keys(it.stats)) it.stats[k] = k === 'dps' ? +(it.stats[k] * t.mul).toFixed(1) : Math.round(it.stats[k] * t.mul);
  if (t.n === 4) { const a = AWAKENED[slot]; Object.assign(it, { divine: true, show: 'divine', name: a.name, lore: a.lore, staffPower: [it.staffPower, a.power].filter(Boolean).join(' · ') }); for (const [k, v] of Object.entries(a.stats)) it.stats[k] = (it.stats[k] || 0) + v; }
  return it; };
export const eventide = (floor, legendaryDps, tier = 1) => tiered({ id: EVENTIDE.id, gm: true, slot: 'weapon', rarity: 'legendary', show: 'unique', stamp: STAFF_STAMP, floor, element: 'void', name: EVENTIDE.name, lore: EVENTIDE.lore, stats: { dps: legendaryDps }, affixes: [] }, tier, 'weapon');
/** Vesperveil as a real ARMOR item: Legendary-parity armor % DPS for the floor (base stat only), Unique display, staff-only. */
export const VESPER_ID = 'gm-vesperveil';
export const vesperveil = (floor, legendaryArmorPct, tier = 1) => tiered({ id: VESPER_ID, gm: true, slot: 'armor', rarity: 'legendary', show: 'unique', stamp: STAFF_STAMP, floor, element: 'void',
  name: VESPERVEIL.label, lore: VESPERVEIL.lore, staffPower: VESPERVEIL.ability, stats: { dpsPct: legendaryArmorPct }, affixes: [] }, tier, 'armor');
export const wearsVesperveil = h => h?.equip?.armor?.id === VESPER_ID;
/** The Root Key: a staff-only TRINKET, displayed at Divine (Solumbra's tier), Legendary-parity stats underneath like the other staff gear.
 *  Passive "Every Door": +5% offline gold/XP on top of the 35% cap (OFFLINE_PCT_MAX); offline damage stays at 35%; 24h window unchanged. */
export const ROOT_KEY = { id: 'gm-rootkey', name: 'The Root Key', lore: 'The first key the Architect ever cut. It opens every door in the tower, all but the one Umbra locked.',
  ability: 'Every Door: +5% offline gold and XP beyond the normal 35% cap (up to 40%; offline boss damage stays at 35%, 24h window unchanged).', offlinePct: 5 };
export const OFFLINE_PCT_MAX = 35; // the most a public hero can reach (Idle Hands 3/3 + Phantom Watch)
export const rootKey = (floor, legendaryTrinketPct) => ({ id: ROOT_KEY.id, gm: true, divine: true, slot: 'trinket', rarity: 'legendary', show: 'divine', stamp: STAFF_STAMP, floor, element: 'void',
  name: ROOT_KEY.name, lore: ROOT_KEY.lore, staffPower: ROOT_KEY.ability, stats: { goldPct: legendaryTrinketPct, xpPct: legendaryTrinketPct }, affixes: [] });
export const legendaryTrinketPct = f => Math.round((3 + f / 12) * 3); // same formula as a rolled Legendary trinket (loot.js)
export const wearsRootKey = h => h?.cls === GM_CLASS && h?.equip?.trinket?.id === ROOT_KEY.id;
/** Keep the staff hero's two staff items equipped at the current floor's parity (also migrates older GM saves without the armor). */
export function gmGear(save, floor, legendaryDps, legendaryArmorPct) {
  const h = save.heroes[0]; if (h.cls !== GM_CLASS) return false; h.equip = h.equip || {}; save.inv = save.inv || []; let ch = false; const tn = gmTier(h.level).n;
  for (const [slot, id, make] of [['weapon', EVENTIDE.id, () => eventide(floor, legendaryDps, tn)], ['armor', VESPER_ID, () => vesperveil(floor, legendaryArmorPct, tn)], ['trinket', ROOT_KEY.id, () => rootKey(floor, legendaryTrinketPct(floor))]]) {
    const bi = save.inv.findIndex(it => it?.id === id);
    if (h.equip[slot]?.id === id) { if (h.equip[slot].floor !== floor || (slot !== 'trinket' && (h.equip[slot].tier || 1) !== tn)) { h.equip[slot] = make(); ch = true; } } // parity follows the floor and the level tier
    else if (bi >= 0) { if (save.inv[bi].floor !== floor || (slot !== 'trinket' && (save.inv[bi].tier || 1) !== tn)) { save.inv[bi] = make(); ch = true; } } // unequipped by choice: refresh in the bag
    else { const o = h.equip[slot]; if (o && !o.gm) save.inv.push(o); h.equip[slot] = make(); ch = true; } // missing (older GM save): equip it
  }
  if (wearsVesperveil(h) && h.look?.outfitStyle !== 'gm-coat') { h.look = { ...(h.look || {}), outfitStyle: 'gm-coat' }; ch = true; } // the coat look follows the equipped armor
  return ch;
}
// ---- perks (active only while the staff flag/role is valid; save.ctx.gm is set at runtime, never trusted from storage)
// ---- Who counts as staff right now. The ONE place to change policy:
//  - drop the local passphrase unlock: set allowLocalUnlock to false (server role only)
//  - add a staff-mode on/off toggle: pass staffMode from a saved preference
export const STAFF_POLICY = { allowLocalUnlock: true };
export const staffActive = ({ serverRole = false, localUnlock = false, staffMode = true } = {}) => !!staffMode && (!!serverRole || (STAFF_POLICY.allowLocalUnlock && !!localUnlock));
export const GM_PERKS = { offlineCapH: 24, bag: 60, drain: 0, inn: 0, respec: 0, announceEveryMs: 10 * 60e3 };
export const gmOn = save => !!save?.ctx?.gm;
// ---- local unlock (only while online mode is off): SHA-256 of a passphrase vs config GM_PASS_HASH; empty hash = disabled
export async function sha256hex(s) { const b = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
export async function checkPass(pass, hash) { if (!hash || !pass) return false; return (await sha256hex(pass)) === String(hash).toLowerCase(); }
/** Strip staff content from a save unless the staff flag is valid (paste-protection on load). Returns true if anything changed. */
export function sanitizeSave(save, valid) {
  if (valid || !save) return false; let changed = false;
  for (const h of save.heroes || []) {
    if (h.cls === GM_CLASS) { h.cls = CLASSES[h.prevCls] ? h.prevCls : 'Vanguard'; changed = true; }
    for (const [k, v] of Object.entries(h.look || {})) if (isGmId(v)) { delete h.look[k]; changed = true; }
    for (const [k, it] of Object.entries(h.equip || {})) if (it && (it.gm || isGmId(it.id))) { h.equip[k] = null; changed = true; }
    for (const id of Object.keys(h.talents || {})) if (isCodexId(id)) { delete h.talents[id]; changed = true; } // Codex ranks are staff-only
  }
  for (const k of ['spirit', 'equinox', 'sanctum', 'spiritSeen', 'gmTierSeen']) if (save[k]) { delete save[k]; changed = true; } // the Solumbra spirit is staff-only (equinox: old placeholder key)
  if ((save.pets || []).some(p => /solumbra|equinox/i.test(p?.sp || '') || p?.rarity === 'divine')) { save.pets = save.pets.filter(p => !/solumbra|equinox/i.test(p?.sp || '') && p?.rarity !== 'divine'); changed = true; }
  const n = (save.inv || []).length; save.inv = (save.inv || []).filter(it => !(it?.gm || isGmId(it?.id))); if (save.inv.length !== n) changed = true;
  return changed;
}
/** Turn the active hero into the staff hero (keeps level, gold and progress; remembers the class to go back to). */
export function becomeGm(save, legendaryDps, floor, legendaryArmorPct = Math.round((3 + floor / 8) * 3)) {
  const h = save.heroes[0]; if (h.cls !== GM_CLASS) h.prevCls = h.cls;
  h.cls = GM_CLASS; h.prevLook = h.prevLook || { ...h.look }; h.look = { ...h.look, ...GM_LOOK };
  h.hp = null; // full HP (null resolves to max)
  const old = h.equip?.weapon; h.equip = h.equip || {}; if (old && !old.gm) save.inv.push(old); h.equip.weapon = eventide(floor, legendaryDps, gmTier(h.level).n); const oa = h.equip.armor; if (oa && !oa.gm) save.inv.push(oa); h.equip.armor = vesperveil(floor, legendaryArmorPct, gmTier(h.level).n); const ot = h.equip.trinket; if (ot && !ot.gm) save.inv.push(ot); h.equip.trinket = rootKey(floor, legendaryTrinketPct(floor)); if (!Object.keys(h.talents || {}).some(isCodexId)) { h.prevTalents = { ...(h.talents || {}) }; h.talents = {}; } // Codex replaces the class tree; current level's points, free respec
}
export function leaveGm(save) {
  const h = save.heroes[0]; if (h.cls !== GM_CLASS) return; h.cls = CLASSES[h.prevCls] ? h.prevCls : 'Vanguard'; h.look = { ...(h.prevLook || {}) }; delete h.prevLook; if (h.equip?.weapon?.gm) h.equip.weapon = null; if (h.equip?.armor?.gm) h.equip.armor = null; if (h.equip?.trinket?.gm) h.equip.trinket = null; h.talents = { ...(h.prevTalents || {}) }; delete h.prevTalents;
}
/** Entrance announcement rate limit: once per floor per 10 minutes. */
export function shouldAnnounce(last, floor, now) { return !(last && last.floor === floor && now - last.at < GM_PERKS.announceEveryMs); }

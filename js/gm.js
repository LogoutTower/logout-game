// Staff ("gm") package: hidden class, look, weapon, perks and the local unlock. Pure (no DOM).
import { CODEX_NAMES, isCodexId } from './codex.js';
// Everything here is excluded from every generator, pool, picker and Wardrobe list (see test/gm.test.mjs).
import { CLASSES, STAFF_CLASSES } from './game.js';
export const GM_CLASS = 'GameMaster';
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
export const GM_NAMES = ['GameMaster', 'Architect of the Cosmos', 'Shaper of Destiny', 'Eventide', 'Final Shape', "Shaper's Decree", 'Vesperveil', 'Mantle of the Unwritten', 'Galaxy of the Unwritten', 'Unsheathed', 'The Unwritten Hour', 'Unwritten Hour', ...CODEX_NAMES];
export const isGmId = id => typeof id === 'string' && id.startsWith('gm-');
/** Eventide: a Legendary-parity weapon of the given floor (base stat only, no Unique ability). */
export const eventide = (floor, legendaryDps) => ({ id: EVENTIDE.id, gm: true, slot: 'weapon', rarity: 'legendary', floor, element: 'void', name: EVENTIDE.name, lore: EVENTIDE.lore, stats: { dps: legendaryDps }, affixes: [] });
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
  const n = (save.inv || []).length; save.inv = (save.inv || []).filter(it => !(it?.gm || isGmId(it?.id))); if (save.inv.length !== n) changed = true;
  return changed;
}
/** Turn the active hero into the staff hero (keeps level, gold and progress; remembers the class to go back to). */
export function becomeGm(save, legendaryDps, floor) {
  const h = save.heroes[0]; if (h.cls !== GM_CLASS) h.prevCls = h.cls;
  h.cls = GM_CLASS; h.prevLook = h.prevLook || { ...h.look }; h.look = { ...h.look, ...GM_LOOK };
  h.hp = null; // full HP (null resolves to max)
  const old = h.equip?.weapon; h.equip = h.equip || {}; if (old && !old.gm) save.inv.push(old); h.equip.weapon = eventide(floor, legendaryDps); if (!Object.keys(h.talents || {}).some(isCodexId)) { h.prevTalents = { ...(h.talents || {}) }; h.talents = {}; } // Codex replaces the class tree; current level's points, free respec
}
export function leaveGm(save) {
  const h = save.heroes[0]; if (h.cls !== GM_CLASS) return; h.cls = CLASSES[h.prevCls] ? h.prevCls : 'Vanguard'; h.look = { ...(h.prevLook || {}) }; delete h.prevLook; if (h.equip?.weapon?.gm) h.equip.weapon = null; h.talents = { ...(h.prevTalents || {}) }; delete h.prevTalents;
}
/** Entrance announcement rate limit: once per floor per 10 minutes. */
export function shouldAnnounce(last, floor, now) { return !(last && last.floor === floor && now - last.at < GM_PERKS.announceEveryMs); }

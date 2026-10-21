// Weapon upgrades +1..+10 and materials. Pure (no DOM). Mirrors supabase/schema-addendum-forge.sql (pglite test checks parity).
// Online the SERVER rolls (forge_upgrade RPC); this file mirrors the rules for display and rolls on this browser in local mode only.
// Materials are in-game only: never the token, never real value. Staff gear (Eventide / Vesperveil, it.gm) keeps its own tier path.
import { UP_DPS } from './game.js';
export { UP_DPS };
export const MAX_UP = 10;
/** Success chance (%) by target level: +1..+5 never fail. A fail burns the materials only (gold, weapon and level are kept). */
export const UP_RATE = [100, 100, 100, 100, 100, 100, 90, 75, 60, 45, 30];
export const setOf = f => Math.max(1, Math.ceil(Math.max(1, f) / 10));
export const milestoneOf = f => setOf(f) * 10;
export const ESSENCE = ['Ashen', 'Rime', 'Gilded', 'Hollow', 'Tidal', 'Ember', 'Static', 'Verdant', 'Dusk', 'Null'];
export const MAT_KINDS = {
  shard: { label: 'Tower Shard', rarity: 'common', color: '#c9c2d8', icon: '◆', from: 'any fight, any floor' },
  ess: { label: 'Floor Essence', rarity: 'uncommon', color: '#5cff8a', icon: '✦', from: 'regular fights in its 10-floor set' },
  core: { label: 'Boss Core', rarity: 'rare', color: '#4fa8ff', icon: '⬢', from: "that floor's boss echo (Farm)" },
  sigil: { label: 'Evolution Sigil', rarity: 'epic', color: '#c26bff', icon: '✪', from: 'milestone boss echoes (Floors 10, 20, 30…)' },
};
export const kindOf = key => key === 'shard' ? 'shard' : key.replace(/\d+$/, '');
export const matName = key => { const k = kindOf(key), n = +key.slice(k.length); return k === 'shard' ? 'Tower Shard' : k === 'ess' ? `${ESSENCE[n - 1] || 'Deep'} Essence` : k === 'core' ? `Floor ${n} Core` : `Sigil of Floor ${n}`; };
export const matIcon = key => { const m = MAT_KINDS[kindOf(key)]; return `<i class="mat mat-${kindOf(key)}" style="color:${m.color}" title="${m.label} · ${m.rarity}">${m.icon}</i>`; };
export const canForge = it => !!it && it.slot === 'weapon' && !it.gm && !String(it.id || '').startsWith('gm-');
export const wFloor = it => Math.max(1, Math.min(100, Math.floor(+it?.floor || 1)));
export const upGold = (it, t) => Math.round(120 * Math.pow(1.6, t) * (1 + (wFloor(it) - 1) / 4));
/** Cost of reaching level t (t = 11 means evolve). Materials only from +6 up. */
export function upCost(it, t) {
  const f = wFloor(it), s = setOf(f), m = {};
  if (t === 6) { m.shard = 10; m['ess' + s] = 3; } else if (t === 7) { m.shard = 20; m['ess' + s] = 5; }
  else if (t === 8) { m['ess' + s] = 8; m['core' + f] = 2; } else if (t === 9) { m['ess' + s] = 12; m['core' + f] = 4; }
  else if (t === 10) m['core' + f] = 6; else if (t === 11) m['sigil' + milestoneOf(f)] = 1;
  return { t, gold: upGold(it, t), mats: m, rate: t > MAX_UP ? 100 : UP_RATE[t] };
}
export const nextCost = it => canForge(it) ? (it.up || 0) < MAX_UP ? upCost(it, (it.up || 0) + 1) : it.evo ? null : upCost(it, 11) : null;
export const lacking = (save, c) => [...(save.gold < c.gold ? ['gold'] : []), ...Object.entries(c.mats).filter(([k, n]) => (save.mats?.[k] || 0) < n).map(([k]) => k)];
// Evolution: one form per 10-floor set of the weapon (a new name, a new look, one bonus effect). Never Eventide/Vesperveil.
export const EVOS = [
  { pre: 'Cinderborn', hue: 18, k: 'dpsPct', v: 8, text: 'Cinder Edge: +8% damage' }, { pre: 'Frostwoken', hue: 190, k: 'xpPct', v: 10, text: 'Rime Memory: +10% XP' },
  { pre: 'Gildsworn', hue: 45, k: 'goldPct', v: 10, text: 'Gilded Oath: +10% gold' }, { pre: 'Hollowed', hue: 270, k: 'capH', v: 1, text: 'Hollow Vigil: +1h offline cap' },
  { pre: 'Tideforged', hue: 200, k: 'dpsPct', v: 8, text: 'Undertow: +8% damage' }, { pre: 'Emberheart', hue: 8, k: 'goldPct', v: 10, text: 'Kiln Tithe: +10% gold' },
  { pre: 'Stormbound', hue: 230, k: 'dpsPct', v: 8, text: 'Static Lash: +8% damage' }, { pre: 'Verdant', hue: 120, k: 'xpPct', v: 10, text: 'Overgrowth: +10% XP' },
  { pre: 'Duskwrought', hue: 290, k: 'capH', v: 1, text: 'Long Shadow: +1h offline cap' }, { pre: 'Nullborn', hue: 300, k: 'dpsPct', v: 8, text: 'Zero Point: +8% damage' },
];
export const evoOf = it => EVOS[setOf(wFloor(it)) - 1];
/** Apply a resolved attempt to the save (shared by local mode and the server's answer). roll: 0..99, success when roll < rate. */
export function applyAttempt(save, it, c, roll) {
  const ok = roll < c.rate; save.mats = save.mats || {};
  for (const [k, n] of Object.entries(c.mats)) save.mats[k] = Math.max(0, (save.mats[k] || 0) - n);
  if (ok) { save.gold -= c.gold; if (c.t > MAX_UP) evolve(it); else it.up = c.t; }
  return { ok, roll, rate: c.rate, t: c.t };
}
export function evolve(it) { const e = evoOf(it); it.evo = { base: it.name, pre: e.pre, hue: e.hue, text: e.text }; it.name = `${e.pre} ${it.name}`.slice(0, 60); it.stats = { ...it.stats, [e.k]: (it.stats?.[e.k] || 0) + e.v }; return it; }
/** Local roll (offline / local mode). Throws a readable reason. */
export function forgeLocal(save, rnd = n => Math.floor(Math.random() * n)) {
  const it = save.heroes[0]?.equip?.weapon; if (!it) throw new Error('equip a weapon first'); if (!canForge(it)) throw new Error('staff gear has its own path');
  const c = nextCost(it); if (!c) throw new Error('this weapon is fully evolved'); if (lacking(save, c).length) throw new Error(lacking(save, c)[0] === 'gold' ? 'not enough gold' : 'not enough materials');
  return applyAttempt(save, it, c, rnd(100));
}
// ---- Material drops (per hour of fighting; fractional carry so they are deterministic from timestamps, like gold).
export const RATES = { fight: { shard: 6, ess: 1.5 }, farm: { shard: 8, ess: 2.5, core: 0.6, sigil: 0.05 } };
export function dropTable(f, farm) { const r = farm ? RATES.farm : RATES.fight, t = { shard: r.shard, ['ess' + setOf(f)]: r.ess };
  if (farm) { t['core' + f] = r.core; if (f % 10 === 0) t['sigil' + f] = r.sigil; } return t; }
/** Grant materials for secs of fighting on floor f (farm: the cleared floor's echo). Returns { key: n } gained. */
export function gainMats(save, secs, f, farm = false) {
  if (!(secs > 0) || !(f >= 1)) return {}; save.mats = save.mats || {}; const c = save.matc || (save.matc = {}), got = {};
  for (const [k, perH] of Object.entries(dropTable(f, farm))) { const x = (c[k] || 0) + perH * secs / 3600, n = Math.floor(x); c[k] = x - n; if (n) { save.mats[k] = (save.mats[k] || 0) + n; got[k] = n; } }
  return got;
}

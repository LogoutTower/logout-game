// Weapon upgrades +1..+10 and materials. Pure (no DOM). Mirrors supabase/schema-addendum-forge.sql (pglite test checks parity).
// Online the SERVER rolls (forge_upgrade RPC); this file mirrors the rules for display and rolls on this browser in local mode only.
// Materials are in-game only: never the token, never real value. Staff gear (Eventide / Vesperveil, it.gm) keeps its own tier path.
import { UP_DPS, EVO_DPS, EVO_CAP, evoTier } from './game.js';
export { UP_DPS, EVO_DPS, EVO_CAP, evoTier };
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
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
/** Gold for level t at evo tier e: +50% per tier. */
export const upGold = (it, t, e = 0) => Math.round(120 * Math.pow(1.6, t) * (1 + (wFloor(it) - 1) / 4) * (1 + 0.5 * e));
// Prestige pacing (tuned for ~10 weeks of active play to Evo V +10; see the forge-prestige SQL header): material counts ×(1 + 0.75e),
// sigils to evolve into Evo I..V: 1, 1, 2, 2, 3.
export const EVO_SIGILS = [1, 1, 2, 2, 3];
const scale = (n, e) => Math.round(n * (1 + 0.75 * e));
/** Cost of reaching level t (t = 11 means evolve / prestige) at evo tier e. Materials only from +6 up. */
export function upCost(it, t, e = 0) {
  const f = wFloor(it), s = setOf(f), m = {};
  if (t === 6) { m.shard = scale(10, e); m['ess' + s] = scale(3, e); } else if (t === 7) { m.shard = scale(20, e); m['ess' + s] = scale(5, e); }
  else if (t === 8) { m['ess' + s] = scale(8, e); m['core' + f] = scale(2, e); } else if (t === 9) { m['ess' + s] = scale(12, e); m['core' + f] = scale(4, e); }
  else if (t === 10) m['core' + f] = scale(6, e); else if (t === 11) m['sigil' + milestoneOf(f)] = EVO_SIGILS[Math.min(4, e)];
  return { t, e, gold: upGold(it, t, e), mats: m, rate: t > MAX_UP ? 100 : UP_RATE[t] };
}
/** Only Rare or better can evolve (rarity scale in js/loot.js: common < uncommon < rare < epic < legendary < unique). */
export const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, unique: 5 };
export const EVO_MIN_RARITY = 'rare';
export const rankOf = it => RANK[it?.rarity] ?? 0;
export const canEvolve = it => canForge(it) && rankOf(it) >= RANK[EVO_MIN_RARITY];
export const nextCost = it => { if (!canForge(it)) return null; const e = evoTier(it); return (it.up || 0) < MAX_UP ? upCost(it, (it.up || 0) + 1, e) : e < EVO_CAP && canEvolve(it) ? upCost(it, 11, e) : null; };
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
/** Evolve / prestige: Evo I the first time (name, look, one bonus effect), then Evo II..V. Always resets the weapon to +0. */
export function evolve(it) { const e = evoOf(it), n = evoTier(it) + 1;
  if (!it.evo) { it.evo = { base: it.name, pre: e.pre, hue: e.hue, text: e.text }; it.stats = { ...it.stats, [e.k]: (it.stats?.[e.k] || 0) + e.v }; }
  it.evo.tier = n; it.name = evoName(it); it.up = 0; return it; }
export const evoName = it => `${it.evo.pre} ${it.evo.base}${evoTier(it) > 1 ? ' ' + ROMAN[evoTier(it)] : ''}`.slice(0, 64);
/** Local roll (offline / local mode). Throws a readable reason. */
export function forgeLocal(save, rnd = n => Math.floor(Math.random() * n)) {
  const it = save.heroes[0]?.equip?.weapon; if (!it) throw new Error('equip a weapon first'); if (!canForge(it)) throw new Error('staff gear has its own path');
  const c = nextCost(it); if (!c) throw new Error(`this weapon is at Evo ${ROMAN[EVO_CAP]}, the final form`); if (lacking(save, c).length) throw new Error(lacking(save, c)[0] === 'gold' ? 'not enough gold' : 'not enough materials');
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
// ---- Farm mode: the hero fights a cleared floor's boss echo (weaker, repeatable). Earns that floor's materials (incl. its Boss Core,
// and the Evolution Sigil on milestone floors) but deals NO damage to the live shared boss. Offline time counts like live time.
/** The floor being farmed, or 0. Only a cleared floor (below the shared floor) can be farmed. */
export const farmFloor = (save, current) => { const f = Math.floor(+save?.farm || 0); return f >= 1 && f < current ? f : 0; };
/** Loot key for a 10-floor set: [{ key, kind, rarity, color, icon, name, where, fight, farm }] (rates per hour). Floors above `upTo` stay hidden. */
export function lootKey(set, upTo = set * 10) {
  const from = (set - 1) * 10 + 1, to = set * 10, rows = [], row = (key, where, fight, farm) => { const m = MAT_KINDS[kindOf(key)]; rows.push({ key, kind: kindOf(key), rarity: m.rarity, color: m.color, icon: m.icon, name: matName(key), where, fight, farm }); };
  row('shard', 'any fight, any floor', RATES.fight.shard, RATES.farm.shard);
  row('ess' + set, `fights on Floors ${from}–${to}`, RATES.fight.ess, RATES.farm.ess);
  for (let f = from; f <= Math.min(to, upTo); f++) row('core' + f, `Floor ${f} echo (Farm)`, 0, RATES.farm.core);
  if (upTo >= to) row('sigil' + to, `Floor ${to} echo (Farm, milestone)`, 0, RATES.farm.sigil);
  return rows;
}
const perH = n => n ? n >= 0.5 ? `${n}/h` : `1 per ${Math.round(1 / n)}h` : "—";
export function lootKeyHtml(set, upTo) {
  return `<table class="lootkey"><caption>Loot key · Floors ${(set - 1) * 10 + 1}–${set * 10}<br><small>Cores and Sigils drive the Forge prestige loop: each Evo tier (I–V) of a weapon from this set costs more of them.</small></caption><tr><th></th><th>Material</th><th>Fighting</th><th>Farming</th></tr>${lootKey(set, upTo).map(r =>
    `<tr><td><i class="mat" style="color:${r.color}" title="${r.rarity}">${r.icon}</i></td><td><b style="color:${r.color}">${r.name}</b><br><small>${r.rarity} · ${r.where}</small></td><td>${perH(r.fight)}</td><td>${perH(r.farm)}</td></tr>`).join('')}</table>`;
}
// ---- Transfer (a MOVE, never a copy): the equipped weapon's evo tier goes onto a bag weapon of equal or higher rarity (Rare+, not staff
// gear). The target ends at the higher of the two tiers (keeping its own form if it was already evolved). The target arrives at +0 (its +levels are not kept): the tier's +8% each moves, the +6..+10 climb is redone at that tier's costs, so a
// transfer can't skip the grind. The source keeps its stats minus the evo bonus effect, returns to its base name and +0, and goes to the bag.
// Fee scales with the tier moved AND the rarity gap: ×1.5 per rarity step up (same rarity = base fee). Grind costs never depend on rarity.
export const XFER_STEP = 1.5;
export const transferGap = (src, dst) => Math.max(0, rankOf(dst) - rankOf(src));
export const transferCost = (src, dst) => { const e = evoTier(src), m = Math.pow(XFER_STEP, transferGap(src, dst)), r = n => Math.round(n * m);
  return { gold: r(upGold(dst, 10, e)), mats: { shard: r(30 * e), ['ess' + setOf(wFloor(dst))]: r(10 * e) }, gap: transferGap(src, dst), mul: m }; };
export function transferCheck(save, i, id) {
  const src = save.heroes[0]?.equip?.weapon, dst = save.inv?.[i];
  if (!src || !canForge(src) || !evoTier(src)) return 'equip an evolved weapon first';
  if (!dst || dst.id !== id || dst.slot !== 'weapon' || !canForge(dst)) return 'pick a weapon from your bag';
  if (!canEvolve(dst) || rankOf(dst) < rankOf(src)) return 'the target must be Rare or better and at least the same rarity';
  return null;
}
export function applyTransfer(save, i) {
  const src = save.heroes[0].equip.weapon, dst = save.inv[i], e = evoTier(src), c = transferCost(src, dst), ev = EVOS.find(x => x.pre === src.evo.pre) || evoOf(src);
  save.gold -= c.gold; for (const [k, n] of Object.entries(c.mats)) save.mats[k] = (save.mats[k] || 0) - n;
  const st = { ...src.stats }; st[ev.k] = (st[ev.k] || 0) - ev.v; if (!st[ev.k]) delete st[ev.k];
  const back = { ...src, name: src.evo.base, stats: st, up: 0 }; delete back.evo;
  const te = Math.max(e, evoTier(dst)); if (!dst.evo) evolve(dst); dst.evo.tier = te; dst.name = evoName(dst); dst.up = 0; // a MOVE: the target keeps the higher tier, the source is wiped
  save.inv[i] = back; save.heroes[0].equip.weapon = dst; return { e, from: back.name, to: dst.name };
}
export function transferLocal(save, i, id) { const err = transferCheck(save, i, id); if (err) throw new Error(err); const c = transferCost(save.heroes[0].equip.weapon, save.inv[i]);
  if (lacking(save, c).length) throw new Error(lacking(save, c)[0] === 'gold' ? 'not enough gold' : 'not enough materials'); return applyTransfer(save, i); }

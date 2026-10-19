// Gold sinks that add no combat power: tonics (small XP/gold/comfort buffs, stacking-limited), Tailor cosmetics and the guild bank.
// Pure, client-side (saved in the player's save; no extra Supabase calls). XP from tonics still obeys the level cap in applyXp.
import { baseHp } from './floors.js';
import { buffsOf } from './game.js';
const tier2 = f => baseHp(f) / baseHp(1); // ×1 on Floor 1, ×20 on Floor 10, ×149 on Floor 20
export const TONICS = [
  { id: 'insight', name: 'Tonic of Insight', desc: '+10% XP', mul: 0.10, base: 400 },
  { id: 'gilded', name: 'Gilded Draught', desc: '+10% gold', mul: 0.10, base: 400 },
  { id: 'hearth', name: 'Hearth Tea', desc: '−20% HP drain', mul: 0.20, base: 250 },
];
export const TONIC_SECS = 1800, TONIC_MAX = 7200; // each buy adds 30 min; at most 2 h banked per tonic
export const tonicPrice = (t, f) => Math.round(t.base * tier2(Math.max(1, f)));
/** Buy a tonic: true on success. GM pays nothing (staff tools stay free). */
export function buyTonic(save, f, id) {
  const t = TONICS.find(x => x.id === id), b = buffsOf(save); if (!t) return false; const p = save.ctx?.gm ? 0 : tonicPrice(t, f);
  if (save.gold < p || (b[id] || 0) + TONIC_SECS > TONIC_MAX) return false; save.gold -= p; b[id] = (b[id] || 0) + TONIC_SECS; return true;
}
/** Multipliers for a `secs`-long step (prorated if a tonic runs out inside it); consumes the timers. */
export function tonicMuls(save, secs) {
  const b = buffsOf(save), fr = id => secs > 0 ? Math.min(1, (b[id] || 0) / secs) : 0;
  const m = { xp: 1 + 0.10 * fr('insight'), gold: 1 + 0.10 * fr('gilded'), drain: 1 - 0.20 * fr('hearth') };
  for (const t of TONICS) if (b[t.id]) b[t.id] = Math.max(0, b[t.id] - secs); return m;
}
// Tailor: gold-only cosmetics (never staff items). Bought ids go into progress.drops, the same list rare drops use.
export const TAILOR = [
  { id: 'nc-ember', price: 25000 }, { id: 'nc-frost', price: 25000 }, { id: 'nc-moss', price: 25000 },
  { id: 't-patron', price: 100000 }, { id: 't-gearwright', price: 250000 }, { id: 't-lamplighter', price: 600000 },
  { id: 'au-ember', price: 1500000 },
];
export function buyCosmetic(save, id) {
  const it = TAILOR.find(x => x.id === id), d = (save.progress.drops ||= []); if (!it || d.includes(id) || save.gold < it.price) return false;
  save.gold -= it.price; d.push(id); return true;
}
export const DONATE_STEPS = [0.1, 0.25, 0.5]; // quick donate: share of current gold

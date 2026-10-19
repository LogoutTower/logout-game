// Daily login streak (7-day calendar). The SERVER decides the day (UTC midnight = 7 PM CDT / 6 PM CST) and the streak day,
// via tick() → daily_claim() (supabase/schema-addendum-daily.sql); this file only maps a streak day to its reward. Staff claims like anyone.
// Rewards never include staff items or tokens. Banked XP goes through applyXp with the level cap; tonics obey TONIC_MAX.
import { baseHp, rng, bossInfo } from './floors.js';
import { applyXp, xpToNext, buffsOf, levelCap } from './game.js';
import { TONIC_SECS, TONIC_MAX } from './sinks.js';
import { rollItem, bagSize, salvagePay } from './loot.js';
const T = f => baseHp(Math.max(1, f)) / baseHp(1);
export const DAILY = [ // gold is × the floor's price tier; xp = share of the current level's XP
  { d: 1, gold: 150 }, { d: 2, gold: 250, tonic: 'insight' }, { d: 3, gold: 350, xp: 0.5 }, { d: 4, gold: 500, tonic: 'gilded' },
  { d: 5, gold: 700, xp: 0.75 }, { d: 6, gold: 900, tonic: 'hearth' }, { d: 7, gold: 2000, chest: true },
];
export const CHEST_COSMETICS = ['nc-dawn', 't-faithful', 'au-dawn']; // chest-only cosmetics, in order; then a rare-loot roll
export const CHEST_WEIGHTS = [0, 0, 55, 32, 13, 0]; // rare / epic / legendary; never Unique from a chest
export const RESET_NOTE = 'Resets daily at 00:00 UTC (7 PM CDT / 6 PM CST).';
export const dailyGold = (day, f) => Math.round(DAILY[day - 1].gold * T(f));
/** Apply the reward for server streak day `d` on floor `f`. Returns a short summary for the toast. */
export function claimReward(save, d, f, { gm = false, seq = 0 } = {}) {
  const r = DAILY[(d - 1) % 7], h = save.heroes[0], out = [], g = dailyGold(r.d, f); save.gold += g; out.push(`+${g} gold`);
  if (r.tonic) { const b = buffsOf(save); b[r.tonic] = Math.min(TONIC_MAX, (b[r.tonic] || 0) + TONIC_SECS); out.push('a tonic'); }
  if (r.xp) { applyXp([h], Math.floor(xpToNext(h.level) * r.xp), levelCap(f, gm)); out.push('banked XP'); }
  if (r.chest) { const own = (save.progress.drops ||= []), c = CHEST_COSMETICS.find(id => !own.includes(id));
    if (c) { own.push(c); out.push('a chest cosmetic'); }
    else { const it = rollItem(rng(seq * 7919 + f * 131 + 7), f, bossInfo(f).lootElement, `daily${seq}`, CHEST_WEIGHTS);
      if (save.inv.length < bagSize(save)) save.inv.push(it); else save.gold += salvagePay(save, it); out.push(`${it.rarity} gear`); } }
  save.daily = { ...(save.daily || {}), streak: r.d, lastClaim: Date.now() }; return out.join(' · ');
}
/** Compact 7-cell calendar HTML (escaped content only: numbers and fixed labels). */
export function calendarHtml(streak, open, saves, f, fmt = String) {
  return `<div class="dcal">${DAILY.map(r => `<span class="dday ${r.d <= streak ? 'done' : ''} ${open && r.d === streak % 7 + 1 ? 'next' : ''}" title="${r.chest ? 'Chest: cosmetic or rare loot' : r.tonic ? 'gold + tonic' : r.xp ? 'gold + banked XP' : 'gold'}"><b>${r.d}</b><small>${r.chest ? '🎁' : fmt(dailyGold(r.d, f))}</small></span>`).join('')}</div>
    <p class="sub">Streak save: ${saves} left this month · ${RESET_NOTE}</p>`;
}
/** Offline mode only (no server): the same rules on this browser's UTC clock. Online, the server's daily_claim() decides. */
export function localDaily(save, now = Date.now()) {
  const day = Math.floor(now / 864e5), dy = save.daily || {}, last = dy.day ?? null, month = new Date(now).toISOString().slice(0, 7);
  if (last !== null && last >= day) return null; let d = 1, sv = false;
  if (last === day - 1) d = (dy.streak || 0) % 7 + 1; else if (last === day - 2 && dy.saveMonth !== month) { d = (dy.streak || 0) % 7 + 1; sv = true; }
  save.daily = { ...dy, day, saveMonth: sv ? month : dy.saveMonth }; return { d, sv, local: true };
}
export const savesLeft = (save, now = Date.now()) => (save.daily?.saveMonth === new Date(now).toISOString().slice(0, 7) ? 0 : 1);

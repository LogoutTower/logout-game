// Tower Map + progress: pure helpers (no DOM), so they are testable and shared by both backends' data.
import { bossInfo, isSpecialSlot, isMilestone, PLAN_FLOORS } from './floors.js';
import { arcOf } from './arcs.js';
export const TOWER_TOP = PLAN_FLOORS, CROWN_FROM = 91;
/** history: [{ floor, at, top }] (any order; newest wins per floor). Returns floors TOWER_TOP..1 (top first). */
export function towerRows({ current, maxFloor, history = [] }) {
  const by = new Map(); for (const h of history) { const p = by.get(h.floor); if (!p || Date.parse(h.at || 0) > Date.parse(p.at || 0)) by.set(h.floor, h); }
  const rows = [];
  for (let f = TOWER_TOP; f >= 1; f--) {
    const state = f > maxFloor ? 'undiscovered' : f < current ? 'cleared' : f === current ? 'current' : 'fog';
    const known = state === 'cleared' || state === 'current', h = by.get(f);
    const arc = arcOf(f), known0 = f <= maxFloor;
    rows.push({ f, state, special: isSpecialSlot(f), milestone: isMilestone(f), crown: f >= CROWN_FROM, arc: arc.n, arcName: known0 ? arc.name : 'Sealed', band: arc.pal.band, finale: known0 && !!bossInfo(f).finale, rival: !!bossInfo(f).rival,
      name: known ? bossInfo(f).name : bossInfo(f).rival ? 'Sealed · a shadow waits' : state === 'fog' ? '???' : 'Not yet discovered', at: state === 'cleared' ? h?.at || null : null, top: state === 'cleared' ? h?.top || null : null });
  }
  return rows;
}
/** Progress panel numbers. A floor counts as cleared once the shared floor is above it (the last one when hp hits 0 at the top). */
export function towerProgress({ current, hp, maxHp, maxFloor }) {
  const cleared = Math.max(0, current - 1) + (current >= maxFloor && hp <= 0 ? 1 : 0);
  return { floor: current, top: TOWER_TOP, cleared, pct: Math.min(100, (cleared / TOWER_TOP) * 100), bossPct: maxHp ? Math.max(0, Math.min(1, hp / maxHp)) : 0 };
}

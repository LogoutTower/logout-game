// 100-floor plan: hand-made bosses, reserved unique slots, and a deterministic seeded generator. Pure (no DOM, no Math.random).
import { BOSSES, SHAPES, ELEMENTS, ADDONS, composeShape, shadeShape } from './bosses.js';
export const PLAN_FLOORS = 100;
/** Milestones (10, 20, ... 100) and every floor 91-100 are reserved for unique bosses and are never generated. */
export const isUniqueSlot = f => f % 10 === 0 || (f >= 91 && f <= PLAN_FLOORS);
export const isMilestone = f => f % 10 === 0;
// Floors 1-9 keep the original hand-made bosses; unique slots use hand-made placeholders until real designs drop in.
function fixedSlot(f) {
  if (f <= 9) return { kind: 'handmade', idx: f - 1 };
  if (!isUniqueSlot(f)) return null;
  const idx = f === 10 || f === PLAN_FLOORS ? 9 : f > 90 ? f - 91 : f / 10 - 1; // 10 & 100: Last Warden; 20-90: bosses 2-9; 91-99: bosses 1-9
  return { kind: 'placeholder_unique', idx };
}
// ---- HP: soft-exponential (growth rate decays with floor), milestones x2.5. Same as before on floor 1, sane at floor 100.
const HP0 = 20000, R = Math.log(1.6), SOFT = 10;
export const baseHp = f => Math.round(HP0 * Math.exp(R * SOFT * Math.log(1 + (f - 1) / SOFT)) / 100) * 100;
export const floorBossHp = f => Math.round(baseHp(f) * (isMilestone(f) ? 2.5 : 1));
// ---- seeded RNG
function rng(seed) { let a = (seed * 2654435761 ^ 0x5eed1337) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const GEN_BASES = Object.keys(SHAPES), GEN_ELEMENTS = Object.keys(ELEMENTS);
const plan = [];
function fixedInfo(f, s) {
  const b = BOSSES[s.idx];
  return { floor: f, kind: s.kind, placeholder_unique: s.kind === 'placeholder_unique', base: b.key, element: 'native', addons: [], name: b.name, big: !!b.big };
}
/** Boss for a floor: { floor, kind: 'handmade'|'placeholder_unique'|'generated', base, element, addons, name, title, hp, milestone, big }. */
export function bossInfo(f) {
  f = Math.max(1, Math.floor(f));
  for (let n = plan.length + 1; n <= f; n++) plan[n - 1] = makeInfo(n);
  return plan[f - 1];
}
function makeInfo(f) {
  const s = fixedSlot(f); let info;
  if (s) info = fixedInfo(f, s);
  else {
    const prev = f > 1 ? plan[f - 2] : null, nx = fixedSlot(f + 1), next = nx ? fixedInfo(f + 1, nx) : null, r = rng(f);
    const base = pick(r, GEN_BASES.filter(k => k !== prev?.base && k !== next?.base));
    const element = pick(r, GEN_ELEMENTS.filter(e => e !== prev?.element));
    const allowed = Object.keys(ADDONS).filter(a => !SHAPES[base].no.split(',').includes(a));
    const count = f < 20 ? 1 : r() < 0.55 ? 1 : 2, addons = [];
    while (addons.length < count) { const a = pick(r, allowed.filter(x => !addons.includes(x))); addons.push(a); }
    info = { floor: f, kind: 'generated', placeholder_unique: false, base, element, addons, name: `${ADDONS[addons[0]]} ${ELEMENTS[element].adj} ${SHAPES[base].noun}`, big: !!SHAPES[base].big };
  }
  return { ...info, title: `Guardian of Floor ${f}`, hp: floorBossHp(f), milestone: isMilestone(f) };
}
export const bossName = f => bossInfo(f).name;
export const bossIsBig = f => bossInfo(f).big;
export function bossShape(f) { const i = bossInfo(f); return i.kind === 'generated' ? composeShape(i.base, i.element, i.addons) : composeShape(i.base); }
export const bossGrid = f => shadeShape(bossShape(f));

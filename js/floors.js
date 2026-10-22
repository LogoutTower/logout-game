// 100-floor plan: hand-made bosses, reserved special slots, and a deterministic seeded generator. Pure (no DOM, no Math.random).
import { RIVAL_NAME, RIVAL_TITLE } from './cutscenes.js';
import { BOSSES_V2 } from './bosses-v2.js';
import { prepV2 } from './bosses.js';
import { BOSSES_21_30 } from './bosses-21-30.js';
import { setArcPreview } from './arcs.js';
import { BOSSES, ARC2, ARC2_KEYS, SHAPES, ELEMENTS, ADDONS, composeShape, shadeShape } from './bosses.js';
export const PLAN_FLOORS = 100;
/** Milestones (10, 20, ... 100) and every floor 91-100 are reserved for special (hand-designed) bosses and are never generated. */
// Floor 15 is the mid-arc special of Rimegear Ascent (MID_SPECIALS); add more mid-arc specials here.
export const MID_SPECIALS = [15];
// ---- Arc 3 preview (FEATURES.arcN 'gm'): Floors 21-30 (Tidewire Depths) are hand-made only while main.js turns the preview on (staff).
// Off (default, regular players): the plan is exactly as before (generated 21-29, placeholder 30). The floor cap (MAX_FLOOR) is unchanged either way.
let ARC3_ON = false; export const ARC3_FROM = 21, ARC3_TO = 30, ARC3_MID = 25;
export const arc3Preview = () => ARC3_ON;
export const setArc3Preview = on => { on = !!on; if (on === ARC3_ON) return; ARC3_ON = on; plan.length = 0; v2Cache.clear(); setArcPreview(3, on); };
const ARC3_TEXT = [
  ['Light That Baits the Deep', 'System notice: a login light was stolen down here. The Angler wears it as bait.'],
  ['Every Line Leads to It', 'System notice: every cable in the archive ends in one of its arms. Unplug nothing.'],
  ['Who Prays to the Tide', 'System notice: the Bishop has been praying so long the coral answered.'],
  ['The Suit Kept Walking', 'System notice: the diver logged out years ago. The suit never got the message.'],
  ['It Remembers Every Tide', 'System notice: the Oracle breathes the tide in and out. Strike when it comes in.'],
  ['An Island That Bites', 'System notice: a whole reef grew on its shell. The shell still blunts the first hits.'],
  ['First Strike, Every Strike', 'System notice: the Duelist has never lost a first exchange. Frost slows the blade.'],
  ['Her Song Is Pure Noise', 'System notice: her song is static. It gets louder the more she bleeds.'],
  ['Herder of Drowned Lights', 'System notice: every light that sank is in its flock. Its own lantern burns holy.'],
  ['Heart of the Sunken Archive', 'System notice: the archive has a heart, and the heart has a current. Do not let it pull you under.'],
];
export const isSpecialSlot = f => f % 10 === 0 || MID_SPECIALS.includes(f) || (ARC3_ON && f === ARC3_MID) || (f >= 91 && f <= PLAN_FLOORS);
export const isMilestone = f => f % 10 === 0;
// Floors 1-9 keep the original hand-made bosses; special slots use hand-made placeholders until real designs drop in.
function fixedSlot(f) {
  if (f <= 9) return { kind: 'handmade', idx: f - 1 };
  if (f >= 11 && f <= 20) return { kind: 'handmade', arc2: f - 11 }; // arc 2: Rimegear Ascent (bosses.js ARC2)
  if (ARC3_ON && f >= ARC3_FROM && f <= ARC3_TO) return { kind: 'handmade', arc3: f - ARC3_FROM }; // arc 3 preview: Tidewire Depths (bosses-21-30.js)
  if (!isSpecialSlot(f)) return null;
  const idx = f === 10 || f === PLAN_FLOORS ? 9 : f > 90 ? f - 91 : f / 10 - 1; // 10 & 100: Last Warden; 20-90: bosses 2-9; 91-99: bosses 1-9
  return { kind: 'placeholder_special', idx };
}
// ---- HP: soft-exponential (growth rate decays with floor), milestones x2.5. Same as before on floor 1, sane at floor 100.
const HP0 = 20000, R = Math.log(1.6), SOFT = 10;
export const baseHp = f => Math.round(HP0 * Math.exp(R * SOFT * Math.log(1 + (f - 1) / SOFT)) / 100) * 100;
// Arc 2+ is a shared-server climb: the guardian's HP is multiplied by ARC_HP (×60 on floor 11, ×1.33 per floor, flat after 20 until the
// next arc is tuned). Gear keeps scaling with baseHp only, so heroes do not outgrow it. See docs/BALANCE-FLOORS-11-20.md. Mirrors floor_hp() in SQL.
export const ARC_HP = { from: 11, start: 332, growth: 0.988, flatFrom: 20 };
// Arc 1 (Gatefall Hold) launch-day pacing: explicit guardian HP for floors 1-10, tuned so ~100 fresh heroes clear Floor 10 about 18 h
// after the gate opens (quick early floors, gentle climb, Floor 10 as a mini-wall). See docs/BALANCE-FLOORS-11-20.md. Mirrors floor_hp().
export const ARC1_HP = [86000, 630000, 2400000, 7300000, 19000000, 29000000, 37000000, 46000000, 62000000, 128000000];
export const arcHpMul = f => f < ARC_HP.from ? 1 : ARC_HP.start * Math.pow(ARC_HP.growth, Math.min(f, ARC_HP.flatFrom) - ARC_HP.from);
export const floorBossHp = f => f < ARC_HP.from ? ARC1_HP[Math.max(1, f) - 1] : Math.round(baseHp(f) * (isMilestone(f) ? 2.5 : 1) * arcHpMul(f) / 1000) * 1000;
// ---- seeded RNG
export function rng(seed) { let a = (seed * 2654435761 ^ 0x5eed1337) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const GEN_BASES = Object.keys(SHAPES).filter(k => !ARC2_KEYS.includes(k) && !SHAPES[k].rival), GEN_ELEMENTS = Object.keys(ELEMENTS);
const plan = [];
// Loot element for the hand-made bosses (generated bosses use their own element).
const NATIVE_ELEMENT = { knight: 'holy', hydra: 'fire', boneking: 'shadow', seraph: 'fire', lich: 'venom', choir: 'storm', golem: 'frost', wyrm: 'storm', dryad: 'venom', dreadknight: 'void' };
function fixedInfo(f, s) {
  if (s.arc2 != null) { const b = ARC2[s.arc2]; return { floor: f, kind: 'handmade', placeholder_special: false, base: b.key, element: 'native', native: b.element, addons: [], name: b.name, big: !!b.big, bossTitle: b.title, lore: b.lore, mech: b.mech, finale: !!b.finale, sig: b.sig || [] }; }
  if (s.arc3 != null) { const b = BOSSES_21_30[s.arc3], [bossTitle, lore] = ARC3_TEXT[s.arc3]; return { floor: f, kind: 'handmade', placeholder_special: false, base: b.key, element: 'native', native: b.element, addons: [], name: b.name, big: !!b.big, bossTitle, lore, mech: b.mech, finale: !!b.finale, sig: [], arc3: true }; }
  const b = BOSSES[s.idx];
  return { floor: f, kind: s.kind, placeholder_special: s.kind === 'placeholder_special', base: b.key, element: 'native', addons: [], name: b.name, big: !!b.big };
}
/** Boss for a floor: { floor, kind: 'handmade'|'placeholder_special'|'generated', base, element, addons, name, title, hp, milestone, big }. */
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
    info = { floor: f, kind: 'generated', placeholder_special: false, base, element, addons, name: `${ADDONS[addons[0]]} ${ELEMENTS[element].adj} ${SHAPES[base].noun}`, big: !!SHAPES[base].big };
  }
  if (f === PLAN_FLOORS) info = { ...info, name: RIVAL_NAME, rival: true, sealed: true, bossTitle: RIVAL_TITLE, element: 'native', native: 'void', kind: 'handmade', placeholder_special: false, base: 'umbra', addons: [], big: true, phases: 2 }; // final guardian: two phases (see bossPhase)
  return { mech: null, lore: null, sig: [], finale: false, ...info, lootElement: info.element === 'native' ? (info.native || NATIVE_ELEMENT[info.base]) : info.element, title: info.bossTitle || `Guardian of Floor ${f}`, hp: floorBossHp(f), milestone: isMilestone(f) };
}
export const bossName = f => bossInfo(f).name;
export const bossIsBig = f => bossInfo(f).big;
const arc3Entry = f => { const i = bossInfo(f); return i.arc3 ? BOSSES_21_30[f - ARC3_FROM] : null; };
const down32 = g => { const k = g.rows.length / 32, rows = []; for (let y = 0; y < 32; y++) { let r = ''; for (let x = 0; x < 32; x++) { let c = '.'; for (let dy = 0; dy < k && c === '.'; dy++) for (let dx = 0; dx < k && c === '.'; dx++) c = g.rows[y * k + dy][x * k + dx]; r += c; } rows.push(r); } return { rows, pal: g.pal }; };
export function bossShape(f) { const i = bossInfo(f); if (i.arc3) return down32(bossV2Grid(f)); return i.kind === 'generated' ? composeShape(i.base, i.element, i.addons) : composeShape(i.base); }
/** v2: boss art v2 flag (FEATURES.bossV2). A BOSSES_V2 entry for the boss's key replaces a hand-made boss (phase 1 only); everything else keeps the 32x32 path. */
const v2Cache = new Map();
export const bossV2Grid = f => { const i = bossInfo(f), e = i.kind !== 'generated' && (BOSSES_V2[i.base] || arc3Entry(f)); if (!e || (e.floor ? e.floor !== f : i.kind !== 'handmade')) return null; if (!v2Cache.has(i.base)) v2Cache.set(i.base, prepV2(e, e.pedestal === false || i.arc3 ? { ground: true } : { stripPedestal: true })); return v2Cache.get(i.base); }; // an entry's `floor` pins it to that floor (reused placeholder shapes elsewhere stay classic)
export const bossGrid = (f, phase = 1, v2 = false) => (v2 && phase === 1 && bossV2Grid(f)) || (bossInfo(f).arc3 ? down32(bossV2Grid(f)) : null) || shadeShape(phase === 2 && bossInfo(f).phases === 2 ? composeShape('umbraAwake') : bossShape(f));
// ---- Two-phase guardians (Floor 100). Phase is derived only from the shared boss HP, so every player sees the same phase; no server state.
export const AWAKEN_AT = 0.5, AWAKEN_NAME = `${RIVAL_NAME} Awakened`, AWAKEN_TITLE = 'The Tower Rewrites Itself';
export const bossPhase = (f, hp, maxHp) => bossInfo(f).phases === 2 && maxHp > 0 && hp > 0 && hp / maxHp <= AWAKEN_AT ? 2 : 1;

// ---- Signature mechanics (arc 2). Live-only context (save.ctx.mech / bossPct / element); offline maths ignore them, so they never cut
// offline progress. All effects are small and use the existing systems: HP layers, enrage (last layer), element weakness, drain.
export const MECHS = {
  casing: { text: 'Brass casing: −15% damage while its first HP layer holds (above 80%).', dps: c => (c.bossPct ?? 1) > 0.8 ? 0.85 : 1 },
  frostbite: { text: 'Frostbite: your HP drains 20% faster on this floor.', drain: () => 1.2 },
  enrage: { text: 'Enrage: on its last HP layer (below 20%) it drains you 40% faster.', drain: c => (c.bossPct ?? 1) < 0.2 ? 1.4 : 1 },
  stillHour: { text: 'The Stilled Hour: time stops on alternate layers (−10% damage on layers 4 and 2) and races on the others (+10%).', dps: c => { const l = Math.ceil((c.bossPct ?? 1) * 5 - 1e-9); return l % 2 === 0 ? 0.9 : 1.1; } },
  // Arc 3 (preview). tide (F25): the Oracle breathes the tide across its five HP layers: tide in on layers 5, 3, 1 (+10% damage), tide out on 4 and 2 (−10%).
  tide: { text: 'Tide: the tide comes in on layers 5, 3 and 1 (+10% damage) and goes out on layers 4 and 2 (−10% damage).', dps: c => { const l = Math.ceil((c.bossPct ?? 1) * 5 - 1e-9); return l % 2 === 0 ? 0.9 : 1.1; } },
  // undertow (F30 finale): two stages. Below 50% the current pulls everyone in (+10% damage, drain +25%); on the last layer (below 20%) it becomes a riptide
  // (+15% damage, drain +40%). Peaks match the existing maxima (overclock +15% damage, enrage +40% drain), so it stays inside the server's damage headroom.
  undertow: { text: 'Undertow: below 50% HP the current pulls you in (+10% damage, you drain 25% faster); below 20% it turns into a riptide (+15% damage, 40% faster drain).',
    dps: c => { const p = c.bossPct ?? 1; return p < 0.2 ? 1.15 : p < 0.5 ? 1.1 : 1; }, drain: c => { const p = c.bossPct ?? 1; return p < 0.2 ? 1.4 : p < 0.5 ? 1.25 : 1; } },
  overclock: { text: 'Overclock: below 40% HP the spire runs fast for everyone: +15% damage, and it drains you 30% faster.', dps: c => (c.bossPct ?? 1) < 0.4 ? 1.15 : 1, drain: c => (c.bossPct ?? 1) < 0.4 ? 1.3 : 1 },
};
const weak = m => m && m.startsWith('weak:') ? m.slice(5) : null;
export const mechText = m => { const w = weak(m); return w ? `Weakness: ${ELEMENTS[w]?.adj || w} weapons deal +20% damage here.` : MECHS[m]?.text || ''; };
/** DPS multiplier of a floor mechanic for the live context c = { mech, bossPct }, weapon element we. */
export const mechDps = (c, we) => { const m = c?.mech; if (!m) return 1; const w = weak(m); if (w) return we === w ? 1.2 : 1; return MECHS[m]?.dps ? MECHS[m].dps(c) : 1; };
export const mechDrain = c => { const m = c?.mech; return m && MECHS[m]?.drain ? MECHS[m].drain(c) : 1; };

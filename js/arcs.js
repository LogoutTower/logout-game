// Arcs: every 10 floors share one SCENE (arena art, palette, props, ambient particles, battle strip, Tower Map band) and a NAME.
// Keyed by Math.ceil(floor / 10). Later arcs (21-30 … 91-100) just add an entry; a missing arc falls back to the last defined one.
// Names live ONLY here (ARC_NAMES) so they are easy to swap.
export const ARC_NAMES = { 1: 'Gatefall Hold', 2: 'Rimegear Ascent' };
export const ARCS = [
  { n: 1, scene: 'stone keep', props: 'torches', particles: 'dust',
    pal: { sky: '#2c1f4a', sky2: '#1a1030', deep: '#120a22', mortar: '#00000055', joint: '#00000044', strip1: '#3a2a5a', strip2: '#2a1d45', glow: '#ff9a2e', band: '#7a5ab8' } },
  { n: 2, scene: 'frozen clockwork spire', props: 'gears', particles: 'snow',
    pal: { sky: '#1c3a5c', sky2: '#0e2238', deep: '#06121f', mortar: '#9fd8ff22', joint: '#c8a85a33', strip1: '#5a7a98', strip2: '#2a4560', glow: '#9fd8ff', band: '#5fc8ff' } },
];
// Preview arcs (staff only until their floors open): not in ARCS/ARC_NAMES/ARENA_BG for regular players. floors.js setArc3Preview() toggles arc 3.
export const PREVIEW_ARCS = {
  3: { name: 'Tidewire Depths', bg: 'assets/bg/arc-3.png', arc: { n: 3, scene: 'sunken undersea ruin', props: 'cables', particles: 'bubbles',
    pal: { sky: '#123a4a', sky2: '#0a2030', deep: '#04101a', mortar: '#5fe8ff18', joint: '#1e5a4a33', strip1: '#1a3a4a', strip2: '#0e2430', glow: '#5fe8ff', band: '#2ab8c8' } } },
};
const previewOn = new Set();
export const setArcPreview = (n, on) => { if (on) previewOn.add(n); else previewOn.delete(n); };
const pv = n => previewOn.has(n) ? PREVIEW_ARCS[n] : null;
const hx = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
export const arcIndex = f => Math.max(1, Math.ceil(Math.max(1, Math.floor(f)) / 10));
/** Arc entry for a floor (graceful fallback to the highest defined arc). */
export function arcOf(f) {
  const n = arcIndex(f), a = pv(n)?.arc || ARCS.find(x => x.n === n) || ARCS[ARCS.length - 1];
  return { ...a, n, name: ARC_NAMES[n] || pv(n)?.name || `Arc ${n}`, from: (n - 1) * 10 + 1, to: n * 10 };
}
/** Scene for one floor: arc palette with a small per-floor tint toward the guardian's element glow (tint 0..1). */
export function sceneOf(f, tintColor = null, tint = 0.14) {
  const a = arcOf(f), p = { ...a.pal };
  if (tintColor && /^#[0-9a-f]{6}$/i.test(tintColor)) { p.sky = mix(p.sky, tintColor, tint); p.sky2 = mix(p.sky2, tintColor, tint * 0.6); }
  return { arc: a.n, name: a.name, props: a.props, particles: a.particles, pal: p };
}
/** Arena background art (FEATURES.arenaBg): one 480x96 pixel-art scene per arc in assets/bg/. Only wired arcs get art;
 * any other arc keeps the classic gradient scene (no fallback to the last arc: a wrong scene reads worse than none). Arc 3 (Tidewire Depths) ships with the Floors 21-30 update. */
export const ARENA_BG = { 1: 'assets/bg/arc-1.png', 2: 'assets/bg/arc-2.png' };
export const arenaBgOf = f => ARENA_BG[arcIndex(f)] || pv(arcIndex(f))?.bg || null;
/** CSS custom properties for #arena (read by style.css). */
export const sceneVars = s => Object.entries({ '--a-sky': s.pal.sky, '--a-sky2': s.pal.sky2, '--a-deep': s.pal.deep, '--a-mortar': s.pal.mortar, '--a-joint': s.pal.joint, '--a-strip1': s.pal.strip1, '--a-strip2': s.pal.strip2, '--a-glow': s.pal.glow });

// Pixel sprites built from string maps → SVG data URIs (hero 32x32, bosses 32x32 via shade()).
import { shade } from './pixel.js';
const PAL = { '.': null, k: '#12062a', c: '#3ff7ff', p: '#ff4fd8', w: '#e6dcff', y: '#ffd84f', r: '#ff3355', g: '#7a5cff', s: '#c9a27a' };
export function sprite(rows, pal = PAL) {
  let r = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`; }));
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${rows.length} ${rows.length}' shape-rendering='crispEdges'>${r}</svg>`)}")`;
}
const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const BOSS_BASE = [
 '..H..........H..', '..HH........HH..', '...HBBBBBBBBBH..', '..BBBBBBBBBBBBB.', '..BBkEEBBBkEEBB.', '..BBkEEBBBkEEBB.', '..BBBBBBBBBBBBB.',
 '..BBBwkwkwkwBBB.', '...BBBBBBBBBB...', '.AA.BBBBBBBB.AA.', 'AAABBBBBBBBBBAAA', 'A..BBBBBBBBBB..A', '...BB......BB...', '...BB......BB...', '..BBB......BBB..', '................'];
const BOSS_PAL = [ // body, horns, arms, eyes per floor
 ['#ff4fd8', '#ff3355', '#7a5cff', '#ffd84f'], ['#b4532a', '#8a8f9a', '#5a3825', '#5ff6ff'], ['#4b3a6e', '#ffd84f', '#2a1d45', '#ff3355'],
 ['#c9c2b0', '#ff9a2e', '#e8c06a', '#ff3355'], ['#4f8a4b', '#26232e', '#2f5a2c', '#b8f3ff'], ['#8a8f9a', '#e8c06a', '#5a5f6a', '#5ff6ff'],
 ['#e6dcff', '#9aa3b5', '#b7aee0', '#12062a'], ['#3a6ad8', '#5ff6ff', '#22408a', '#fff6a8'], ['#7a3d9e', '#4f8a4b', '#c2369e', '#5cff8a'], ['#1b1030', '#5ff6ff', '#3a2a55', '#ff4fd8']];
const HYDRA_TOP = ['................', '.HBB..HBBH..BBH.', '.BEB..BEEB..BEB.', '.BBB..BwwB..BBB.', '..BB...BB...BB..', '...BB..BB..BB...', '...BBBBBBBBBB...', '..BBBBBBBBBBBBB.'];
const SHAPES = ['horned', 'hydra', 'crown', 'wings', 'horned', 'crown', 'hulk', 'hydra', 'crown', 'wings']; // one per floor
const put = (rows, pts, ch) => { const g = rows.map(r => [...r]); for (const [x, y] of pts) g[y][x] = ch; return g.map(r => r.join('')); };
export function bossShape(f) {
  const shape = SHAPES[(f - 1) % SHAPES.length];
  let rows = BOSS_BASE;
  if (shape === 'crown') rows = rows.map((r, y) => y === 0 ? '...H.H.HH.H.H...' : y === 1 ? '...HHHHHHHHHH...' : r);
  if (shape === 'hydra') rows = [...HYDRA_TOP, ...BOSS_BASE.slice(8)];
  if (shape === 'wings') rows = put(rows, [[0, 1], [15, 1], [0, 2], [1, 2], [14, 2], [15, 2], ...[3, 4, 5, 6, 7].flatMap(y => [[0, y], [1, y], [14, y], [15, y]]), [1, 8], [14, 8]], 'A');
  if (shape === 'hulk') rows = rows.map((r, y) => y >= 3 && y <= 11 ? r.replace(/^\.+/, m => '.' + 'A'.repeat(m.length - 1)).replace(/\.+$/, m => 'A'.repeat(m.length - 1) + '.') : r);
  return { shape, rows };
}
export const BOSS_SIZE = 32;
export function bossGrid(f) {
  const [B, H, A, E] = BOSS_PAL[(f - 1) % BOSS_PAL.length];
  return shade(bossShape(f).rows, { k: '#12062a', w: '#e6dcff', B, H, A, E }, { drop: '', eyes: 'E' });
}
export const bossSprite = f => memo('b' + f, () => { const g = bossGrid(f); return sprite(g.rows, g.pal); });
export const BOSS_SPRITE = bossSprite(1);
import { heroGrid } from './cosmetics.js';
export const heroSprite = (look, cls) => memo(cls + JSON.stringify(look), () => { const g = heroGrid(look, cls); return sprite(g.rows, g.pal); });

// Tiny 16x16 pixel sprites built from string maps → SVG data URIs.
const PAL = { '.': null, k: '#12062a', c: '#3ff7ff', p: '#ff4fd8', w: '#e6dcff', y: '#ffd84f', r: '#ff3355', g: '#7a5cff', s: '#c9a27a' };
export function sprite(rows, pal = PAL) {
  let r = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`; }));
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' shape-rendering='crispEdges'>${r}</svg>`)}")`;
}
const BOSS_BASE = [
 '..H..........H..', '..HH........HH..', '...HBBBBBBBBBH..', '..BBBBBBBBBBBBB.', '..BBkEEBBBkEEBB.', '..BBkEEBBBkEEBB.', '..BBBBBBBBBBBBB.',
 '..BBBwkwkwkwBBB.', '...BBBBBBBBBB...', '.AA.BBBBBBBB.AA.', 'AAABBBBBBBBBBAAA', 'A..BBBBBBBBBB..A', '...BB......BB...', '...BB......BB...', '..BBB......BBB..', '................'];
const BOSS_PAL = [ // body, horns, arms, eyes per floor
 ['#ff4fd8', '#ff3355', '#7a5cff', '#ffd84f'], ['#b4532a', '#8a8f9a', '#5a3825', '#5ff6ff'], ['#4b3a6e', '#ffd84f', '#2a1d45', '#ff3355'],
 ['#c9c2b0', '#ff9a2e', '#e8c06a', '#ff3355'], ['#4f8a4b', '#26232e', '#2f5a2c', '#b8f3ff'], ['#8a8f9a', '#e8c06a', '#5a5f6a', '#5ff6ff'],
 ['#e6dcff', '#9aa3b5', '#b7aee0', '#12062a'], ['#3a6ad8', '#5ff6ff', '#22408a', '#fff6a8'], ['#7a3d9e', '#4f8a4b', '#c2369e', '#5cff8a'], ['#1b1030', '#5ff6ff', '#3a2a55', '#ff4fd8']];
export function bossSprite(f) {
  const [B, H, A, E] = BOSS_PAL[(f - 1) % BOSS_PAL.length];
  let rows = BOSS_BASE;
  if (f % 3 === 0) rows = rows.map((r, y) => y < 2 ? '....H.H..H.H....' : r); // crown
  if (f % 3 === 2) rows = rows.map((r, y) => y === 9 || y === 10 ? r.replace(/^A+|A+$/g, m => 'A'.repeat(m.length)) : y === 8 ? 'AA.BBBBBBBBBB.AA' : r); // wings
  return sprite(rows, { k: '#12062a', w: '#e6dcff', B, H, A, E });
}
export const BOSS_SPRITE = bossSprite(1);
import { heroGrid } from './cosmetics.js';
export const heroSprite = (look, cls) => { const g = heroGrid(look, cls); return sprite(g.rows, g.pal); };

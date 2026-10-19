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
import { bossGrid } from './floors.js';
export { bossGrid, bossShape, bossIsBig, bossInfo } from './floors.js';
export { BOSS_SIZE } from './bosses.js';
export const bossSprite = f => memo('b' + f, () => { const g = bossGrid(f); return sprite(g.rows, g.pal); });
export const BOSS_SPRITE = bossSprite(1);
import { heroGrid } from './cosmetics.js';
export const heroSprite = (look, cls) => memo(cls + JSON.stringify(look), () => { const g = heroGrid(look, cls); return sprite(g.rows, g.pal); });

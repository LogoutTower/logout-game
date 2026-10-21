// Pixel sprites built from string maps → SVG data URIs (hero 32x32, bosses 32x32 via shade()).
import { shade } from './pixel.js';
const PAL = { '.': null, k: '#12062a', c: '#3ff7ff', p: '#ff4fd8', w: '#e6dcff', y: '#ffd84f', r: '#ff3355', g: '#7a5cff', s: '#c9a27a' };
// Grids above SVG_MAX px per side render through a canvas cached as a PNG data URL (one <rect> per pixel gets heavy at 96x96).
export const SVG_MAX = 48;
function canvasSprite(rows, pal) { const n = rows.length, cv = document.createElement('canvas'); cv.width = cv.height = n; const g = cv.getContext('2d'), img = g.createImageData(n, n);
  const rgb = {}; for (const [k, c] of Object.entries(pal)) if (c) rgb[k] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const c = rgb[ch]; if (c) { const o = (y * n + x) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255; } }));
  g.putImageData(img, 0, 0); return `url("${cv.toDataURL('image/png')}")`; }
export function sprite(rows, pal = PAL) {
  if (rows.length > SVG_MAX && typeof document !== 'undefined') return canvasSprite(rows, pal);
  let r = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`; }));
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${rows.length} ${rows.length}' shape-rendering='crispEdges'>${r}</svg>`)}")`;
}
const cache = new Map(); let BV2 = false; // boss art v2 (FEATURES.bossV2); main.js sets it once the staff check is known
export const setBossV2 = on => { BV2 = !!on; }; export const bossV2 = () => BV2;
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
import { bossGrid } from './floors.js';
export { bossGrid, bossShape, bossIsBig, bossInfo, bossPhase, AWAKEN_NAME, AWAKEN_TITLE } from './floors.js';
export { BOSS_SIZE } from './bosses.js';
export const bossSprite = (f, phase = 1) => memo('b' + f + ':' + phase + (BV2 ? ':v2' : ''), () => { const g = bossGrid(f, phase, BV2); return sprite(g.rows, g.pal); });
import { bossV2Grid } from './floors.js';
/** True when this floor/phase is drawn from the art v2 registry right now (flag on + entry present). */
export const bossIsV2 = (f, phase = 1) => BV2 && phase === 1 && !!bossV2Grid(f);
export const BOSS_SPRITE = bossSprite(1);
import { heroGrid } from './cosmetics.js';
export const heroSprite = (look, cls) => memo(cls + JSON.stringify(look), () => { const g = heroGrid(look, cls); return sprite(g.rows, g.pal); });

// Floor bosses: original creature silhouettes drawn with simple primitives on a 32x32 grid, then outlined/shaded by shade().
// Pure (no DOM). Palette chars: k = deep shadow, E = glow (both unshaded).
import { shade } from './pixel.js';
export const BOSS_SIZE = 32;
function canvas() {
  const g = Array.from({ length: BOSS_SIZE }, () => Array(BOSS_SIZE).fill('.'));
  const px = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 1 && x < BOSS_SIZE - 1 && y >= 1 && y < BOSS_SIZE - 1) g[y][x] = c; };
  const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(i, j, c); };
  const ell = (cx, cy, rx, ry, c) => { for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx + 0.5) + (j * j) / (ry * ry + 0.5) <= 1) px(cx + i, cy + j, c); };
  const line = (x0, y0, x1, y1, c, t = 1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let s = 0; s <= n; s++) { const x = x0 + (x1 - x0) * s / n, y = y0 + (y1 - y0) * s / n; rect(Math.round(x - (t - 1) / 2), Math.round(y - (t - 1) / 2), t, t, c); } };
  const tri = (a, b, d, c) => { const [minY, maxY] = [Math.min(a[1], b[1], d[1]), Math.max(a[1], b[1], d[1])]; for (let y = minY; y <= maxY; y++) for (let x = 0; x < BOSS_SIZE; x++) {
    const s = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]); const e = [s(a, b), s(b, d), s(d, a)]; if (e.every(v => v >= 0) || e.every(v => v <= 0)) px(x, y, c); } };
  const flare = (y0, y1, cx, w0, w1, c) => { for (let y = y0; y <= y1; y++) { const w = Math.round(w0 + (w1 - w0) * (y - y0) / Math.max(1, y1 - y0)); rect(cx - w, y, 2 * w + 1, 1, c); } };
  return { g, px, rect, ell, line, tri, flare, rows: () => g.map(r => r.join('')) };
}
const K = '#12062a';
export const BOSSES = [
  { name: 'The Gatewarden', pal: { R: '#8a2a3c', M: '#8a93a8', D: '#4a5068', G: '#d8a64a', W: '#6b4a2b', S: '#dfe6f0', E: '#ffd84f', k: K }, draw: ({ rect, ell, line, px }) => {
    rect(9, 13, 14, 15, 'R');                                  // cape
    line(25, 3, 25, 30, 'W', 1); rect(26, 4, 3, 5, 'S'); line(25, 1, 25, 3, 'S'); px(24, 5, 'S'); // halberd
    ell(15, 8, 5, 5, 'M'); line(15, 1, 15, 3, 'R', 2); rect(11, 8, 9, 1, 'k'); px(13, 8, 'E'); px(17, 8, 'E'); // helm, plume, visor
    rect(10, 13, 11, 10, 'M'); rect(14, 15, 3, 3, 'G'); rect(10, 22, 11, 1, 'G');
    ell(9, 14, 3, 2, 'G'); ell(21, 14, 3, 2, 'G'); rect(7, 15, 3, 7, 'D'); rect(22, 15, 3, 6, 'D'); rect(23, 13, 3, 3, 'D'); // pauldrons, arms
    rect(11, 23, 4, 6, 'D'); rect(16, 23, 4, 6, 'D'); rect(10, 29, 5, 2, 'M'); rect(16, 29, 5, 2, 'M');
  } },
  { name: 'The Rust Hydra', pal: { B: '#b4532a', L: '#e8a05a', H: '#6b2e18', w: '#f4ead8', E: '#5ff6ff', k: K }, draw: ({ ell, line, px }) => {
    line(24, 26, 30, 29, 'B', 2); ell(16, 25, 9, 5, 'B'); ell(16, 27, 6, 2, 'L');
    for (const [x0, x1, y1] of [[10, 5, 9], [16, 16, 6], [22, 27, 10]]) { line(x0, 22, x1, y1, 'B', 3); ell(x1, y1 - 2, 3, 2, 'B'); px(x1 - 1, y1 - 3, 'E'); px(x1 + 1, y1 - 3, 'E'); line(x1 - 2, y1 - 1, x1 + 2, y1 - 1, 'w'); px(x1, y1 - 5, 'H'); }
    for (let i = 0; i < 4; i++) { px(9 - i, 20 - i * 3, 'H'); px(18, 19 - i * 3, 'H'); px(24 + i, 20 - i * 3, 'H'); }
  } },
  { name: 'The Hollow King', pal: { T: '#4b3a6e', R: '#8a2a5c', W: '#e6dcc8', P: '#3a1d5a', G: '#ffd84f', E: '#ff3355', k: K }, draw: ({ rect, ell, line, px }) => {
    ell(16, 7, 10, 5, 'T'); rect(6, 7, 20, 23, 'T'); rect(9, 9, 14, 13, 'R'); rect(7, 22, 18, 3, 'T'); // throne
    ell(16, 10, 4, 4, 'W'); px(14, 10, 'k'); px(18, 10, 'k'); px(14, 10, 'E'); px(18, 10, 'E'); rect(15, 13, 3, 1, 'k'); // skull
    rect(12, 4, 9, 2, 'G'); px(12, 3, 'G'); px(16, 2, 'G'); px(16, 3, 'G'); px(20, 3, 'G');           // crown
    rect(11, 15, 11, 3, 'P'); rect(13, 18, 7, 4, 'W'); for (const y of [19, 21]) rect(13, y, 7, 1, 'k'); px(16, 19, 'W'); px(16, 21, 'W');
    line(11, 16, 9, 22, 'W'); line(21, 16, 24, 20, 'W'); line(24, 9, 24, 23, 'G'); ell(24, 8, 1, 1, 'E'); // arms, scepter
    line(14, 22, 13, 29, 'W'); line(18, 22, 19, 29, 'W'); rect(7, 25, 2, 5, 'T'); rect(23, 25, 2, 5, 'T');
  } },
  { name: 'The Ash Seraph', pal: { F: '#ff9a2e', W: '#b9b4c4', L: '#7d7590', R: '#ece6f4', S: '#f1d1b5', G: '#e8c06a', E: '#fff3a0', k: K }, draw: ({ ell, line, flare, px }) => {
    ell(7, 14, 6, 9, 'W'); ell(25, 14, 6, 9, 'W'); for (let i = 0; i < 4; i++) { line(12, 10 + i * 3, 3, 13 + i * 4, 'L'); line(20, 10 + i * 3, 29, 13 + i * 4, 'L'); }
    ell(16, 4, 6, 2, 'F'); ell(16, 4, 4, 1, '.'); px(16, 1, 'E'); px(11, 3, 'E'); px(21, 3, 'E');      // burning halo
    flare(12, 30, 16, 2, 7, 'R'); line(16, 14, 16, 29, 'L'); ell(16, 9, 3, 3, 'G'); ell(16, 9, 2, 2, 'S'); px(15, 9, 'k'); px(17, 9, 'k');
    for (const [x, y] of [[4, 26], [27, 25], [9, 29], [24, 30], [2, 20], [29, 19]]) px(x, y, 'F');
  } },
  { name: 'The Mire Lich', pal: { R: '#3f4a3a', M: '#5f8a3a', W: '#d6d0b8', D: '#5a3825', E: '#7dff6a', k: K }, draw: ({ rect, ell, line, flare, px }) => {
    line(25, 5, 25, 30, 'D'); ell(25, 4, 2, 2, 'E'); px(23, 7, 'D'); px(27, 7, 'D');                // staff + orb
    flare(12, 29, 15, 4, 9, 'R'); for (let x = 7; x <= 23; x += 3) rect(x, 30, 1, 1, 'R');             // ragged robe
    for (let x = 7; x <= 23; x += 4) rect(x, 27, 2, 3, 'M');
    ell(15, 8, 5, 5, 'R'); ell(15, 9, 3, 3, 'k'); px(14, 9, 'E'); px(16, 9, 'E'); rect(13, 4, 5, 1, 'M');
    line(10, 15, 6, 21, 'R', 2); line(20, 15, 24, 17, 'R', 2); rect(5, 21, 2, 2, 'W'); rect(24, 16, 2, 2, 'W');
  } },
  { name: 'The Iron Choir', pal: { M: '#8a8f9a', D: '#4a4f5a', G: '#e8c06a', E: '#5ff6ff', k: K }, draw: ({ rect, ell, line, flare, px }) => {
    for (const x of [9, 16, 23]) line(x, 1, x, 6, 'D');
    for (const [cx, cy, w] of [[9, 7, 4], [23, 7, 4], [16, 16, 5]]) { ell(cx, cy, w - 2, 2, 'M'); flare(cy, cy + w + 3, cx, w - 2, w + 1, 'M'); rect(cx - w - 1, cy + w + 3, 2 * w + 3, 1, 'G'); rect(cx - 1, cy + 2, 3, 1, 'E'); px(cx, cy + w + 4, 'D'); }
    for (const [x, y] of [[4, 22], [28, 21], [16, 29], [6, 4], [26, 3]]) px(x, y, 'E');               // resonance motes
  } },
  { name: 'The Pale Colossus', big: true, pal: { S: '#c9c2b0', D: '#8a8476', M: '#5f8a3a', E: '#5ff6ff', k: K }, draw: ({ rect, ell, line, px }) => {
    rect(9, 22, 6, 9, 'S'); rect(17, 22, 6, 9, 'S'); rect(8, 29, 8, 2, 'D'); rect(16, 29, 8, 2, 'D');  // legs
    rect(7, 9, 18, 14, 'S'); ell(6, 10, 5, 4, 'D'); ell(26, 10, 5, 4, 'D');                          // torso, shoulders
    rect(1, 13, 6, 11, 'S'); rect(25, 13, 6, 11, 'S'); rect(1, 23, 7, 6, 'D'); rect(24, 23, 7, 6, 'D'); // arms, fists
    rect(13, 3, 6, 6, 'S'); rect(14, 5, 4, 1, 'E');                                                  // head, visor
    ell(16, 15, 2, 2, 'k'); ell(16, 15, 1, 1, 'E'); line(10, 11, 12, 19, 'D'); line(22, 18, 20, 21, 'D'); line(3, 16, 4, 20, 'D');
    rect(7, 9, 4, 2, 'M'); rect(21, 21, 3, 1, 'M'); px(26, 8, 'M'); px(5, 14, 'M');
  } },
  { name: 'The Storm Wyrm', pal: { B: '#3a6ad8', L: '#a8c8ff', W: '#22408a', H: '#e6dcff', E: '#fff6a8', k: K }, draw: ({ rect, ell, line, tri, px }) => {
    tri([17, 17], [30, 2], [30, 18], 'W'); tri([14, 17], [22, 2], [24, 16], 'W'); line(17, 17, 30, 2, 'B'); line(30, 2, 30, 18, 'B'); // wings
    line(24, 23, 30, 29, 'B', 2); px(30, 29, 'H');                                                  // tail
    ell(17, 21, 8, 5, 'B'); ell(17, 23, 5, 2, 'L'); rect(12, 25, 3, 5, 'B'); rect(20, 25, 3, 5, 'B'); rect(11, 29, 4, 1, 'H'); rect(20, 29, 4, 1, 'H');
    line(12, 18, 8, 10, 'B', 3); ell(7, 8, 4, 3, 'B'); rect(2, 8, 4, 2, 'B'); line(8, 5, 11, 2, 'H'); line(6, 5, 7, 2, 'H'); px(7, 7, 'E'); rect(2, 10, 3, 1, 'k');
    line(3, 13, 1, 16, 'E'); line(1, 16, 3, 18, 'E'); px(26, 24, 'E');                               // lightning
  } },
  { name: 'The Thorn Matriarch', pal: { D: '#5a3825', B: '#3f7a3a', H: '#6fbf4a', S: '#c9a27a', A: '#7a3d9e', F: '#ff6fb8', E: '#ffd84f', k: K }, draw: ({ rect, ell, line, flare, px }) => {
    for (const x of [3, 9, 23, 29]) line(16, 24, x, 30, 'D', 2);                                    // roots
    line(14, 13, 5, 8, 'A', 1); line(18, 13, 27, 8, 'A', 1); for (const [x, y] of [[7, 9], [25, 9], [10, 11], [22, 11]]) px(x, y - 1, 'A'); // thorn vines
    flare(14, 26, 16, 3, 8, 'B'); for (let y = 16; y <= 26; y += 3) { px(16 - (y - 10) / 2, y, 'H'); px(16 + (y - 10) / 2, y, 'H'); }
    ell(16, 6, 6, 5, 'H'); rect(14, 11, 5, 4, 'S'); ell(16, 8, 3, 3, 'S'); px(15, 8, 'k'); px(17, 8, 'k');
    for (const [x, y] of [[11, 3], [21, 4], [12, 8], [20, 9], [5, 8], [27, 8], [16, 1]]) px(x, y, 'F'); px(16, 18, 'E');
  } },
  { name: 'The Last Warden', pal: { P: '#2a1d45', B: '#2a2240', M: '#4a4266', S: '#c8d0e0', G: '#7a6aa8', E: '#5ff6ff', k: K }, draw: ({ rect, ell, line, px }) => {
    rect(6, 12, 17, 18, 'P');                                                                         // cape
    rect(9, 12, 11, 10, 'B'); line(14, 13, 14, 20, 'E'); ell(8, 13, 4, 3, 'M'); ell(20, 13, 4, 3, 'M'); px(7, 12, 'E'); px(21, 12, 'E');
    ell(14, 7, 4, 5, 'M'); rect(11, 7, 7, 1, 'E'); line(10, 3, 8, 1, 'M'); line(18, 3, 20, 1, 'M');   // horned helm, cyan visor
    rect(9, 22, 4, 8, 'M'); rect(15, 22, 4, 8, 'M'); rect(8, 29, 5, 2, 'B'); rect(15, 29, 5, 2, 'B');
    rect(24, 12, 3, 18, 'S'); line(25, 13, 25, 28, 'E'); rect(21, 11, 9, 2, 'G'); rect(24, 6, 3, 5, 'G'); ell(25, 5, 1, 1, 'E'); // planted greatsword
    rect(21, 15, 3, 3, 'M');                                                                          // gauntlet on the grip line
  } },
];
const at = f => BOSSES[(f - 1) % BOSSES.length];
export function bossShape(f) { const c = canvas(); at(f).draw(c); return { rows: c.rows() }; }
export const bossGrid = f => shade(bossShape(f).rows, at(f).pal, { scale: 1, drop: '', eyes: '', flat: 'kE' });
export const bossIsBig = f => !!at(f).big;

// Pure pixel-art post-process: 16x16 layer grid -> 32x32 sprite with 1px outline, 3-tone shading and a cyan rim light.
const OUTLINE = '#12062a', RIM = '#5ff6ff';
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
export const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const POOL = [...Array(94)].map((_, i) => String.fromCharCode(33 + i)).filter(c => c !== '.');
/** rows: N strings of N chars, pal: char->'#rrggbb'. Chars listed in `drop` are cleared (old hand-drawn outlines). */
export function shade(rows, pal, { scale = 2, drop = 'k', eyes = 'e' } = {}) {
  const n = rows.length * scale, src = rows.map(r => [...r]);
  const at = (x, y) => { const c = src[Math.floor(y / scale)]?.[Math.floor(x / scale)]; return c && c !== '.' && pal[c] && !drop.includes(c) ? c : null; };
  const out = [], cmap = new Map(), key = col => { if (!cmap.has(col)) cmap.set(col, POOL[cmap.size]); return cmap.get(col); };
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const c = at(x, y);
      if (!c) { const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy)); row += near ? key(OUTLINE) : '.'; continue; }
      const base = pal[c];
      let col = base;
      if (eyes.includes(c)) col = (x % scale === 0 && y % scale === 0) ? '#ffffff' : base; // eye catch-light
      else if (!at(x + 1, y)) col = mix(base, RIM, 0.55);                   // rim light on the right silhouette edge
      else if (at(x, y - 1) !== c || at(x - 1, y) !== c) col = mix(base, '#e4dcff', 0.3); // light (top/left), lavender-tinted
      else if (at(x, y + 1) !== c || at(x + 1, y) !== c) col = mix(base, OUTLINE, 0.42);   // shadow (bottom/right)
      row += key(col);
    }
    out.push(row);
  }
  return { rows: out, pal: Object.fromEntries([...cmap].map(([col, ch]) => [ch, col])) };
}

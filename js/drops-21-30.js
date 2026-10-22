// $LOGOUT signature drops, arc 3 (Floors 21-30, Tidewire Depths). One per guardian.
// DATA: paste each `sig` into the matching ARC3 boss entry in js/bosses.js (same shape as arc 2: { slot, name } + optional new fields).
//   rarity  : showcase rarity for the preview / codex only. loot.js is unchanged: any Epic or Legendary roll in that slot can become the signature (50%).
//   flavor  : one-line flavour text (new optional field; arc 2 sigs have none, the lore line stays "System notice: signature drop of ...").
//   icon    : 16x16 rows in icons.js SHAPES keys (m metal, d dark metal, a element accent, h handle, g rarity gem) plus two optional
//             flat glow keys from iconPal (c boss accent, w highlight, p second accent). Suggested itemIcon hook: if (it.signature && SIG_ICON[it.name])
//             use those rows, merge iconPal into pal, and pass flat: 'fcwp' to shade(). Metal/gem still tint by rarity, accent by element, as now.
//   equip   : weapon -> { weapon: <SIG_WEAPON key>, W, T } ; armor -> { outfit: <SIG_OUTFIT key>, O, T }. Trinkets have no equip look.
//             Merge with the hero look, then composeHeroSig(look). Only existing key letters and anchors are used.
import { WEAPON, OUTFIT, BASE, composeHero64 } from './hero64.js';

export const SIGS_21_30 = [
  { floor: 21, boss: 'The Lantern Angler', element: 'storm', slot: 'trinket', name: "Angler's Stolen Light", rarity: 'epic',
    flavor: 'Still warm. Whoever it belonged to is still looking for it.', iconPal: { c: '#7ff6ff', w: '#f0fbff' },
    icon: ['................', '..ddd...........', '.d...dd.........', '.d.....d........', '........d.......', '.........d......', '.........d......', '........mmmm....', '.......mccccm...', '.......cwwacc...', '.......cwaacc...', '.......ccaacc...', '........cccc....', '.........mm.....', '........g..g....', '.........gg.....'] },
  { floor: 22, boss: 'The Cable Kraken', element: 'void', slot: 'weapon', name: 'Live Wire of the Kraken', rarity: 'epic',
    flavor: 'Six arms, six signals. You only need the one that bites.', iconPal: { c: '#7fb8ff', w: '#ffffff', p: '#ff4fd8' },
    icon: ['.............cwc', '..............c.', '............ma..', '...........da...', '...........ma...', '..........dm....', '.........ca.....', '........dm......', '.......ma.......', '......cd........', '.....ma.........', '...p.d..........', '...pp...........', '..hpp...........', '.hh.............', 'gh..............'],
    equip: { weapon: 'sig-livewire', W: '#6a4ab0', T: '#3a3150' } },
  { floor: 23, boss: 'The Coral Bishop', element: 'holy', slot: 'weapon', name: 'Coral Crozier', rarity: 'epic',
    flavor: 'It grows a little every sermon. Nobody prunes it.', iconPal: { c: '#f08a9a', w: '#fff3e0' },
    icon: ['.......cccc.....', '......c....c....', '.....c..cc..c...', '.....c.c..c.c...', '......c.wc..c...', '..c.......cc....', '..cc.....mc.....', '...cc...mg......', '....c.hmm.......', '.....hhm........', '....hh..........', '...hh...........', '..hh............', '.hh.............', 'hh..............', 'h...............'],
    equip: { weapon: 'sig-crozier', W: '#f08a9a', T: '#e0b84a' } },
  { floor: 24, boss: 'The Brine Diver', element: 'frost', slot: 'armor', name: 'Brine-Sealed Hardsuit', rarity: 'epic',
    flavor: 'Rated for any depth. The last owner never came up to complain.', iconPal: { c: '#9fd8ff', w: '#f0fbff' },
    icon: ['................', '...mm.dddd.mm...', '..mmmmdccdmmmm..', '..mmmdcwacdmmm..', '..mmmdcaacdmmm..', '...mmmdddmmmm...', '....mmmmmmmm....', '....mgmmmmgm....', '....mmmaammm....', '....dmmmmmmd....', '....dmmmmmmd....', '....ddmmmmdd....', '....cdddddddc...', '....c.......c...', '................', '................'],
    equip: { outfit: 'sig-hardsuit', O: '#b08a4a', T: '#e8d08a' } },
  { floor: 25, boss: 'The Lumen Jelly Oracle', element: 'void', slot: 'trinket', name: 'Tide-Ring of Six Eyes', rarity: 'legendary',
    flavor: 'Half of it is always coming in. Half of it is always leaving.', iconPal: { c: '#7ff6ff', p: '#ff4fd8', w: '#ffffff' },
    icon: ['................', '.....cccpp......', '....c.....p.....', '...c..g.g..p....', '..c..mmmmm..p...', '..c.gmwaamg.p...', '..c..maaam..p...', '..c.gmmmmmg.p...', '...c..g.g..p....', '....c.....p.....', '.....cccpp......', '.......dd.......', '......d..d......', '.......dd.......', '................', '................'] },
  { floor: 26, boss: 'The Reefback Tortoise', element: 'venom', slot: 'armor', name: 'Reef Shell Carapace', rarity: 'epic',
    flavor: 'The reef on it is still alive, and it has opinions about you.', iconPal: { c: '#f08a9a', w: '#7ff6ff' },
    icon: ['................', '.....cc...c.....', '....cmmc.cc.....', '...mmmmmmmmmm...', '..mdmmdmmdmmdm..', '..mmdmmwmmdmmm..', '.mmmmddddmmmmmm.', '..mmdmmaammdmm..', '..mmmdmaamdmwm..', '...mmmdddmmmm...', '...dmmmggmmmd...', '....dmmmmmmd....', '.....dddddd.....', '................', '................', '................'],
    equip: { outfit: 'sig-reefshell', O: '#5a7a52', T: '#c9b37a' } },
  { floor: 27, boss: 'The Eel Duelist', element: 'storm', slot: 'weapon', name: 'Eelstrike Rapier', rarity: 'epic',
    flavor: 'It thrusts before you decide to. Try to keep up.', iconPal: { c: '#e0b84a', w: '#fff6a8' },
    icon: ['...............w', '..............m.', '.............m..', '............ma..', '...........m....', '..........ma....', '.........m......', '........ma......', '...cc..m........', '..c..cm.........', '..c.cmc.........', '...chc..........', '...hcc..........', '..hh............', '.hh.............', 'gh..............'],
    equip: { weapon: 'sig-rapier', W: '#bcd4ff', T: '#e0b84a' } },
  { floor: 28, boss: 'The Static Siren', element: 'blood', slot: 'trinket', name: 'Static Pearl Clasp', rarity: 'epic',
    flavor: 'Hold it to your ear and you hear the song. Do not hold it too long.', iconPal: { c: '#f08a9a', w: '#f4eefc', p: '#ff3355' },
    icon: ['................', '..c..........c..', '..cc........cc..', '...cmm....mmc...', '....mmmmmmmm....', '....mmwwwwmm....', '...mmwwwwwamm...', '...mmwwwwaamm...', '....mmwaaamm....', '....mmmmmmmm....', '...cmm.gg.mmc...', '..cc........cc..', '..c..p.p.p...c..', '......p.p.......', '................', '................'] },
  { floor: 29, boss: 'The Abyss Shepherd', element: 'shadow', slot: 'armor', name: "Shepherd's Lightless Shroud", rarity: 'epic',
    flavor: 'Wear it and the little lights start to follow you home.', iconPal: { c: '#7ff6ff', w: '#fff3c0' },
    icon: ['......dddd......', '.....dmmmmd.....', '....dmddddmd....', '....dmcddcmd....', '....dmddddmd..w.', '...dmmmddmmmd...', '..dmmmmggmmmmd..', '..dmmmmmmmmmmd..', '..dmmmaammmmmd..', 'c.dmmmmmmmmmmd..', '..ddmmmmmmmmdd..', '...ddmmmmmmdd...', '....dd.dd.dd..c.', '................', '.......w........', '................'],
    equip: { outfit: 'sig-shroud', O: '#3e3462', T: '#f4cc52' } },
  { floor: 30, boss: 'The Tidewire Leviathan', element: 'void', slot: 'weapon', name: 'Archive-Heart Glaive', rarity: 'legendary',
    flavor: 'Every floor it ever drowned is written somewhere inside the blade.', iconPal: { c: '#7fb8ff', w: '#ffffff', p: '#ff4fd8' },
    icon: ['..........mmmm..', '.........mmaamm.', '........mmaaaam.', '........maa..mm.', '.......mma....m.', '.......ma.......', '......cpc.......', '.....cpwpc......', '......cpc.......', '.....hh.........', '....hh..........', '...hh.c.........', '..hh............', '.hh.............', 'hh..............', 'g...............'],
    equip: { weapon: 'sig-glaive', W: '#7a5cff', T: '#e0b84a' } },
];

// ---------- 64x64 equip layers (generated; keys: W family i l W I, trim t v T V, handle 4 5, fixed glows Q X p f m x Y 7) ----------
const N = 64, blank = () => [...Array(N)].map(() => Array(N).fill('.'));
const toRows = g => g.map(r => r.join(''));
const P = (g, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = c; };
const line = (g, x0, y0, x1, y1, c, w = 1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; for (let k = 0; k < w; k++) P(g, x + k, y, typeof c === 'function' ? c(i, k) : c); } };
const shift = (rows, dx, dy) => { const g = blank(); rows.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') P(g, x + dx, y + dy, c); })); return toRows(g); };
// back mount = hand drawing flipped vertically and moved to the back anchor area (as the stock weapons do)
const toBack = rows => { let minx = N, miny = N; rows.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') { minx = Math.min(minx, x); miny = Math.min(miny, y); } }));
  const f = [...rows].reverse(); let my = N; f.forEach((r, y) => { if (/[^.]/.test(r)) my = Math.min(my, y); }); return shift(f, 10 - minx, 15 - my); };
const handle = g => { line(g, 40, 51, 43, 45, '5', 2); P(g, 39, 52, 'v'); P(g, 40, 52, 't'); P(g, 39, 51, 'v'); };

// In-hand v3: sized to match the back mounts (and at least as big as the stock staff/lance): 3px shafts, 2px blades, big crook/crescent.
function liveWire() { const g = blank(); handle(g); line(g, 40, 44, 47, 44, 'T', 1); line(g, 40, 43, 47, 43, 'v'); P(g, 39, 44, 't'); P(g, 48, 43, 'V');
  for (let i = 0; i <= 34; i++) { const t = i / 34, x = 44 + 14 * t + Math.sin(t * 10) * 1.8, y = 42 - 32 * t; const band = i % 4 === 0 ? 'Q' : i % 2 ? 'l' : 'I';
    P(g, x, y, band); P(g, x + 1, y, i % 4 === 0 ? 'X' : 'W'); P(g, x + 2, y, 'i'); }
  for (const [x, y] of [[58, 7], [60, 8], [59, 6], [57, 6], [59, 9], [61, 6], [56, 8]]) P(g, x, y, 'Q'); P(g, 59, 7, 'X'); P(g, 58, 8, 'X'); P(g, 57, 9, 'p'); P(g, 61, 9, 'p'); return toRows(g); }
function crozier() { const g = blank(); line(g, 37, 58, 50, 20, (i, k) => k === 2 ? '4' : '5', 3); line(g, 46, 32, 54, 32, 'T', 1); line(g, 46, 33, 54, 33, 'v'); P(g, 50, 31, 'V');
  for (let a = 0; a <= 44; a++) { const t = a / 44, ang = Math.PI * (1.25 - 1.95 * t), r = 8 - 4.5 * t, x = 53 + Math.cos(ang) * r, y = 12 - Math.sin(ang) * r;
    P(g, x, y, 'W'); P(g, x + 1, y, a % 4 ? 'W' : 'l'); P(g, x, y + 1, 'i'); P(g, x + 1, y + 1, 'l'); }
  line(g, 50, 21, 48, 16, 'W', 2); P(g, 53, 12, 'X'); P(g, 54, 12, 'Y'); P(g, 53, 13, 'Y');
  for (const [x0, y0, x1, y1] of [[48, 24, 46, 22], [48, 27, 47, 27], [59, 19, 60, 23], [52, 22, 54, 26]]) line(g, x0, y0, x1, y1, 'W', 2); for (const [x, y] of [[46, 21], [46, 26], [60, 24], [54, 27]]) P(g, x, y, 'f'); return toRows(g); }
function rapier() { const g = blank(); handle(g); line(g, 45, 43, 61, 9, (i) => i % 5 === 3 ? 'Q' : 'I'); line(g, 46, 43, 62, 9, 'l'); line(g, 46, 44, 62, 10, 'i'); P(g, 61, 8, 'X'); P(g, 62, 7, 'X');
  for (const [x, y] of [[40, 41], [39, 42], [39, 43], [39, 44], [40, 45], [41, 46], [44, 48], [45, 47], [46, 46], [47, 45], [47, 44], [47, 42], [46, 41], [44, 40], [43, 40], [42, 40], [41, 40]]) { P(g, x, y, 'T'); }
  for (const [x, y] of [[40, 46], [41, 47], [42, 48], [43, 48], [48, 44], [48, 45]]) P(g, x, y, 'v'); P(g, 43, 41, 'V'); P(g, 42, 42, 'V');
  for (const [x, y] of [[51, 29], [54, 23], [57, 17], [59, 13]]) P(g, x + 2, y - 1, 'Q'); return toRows(g); }
function glaive() { const g = blank(); line(g, 36, 59, 51, 18, (i, k) => (i % 7 === 3 ? 'T' : k === 2 ? '4' : '5'), 3);
  for (const [x, y] of [[47, 31], [48, 30], [49, 31], [48, 32], [47, 30], [49, 30], [47, 32], [49, 32]]) P(g, x, y, 'p'); P(g, 48, 31, 'X'); for (const [x, y] of [[46, 31], [50, 31], [48, 29], [48, 33]]) P(g, x, y, 'T');
  for (let a = 0; a <= 44; a++) { const t = a / 44, ang = Math.PI * (0.95 - 0.95 * t), x = 53 + Math.cos(ang) * 8.5, y = 17 - Math.sin(ang) * 12; const dx = x > 53 ? -1 : 1;
    P(g, x, y, 'I'); P(g, x, y + 1, 'W'); P(g, x + dx, y + 2, 'W'); P(g, x + dx * 2, y + 3, t > 0.1 && t < 0.9 ? 'l' : 'W'); if (t > 0.2 && t < 0.8) P(g, x + dx * 3, y + 4, 't'); }
  line(g, 50, 19, 46, 15, 'l', 2); P(g, 45, 14, 'I'); for (const [x, y] of [[49, 8], [58, 4], [61, 12]]) P(g, x, y, 'Q'); return toRows(g); }
function stripBack(rows) { return rows.map(r => r.replace(/[^.]/g, '.')); }
const WEAP = { 'sig-livewire': liveWire(), 'sig-crozier': crozier(), 'sig-rapier': rapier(), 'sig-glaive': glaive() };
// Hand-drawn back mounts (v2): diagonal, head/blade or hilt above the left shoulder, shaft down-right behind the body, 2px+ silhouettes.
const BACK = {
  'sig-livewire': () => { const g = blank(); line(g, 9, 13, 13, 19, '5', 2); line(g, 9, 20, 15, 16, 'T'); P(g, 8, 12, 'v'); P(g, 9, 12, 't');
    for (let i = 0; i <= 24; i++) { const t = i / 24, x = 14 + 18 * t + Math.sin(t * 9) * 1.4, y = 20 + 18 * t; P(g, x, y, i % 4 === 0 ? 'Q' : i % 2 ? 'l' : 'I'); P(g, x + 1, y, i % 4 === 0 ? 'X' : 'i'); }
    for (const [x, y] of [[33, 40], [35, 39], [34, 42], [32, 41]]) P(g, x, y, 'Q'); P(g, 34, 40, 'X'); P(g, 33, 39, 'p'); return toRows(g); },
  'sig-rapier': () => { const g = blank(); line(g, 9, 13, 13, 19, '5', 2); P(g, 8, 12, 'v');
    for (const [x, y] of [[8, 17], [8, 18], [9, 20], [10, 21], [12, 22], [14, 21], [15, 20], [16, 18], [15, 16], [13, 15], [11, 15]]) { P(g, x, y, 'T'); P(g, x - 1, y, 'v'); }
    line(g, 15, 21, 32, 41, (i) => i % 5 === 3 ? 'Q' : 'I'); line(g, 16, 21, 33, 41, 'l'); P(g, 33, 42, 'X'); return toRows(g); },
  'sig-crozier': () => { const g = blank(); line(g, 13, 18, 34, 46, (i, k) => k ? '4' : '5', 3); line(g, 10, 20, 17, 16, 'T', 2);
    // full coral crook head above the shoulder: thick 3px spiral, inner glow, branches
    for (let a = 0; a <= 40; a++) { const t = a / 40, ang = Math.PI * (0.3 + 1.9 * t), r = 8 - 4.5 * t, x = 9 + Math.cos(ang) * r, y = 9 - Math.sin(ang) * r;
      P(g, x, y, 'W'); P(g, x + 1, y, a % 4 ? 'W' : 'l'); P(g, x, y + 1, 'i'); P(g, x + 1, y + 1, 'l'); }
    line(g, 13, 17, 15, 11, 'W', 2); P(g, 9, 9, 'X'); P(g, 10, 9, 'Y'); P(g, 9, 10, 'Y');
    for (const [x0, y0, x1, y1] of [[3, 14, 0, 18], [5, 15, 4, 20], [16, 10, 20, 7], [17, 12, 21, 12]]) line(g, x0, y0, x1, y1, 'W', 2); for (const [x, y] of [[0, 19], [4, 21], [21, 6], [22, 12]]) P(g, x, y, 'f'); return toRows(g); },
  'sig-glaive': () => { const g = blank(); line(g, 13, 19, 35, 49, (i, k) => (i % 7 === 3 ? 'T' : k ? '4' : '5'), 3);
    for (const [x, y] of [[13, 18], [14, 17], [15, 18], [14, 19], [13, 17], [15, 17], [13, 19], [15, 19]]) P(g, x, y, 'p'); P(g, 14, 18, 'X'); for (const [x, y] of [[12, 18], [16, 18], [14, 16], [14, 20]]) P(g, x, y, 'T');
    // big crescent blade over the shoulder: 4px thick, gold inner spine, sweeping from the collar up and out to the left
    for (let a = 0; a <= 40; a++) { const t = a / 40, ang = Math.PI * (0.05 + 0.95 * t), x = 10 + Math.cos(ang) * 9, y = 14 - Math.sin(ang) * 11;
      P(g, x, y, 'I'); P(g, x, y + 1, 'W'); P(g, x + (x < 10 ? 1 : -1), y + 2, 'W'); P(g, x + (x < 10 ? 1 : -1) * 2, y + 3, t > 0.1 && t < 0.9 ? 'l' : 'W'); if (t > 0.2 && t < 0.8) P(g, x + (x < 10 ? 1 : -1) * 3, y + 4, 't'); }
    P(g, 1, 15, 'W'); P(g, 1, 16, 'i'); for (const [x, y] of [[6, 8], [11, 5], [15, 9]]) P(g, x, y, 'Q'); return toRows(g); },
};
export const SIG_WEAPON = Object.fromEntries(Object.entries(WEAP).map(([k, h]) => { const b = BACK[k](); return [k, { m: { hand: h, back: b }, f: { hand: shift(h, -3, -2), back: b } }]; }));

const over = (base, fn) => { const g = base.map(r => [...r]); fn((x, y, c) => { if (g[y]?.[x] !== undefined) g[y][x] = c; }, (x, y) => g[y]?.[x]); return toRows(g); };
const hardsuit = b => over(OUTFIT.plate[b], (p, at) => { const cx = b === 'm' ? 31 : 31, cy = b === 'm' ? 35 : 34;
  for (const [dx, dy] of [[-2, -2], [-1, -3], [0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3], [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1]]) p(cx + dx, cy + dy, dy > 0 ? 'v' : 'T');
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) p(cx + dx, cy + dy, 'd'); p(cx - 1, cy - 1, 'Q'); p(cx, cy - 1, 'X'); p(cx - 1, cy, '7');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (y >= 50 && /[uUoO]/.test(at(x, y) || '') && (x * 7 + y * 3) % 5 === 0) p(x, y, y > 53 ? 'Y' : 'Q'); });
const reefshell = b => over(OUTFIT.plate[b], (p, at) => { for (let y = 29; y < 41; y++) for (let x = 0; x < 64; x++) { const c = at(x, y); if (!/[uUO]/.test(c || '')) continue;
  if ((y - 29) % 4 === 0 || ((x + (Math.floor((y - 29) / 4) % 2) * 3) % 6 === 0)) p(x, y, 'u'); }
  const sh = b === 'm' ? [[19, 29], [20, 28], [21, 29], [45, 29], [46, 28], [44, 28]] : [[21, 29], [22, 28], [23, 29], [43, 29], [44, 28], [42, 28]];
  sh.forEach(([x, y], i) => p(x, y, i % 3 === 1 ? 'm' : 'f')); for (const [x, y] of [[30, 33], [31, 34], [31, 35], [32, 36]]) if (at(x, y) !== '.') p(x, y, 'Q'); });
// Shroud v2: cloak + fallen hood framing the head, a cowl/mantle across the shoulders above the shield line, gold trim, 2x2 wisp lights.
const shroud = b => over(OUTFIT.cloak[b], (p, at) => { const body = BASE[b].body, ext = y => { const r = body[y] || ''; const a = r.search(/[^.]/); return a < 0 ? null : [a, r.length - 1 - [...r].reverse().join('').search(/[^.]/)]; };
  const e8 = ext(9);
  for (let y = 5; y <= 27; y++) { const e = ext(Math.max(y, 9)); if (!e) continue; const [a, z] = y < 9 ? [e8[0] + (9 - y), e8[1] - (9 - y)] : e;
    for (const [x, c] of [[a - 1, 'U'], [a - 2, 'u'], [a - 3, y > 12 ? 'o' : '.'], [z + 1, 'U'], [z + 2, 'O'], [z + 3, y > 12 ? 'u' : '.']]) if (c !== '.' && at(x, y) === '.') p(x, y, c);
    if (y < 9) for (let x = a; x <= z; x++) if (at(x, y) === '.' && y >= 6) p(x, y, y === 6 ? 'U' : 'O'); }
  const cx = b === 'm' ? 31 : 30, half = b === 'm' ? 17 : 14; // mantle rows 27-32, wider than the shield (shield top is row 31)
  for (let y = 27; y <= 32; y++) { const w = Math.min(half, 6 + (y - 27) * 3); for (let x = cx - w; x <= cx + w; x++) { if (y < 29 && Math.abs(x - cx) < 4) continue; p(x, y, y === 32 ? 't' : y === 27 ? 'O' : (x + y) % 5 === 0 ? 'u' : 'U'); } }
  for (let x = cx - 3; x <= cx + 3; x++) p(x, 29, 'T'); p(cx, 30, 'X'); p(cx - 1, 30, 'T'); p(cx + 1, 30, 'T'); p(cx, 31, 'T');
  for (let y = 32; y < 64; y++) for (let x = 0; x < 64; x++) if (at(x, y) === 't') p(x, y, 'T');
  const W = b === 'm' ? [[12, 26], [49, 27], [11, 47], [47, 44], [14, 57], [44, 58]] : [[13, 26], [47, 27], [13, 47], [45, 44], [15, 57], [42, 58]];
  W.forEach(([x, y], i) => { p(x, y, 'X'); p(x + 1, y, 'Q'); p(x, y + 1, 'Q'); p(x + 1, y + 1, i % 2 ? 'Q' : '7'); }); });
export const SIG_OUTFIT = { 'sig-hardsuit': { m: hardsuit('m'), f: hardsuit('f') }, 'sig-reefshell': { m: reefshell('m'), f: reefshell('f') }, 'sig-shroud': { m: shroud('m'), f: shroud('f') } };

let reg = false; const register = () => { if (!reg) { Object.assign(WEAPON, SIG_WEAPON); Object.assign(OUTFIT, SIG_OUTFIT); reg = true; } };
/** composeHero64 with the signature layers registered. look.weapon / look.outfit may be a sig-* key. */
export function composeHeroSig(look) { register(); return composeHero64(look); }
/** Merge a signature's equip look over a hero look. */
export const withSig = (look, sig) => ({ ...look, ...(sig.equip || {}) });

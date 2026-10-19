// Guild banners: pixel sigil (7x7) on a two-colour pennant, as cached SVG data URIs. Also the procedural Guild Hall art.
import { DEFAULT_BANNER } from './guildsv2.js';
const SIG = {
  tower: ['..#.#..', '..###..', '..#.#..', '..###..', '.#####.', '.##.##.', '.#####.'],
  crown: ['.......', '#..#..#', '##.#.##', '#######', '#######', '.#####.', '.......'],
  star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
  moon: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
  sword: ['......#', '.....#.', '....#..', '#..#...', '.##....', '.##....', '#..#...'],
  shield: ['#######', '#.....#', '#.###.#', '#.###.#', '.#.#.#.', '..#.#..', '...#...'],
  flame: ['...#...', '..##...', '..###..', '.####..', '.##.##.', '##...##', '.#####.'],
  eye: ['.......', '..###..', '.#...#.', '#..#..#', '.#...#.', '..###..', '.......'],
  key: ['.###...', '#...#..', '#...#..', '.###...', '...#...', '...##..', '...#...'],
  skull: ['.#####.', '#######', '#..#..#', '#######', '.#####.', '.#.#.#.', '.......'],
  wing: ['#......', '##.....', '###....', '####...', '#####..', '.####..', '..###..'],
  rune: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
};
const enc = s => `url("data:image/svg+xml,${encodeURIComponent(s).replace(/'/g, '%27')}")`;
const rects = (rows, col, ox = 0, oy = 0) => rows.flatMap((r, y) => [...r].map((c, x) => c === '#' ? `<rect x="${x + ox}" y="${y + oy}" width="1" height="1" fill="${col}"/>` : '')).join('');
const cache = new Map();
/** Pennant 9x12: field c2, border c1, sigil c1, swallow-tail bottom. */
export function bannerIcon(b = DEFAULT_BANNER) {
  b = { ...DEFAULT_BANNER, ...(b || {}) }; const key = `${b.sigil}|${b.c1}|${b.c2}`; if (cache.has(key)) return cache.get(key);
  const sig = SIG[b.sigil] || SIG.tower;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 12" shape-rendering="crispEdges"><path d="M0 0h9v12l-4.5-2.5L0 12z" fill="${b.c1}"/><path d="M1 1h7v9.3l-3.5-2L1 10.3z" fill="${b.c2}"/>${rects(sig, b.c1, 1, 1)}</svg>`;
  const u = enc(svg); cache.set(key, u); return u;
}
export const bannerBadge = (b, tag = '', cls = 'gbadge') => `<i class="${cls}" style='background-image:${bannerIcon(b)}' title="${tag ? `[${tag}]` : 'guild banner'}" aria-hidden="true"></i>`;
export const SIGIL_ROWS = SIG;
// ---- Guild Hall (Town): 64x36 pixel room; grows with guild level (size cues) and hall upgrades (0-5 visible features)
export function hallArt(level = 1, hall = 0, b = DEFAULT_BANNER) {
  b = { ...DEFAULT_BANNER, ...(b || {}) }; const key = `hall|${level}|${hall}|${b.sigil}|${b.c1}|${b.c2}`; if (cache.has(key)) return cache.get(key);
  const W = 64, H = 36, wall = ['#1d1238', '#24174a', '#2c1d5c', '#35226b', '#3f2a7d', '#4a3290'][hall], floorC = ['#2a1c12', '#33220f', '#3d2a14', '#4a3318', '#563b1c', '#644420'][hall];
  let s = `<rect width="${W}" height="${H}" fill="${wall}"/>`;
  for (let y = 2; y < 26; y += 4) for (let x = (y / 4) % 2 ? 0 : 3; x < W; x += 6) s += `<rect x="${x}" y="${y}" width="5" height="3" fill="#ffffff" opacity=".035"/>`; // stone courses
  s += `<rect y="26" width="${W}" height="10" fill="${floorC}"/>`; for (let x = 0; x < W; x += 8) s += `<rect x="${x}" y="26" width="1" height="10" fill="#000" opacity=".25"/>`;
  const banners = Math.min(5, 1 + Math.floor(level / 5)); // more banners as the guild levels up
  for (let i = 0; i < banners; i++) { const x = Math.round((W / (banners + 1)) * (i + 1)) - 3; s += `<rect x="${x + 3}" y="2" width="1" height="2" fill="#8a6a3a"/><g transform="translate(${x} 4) scale(.75)"><path d="M0 0h9v12l-4.5-2.5L0 12z" fill="${b.c1}"/><path d="M1 1h7v9.3l-3.5-2L1 10.3z" fill="${b.c2}"/>${rects(SIG[b.sigil] || SIG.tower, b.c1, 1, 1)}</g>`; }
  const torch = x => `<rect x="${x}" y="15" width="1" height="4" fill="#6b4a2b"/><rect x="${x - 1}" y="13" width="3" height="2" fill="#ff9b3d"/><rect x="${x}" y="12" width="1" height="1" fill="#ffd76a"/>`;
  if (hall >= 1) s += torch(3) + torch(60); // 1: torches
  if (hall >= 2) s += `<rect x="20" y="27" width="24" height="7" fill="#7a1f3a"/><rect x="21" y="28" width="22" height="5" fill="#9b2a4a"/><rect x="21" y="30" width="22" height="1" fill="${b.c1}" opacity=".7"/>`; // 2: rug
  if (hall >= 3) s += `<rect x="26" y="20" width="12" height="2" fill="#5a3a1c"/><rect x="27" y="22" width="1" height="4" fill="#5a3a1c"/><rect x="36" y="22" width="1" height="4" fill="#5a3a1c"/><rect x="30" y="18" width="4" height="2" fill="#ffd76a"/>`; // 3: table + chest of gold
  if (hall >= 4) s += `<rect x="8" y="17" width="5" height="9" fill="#46345e"/><rect x="9" y="15" width="3" height="2" fill="#c9c2d8"/><rect x="51" y="17" width="5" height="9" fill="#46345e"/><rect x="52" y="15" width="3" height="2" fill="#c9c2d8"/>`; // 4: statues
  if (hall >= 5) s += `<rect x="28" y="0" width="8" height="2" fill="#ffd76a"/><rect x="29" y="2" width="6" height="1" fill="#ffd76a" opacity=".6"/>${[30, 32, 34].map(x => `<rect x="${x}" y="3" width="1" height="1" fill="#fff8d0"/>`).join('')}`; // 5: golden chandelier
  if (level >= 10) s += `<rect x="0" y="0" width="${W}" height="1" fill="${b.c1}" opacity=".5"/>`; // level 10+: gilded cornice
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${s}</svg>`;
  const u = enc(svg); cache.set(key, u); return u;
}

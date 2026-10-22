// Procedural pixel item icons (16x16 → 32x32 via pixel.js shade()). Shape by item type, seeded detail by item id,
// metal tinted by rarity, accent by element, a prismatic frame for Unique. Cached per (shape, rarity, element, seed).
import { shade } from './pixel.js';
import { sprite } from './sprites.js';
import { ELEMENTS } from './bosses.js';
import { RARITIES } from './loot.js';
import { SIGS_21_30 } from './drops-21-30.js';
const SIG_ICON = Object.fromEntries(SIGS_21_30.filter(s => s.icon).map(s => [s.name, s])); // arc 3 signature icons (custom rows + flat glows)
const H = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
// m = metal, d = dark metal, a = element accent, h = handle, g = gem (rarity)
export const SHAPES = {
  sword: ['...............m', '..............mm', '.............mam', '............mam.', '...........mam..', '..........mam...', '.........mam....', '........mam.....', '...d...mam......', '...dd.mam.......', '....ddmm........', '.....hd.........', '....hdhd........', '...hh..dd.......', '..gh............', '..g.............'],
  greatsword: ['..............mm', '.............mam', '............mama', '...........mamm.', '..........mamm..', '.........mamm...', '........mamm....', '.......mamm.....', '..dd..mamm......', '..ddd.mmm.......', '...ddmmm........', '....hdd.........', '...hhdd.........', '..hh..dd........', '.gh.............', 'gg..............'],
  axe: ['.......mmm......', '......mmaam.....', '.....mmaaamm....', '.....maaaam.h...', '......mmamm.h...', '........m.h.....', '.........h......', '........h.......', '.......h........', '......h.........', '.....h..........', '....h...........', '...h............', '..h.............', '.g..............', 'gg..............'],
  staff: ['...........aa...', '..........agga..', '..........agga..', '...........aa...', '..........hh....', '.........hh.....', '........hh......', '.......hh.......', '......hh........', '.....hh.........', '....hh..........', '...hh...........', '..hh............', '.hh.............', 'hh..............', 'h...............'],
  spear: ['..............am', '.............ama', '............mam.', '...........hm...', '..........h.....', '.........h......', '........h.......', '.......h........', '......h.........', '.....h..........', '....h...........', '...h............', '..h.............', '.h..............', 'h...............', '................'],
  dagger: ['................', '................', '..........m.....', '.........mam....', '........mam.....', '.......mam......', '......mam.......', '.....mam........', '...d.mm.........', '...ddm..........', '....dd..........', '...h.dd.........', '..hh............', '.gh.............', '.g..............', '................'],
  katana: ['...............m', '..............ma', '.............ma.', '............ma..', '...........ma...', '..........ma....', '.........ma.....', '........ma......', '.......ma.......', '.....dma........', '.....dd.........', '....hd..........', '...hh...........', '..hh............', '.hh.............', 'g...............'],
  armor: ['................', '...mm......mm...', '..mmmm....mmmm..', '..mmmmmmmmmmmm..', '...mmmmaammmm...', '....mmmaammm....', '....mmmmmmmm....', '....mmmggmmm....', '....mmmmmmmm....', '....dmmmmmmd....', '....dmmmmmmd....', '....ddmmmmdd....', '.....dddddd.....', '................', '................', '................'],
  ring: ['................', '................', '......gggg......', '.....gaaaag.....', '......gggg......', '.....m....m.....', '....m......m....', '...m........m...', '...m........m...', '...m........m...', '....m......m....', '.....m....m.....', '......mmmm......', '................', '................', '................'],
  // Staff gear tiers: III adds a guard and edge light, Divine adds a light/shadow blade and a halo ring
  katana2: ['..............am', '.............ama', '............ama.', '...........ama..', '..........ama...', '.........ama....', '........ama.....', '.......ama......', '......ama.......', '...g.dma........', '....ggd.........', '...ghdg.........', '...hh.g.........', '..hh............', '.hh.............', 'gg..............'],
  katanaD: ['.............wwa', '............wwa.', '...........wwa..', '..........wwa...', '.........wwa....', '........wwa.....', '.......wda......', '......wda.......', '.....wda........', '..g.wda.........', '.ggggd..........', '..ghdgg.........', '..hh..g.........', '.hh.............', 'hh..............', 'gg..............'],
  armor2: ['................', '..gmm......mmg..', '..mmmm....mmmm..', '.gmmmmmmmmmmmmg.', '...mmmmaammmm...', '....mmmaammm....', '....mmammamm....', '....mmmggmmm....', '....mammmmam....', '....dmmmmmmd....', '....dmaggamd....', '....ddmmmmdd....', '.....dddddd.....', '......g..g......', '................', '................'],
  armorD: ['.....wwwwww.....', '..gww......wwg..', '..wwmm....mmdd..', '.gwwmmmmmmmmddg.', '...wwmmaammdd...', '....wwmaamdd....', '....wwammadd....', '....wwmggmdd....', '....wammmmad....', '....wmmmmmmd....', '....wmaggamd....', '....wwmmmmdd....', '.....wwwdddd.....'.slice(0, 16), '......g..g......', '.......gg.......', '................'],
  // The Root Key (staff, Divine): a bow ring of light and shadow halves, gold shaft, three teeth
  rootkey: ['.....wwgg.......', '....ww..gg......', '...w.wa.d.g.....', '...w.ad.a.g.....', '...w..dd..g.....', '....ww..gg......', '.....wwgg.......', '.......mm.......', '.......mm.......', '.......mm.......', '.......mmgg.....', '.......mm.......', '.......mmgg.....', '.......mm.......', '.......mmggg....', '........m.......'],
  amulet: ['....d......d....', '.....d....d.....', '......d..d......', '.......dd.......', '.......mm.......', '......mmmm......', '.....mmggmm.....', '....mmgaagmm....', '....mmgaagmm....', '.....mmggmm.....', '......mmmm......', '.......mm.......', '................', '................', '................', '................'],
};
const WEAPON_BY_WORD = [[/greatsword|longbrand|brand/i, 'greatsword'], [/glaive|halberd|warglaive|warpick|cleaver/i, 'axe'], [/staff|spellstaff/i, 'staff'], [/spear|fangspear|starhook/i, 'spear'], [/fang/i, 'dagger'], [/blade|edge|sabre|runeblade|thornblade/i, 'sword']];
export function iconShape(it) {
  if (it.gm && it.slot === 'weapon' || it.id === 'gm-eventide') return (it.tier || 1) >= 4 ? 'katanaD' : (it.tier || 1) >= 3 ? 'katana2' : 'katana';
  if (it.gm && it.slot === 'armor' && (it.tier || 1) >= 3) return (it.tier || 1) >= 4 ? 'armorD' : 'armor2'; // the staff blade reuses its own cosmetic silhouette
  if (it.id === 'gm-rootkey') return 'rootkey';
  if (it.slot === 'armor') return 'armor';
  if (it.slot === 'trinket') return H(it.id) % 2 ? 'ring' : 'amulet';
  for (const [re, s] of WEAPON_BY_WORD) if (re.test(it.name || '')) return s;
  return ['sword', 'axe', 'staff', 'dagger'][H(it.id) % 4];
}
const mixHex = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const cache = new Map();
/** CSS background-image value for an item icon (cached). */
export function itemIcon(it) {
  const sg = it.signature && SIG_ICON[it.name], shape = sg ? 'sig:' + it.name : iconShape(it), rc = it.gm ? '#ffd76a' : (RARITIES.find(r => r.id === it.rarity)?.color || '#c9c2d8'), el = ELEMENTS[it.element] || ELEMENTS.void, seed = H(it.id) % 3;
  const key = `${shape}|${it.rarity}|${it.element}|${seed}|${it.gm ? 'gm' : ''}|${it.divine ? 'dv' : ''}|${shape}`; if (cache.has(key)) return cache.get(key);
  const metal = it.gm ? '#20182e' : mixHex('#b8b4c8', rc, it.rarity === 'common' ? 0.1 : 0.45), pal = { m: metal, d: mixHex(metal, '#12062a', 0.45), a: it.gm ? '#ffd76a' : el.ramp[2], h: ['#6b4a2b', '#4a3a5a', '#8a6a3a'][seed], g: rc };
  let rows = sg ? sg.icon : SHAPES[shape]; if (sg) Object.assign(pal, sg.iconPal || {});
  if (it.rarity === 'unique' || it.gm) rows = rows.map((r, y) => [...r].map((c, x) => c === '.' && (x === 0 || y === 0 || x === 15 || y === 15) && (x + y) % 2 === 0 ? 'f' : c).join('')); // prismatic frame
  if (it.rarity === 'unique') pal.f = '#7ff6ff'; if (it.gm) pal.f = '#ffd76a';
  if (it.divine) Object.assign(pal, { m: '#f6d77a', d: '#0b0a0f', a: '#fffaf0', g: '#f6d77a', w: '#fffaf0', f: '#fffaf0' }); // Divine: white, gold, black (as Solumbra)
  const s = shade(rows, pal, { drop: '', eyes: '', flat: sg ? 'fcwp' : 'f' }), url = sprite(s.rows, s.pal); cache.set(key, url); return url;
}
export const iconCacheSize = () => cache.size;

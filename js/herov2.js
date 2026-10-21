// Hero sprites v2: 24x24 layer grid, shaded by pixel.js shade() to 48x48. 16-bit chibi (~2.5 heads), leather adventurer kit.
// Pure (no DOM). Body (m/f) and race (human/sylvan/beastkin/shade) are look slots; every v1 cosmetic id draws here too.
// Palette chars: S skin, H hair, O outfit, T trim, W weapon, w wood/grip, L leather, l dark leather, d leggings, y gold, r scarf,
// e eyes (catch-light), f brows/mouth, m blush/lips, g Shade glow eyes, n horn, z Shade smoke, q fur tip, x shield face, G leaf.
export const V2_SIZE = 24;
const HEAD = [ // rows 0-11 (hair is drawn over rows 0-5), face cols 6-17
  '........................', '........SSSSSSSS........', '.......SSSSSSSSSS.......', '......SSSSSSSSSSSS......', '......SSSSSSSSSSSS......',
  '......SSSSSSSSSSSS......', '......SSeeSSSSeeSS......', '......SSeeSSSSeeSS......', '......SmSSSSSSSSmS......', '......SSSSSffSSSSS......',
  '.......SSSSSSSSSS.......', '..........SSSS..........'];
const BODY = {
  m: { rows: [ // broad shoulders, straight tunic, wide stance
    '......OOOOOTTOOOOO......', '.....OOOOOOTTOOOOOO.....', '....OO.OOOOTTOOOO.OO....', '....OO.OOOLTTLOOO.OO....', '....SS.LLLLyyLLLL.SS....',
    '....SS.OOOOOOOOOO.SS....', '.......OOOOOOOOOO.......', '.......dddd..dddd.......', '.......dddd..dddd.......', '.......LLLL..LLLL.......',
    '......LLLLL..LLLLL......', '......lllll..lllll......'],
    torso: [7, 16], sh: [5, 18], armL: 4, armR: 18, hand: 16, gripR: [20, 16], gripL: [3, 16], hem: 18, legs: [[7, 10], [13, 16]] },
  f: { rows: [ // slimmer shoulders, fitted bodice, cinched waist, flared skirt, slim legs
    '.......OOOOTTOOOO.......', '......OOOOOTTOOOOO......', '.....OO.OOOTTOOO.OO.....', '.....OO..OLTTLO..OO.....', '.....SS..LLyyLL..SS.....',
    '.....SS.OOOOOOOO.SS.....', '.......OOOOOOOOOO.......', '........ddd..ddd........', '........ddd..ddd........', '........LLL..LLL........',
    '.......LLLL..LLLL.......', '.......llll..llll.......'],
    torso: [8, 15], sh: [6, 17], armL: 5, armR: 17, hand: 16, gripR: [19, 16], gripL: [4, 16], hem: 18, legs: [[8, 10], [13, 15]] },
};
const v = (x, y0, y1, c) => { const o = []; for (let y = y0; y <= y1; y++) o.push([x, y, c]); return o; };
const WEAPONS = { // [dx, dy, ch] from the grip point (dy < 0 is up)
  sword: [...v(0, -11, -2, 'W'), ...v(1, -10, -2, 'W'), [-1, -1, 'y'], [0, -1, 'y'], [1, -1, 'y'], [2, -1, 'y'], [0, 0, 'w'], [0, 1, 'w'], [0, 2, 'y']],
  axe: [...v(0, -9, 3, 'w'), ...v(1, -9, -4, 'W'), ...v(2, -9, -4, 'W'), ...v(3, -8, -5, 'W'), ...v(-1, -8, -6, 'W')],
  lance: [...v(0, -13, -6, 'W'), [-1, -7, 'W'], [1, -7, 'W'], [-1, -6, 'T'], [1, -6, 'T'], ...v(0, -5, 4, 'w')],
  curve: [...v(0, -4, -2, 'W'), ...v(1, -7, -5, 'W'), ...v(2, -10, -8, 'W'), [3, -11, 'W'], [-1, -1, 'y'], [0, -1, 'y'], [1, -1, 'y'], [0, 0, 'w'], [0, 1, 'w']],
  dagger: [...v(0, -6, -2, 'W'), [-1, -1, 'y'], [0, -1, 'y'], [1, -1, 'y'], [0, 0, 'w']],
  scythe: [...v(0, -13, 4, 'w'), [-1, -13, 'W'], [-2, -13, 'W'], [-3, -13, 'W'], [-4, -12, 'W'], [-5, -12, 'W'], [-6, -11, 'W'], [-7, -10, 'W'], [-1, -12, 'W'], [-2, -12, 'W'], [-3, -12, 'W']],
  staff: [...v(0, -11, 4, 'w'), [0, -12, 'W'], [-1, -13, 'W'], [1, -13, 'W'], [0, -14, 'p']],
  orb: [...v(0, -10, 4, 'w'), [-1, -13, 'W'], [0, -13, 'W'], [1, -13, 'W'], [-1, -12, 'W'], [0, -12, 'p'], [1, -12, 'W'], [-1, -11, 'W'], [0, -11, 'W'], [1, -11, 'W']],
  wand: [...v(0, -3, 0, 'w'), ...v(0, -6, -4, 'W'), [-1, -5, 'W'], [1, -5, 'W'], [0, -7, 'p']],
};
const RACE_PAL = { shade: { S: '#4a3d63', m: '#4a3d63', n: '#a99bd0' } };
export function heroGrid24(look, cls, byId, skins = {}) {
  const val = id => byId(id)?.value;
  const B = BODY[val(look.body) === 'f' ? 'f' : 'm'], race = val(look.race) || 'human';
  const g = [...HEAD, ...B.rows].map(r => [...r]);
  const set = (x, y, c) => { if (x >= 0 && x < 24 && y >= 0 && y < 24) g[y][x] = c; };
  const fill = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const isF = B === BODY.f, [t0, t1] = B.torso, [s0, s1] = B.sh;
  if (isF) { set(7, 6, 'f'); set(16, 6, 'f'); set(7, 5, 'f'); set(16, 5, 'f'); set(11, 9, 'm'); set(12, 9, 'm'); fill(7, 16, 18, 18, 'T'); } // lashes + lips, trimmed skirt hem
  if (race === 'beastkin') { const tail = [[6, 19], [5, 19], [5, 20], [4, 20], [3, 20], [3, 21], [2, 21], [2, 20], [1, 20], [1, 19], [2, 19], [1, 18], [2, 18], [0, 18], [1, 17]];
    tail.forEach(([x, y]) => set(x, y, 'H')); [[1, 17], [0, 18], [1, 18]].forEach(([x, y]) => set(x, y, 'q')); } // fox tail behind the hip
  const style = val(look.outfitStyle), hair = val(look.hairStyle);
  // outfit overlays (tunic is the base)
  if (style === 'robe') { fill(t0, t1, 19, 21, 'O'); fill(t0 - 1, t1 + 1, 22, 22, 'T'); for (const [a, b] of B.legs) fill(a, b, 23, 23, 'l'); fill(t0 + 2, t1 - 2, 23, 23, '.'); fill(t0 + 1, t1 - 1, 18, 18, 'O'); }
  if (style === 'plate') { fill(s0, s0 + 1, 12, 13, 'T'); fill(s1 - 1, s1, 12, 13, 'T'); fill(t0 + 1, t0 + 2, 15, 15, 'T'); fill(t1 - 2, t1 - 1, 15, 15, 'T'); for (const [a, b] of B.legs) fill(a, b, 21, 21, 'T'); }
  if (style === 'cloak') { const L = B.armL - 1, R = B.armR + 2; fill(L, L, 12, 21, 'O'); fill(R, R, 12, 21, 'O'); fill(L - 1, L - 1, 13, 19, 'O'); fill(R + 1, R + 1, 13, 19, 'O'); set(L - 1, 12, 'T'); set(R + 1, 12, 'T'); set(L, 22, 'T'); set(R, 22, 'T'); }
  // hair
  const top = () => { fill(8, 15, 0, 0, 'H'); fill(7, 16, 1, 1, 'H'); fill(6, 17, 2, 2, 'H'); fill(5, 18, 3, 3, 'H'); [5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18].forEach(x => set(x, 4, 'H')); [5, 6, 17, 18].forEach(x => set(x, 5, 'H')); };
  if (hair === 'short') { top(); set(5, 6, 'H'); set(18, 6, 'H'); }
  if (hair === 'long') { top(); fill(4, 5, 5, 14, 'H'); fill(18, 19, 5, 14, 'H'); set(6, 6, 'H'); set(17, 6, 'H'); if (isF) { set(3, 13, 'H'); set(20, 13, 'H'); } }
  if (hair === 'spiky') { top(); fill(8, 15, 0, 0, '.'); [7, 10, 13, 16].forEach(x => set(x, 0, 'H')); set(4, 2, 'H'); set(19, 2, 'H'); set(4, 4, 'H'); set(19, 4, 'H'); }
  if (hair === 'hood') { fill(8, 15, 0, 0, 'O'); fill(6, 17, 1, 1, 'O'); fill(5, 18, 2, 2, 'O'); fill(4, 19, 3, 3, 'O'); fill(4, 5, 4, 11, 'O'); fill(18, 19, 4, 11, 'O'); fill(6, 17, 3, 3, 'T'); [6, 7, 8, 9, 14, 15, 16, 17].forEach(x => set(x, 4, 'H')); }
  if (hair === 'crown') { top(); fill(8, 15, 0, 0, '.'); fill(8, 15, 1, 1, 'y'); [8, 10, 13, 15].forEach(x => set(x, 0, 'y')); set(11, 1, 'p'); set(12, 1, 'p'); }
  if (isF && (hair === 'short' || hair === 'spiky')) { fill(18, 19, 5, 9, 'H'); set(19, 10, 'H'); }
  if (isF && hair !== 'hood') { set(17, 2, 'p'); set(18, 3, 'p'); } // hair clip // side ponytail so the female read survives short cuts
  // race features (after hair so they stay visible)
  if (race === 'sylvan') { [[5, 7], [4, 6], [3, 5], [2, 4]].forEach(([x, y]) => set(x, y, 'S')); [[18, 7], [19, 6], [20, 5], [21, 4]].forEach(([x, y]) => set(x, y, 'S')); if (hair !== 'hood' && hair !== 'crown') { [7, 9, 14, 16].forEach(x => set(x, 3, 'G')); } }
  if (race === 'beastkin' && hair !== 'hood') { [[6, 0], [6, 1], [7, 1], [6, 2], [7, 2], [8, 2], [17, 0], [17, 1], [16, 1], [17, 2], [16, 2], [15, 2]].forEach(([x, y]) => set(x, y, 'H')); set(7, 2, 'm'); set(16, 2, 'm'); }
  if (race === 'shade') { for (const [x, y] of [[8, 6], [9, 6], [8, 7], [9, 7], [14, 6], [15, 6], [14, 7], [15, 7]]) set(x, y, 'g');
    if (hair !== 'hood') { set(7, 0, 'n'); set(8, 1, 'n'); set(16, 0, 'n'); set(15, 1, 'n'); }
    [[4, 23], [5, 22], [19, 23], [18, 21], [3, 19], [20, 18], [2, 15]].forEach(([x, y]) => { if (g[y][x] === '.') set(x, y, 'z'); }); }
  // class silhouettes
  if (cls === 'Vanguard') { const x0 = B.armL - 3; fill(x0, x0 + 3, 13, 18, 'T'); fill(x0 + 1, x0 + 2, 14, 17, 'x'); set(x0 + 1, 19, 'T'); set(x0 + 2, 19, 'T'); fill(s0, s0 + 1, 12, 12, 'T'); fill(s1 - 1, s1, 12, 12, 'T'); } // kite shield + pauldrons
  if (cls === 'Blade') { [[10, 11], [9, 11], [8, 12], [7, 12], [6, 12], [5, 12], [4, 13], [3, 13], [2, 14], [1, 14], [1, 15], [0, 16]].forEach(([x, y]) => set(x, y, 'r')); } // trailing scarf
  if (cls === 'Arcanist' && hair !== 'hood' && hair !== 'crown') { fill(4, 19, 3, 3, 'T'); fill(7, 16, 2, 2, 'O'); fill(9, 15, 1, 1, 'O'); fill(11, 14, 0, 0, 'O'); set(15, 0, 'O'); set(16, 0, 'O'); } // wide-brim pointed hat
  const wv = val(look.weapon), [gx, gy] = B.gripR;
  for (const [dx, dy, c] of WEAPONS[wv] || []) set(gx + dx, gy + dy, c);
  if (wv === 'dagger') { const [lx, ly] = B.gripL; for (const [dx, dy, c] of WEAPONS.dagger) set(lx - dx, ly + dy, c); }
  const sk = skins[look.skinSet]; if (sk?.draw24) sk.draw24(set, fill, B);
  const pal = { e: '#12062a', f: '#2a1d45', m: '#ff8fa8', r: '#ff3355', b: '#3a2a55', y: '#ffd84f', p: '#ff4fd8', w: '#6b4a2b', L: '#6e4528', l: '#3b2416', d: '#2b2340',
    g: '#c07bff', n: '#1c1528', z: '#7a52c7', q: '#f3ead8', x: '#3a2a55', G: '#5cc46a',
    S: val(look.skin), H: val(look.hairColor), O: val(look.outfitColor), T: val(look.trim), W: val(look.weaponColor), ...(RACE_PAL[race] || {}) };
  if (sk) Object.assign(pal, sk.pal);
  return { rows: g.map(r => r.join('')), pal };
}
// Staff hooded coat at 24x24: face in full shadow with two cyan glints, gold trim, long flared coat, single void katana.
const GM24 = [
  '........OOOOOOOO........', '.......OOOOOOOOOO.......', '......OOOOOOOOOOOO......', '.....OOOTTTTTTTTOOO.....', '.....OOTvvvvvvvvTOO.....',
  '.....OOTvvvvvvvvTOO.....', '.....OOTvvcvvcvvTOO.....', '.....OOTvvvvvvvvTOO.....', '.....OOTvvvvvvvvTOO.....', '......OOTvvvvvvTOO......',
  '......OOTTvvvvTTOO......', '.....OOOOTTTTTTOOOO.....', '....OOOOOTOOOOTOOOOO....', '....OO.OOTOOOOTOO.OO....', '....OO.OOTOOOOTOO.OO....',
  '....bb.bbTbyybTbb.bb....', '....OO.OOTOOOOTOO.OO....', '....OOOOOTOOOOTOOOOO....', '...OOOOOOTOOOOTOOOOOO...', '...OOOOOOTOOOOTOOOOOO...',
  '..OOOOOOOTOOOOTOOOOOOO..', '..OOOOOOOTOOOOTOOOOOOO..', '.OOOOOOOOTbbbbTOOOOOOOO.', '.TTTTTTTTTb..bTTTTTTTTT.'];
const GM24_KATANA = [...v(21, 0, 12, 'K'), ...[1, 3, 5, 7, 9, 11].map(y => [22, y, 'y']), [20, 13, 'y'], [21, 13, 'y'], [22, 13, 'y'], [21, 14, 'b'], [21, 15, 'b'], [21, 16, 'b']];
export function gmGrid24() { const g = GM24.map(r => [...r]); for (const [x, y, c] of GM24_KATANA) g[y][x] = c;
  return { rows: g.map(r => r.join('')), pal: { O: '#17131f', T: '#d9a93f', v: '#030106', c: '#5ff6ff', K: '#0a0710', y: '#ffd76a', b: '#241c30' } }; }

// Late-game shop UI pieces (Goods tab sections, pet sprites, hall decor, memorial wall). Pure string builders; main.js wires them.
import { SHOP, DECOR, PETS, PET_GRIDS, PERK_LABEL, PET_RARITY, memorialPrice, prestigePrice, SPIRIT, DIVINE, ECLIPSE, MEMORIAL_SHOW, spiritStage, SPIRIT_STAGES } from './prestige.js';
import { sprite } from './sprites.js';
import { rarityOf } from './loot.js';
const cache = new Map();
export const petSprite = sp => { if (!cache.has(sp)) { const p = PETS.find(x => x.sp === sp); cache.set(sp, sprite(PET_GRIDS[sp], { a: p.c[0], b: p.c[1], c: '#3a2a55', e: '#12062a' })); } return cache.get(sp); };
// One grid per evolution stage (8×8; the CSS scales them per stage): 1 a small wisp orb, 2 the spirit, 3 the winged, crowned final form.
export const SPIRIT_GRIDS = {
  1: ['........', '........', '...aa...', '..abba..', '..abea..', '...aa...', '........', '........'],
  2: ['...aa...', '..abba..', '.abbbba.', 'abbebbba', 'abbbbbba', '.abbbba.', '..abba..', '...aa...'],
  3: ['a.e..e.a', 'aa.ee.aa', 'aabbbbaa', 'abbebbba', 'abbbbbba', 'aabbbbaa', 'aa.bb.aa', 'a......a'],
};
export const spiritHalves = (stage = 3) => { const k = 'eq' + stage, g = SPIRIT_GRIDS[stage] || SPIRIT_GRIDS[3]; if (!cache.has(k)) cache.set(k, [sprite(g, { a: '#ffe9a8', b: '#fff8e0', e: '#d9a93f' }), sprite(g, { a: '#7a3cff', b: '#1a0f2e', e: '#c9a0ff' })]); return cache.get(k); };
const lvOf = save => save?.heroes?.[0]?.level || 1;
/** Arena pet element HTML: the active pet bobbing at the hero's heel, or (staff only) the Solumbra spirit's two orbiting halves. */
export function petHtml(save, gm) {
  if (gm && save.spirit) return haloHtml(spiritStage(lvOf(save)).n);
  const p = (save.pets || []).find(x => x.id === save.activePet); if (!p || !PET_GRIDS[p.sp]) return '';
  return `<div class="petbob r-${p.rarity}" style="background-image:${petSprite(p.sp).replace(/"/g, '&quot;')};--rc:${rarityOf(p.rarity).color}" title="${p.uname || PETS.find(x => x.sp === p.sp).label}"></div>`;
}
/** Solumbra's halo: the two halves on a small elliptical orbit above the staff hero's head (pure CSS transforms; paused while the tab is hidden, static under reduced motion). */
export function haloHtml(stage = 3) { const [l, d] = spiritHalves(stage), u = x => x.replace(/"/g, '&quot;'), st = SPIRIT_STAGES[(stage | 0) - 1] || SPIRIT_STAGES[2];
  return `<div class="halo s${st.n}" data-stage="${st.n}" title="${st.name}">${st.n === 3 ? '<i class="corona"></i>' : ''}<i class="sph lt" style="background-image:${u(l)}"></i><i class="sph dk" style="background-image:${u(d)}"></i></div>`; }
export const eclipseOn = (t = Date.now()) => t % ECLIPSE.everyMs < ECLIPSE.forMs;
const petName = p => p.uname || PETS.find(x => x.sp === p.sp)?.label || p.sp;
/** Goods tab: condensed late-game sections. st = server shop_state (or null while loading). */
export function shopHtml(st, save, f, { fmt, esc, gm }) {
  const row = (l, s, btn) => `<div class="srow"><div><b>${l}</b><small>${s}</small></div>${btn}</div>`;
  if (!st) return `<h3>Collector's Wing</h3><p class="sub">Loading the collector's stock…</p>`;
  const owned = new Set(st.owned || []), arcF = st.arc || f, reached = a => arcF >= (a - 1) * 10 + 1, fell = a => arcF > a * 10, b = (attr, p, dis) => `<button ${attr} ${dis || save.gold < p ? 'disabled' : ''}>${fmt(p)}g</button>`;
  const item = it => { const p = it.kind === 'prestige' ? Number(st.prices?.[it.id] ?? prestigePrice(it)) : it.price, has = owned.has(it.id);
    const lock = it.kind === 'trophy' ? (!fell(it.arc) ? `after arc ${it.arc} falls` : '') : !reached(it.arc) ? `reach arc ${it.arc}` : '';
    const tag = it.kind === 'token' ? ` · have ${st.tokens?.[it.id] || 0}` : it.kind === 'prestige' ? ' · price rises with every sale (all players)' : '';
    const tokBtn = it.kind === 'token' && (st.tokens?.[it.id] || 0) > 0 ? `<button data-tok="${it.id}">Use</button>` : '';
    const btn = tokBtn + (has ? (it.kind === 'prestige' ? `<button data-ptitle="${it.id}">${save.heroes[0].look.ptitle === it.id ? 'Remove' : 'Wear'}</button>` : it.kind === 'skin' ? `<button data-skin="${it.id}">${save.heroes[0].look.skinSet === it.id ? 'Remove' : 'Wear'}</button>` : '<button disabled>Owned</button>') : lock ? `<button disabled>${lock}</button>` : b(`data-shop="${it.id}"`, p));
    return row(`${it.icon ? it.icon + ' ' : ''}${esc(it.label)}`, `${esc(it.desc || it.kind)}${tag}`, btn); };
  const sec = (title, kinds, note = '') => `<details class="cwing"><summary>${title}</summary>${note}` + SHOP.filter(i => kinds.includes(i.kind)).map(item).join('') + '</details>';
  const pets = (st.pets || []), act = save.activePet;
  const petRows = pets.map(p => { const R = rarityOf(p.rarity); return `<div class="petcell ${p.id === act ? 'on' : ''}" style="--rc:${R.color}"><i style="background-image:${petSprite(p.sp).replace(/"/g, '&quot;')}"></i><b>${esc(petName(p))}</b><small style="color:${R.color}">${R.label}</small><small>${PERK_LABEL[p.perk.k](p.perk.v)}</small><button data-pet="${p.id}">${p.id === act ? 'Active' : 'Follow'}</button></div>`; }).join('');
  const sst = spiritStage(lvOf(save)), [sl, sd] = spiritHalves(sst.n), u = x => x.replace(/"/g, '&quot;');
  const spirit = gm ? `<div class="petcell spiritcard ${save.spirit ? 'on' : ''}" style="--rc:${DIVINE.color}"><div class="spart s${sst.n}"><i style="background-image:${u(sl)}"></i><i style="background-image:${u(sd)}"></i></div><b>${esc(sst.name)}</b><small class="divine">${DIVINE.label} · ${SPIRIT.label} · staff only · stage ${sst.n} of 3</small><small class="sub">${esc(sst.blurb)}${sst.n < 3 ? ` · evolves at Lv ${SPIRIT_STAGES[sst.n].min}` : ''}</small>${SPIRIT.abilities.map(([n, t]) => `<small><b>${esc(n)}</b> ${esc(t)}</small>`).join('')}<small class="lore">${esc(SPIRIT.lore)}</small><button data-spirit>${save.spirit ? 'Active' : 'Follow'}</button></div>` : '';
  const carvable = Array.from({ length: Math.max(0, arcF) }, (_, i) => i + 1);
  return `<h3>Collector's Wing <small>· cosmetic and prestige only</small></h3>`
    + sec('Arc trophies', ['trophy']) + sec('Hero skins', ['skin'])
    + `<details class="cwing" open><summary>Pets <small>· ${pets.length + (gm ? 1 : 0)} owned · one follows you</small></summary><p class="sub">One passive perk each, by rarity (${PET_RARITY.map(r => `<span style="color:${rarityOf(r).color}">${rarityOf(r).label}</span>`).join(' · ')}). Found in eggs, the day-7 chest and rare floor-clear drops. Perks never pass the level or forge cap.</p>`
    + `<div class="petgrid">${spirit}${petRows || (spirit ? '' : '<p class="sub">No pets yet.</p>')}</div></details>` + sec('Pet eggs', ['egg'])
    + sec('Tokens', ['token']) + sec('Prestige titles', ['prestige'])
    + `<details class="cwing"><summary>Floor memorials</summary><p class="sub">Carve a name on a floor's wall (once per floor, chat filters apply). The newest ${MEMORIAL_SHOW} show on the Tower Map.</p><div class="carve"><select id="carveF">${carvable.map(n => `<option value="${n}">Floor ${n} · ${fmt(memorialPrice(n))}g</option>`).join('')}</select><input id="carveN" maxlength="20" placeholder="Name to carve" value="${esc(save.heroes[0].name)}"><button data-carve>Carve</button></div></details>`;
}
export function decorHtml(list, { canBuy, staff, fmt, bank }) {
  const have = new Set(list); const shown = DECOR.filter(d => have.has(d.id));
  return `<div class="decor">${shown.map(d => `<span class="dc" title="${d.label}">${d.icon}</span>`).join('') || '<small>No decor yet.</small>'}</div>`
    + (canBuy ? `<div class="decorbuy">${DECOR.filter(d => !have.has(d.id)).map(d => `<button data-decor="${d.id}" ${!staff && bank < d.price ? 'disabled' : ''}>${d.icon} ${d.label} · ${fmt(d.price)}g</button>`).join('')}</div><p class="sub">${staff ? 'Staff guild: paid from your own gold; prestige only.' : 'Paid from the guild bank (leader/officers). Prestige only.'}</p>` : '');
}
export const wallHtml = (names, esc) => `<div class="mwall"><b>Memorial wall</b>${names.length ? names.map(n => `<span>${esc(n)}</span>`).join('') : '<small>No names carved yet.</small>'}</div>`;

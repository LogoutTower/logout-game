// UI shell: 5-tab bottom nav (Battle / Hero / Town / Guild / More), Hero and Town sub-tabs, dialogs as slide-up sheets,
// tap-outside to close, badge dots. Pure DOM glue: every feature still lives in its own dialog and opener in main.js.
const $ = id => document.getElementById(id);
const HERO = [['gear', 'Gear'], ['bag', 'Bag'], ['talents', 'Talents'], ['wardrobe', 'Wardrobe']];
const HERO_DLG = { gear: 'gearSheet', bag: 'bag', talents: 'talents', wardrobe: 'wardrobe' };
let open = {}, heroAt = 'gear', townAt = 'train', switching = false;
const openDialogs = () => [...document.querySelectorAll('dialog[open]')];
export function closeAll() { switching = true; for (const d of openDialogs()) d.close(); switching = false; }
export function setTab(t) {
  for (const b of document.querySelectorAll('#tabbar [data-tab]')) { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
}
function owner(d) { return d.dataset.group === 'hero' ? 'hero' : d.id === 'town' ? 'town' : d.id === 'guild' ? 'guild' : d.id === 'away' ? 'battle' : 'more'; }
export function heroTab(k) { heroAt = k; closeAll(); setTab('hero'); open[k]?.(); markHero(); }
function markHero() { for (const b of document.querySelectorAll('.herotabs [data-sub]')) b.setAttribute('aria-selected', String(b.dataset.sub === heroAt)); }
export function townPane(p) {
  if (p === 'hall' && $('hallCard').hidden) p = 'train'; townAt = p;
  for (const s of document.querySelectorAll('#town .pane')) s.classList.toggle('on', s.dataset.pane === p);
  for (const b of document.querySelectorAll('#townTabs [data-pane]')) b.setAttribute('aria-selected', String(b.dataset.pane === p));
}
export function syncHall() { $('hallTab').hidden = $('hallCard').hidden; if (townAt === 'hall' && $('hallCard').hidden) townPane('train'); }
export function setDot(id, on, label) { const d = $(id); if (!d) return; if (d.hidden === !!on) d.hidden = !on; if (label != null && d.title !== label) d.title = label; }
export function setHeroLabels({ bag, talents, talentsDot, bagDot }) {
  for (const b of document.querySelectorAll('.herotabs [data-sub="bag"]')) { if (b.firstChild.textContent !== bag) b.firstChild.textContent = bag; b.classList.toggle('dotted', !!bagDot); }
  for (const b of document.querySelectorAll('.herotabs [data-sub="talents"]')) { if (b.firstChild.textContent !== talents) b.firstChild.textContent = talents; b.classList.toggle('dotted', !!talentsDot); }
}
export function initUI(o) {
  open = o;
  for (const d of document.querySelectorAll('dialog[data-group="hero"]')) {
    const nav = document.createElement('div'); nav.className = 'subtabs herotabs'; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Hero');
    nav.innerHTML = HERO.map(([k, l]) => `<button data-sub="${k}" role="tab">${l}<b class="sdot" aria-hidden="true"></b></button>`).join('');
    d.querySelector('h2').after(nav);
    nav.onclick = e => { const b = e.target.closest('[data-sub]'); if (b) heroTab(b.dataset.sub); };
  }
  $('townTabs').onclick = e => { const b = e.target.closest('[data-pane]'); if (b) townPane(b.dataset.pane); }; townPane('train');
  $('tabbar').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); };
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('close', () => { if (!switching && !openDialogs().length) setTab('battle'); });
    d.addEventListener('click', e => { // tap on the backdrop closes the sheet; a tap that lands on the tab bar also switches tab
      if (e.target !== d) return; const r = d.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
      const t = [...document.querySelectorAll('#tabbar [data-tab]')].find(b => { const q = b.getBoundingClientRect(); return e.clientX >= q.left && e.clientX <= q.right && e.clientY >= q.top && e.clientY <= q.bottom; });
      d.close(); if (t) go(t.dataset.tab);
    });
  }
  new MutationObserver(() => { const d = openDialogs().at(-1); if (d) setTab(owner(d)); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
}
export function go(t) {
  closeAll(); setTab(t);
  if (t === 'hero') return heroTab(heroAt);
  if (t === 'town') { open.town?.(); townPane(townAt); return; }
  if (t === 'guild') return open.guild?.();
  if (t === 'more') return $('more').showModal();
  window.scrollTo({ top: 0 });
}

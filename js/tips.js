// Tap-to-see tooltips for touch screens. Anything with a title= shows it on hover on desktop; phones have no hover, so:
// tapping a non-interactive element with a title shows a small popup with the same text; tapping elsewhere (or Esc) hides it.
// Buttons, links and inputs keep their normal tap action and show their tip on a long-press (~500 ms) instead.
// One shared popup (#tip, role="tooltip"), wired once with delegated listeners, so re-rendered HTML needs nothing extra.
const INTERACTIVE = 'button,a[href],input,select,textarea,summary,label,[onclick],[role="button"],[tabindex]:not([tabindex="-1"])';
export const isTouch = () => matchMedia('(hover: none), (pointer: coarse)').matches;
let tip = null, owner = null, pressT = 0, pressed = false;
function el() { if (!tip) { tip = document.createElement('div'); tip.id = 'tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; } return tip; }
export function hideTip() { if (tip && !tip.hidden) { tip.hidden = true; owner?.removeAttribute('aria-describedby'); owner = null; } }
export function showTip(target, text = target?.getAttribute('title')) {
  if (!target || !text) return false; const t = el();
  (target.closest('dialog[open]') || document.body).appendChild(t); // inside the open dialog so it sits in the top layer
  t.textContent = text; t.hidden = false; owner = target; target.setAttribute('aria-describedby', 'tip');
  const r = target.getBoundingClientRect(), w = Math.min(280, innerWidth - 16); t.style.maxWidth = w + 'px';
  const tw = t.offsetWidth, th = t.offsetHeight; let x = Math.round(r.left + r.width / 2 - tw / 2), y = Math.round(r.top - th - 8);
  x = Math.max(8, Math.min(x, innerWidth - tw - 8)); if (y < 8) y = Math.round(r.bottom + 8);
  t.style.left = x + 'px'; t.style.top = y + 'px'; return true;
}
const titled = e => e.target instanceof Element ? e.target.closest('[title]') : null;
export function initTips(root = document) {
  if (root.__tips) return; root.__tips = true;
  root.addEventListener('click', e => {
    if (pressed) { pressed = false; e.preventDefault(); e.stopPropagation(); return; } // long-press already showed the tip: swallow its click
    if (!isTouch()) return; const t = titled(e);
    if (t && !t.closest(INTERACTIVE) && t.getAttribute('title')) { if (owner === t && !tip.hidden) hideTip(); else showTip(t); return; }
    hideTip();
  }, true);
  root.addEventListener('pointerdown', e => { clearTimeout(pressT); pressed = false; if (e.pointerType === 'mouse') return; const t = titled(e), b = t?.closest(INTERACTIVE);
    if (t && b && t.getAttribute('title')) pressT = setTimeout(() => { pressed = showTip(t); }, 500); }, true);
  for (const ev of ['pointerup', 'pointercancel', 'pointermove']) root.addEventListener(ev, e => { if (ev !== 'pointermove' || Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clearTimeout(pressT); }, true);
  root.addEventListener('contextmenu', e => { if (pressed || (isTouch() && titled(e)?.closest(INTERACTIVE))) e.preventDefault(); }, true); // no OS menu on long-press
  root.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
  const follow = () => { if (!tip || tip.hidden || !owner) return; const r = owner.isConnected && owner.getBoundingClientRect();
    if (r && r.bottom > 0 && r.top < innerHeight && r.width) showTip(owner, tip.textContent); else hideTip(); }; // scrolling keeps the tip on its element; hides once it leaves the screen
  addEventListener('scroll', follow, true); addEventListener('resize', follow);
}

// Forge animation: CSS + one small canvas for sparks. Mobile-friendly, tap to skip, honours reduced motion.
// 'up': one quick strike. 'evolve': dim, the weapon floats over the anvil, 3 strikes with sparks, a crack of light,
// the old sprite shatters and the new one spins in with a name card.
const wait = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function sparks(cv, n, hue) {
  const g = cv.getContext('2d'), W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = cv.clientHeight * devicePixelRatio, x0 = W / 2, y0 = H * 0.56;
  const ps = Array.from({ length: n }, () => { const a = -Math.PI * Math.random(), v = (2 + Math.random() * 6) * devicePixelRatio; return { x: x0, y: y0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1 }; });
  let raf; const step = () => { g.clearRect(0, 0, W, H); let alive = 0;
    for (const p of ps) { if (p.l <= 0) continue; alive++; p.x += p.vx; p.y += p.vy; p.vy += 0.25 * devicePixelRatio; p.l -= 0.03; g.fillStyle = `hsla(${hue},100%,${60 + 30 * p.l}%,${p.l})`; g.fillRect(p.x, p.y, 3 * devicePixelRatio, 3 * devicePixelRatio); }
    if (alive) raf = requestAnimationFrame(step); else g.clearRect(0, 0, W, H); };
  step(); return () => cancelAnimationFrame(raf);
}
/** ico: (item) => html. Resolves when the animation ends (or is tapped away). */
const RN = ['', 'I', 'II', 'III', 'IV', 'V'];
/** card (optional): { kicker, title, text } overrides the name card (GM tier replays). */
export async function playForge(kind, before, after, ok, ico, card0 = null) {
  const reduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches, evo = kind === 'evolve' && ok;
  const o = document.createElement('div'); o.className = 'fanim' + (evo ? ' evo' : ''); o.setAttribute('role', 'status');
  o.innerHTML = `<canvas class="fspark"></canvas><div class="fstage"><div class="fweap">${ico(before)}</div><div class="fhammer" aria-hidden="true">🔨</div><div class="fanvil" aria-hidden="true"></div></div><div class="fcard" hidden></div><small class="fskip">tap to skip</small>`;
  (document.querySelector('dialog[open]') || document.body).append(o); let skip = false; o.onclick = () => { skip = true; };
  const w = o.querySelector('.fweap'), hm = o.querySelector('.fhammer'), cv = o.querySelector('.fspark'), card = o.querySelector('.fcard'), hue = evo ? 280 : 40;
  const strike = async () => { hm.classList.remove('hit'); void hm.offsetWidth; hm.classList.add('hit'); await wait(reduced ? 60 : 220); if (!skip) { sparks(cv, reduced ? 8 : 40, hue); w.classList.remove('jolt'); void w.offsetWidth; w.classList.add('jolt'); } await wait(reduced ? 80 : 260); };
  requestAnimationFrame(() => o.classList.add('on')); await wait(reduced ? 50 : evo ? 600 : 250);
  for (let i = 0; i < (kind === 'evolve' ? 3 : 1) && !skip; i++) await strike();
  if (evo && !skip) {
    o.classList.add('crack'); await wait(reduced ? 80 : 450);
    w.innerHTML = [0, 1, 2, 3].map(i => `<span class="shard s${i}">${ico(before)}</span>`).join(''); w.classList.add('shatter'); await wait(reduced ? 80 : 550);
    w.classList.remove('shatter'); w.innerHTML = ico(after); w.classList.add('spinin'); await wait(reduced ? 80 : 800);
  } else if (!skip && ok) { w.innerHTML = ico(after); w.classList.add('glint'); }
  card.hidden = false; card.innerHTML = card0 ? `<small>${esc(card0.kicker)}</small><b>${esc(card0.title)}</b><span>${esc(card0.text || '')}</span>` : evo ? `<small>Evolved · Evo ${RN[Math.max(1, Math.min(5, after.evo?.tier | 0 || 1))]}</small><b>${esc(after.name)}</b><span>${esc(after.evo?.text || '')} · +${8 * Math.max(1, Math.min(5, after.evo?.tier | 0 || 1))}% base damage</span>` : ok ? `<b>+${after.up || 0}</b><span>${esc(after.name)}</span>` : `<b class="bad">Failed</b><span>The materials burned. Your weapon held at +${after.up || 0}.</span>`;
  const hold = Date.now(); while (!skip && Date.now() - hold < (evo ? 1800 : 700)) await wait(50);
  o.classList.remove('on'); await wait(200); o.remove();
}

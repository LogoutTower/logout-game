// Full-screen cutscene player: procedural pixel-art panels (arc palettes from js/arcs.js), typewriter System-notice text,
// a light glitch between panels, tap/Enter to advance, Skip button, reduced-motion support. Content is in js/cutscenes.js.
import { ARCS, ARC_NAMES, arcOf } from './arcs.js';
import { CUTSCENES, fillText, RIVAL_NAME } from './cutscenes.js';
const W = 160, H = 96;
const palOf = n => (ARCS.find(a => a.n === n) || { pal: { sky: '#0a0a12', sky2: '#05050a', deep: '#000000', strip1: '#1a1a24', strip2: '#101018', glow: '#6a5aff', band: '#333344' } }).pal;
function seeded(s) { let a = s >>> 0; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); }
const R = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); };
function backdrop(g, p, arc) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, p.sky); gr.addColorStop(1, p.deep); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let y = 0; y < 70; y += 8) for (let x = (y / 8) % 2 * 8; x < W; x += 16) R(g, '#00000022', x, y, 15, 7); // bricks / panes
  R(g, p.strip1, 0, 76, W, 4); R(g, p.strip2, 0, 80, W, 16);
  const r = seeded(arc * 97); for (let i = 0; i < 26; i++) R(g, arc === 2 ? '#e8f6ff' : arc >= 3 ? '#8a7aff' : '#ffcf8a55', r() * W, r() * 76, 1, 1); // snow / dust / void motes
}
const ART = {
  login(g, p) { R(g, '#000000aa', 40, 24, 80, 44); R(g, p.glow, 40, 24, 80, 3); for (let i = 0; i < 3; i++) R(g, '#ffffff33', 48, 34 + i * 9, 64, 5); R(g, p.glow, 66, 58, 28, 6); },
  erase(g, p, t) { R(g, '#000000aa', 40, 24, 80, 44); R(g, '#ffffff33', 48, 34, 64, 5); R(g, '#ffffff33', 48, 43, 64, 5); const k = Math.min(1, t * 1.5);
    R(g, '#ff4a6a', 66 + 14 * k, 54, 28 * (1 - k), 8); for (let i = 0; i < 12 * k; i++) R(g, '#ff4a6a', 66 + (i * 7) % 30, 50 - i * 2, 1, 1); R(g, '#1a1020', 100, 10, 20, 38); R(g, '#000', 104, 8, 12, 10); },
  signature(g, p) { R(g, '#000000aa', 40, 24, 80, 44); R(g, '#ffffff11', 66, 54, 28, 8); g.fillStyle = '#b8a8ff'; g.font = '10px monospace'; g.fillText('U.', 74, 62); },
  trapped(g, p) { R(g, '#ff4a6a', 50, 30, 60, 30); R(g, '#000', 52, 32, 56, 26); g.fillStyle = '#ff4a6a'; g.font = '7px monospace'; g.fillText('LOG OUT', 64, 44); g.fillText('DISABLED', 62, 53);
    for (let x = 30; x < 130; x += 10) R(g, '#ffffff22', x, 10, 2, 66); },
  stair(g, p, t) { const n = Math.ceil(8 * Math.min(1, t * 1.3)); for (let i = 0; i < n; i++) R(g, p.glow, 60 + i * 6, 74 - i * 7, 10, 3); R(g, '#ffffff', 58, 66, 4, 10); },
  dissolve(g, p, t) { const r = seeded(7); for (let i = 0; i < 260; i++) { const x = 64 + r() * 32, y = 20 + r() * 56, d = r(); if (d > t) R(g, '#2a1838', x, y, 2, 2); else R(g, p.glow, x + (t - d) * 30 * (r() - 0.3), y - (t - d) * 40, 1, 1); } },
  workshop(g, p) { R(g, '#3a2414', 20, 56, 120, 6); R(g, '#2a180c', 26, 62, 4, 14); R(g, '#2a180c', 130, 62, 4, 14); R(g, '#e8e0c8', 40, 50, 6, 6); R(g, p.glow, 100, 44, 3, 12);
    for (let i = 0; i < 4; i++) R(g, '#d8d0b0', 30 + i * 26, 12 + (i % 2) * 4, 20, 26); },
  blueprints(g) { R(g, '#1a3a6a', 22, 12, 116, 60); g.strokeStyle = '#9fd8ff'; g.lineWidth = 1; g.beginPath(); g.arc(60, 42, 18, 0, 7); g.moveTo(42, 42); g.lineTo(78, 42); g.moveTo(60, 24); g.lineTo(60, 60); g.stroke();
    g.beginPath(); g.arc(104, 42, 14, 0, 7); g.stroke(); g.setLineDash([2, 2]); g.beginPath(); g.moveTo(78, 42); g.lineTo(90, 42); g.stroke(); g.setLineDash([]); R(g, '#9fd8ff66', 92, 62, 40, 2); R(g, '#9fd8ff44', 96, 66, 32, 1); },
  note(g) { R(g, '#d8d0b0', 44, 16, 72, 56); for (let i = 0; i < 6; i++) R(g, '#5a4a3a', 50, 24 + i * 7, 54 - (i % 3) * 8, 1); for (let x = 44; x < 116; x += 4) R(g, '#00000000', x, 70, 4, 2), R(g, '#140a20', x, 68 + (x % 8 ? 2 : 0), 4, 4); },
  glimpse(g, p) { R(g, '#ffffff22', 50, 12, 60, 64); R(g, p.glow, 50, 12, 60, 1); g.strokeStyle = '#c8a85a'; g.beginPath(); g.arc(80, 40, 16, 0, 7); g.stroke(); R(g, '#c8a85a', 79, 28, 2, 12); R(g, '#c8a85a', 80, 39, 9, 2); },
  rewrite(g, p, t) { for (let y = 0; y < 4; y++) for (let x = 0; x < 10; x++) { const on = (x + y * 3) / 40 < t; R(g, on ? '#8a7aff' : p.strip1, 4 + x * 16, 78 + y * 5, 14, 4); } },
  workshop2(g, p) { ART.workshop(g, p); R(g, '#000000', 60, 20, 40, 30); R(g, '#8a5aff', 62, 22, 36, 26); R(g, '#000', 64, 24, 32, 22); g.fillStyle = '#ff4a6a'; g.font = '6px monospace'; g.fillText('ACCESS', 68, 34); g.fillText('REVOKED', 66, 42); },
  name(g, p) { g.fillStyle = '#e8f6ff'; g.font = 'bold 14px monospace'; g.textAlign = 'center'; g.fillText(RIVAL_NAME.toUpperCase(), 80, 48); g.textAlign = 'left'; R(g, '#8a7aff55', 30, 52, 100, 1); },
  silhouette(g, p, t) { umbra(g, 80, 8, t); },
  silhouetteOld(g) { R(g, '#000000', 62, 22, 36, 54); R(g, '#000000', 70, 10, 20, 14); R(g, '#000000', 52, 30, 10, 30); R(g, '#000000', 98, 30, 10, 30); R(g, '#8a7aff', 74, 16, 3, 2); R(g, '#8a7aff', 83, 16, 3, 2);
    for (let i = 0; i < 9; i++) R(g, '#8a7aff33', 60 + i * 5, 6 + (i % 3) * 3, 1, 1); },
  sealed(g) { R(g, '#000000cc', 56, 14, 48, 62); R(g, '#3a3050', 56, 14, 48, 2); g.fillStyle = '#8a7aff'; g.font = '16px monospace'; g.textAlign = 'center'; g.fillText('?', 80, 52); g.textAlign = 'left'; },
};
// Umbra: tall hooded figure, long black hair, pale face in shadow, two violet eyes, starlit cloak with glitch streaks. Original pixel art.
function umbra(g, cx, top, t = 1) {
  const C = { hood: '#1a0f2e', hoodL: '#2c1a4a', hair: '#07040c', face: '#3a3048', eye: '#c79bff', star: '#b98aff', edge: '#5a3a9a' };
  for (let y = 0; y < 82; y++) { const w = y < 18 ? 10 + y * 0.9 : y < 30 ? 26 : 26 + (y - 30) * 0.35; R(g, y < 18 ? C.hoodL : C.hood, cx - w / 2, top + y, w, 1); R(g, C.edge, cx - w / 2, top + y, 1, 1); R(g, C.edge, cx + w / 2 - 1, top + y, 1, 1); }
  R(g, C.hair, cx - 8, top + 10, 16, 30); R(g, C.hair, cx - 10, top + 20, 4, 30); R(g, C.hair, cx + 6, top + 20, 4, 30);
  R(g, C.face, cx - 5, top + 12, 10, 12); R(g, C.hair, cx - 6, top + 11, 12, 3); R(g, C.hair, cx - 6, top + 12, 3, 5);
  const blink = t < 0.15 ? 0 : 1; if (blink) { R(g, C.eye, cx - 4, top + 17, 3, 1); R(g, C.eye, cx + 1, top + 17, 3, 1); R(g, '#c79bff55', cx - 6, top + 16, 13, 3); }
  const r = seeded(31); for (let i = 0; i < 40; i++) R(g, C.star, cx - 18 + r() * 36, top + 32 + r() * 48, 1, 1);
  for (let i = 0; i < 5; i++) R(g, '#8a5aff88', cx - 20 + r() * 20, top + 8 + r() * 60, 10 + r() * 14, 1); // glitch streaks
}
/** Draw one panel to a canvas at progress t (0..1). Exported for tests and contact sheets. */
export function drawPanel(cv, panel, t = 1) { cv.width = W; cv.height = H; const g = cv.getContext('2d'), p = palOf(panel.arc); g.imageSmoothingEnabled = false; backdrop(g, p, panel.arc); (ART[panel.art] || (() => {}))(g, p, t); }
const reduced = () => matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** Play a cutscene by key. Resolves when finished or skipped. */
export function playCutscene(key, { onEnd } = {}) {
  const cs = CUTSCENES[key]; if (!cs) return Promise.resolve(false);
  document.getElementById('cutscene')?.remove();
  const el = document.createElement('dialog'); el.id = 'cutscene'; el.setAttribute('aria-label', cs.title); el.tabIndex = -1;
  el.innerHTML = `<canvas class="cs-art"></canvas><div class="cs-box"><small class="cs-h">System notice · ${cs.title}</small><p class="cs-t" aria-live="polite"></p><small class="cs-n"></small></div><button class="cs-skip" type="button">Skip ▸▸</button>`;
  document.body.append(el); el.showModal?.(); el.addEventListener('cancel', e => { e.preventDefault(); end(); }); el.focus(); // top layer: above any open dialog
  const cv = el.querySelector('canvas'), tx = el.querySelector('.cs-t'), nn = el.querySelector('.cs-n'), rm = reduced();
  let i = -1, typing = 0, full = '', raf = 0, t0 = 0, done;
  const name = n => ARC_NAMES[n] || arcOf(n * 10).name;
  const anim = now => { const p = cs.panels[i], t = rm ? 1 : Math.min(1, (now - t0) / 1400); drawPanel(cv, p, t); if (t < 1) raf = requestAnimationFrame(anim); };
  const type = () => { if (typing >= full.length) return; typing += 2; tx.textContent = full.slice(0, typing); setTimeout(type, 24); };
  const show = () => { i++; if (i >= cs.panels.length) return end(); const p = cs.panels[i]; full = fillText(p.text, cs, name); nn.textContent = `${i + 1} / ${cs.panels.length} · tap to continue`; el.querySelector('.cs-h').textContent = p.glitch ? `Sys̶tem n0t̷ice · ${cs.title}` : `System notice · ${cs.title}`; el.classList.toggle('near', !!p.glitch);
    if (!rm) { el.classList.remove('glitch'); void el.offsetWidth; el.classList.add('glitch'); }
    cancelAnimationFrame(raf); t0 = performance.now(); raf = requestAnimationFrame(anim); if (rm) { typing = full.length; tx.textContent = full; } else { typing = 0; tx.textContent = ''; type(); } };
  const next = () => { if (typing < full.length) { typing = full.length; tx.textContent = full; } else show(); };
  const end = () => { cancelAnimationFrame(raf); el.close?.(); el.remove(); document.removeEventListener('keydown', key2); onEnd?.(); done(true); };
  const key2 = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } };
  el.addEventListener('click', e => { if (e.target.closest('.cs-skip')) end(); else next(); }); document.addEventListener('keydown', key2);
  return new Promise(r => { done = r; show(); });
}

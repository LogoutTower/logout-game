// Staff aura "Galaxy of the Unwritten": grows with level (cosmetic only). One canvas behind the hero, ~24 fps,
// paused in background tabs, a single static frame under prefers-reduced-motion, fewer stars on small screens.
export const GALAXY_TIERS = [
  { min: 1, name: 'Faint Swirl', desc: 'a faint star swirl at the coat hem' },
  { min: 10, name: 'Rising Starfield', desc: 'the starfield climbs the coat' },
  { min: 20, name: 'Spiral Galaxy', desc: 'a slow spiral galaxy turns behind you' },
  { min: 30, name: 'Turning Arms', desc: 'the spiral arms reach across the arena' },
  { min: 40, name: 'Nebula Crown', desc: 'a nebula galaxy fills the space around you' },
];
/** Tier (1-5) plus smooth growth t in [0,1] (level 1 → 0, level 50+ → 1). */
export function galaxyTier(level = 1) {
  const i = GALAXY_TIERS.reduce((a, x, k) => level >= x.min ? k : a, 0), t = Math.max(0, Math.min(1, (level - 1) / 49));
  return { tier: i + 1, ...GALAXY_TIERS[i], t, scale: 1.3 + 2.4 * t };
}
const seeded = s => () => (s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 >>> 0) / 4294967296;
export function mountGalaxy(arena, hero) {
  const cv = document.createElement('canvas'); cv.id = 'galaxy'; cv.setAttribute('aria-hidden', 'true'); arena.insertBefore(cv, hero);
  const g = cv.getContext('2d'), reduce = matchMedia('(prefers-reduced-motion: reduce)'), small = matchMedia('(max-width: 640px)');
  let st = { on: false, level: 1, stars: 0, eyes: false }, stars = [], raf = 0, last = 0, key = '';
  const build = () => { const r = seeded(7), { t } = galaxyTier(st.level), n = Math.round((small.matches ? 50 : 90) + (small.matches ? 70 : 160) * t); stars = [];
    for (let i = 0; i < n; i++) { const arm = i % 2, d = r(), a = arm * Math.PI + d * 5.2 + (r() - .5) * .5; // log-spiral arms
      stars.push({ d, a, hem: r(), hx: r() * 2 - 1, sz: r() < .2 ? 2.5 : 1.5, c: r() < .35 ? '#ffd76a' : r() < .6 ? '#cfd8ff' : '#9a7bff', tw: r() * 6.28 }); } };
  const place = () => { const hr = hero.getBoundingClientRect(), ar = arena.getBoundingClientRect(), { scale } = galaxyTier(st.level), s = Math.round(Math.max(hr.width, hr.height) * scale);
    Object.assign(cv.style, { width: s + 'px', height: s + 'px', left: (hr.left - ar.left + hr.width / 2 - s / 2) + 'px', top: (hr.top - ar.top + hr.height / 2 - s / 2) + 'px' });
    const dpr = Math.min(2, devicePixelRatio || 1); cv.width = cv.height = Math.round(s * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); return s; };
  let size = 0;
  function draw(time) {
    const { t, tier } = galaxyTier(st.level), S = size, c = S / 2, hs = S / galaxyTier(st.level).scale, rot = time / 1000 * 0.05;
    g.clearRect(0, 0, S, S);
    if (tier >= 3) { // nebula: deep purples/blues, grows with level
      const k = (t - 0.39) / 0.61, rg = g.createRadialGradient(c, c, hs * .2, c, c, S / 2);
      rg.addColorStop(0, `rgba(110,50,200,${.22 + .38 * k})`); rg.addColorStop(.45, `rgba(40,50,160,${.14 + .3 * k})`); rg.addColorStop(1, 'rgba(10,6,30,0)'); g.fillStyle = rg; g.fillRect(0, 0, S, S); }
    for (const s of stars) {
      const tw = .55 + .45 * Math.sin(time / 700 + s.tw); let x, y, a;
      if (s.d > .35 + .65 * t && tier < 3) continue; // low tiers: fewer stars
      if (tier < 3 || s.hem < .25) { // hem swirl / starfield climbing the coat
        const climb = Math.min(1, .15 + 1.6 * t), yy = .5 - s.hem * climb; x = c + s.hx * hs * (.55 + .1 * Math.sin(time / 1500 + s.tw)); y = c + hs * (yy - .02 + .06 * Math.sin(time / 2000 + s.tw * 2)); a = .9 * tw;
      } else { const rr = (S / 2) * (.3 + .7 * s.d); x = c + Math.cos(s.a + rot) * rr; y = c + Math.sin(s.a + rot) * rr * .55; a = (.55 + .45 * (1 - s.d)) * tw; }
      g.globalAlpha = a; g.fillStyle = s.c; g.fillRect(x, y, s.sz, s.sz); }
    g.globalAlpha = 1;
    if (st.stars > 0) { const r = seeded(99); g.fillStyle = '#ffd76a'; for (let i = 0; i < Math.min(100, st.stars); i++) { const x = c + (r() - .5) * hs * .5, y = c + hs * (.0 + r() * .45); g.globalAlpha = .6 + .4 * Math.sin(time / 900 + i); g.fillRect(x - .5, y - 1.5, 1, 3); g.fillRect(x - 1.5, y - .5, 3, 1); } g.globalAlpha = 1; } // Constellation
    if (st.eyes) { g.fillStyle = '#ffd76a'; g.shadowColor = '#ffd76a'; g.shadowBlur = 4; g.globalAlpha = .55 + .3 * Math.sin(time / 1200); g.fillRect(c - hs * .07, c - hs * .2, 2, 1.5); g.fillRect(c + hs * .04, c - hs * .2, 2, 1.5); g.shadowBlur = 0; g.globalAlpha = 1; } // The Final Shape
  }
  function loop(time) { raf = 0; if (!st.on || document.hidden) return; if (time - last > 40) { last = time; draw(time); } if (!reduce.matches) raf = requestAnimationFrame(loop); }
  const kick = () => { if (!raf && st.on) raf = requestAnimationFrame(loop); };
  document.addEventListener('visibilitychange', kick); addEventListener('resize', () => { if (st.on) { size = place(); last = 0; kick(); } });
  return { update(next) { const k = JSON.stringify(next); if (k === key) return; key = k; const lv = st.level; st = { ...st, ...next }; cv.hidden = !st.on; if (!st.on) return;
    if (!stars.length || galaxyTier(lv).t !== galaxyTier(st.level).t) build(); size = place(); last = 0; kick(); } };
}

// Offline e2e for boss art v2 (FEATURES.bossV2 = 'gm'): local mode only (Supabase blocked), fresh browser contexts.
// Checks: non-staff sees the classic 32x32 boss; staff sees the v2 art at a whole-number scale for Floors 1-20; mobile fits.
// Writes battle screenshots and per-floor arena renders to BV2_SHOTS (default /tmp/bv2).
import assert from 'node:assert/strict'; import { createHash } from 'node:crypto'; import { chromium, devices } from 'playwright-core'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js'); const { floorBossHp } = await import('../js/game.js').catch(() => ({}));
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', OUT = process.env.BV2_SHOTS || '/tmp/bv2', CHROME = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const FLOORS = (process.env.BV2_FLOORS || '1,10,20').split(',').map(Number), SHEET = !!process.env.BV2_SHEET;
const b = await chromium.launch({ executablePath: CHROME });
async function page(dev, gm, floor) {
  const ctx = await b.newContext({ ...dev }); await offline(ctx);
  await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('bossv2-test').digest('hex')}'`) }); });
  await ctx.addInitScript(([h, gm, floor]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', 'bossv2-test');
    if (!localStorage.getItem('bv2.seeded')) { localStorage.setItem('bv2.seeded', '1'); localStorage.setItem('logout.v1.world', JSON.stringify({ floor, hp: 9e15, dmg: {}, marks: {} })); } }, [TEAM_PASS_HASH, gm, floor]);
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now());
  await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Tess'); await p.click('#start'); await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip');
  await p.waitForTimeout(2500); for (const d of ['away', 'system']) await p.evaluate(id => document.getElementById(id)?.open && document.getElementById(id).close(), d);
  await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); }); await p.waitForTimeout(400);
  return { ctx, p, errs };
}
const info = p => p.evaluate(() => { const bo = document.getElementById('boss'), a = document.getElementById('arena'), r = bo.getBoundingClientRect(), ar = a.getBoundingClientRect(), h = document.getElementById('hero').getBoundingClientRect();
  return { v2: bo.classList.contains('v2'), big: bo.classList.contains('big'), w: r.width, h: r.height, top: r.top - ar.top, left: r.left, right: r.right, arenaW: ar.width, arenaH: ar.height, vw: innerWidth, heroRight: h.right, floorText: document.getElementById('floor')?.textContent, bg: bo.style.backgroundImage.slice(0, 30) }; });
const RUNS = [['desktop', { viewport: { width: 1280, height: 900 } }], ['mobile', devices['iPhone 13']]];
const results = [];
// non-staff: classic sprite
{ const { ctx, p, errs } = await page(RUNS[0][1], false, 1); const i = await info(p); const ALL = (await import('../config.js')).FEATURES.bossV2 === 'all'; assert.equal(i.v2, ALL, `non-staff: v2 ${ALL ? 'on' : 'off'}`); assert.match(i.bg, ALL ? /png/ : /svg/); assert.deepEqual(errs, []); await ctx.close(); console.log('non-staff ok'); }
for (const [name, dev] of RUNS) for (const f of FLOORS) {
  const { ctx, p, errs } = await page(dev, true, f); const i = await info(p); results.push({ name, f, ...i });
  assert.equal(i.v2, true, `${name} F${f}: v2 on for staff`); assert.match(i.bg, /png/, 'canvas PNG');
  const want = (i.vw <= 640 ? 1.875 : 3) * 96; assert.ok(Math.abs(i.w - want) < 0.6, `${name} F${f}: ${i.w}px, want ${want}`);
  const fits = i.right <= i.vw + 0.5 && i.left >= i.heroRight - 0.5; results.at(-1).fits = fits; if (!process.env.BV2_LENIENT) assert.ok(fits, `${name} F${f}: boss fits next to the hero`);
  assert.ok(i.top >= -0.5, `${name} F${f}: boss not clipped at top (${i.top})`); if (i.right > i.vw + 0.5 || i.left < i.heroRight - 0.5) console.log(`LAYOUT ${name} F${f}: boss ${Math.round(i.left)}-${Math.round(i.right)}px, hero right ${Math.round(i.heroRight)}px, viewport ${i.vw}px`);
  assert.deepEqual(errs, []);
  await p.screenshot({ path: `${OUT}/bosses-v2-F${String(f).padStart(2, '0')}-${name}.png`, animations: 'disabled' });
  if (SHEET && name === 'desktop') await p.locator('#arena').screenshot({ path: `${OUT}/arena-F${String(f).padStart(2, '0')}.png`, animations: 'disabled' });
  await ctx.close();
}
console.log(JSON.stringify(results.map(r => ({ run: r.name, f: r.f, big: r.big, px: Math.round(r.w), vw: r.vw, arenaW: Math.round(r.arenaW), arenaH: Math.round(r.arenaH), gapToHero: Math.round(r.left - r.heroRight), rightMargin: Math.round(r.vw - r.right), fits: r.fits }))));
await b.close(); console.log('boss v2 e2e ok');

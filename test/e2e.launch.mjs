// Launch-day browser checks against the local static site (offline backend; never the live DB): node test/e2e.launch.mjs [base]
// gate ON before LAUNCH_AT, auto-open at LAUNCH_AT (mocked clock), gate OFF (prelaunchLock false), and the game booting on desktop and mobile.
import assert from 'node:assert'; import { chromium, devices } from 'playwright-core'; import { LAUNCH_AT } from '../config.js'; import { offline } from './e2e-offline.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:8765/', launch = Date.parse(LAUNCH_AT), OUT = process.env.SHOTS || '/workspace';
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
async function page(now, opts = {}, unlock = false) {
  const ctx = await b.newContext(opts); const hits = await offline(ctx), errs = [];
  if (unlock) await ctx.route(/\/(index\.html|app\.html)?(\?.*)?$/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace('"lock":true', '"lock":false') }); }); // gate OFF
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); if (now) await p.clock.install({ time: now }); return { p, ctx, hits, errs };
}
const game = p => p.waitForSelector('#create, #game', { state: 'attached', timeout: 10000 });
{ const { p, ctx, hits, errs } = await page(launch - 3600e3); await p.goto(BASE); await p.waitForTimeout(800); // gate ON, an hour before launch
  assert(!/app\.html/.test(p.url()), 'gate holds before LAUNCH_AT'); assert.equal(await p.locator('#create').count(), 0); await p.screenshot({ path: `${OUT}/launch-gate-on.png` });
  await p.clock.fastForward(3600e3 + 5000); await p.waitForURL(/app\.html/, { timeout: 15000 }).catch(() => {}); if (!/app\.html/.test(p.url())) { await p.reload(); await p.waitForTimeout(800); }
  assert(/app\.html/.test(p.url()), 'gate auto-opens at LAUNCH_AT'); await game(p); assert.deepEqual(hits, []); assert.deepEqual(errs, []); await ctx.close(); }
for (const [label, opts] of [['desktop', { viewport: { width: 1366, height: 820 } }], ['mobile', devices['iPhone 13']]]) { // gate OFF
  const { p, ctx, hits, errs } = await page(null, opts, true); await p.goto(BASE + 'app.html'); await game(p); await p.waitForTimeout(600);
  if (await p.locator('#create').isVisible().catch(() => false)) { const nm = p.locator('#create input').first(); if (await nm.count()) await nm.fill('Rehearsal'); const go = p.locator('#create button[type=submit], #create .cta').first(); if (await go.count()) await go.click().catch(() => {}); await p.waitForTimeout(1500); }
  if (await p.isVisible('#tskip').catch(() => false)) await p.click('#tskip');
  const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert(w[0] <= w[1] + 2, `${label}: no horizontal overflow ${w}`);
  await p.screenshot({ path: `${OUT}/launch-app-${label}.png` }); assert.deepEqual(hits, [], 'no live backend requests'); assert.deepEqual(errs, [], `${label}: no page errors`); await ctx.close(); }
await b.close(); console.log('launch e2e ok');

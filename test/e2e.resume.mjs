// Browser regression: reopening/resuming after 1-2 h sends the away batch at once (pageshow, visibilitychange, reload), not on a later slot.
// Mocked clock (Playwright clock.setSystemTime jumps wall time without firing timers). Offline mode only; the Supabase cadence is covered by test/resume.test.mjs.
import assert from 'node:assert'; import { TEAM_PASS_HASH } from '../config.js'; import { offline } from './e2e-offline.mjs';
const { chromium } = await import('playwright-core');
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html';
const browser = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
const bctx = await browser.newContext(); const supa = await offline(bctx); await bctx.addInitScript(h => localStorage.setItem('logout.v1.gate', h), TEAM_PASS_HASH);
const page = await bctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
let T = Date.UTC(2026, 9, 19, 18); await page.clock.install({ time: T });
await page.goto(URL + '?t=' + Date.now()); await page.waitForSelector('#create:not(.hidden)'); await page.fill('#hname', 'Resumer'); await page.click('#start');
await page.clock.runFor(8000); if (await page.isVisible('#tskip').catch(() => false)) await page.click('#tskip');
const dmg = () => page.evaluate(() => { const s = JSON.parse(localStorage.getItem('logout.v1.save')), w = JSON.parse(localStorage.getItem('logout.v1.world')); return { f: w.floor, d: w.dmg[s.heroes[0].name] || 0 }; }); // the guardian's damage table resets when the floor falls
const moved = (a, b) => b.f > a.f || b.d > 200 * Math.max(1, a.d / 10);
const res = {};
for (const [ev, h] of [['visibilitychange', 1], ['pageshow', 2]]) {
  await page.clock.runFor(2000); const d0 = await dmg(); T = await page.evaluate(() => Date.now()); await page.clock.setSystemTime(T + h * 3600e3);
  await page.evaluate(e => { if (e === 'pageshow') dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); else document.dispatchEvent(new Event('visibilitychange')); }, ev);
  await page.clock.runFor(1200); const d1 = await dmg(); res[ev] = { hours: h, before: d0, after: d1 };
  assert(moved(d0, d1), `${ev}: the ${h} h batch reached the backend within ~1 s (${JSON.stringify(d0)} → ${JSON.stringify(d1)})`); }
// closed and reopened 1.5 h later: the batch goes out during load
{ const d0 = await dmg(); T = await page.evaluate(() => Date.now()); await page.clock.setSystemTime(T + 1.5 * 3600e3); await page.reload(); await page.clock.runFor(4000); const d1 = await dmg(); res.reload = { before: d0, after: d1 };
  assert(d1.f > d0.f || d1.d - d0.d > 10000, `reload: offline batch submitted on load (${JSON.stringify(d0)} → ${JSON.stringify(d1)})`); }
console.log(JSON.stringify(res)); assert.deepEqual(errs, []); await browser.close(); assert.deepEqual(supa, [], 'no request reached the live backend'); console.log('resume e2e ok');

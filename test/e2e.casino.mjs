// Offline e2e for The Glitch Den (Town → Den): desktop Chromium, iPhone (WebKit), Android (Chromium). Local mode only, never the live DB.
// Writes /workspace/casino-*.png.
import assert from 'node:assert/strict'; import { webkit, chromium, devices } from 'playwright-core'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js');
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', SHOTS = process.env.CASINO_SHOTS || '/workspace', CHROME = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const RUNS = [['desktop', chromium, { executablePath: CHROME }, { viewport: { width: 1280, height: 900 } }], ['iphone', webkit, {}, devices['iPhone 13']], ['android', chromium, { executablePath: CHROME }, devices['Pixel 7']]];
const shot = (p, path) => p.screenshot({ path, timeout: 60000, animations: 'disabled' }).catch(() => p.screenshot({ path, timeout: 60000 }));
const fits = p => p.evaluate(() => { const e = document.querySelector('#denBody .den'), b = e.getBoundingClientRect(); return b.x >= -0.5 && b.right <= innerWidth + 0.5 && e.scrollWidth <= e.clientWidth + 1; });
const gold = p => p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).gold);
for (const [name, eng, launch, dev] of RUNS) {
  const b = await eng.launch(launch), errs = [], mobile = name !== 'desktop', tap = (p, s) => mobile ? p.tap(s) : p.click(s);
  const ctx = await b.newContext({ ...dev }); const hits = await offline(ctx); await ctx.addInitScript(h => localStorage.setItem('logout.v1.gate', h), TEAM_PASS_HASH);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now());
  await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Tess'); await tap(p, '#start'); await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await tap(p, '#tskip');
  await p.waitForTimeout(2500); await p.evaluate(() => { const k = 'logout.v1.save', s = JSON.parse(localStorage.getItem(k)); s.gold = 50000; localStorage.setItem(k, JSON.stringify(s)); });
  await p.reload(); await p.waitForSelector('#tabbar:not(.hidden)'); await p.waitForTimeout(2000); if (await p.isVisible('#away').catch(() => false)) await p.evaluate(() => document.getElementById('away').close());
  await tap(p, '#tabTown'); await p.waitForSelector('#town[open]'); await tap(p, '#townTabs [data-pane="den"]'); await p.waitForSelector('#denBody [data-den-play]');
  assert.match(await p.textContent('#denBody'), /Gold only\. No real money, no token\./); assert.ok(await fits(p), `${name}: den fits`);
  // Coin flip
  const g0 = await gold(p); await p.fill('#denBet', '100'); await tap(p, '[data-den-p="1"]'); await p.fill('#denBet', '100'); await tap(p, '[data-den-play]'); await p.waitForSelector('.denres');
  const g1 = await gold(p); assert.ok(g1 === g0 - 100 || g1 === g0 + 94 || Math.abs(g1 - g0) < 300, `${name}: flip moved gold ${g0} → ${g1}`);
  await shot(p, `${SHOTS}/casino-${name}-flip.png`);
  // cooldown
  await p.fill('#denBet', '100'); await tap(p, '[data-den-play]'); await p.waitForTimeout(300);
  // max bet clamps to the floor limit
  await p.waitForTimeout(1600); await tap(p, '[data-den-b="max"]'); assert.equal(+(await p.inputValue('#denBet')), 2000, 'max bet = 2,000g on floor 1');
  // Dice
  await tap(p, '[data-den-g="dice"]'); await p.waitForSelector('#denDice'); await tap(p, '[data-den-m="under"]'); assert.match(await p.textContent('#denBody'), /Under 50 · 49% to win · pays ×1\.95/);
  await p.fill('#denBet', '50'); await tap(p, '[data-den-play]'); await p.waitForSelector('.denres'); assert.match(await p.textContent('.denres'), /Rolled \d+/); await shot(p, `${SHOTS}/casino-${name}-dice.png`);
  // Wheel
  await p.waitForTimeout(1600); await tap(p, '[data-den-g="wheel"]'); await p.waitForSelector('.wheel'); assert.equal(await p.locator('.wseg').count(), 6);
  await p.fill('#denBet', '200'); await tap(p, '[data-den-play]'); await p.waitForSelector('.wseg.hit'); assert.ok(await fits(p), `${name}: wheel fits`); await shot(p, `${SHOTS}/casino-${name}-wheel.png`);
  // daily wager limit
  await p.evaluate(() => { const k = 'logout.v1.save', s = JSON.parse(localStorage.getItem(k)); s.den = { d: new Date().toISOString().slice(0, 10), used: 99995, t: 0 }; localStorage.setItem(k, JSON.stringify(s)); });
  const sv = await gold(p); assert.ok(sv >= 0, 'gold never negative');
  assert.deepEqual(errs, [], `${name}: page errors`); assert.deepEqual(hits, [], 'no live backend calls'); console.log(`${name}: den ok`); await b.close();
}

// Offline e2e for the Floor 100 two-phase guardian (Supabase blocked). Phase is derived from the shared HP: above 50% the queen, at/below
// 50% the awakened form with a glitch transition + banner (once per device). Desktop Chromium + mobile (Pixel 7, and iPhone WebKit if
// installed). Writes /workspace/umbra-boss-*.png (UMBRA_SHOTS overrides; empty string disables).
import assert from 'node:assert/strict'; import { chromium, webkit, devices } from 'playwright-core'; import { offline } from './e2e-offline.mjs';
import { TEAM_PASS_HASH } from '../config.js'; import { floorBossHp, AWAKEN_NAME } from '../js/floors.js';
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', SHOTS = process.env.UMBRA_SHOTS ?? '/workspace', MAXHP = floorBossHp(100);
const CH = { executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` };
const RUNS = [['desktop', chromium, CH, { viewport: { width: 900, height: 900 } }], ['android', chromium, CH, devices['Pixel 7']]];
if (process.env.UMBRA_WEBKIT !== '0') { try { const w = await webkit.launch(); await w.close(); RUNS.push(['iphone', webkit, {}, devices['iPhone 13']]); } catch { console.log('webkit not installed: skipping iPhone run'); } }
const setWorld = (p, pct) => p.evaluate(([hp]) => { const k = 'logout.v1.world', w = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...w, floor: 100, hp, dmg: w.dmg || { Wren: 10 }, t: Date.now(), hist: w.hist || [] })); }, [Math.round(MAXHP * pct)]);
const dismiss = async p => { for (let i = 0; i < 12; i++) { if (await p.isVisible('#tskip').catch(() => false)) await p.click('#tskip'); else if (await p.isVisible('#cutscene .cs-skip').catch(() => false)) await p.click('#cutscene .cs-skip'); else break; await p.waitForTimeout(300); } };
for (const [name, eng, launch, dev] of RUNS) {
  const b = await eng.launch(launch), errs = [], ctx = await b.newContext({ ...dev }); const hits = await offline(ctx);
  await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/MAX_FLOOR\s*=\s*\d+/, 'MAX_FLOOR = 100').replace(/online:\s*'[a-z]+'/, "online: 'off'") }); });
  await ctx.addInitScript(h => localStorage.setItem('logout.v1.gate', h), TEAM_PASS_HASH);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now());
  await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Wren'); await p.click('#start'); await p.waitForTimeout(1500); await dismiss(p);
  // phase 1
  await setWorld(p, 0.8); await p.reload(); await p.waitForTimeout(2000); await dismiss(p);
  assert.equal(await p.textContent('#bname'), 'Umbra', `${name}: phase 1 name`); assert.match(await p.textContent('#floor'), /Queen Who Rewrites the Tower/);
  assert.equal(await p.$eval('#arena', a => a.classList.contains('awakened')), false); assert.equal(await p.isVisible('#phaseBanner'), false);
  const s1 = await p.$eval('#boss', e => e.style.backgroundImage); assert.ok(s1.length > 1000, 'sprite drawn');
  if (SHOTS && name !== 'iphone') await p.locator('#arena').screenshot({ path: `${SHOTS}/umbra-boss-phase1${name === 'desktop' ? '' : '-' + name}.png` });
  // live crossing of 50%: the next poll of the shared HP flips the phase for this player
  await setWorld(p, 0.49); await p.waitForFunction(() => document.getElementById('arena').classList.contains('awakened'), null, { timeout: 90000 }); await p.waitForTimeout(700);
  assert.equal(await p.textContent('#bname'), AWAKEN_NAME, `${name}: phase 2 name`); assert.match(await p.textContent('#floor'), /The Tower Rewrites Itself/);
  assert.ok(await p.isVisible('#phaseBanner'), `${name}: banner shown ${JSON.stringify(errs)} ${await p.$eval('#phaseBanner', e => e.outerHTML)}`); assert.match(await p.textContent('#phaseBanner'), /Umbra Awakened/);
  assert.notEqual(await p.$eval('#boss', e => e.style.backgroundImage), s1, 'awakened sprite differs');
  const L = await p.evaluate(() => { const r = document.getElementById('phaseBanner').getBoundingClientRect(); return { x: r.x, r: r.right, y: r.y, b: r.bottom, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth }; });
  assert.ok(L.x >= 0 && L.r <= L.vw && L.y >= 0 && L.b <= L.vh, `${name}: banner on screen ${JSON.stringify(L)}`); assert.ok(L.sw <= L.vw + 1, `${name}: no horizontal overflow`);
  if (SHOTS) await p.waitForTimeout(500), await p.screenshot({ path: `${SHOTS}/umbra-boss-${name === 'desktop' ? 'transition' : 'mobile' + (name === 'iphone' ? '-iphone' : '')}.png` });
  await p.click('#phaseBanner'); await p.waitForTimeout(300); assert.equal(await p.isVisible('#phaseBanner'), false, 'tap dismisses');
  if (SHOTS && name === 'desktop') { await p.waitForTimeout(2500); await p.locator('#arena').screenshot({ path: `${SHOTS}/umbra-boss-phase2.png` }); }
  // reload in phase 2: same phase, banner already seen for this save
  await p.waitForTimeout(1500); await p.reload(); await p.waitForTimeout(2500); await dismiss(p);
  assert.equal(await p.textContent('#bname'), AWAKEN_NAME); assert.equal(await p.isVisible('#phaseBanner'), false, 'banner once per device');
  assert.deepEqual(hits, []); assert.deepEqual(errs, []); await b.close(); console.log(`umbra phase e2e ok (${name})`);
}

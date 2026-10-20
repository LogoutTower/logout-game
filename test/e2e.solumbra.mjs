// Offline e2e: Solumbra's 3 evolution stages (staff, local unlock) + evolve banner once per stage; players never see it.
// Writes /workspace/solumbra-stage-*.png. Supabase blocked (never the live DB).
import assert from 'node:assert/strict'; import { chromium } from 'playwright-core'; import { createHash } from 'node:crypto'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js'); const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', SHOTS = process.env.SOL_SHOTS || '/workspace';
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` }), errs = [];
async function page(gm) { const ctx = await b.newContext({ viewport: { width: 900, height: 900 } }); const hits = await offline(ctx);
  if (gm) await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('solumbra-test').digest('hex')}'`) }); });
  await ctx.addInitScript(([h, gm]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', 'solumbra-test'); }, [TEAM_PASS_HASH, gm]);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Builder'); await p.click('#start');
  await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip'); return { ctx, p, hits }; }
{ const { ctx, p, hits } = await page(false); await p.waitForTimeout(2000); assert.equal(await p.locator('#pet .halo').count(), 0, 'players never get Solumbra'); assert.equal(await p.locator('#evolveBanner').count(), 0); assert.deepEqual(hits, []); await ctx.close(); }
const { ctx, p, hits } = await page(true);
await p.waitForSelector('#pet .halo'); await p.waitForSelector('#evolveBanner'); assert.equal(await p.getAttribute('#pet .halo', 'data-stage'), '1'); assert.match(await p.textContent('#evolveBanner'), /Solumbra Wisp/);
for (const [lv, n, name] of [[1, 1, 'Solumbra Wisp'], [35, 2, 'Solumbra Spirit'], [65, 3, 'Solumbra, Spirit of the First Dawn and Last Dusk']]) {
  if (lv > 1) { await p.evaluate(l => { const k = 'logout.v1.save', s = JSON.parse(localStorage.getItem(k)); s.heroes[0].level = l; localStorage.setItem(k, JSON.stringify(s)); }, lv); await p.reload(); await p.waitForSelector('#pet .halo'); await p.waitForSelector('#evolveBanner'); }
  assert.equal(await p.getAttribute('#pet .halo', 'data-stage'), String(n)); assert.match(await p.textContent('#evolveBanner'), new RegExp(name)); assert.equal(await p.locator('#pet .corona').count(), n === 3 ? 1 : 0);
  await p.waitForTimeout(700); await p.screenshot({ path: `${SHOTS}/solumbra-stage-${n}.png`, clip: { x: 0, y: 0, width: 900, height: 700 } });
}
// banner only the first time: reload at stage 3 → no banner
await p.reload(); await p.waitForSelector('#pet .halo'); await p.waitForTimeout(2500); assert.equal(await p.locator('#evolveBanner').count(), 0, 'no repeat banner');
// the staff card shows the current stage
await p.evaluate(() => document.querySelector('#lbSide .cardlink, #lb .cardlink[data-card="Builder"]')?.click()); await p.evaluate(() => [...document.querySelectorAll('.cardlink')].find(e => e.dataset.card === 'Builder')?.click());
await p.waitForSelector('#idCard[open] .idcard'); assert.match(await p.textContent('#idCardBody'), /First Dawn and Last Dusk/); assert.match(await p.textContent('#idCardBody'), /stage 3 of 3/);
await p.locator('#idCard').screenshot({ path: `${SHOTS}/solumbra-stage-3-idcard.png` });
assert.deepEqual(hits, []); assert.deepEqual(errs, []); await b.close(); console.log('solumbra e2e ok');

// Browser test for the staff Sanctum (local mode, Supabase blocked): node test/e2e.sanctum.mjs [url] [shotDir]
// Players never see the portal. Staff: Sanctum damage never reaches the shared boss/leaderboard, DPS meters run, gold/XP keep accruing,
// offline time accrues to the Sanctum, and returning to the tower resumes shared-boss damage.
import assert from 'node:assert'; import { chromium } from 'playwright-core'; import { createHash } from 'node:crypto'; import { TEAM_PASS_HASH } from '../config.js'; import { offline } from './e2e-offline.mjs';
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', SHOTS = process.argv[3] || '';
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` }), errs = [];
async function page(gm, hero) {
  const ctx = await b.newContext({ viewport: { width: 900, height: 900 } }); const hits = await offline(ctx);
  if (gm) await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('sanctum-test').digest('hex')}'`) }); });
  await ctx.addInitScript(([h, gm]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', 'sanctum-test'); }, [TEAM_PASS_HASH, gm]);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', hero); await p.click('#start');
  await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip'); return { ctx, p, hits };
}
const world = p => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('logout.v1.save')), w = JSON.parse(localStorage.getItem('logout.v1.world')); return { f: w.floor, d: w.dmg[s.heroes[0].name] || 0, gold: s.gold, xp: s.heroes[0].xp + s.heroes[0].level * 1e9, hist: JSON.stringify(w.hist || []).includes(s.heroes[0].name) }; });
{ const { ctx, p, hits } = await page(false, 'Tess'); await p.waitForTimeout(1500); assert.equal(await p.isVisible('#portalBtn'), false, 'players never see the portal'); assert.deepEqual(hits, []); await ctx.close(); }
{ const { ctx, p, hits } = await page(true, 'Builder'); await p.waitForTimeout(6000);
  assert(await p.isVisible('#portalBtn'), 'staff sees the portal'); assert.match(await p.textContent('#portalBtn'), /Sanctum/);
  if (SHOTS) await p.locator('#arena').screenshot({ path: `${SHOTS}/sanctum-toggle-tower.png` });
  await p.click('#portalBtn'); await p.waitForTimeout(1500); assert(await p.$eval('#arena', a => a.classList.contains('sanctum')), 'in the Sanctum'); assert.match(await p.textContent('#portalBtn'), /Tower/);
  const w0 = await world(p); await p.waitForTimeout(9000); const w1 = await world(p);
  assert.deepEqual([w1.f, w1.d], [w0.f, w0.d], 'Sanctum damage never reaches the shared boss'); assert(w1.gold > w0.gold && w1.xp > w0.xp, 'gold and XP keep accruing');
  const meter = await p.textContent('#dpsMeter'); assert.match(meter, /DPS/); const live = +(meter.match(/DPS\s+([\d.,]+)/)?.[1] || '0').replace(/,/g, ''); assert(live > 0, 'DPS meter running');
  assert(!(await p.textContent('#lb')).includes('Builder') || w0.d > 0, 'no new leaderboard entry from the Sanctum');
  await p.fill('#cLv', '80'); await p.dispatchEvent('#cLv', 'change'); await p.waitForTimeout(400); assert.match(await p.textContent('#bname'), /Lv 80/, 'adjustable construct');
  if (SHOTS) { await p.waitForTimeout(1200); await p.locator('#arena').screenshot({ path: `${SHOTS}/sanctum-arena.png` }); }
  // closed for 2 h while in the Sanctum: the away time accrues to the Sanctum, not the boss
  await p.evaluate(() => { const k = 'logout.v1.save', s = JSON.parse(localStorage.getItem(k)); s.lastTick -= 2 * 3600e3; localStorage.setItem(k, JSON.stringify(s)); }); const w2 = await world(p);
  await p.reload(); await p.waitForTimeout(3000); if (await p.isVisible('#away').catch(() => false)) await p.evaluate(() => document.getElementById('away').close());
  const w3 = await world(p); assert.deepEqual([w3.f, w3.d], [w2.f, w2.d], 'offline Sanctum time never hits the boss'); assert(w3.gold > w2.gold, 'offline gold accrued');
  assert(await p.$eval('#arena', a => a.classList.contains('sanctum')), 'still in the Sanctum after reopening');
  // back to the tower: shared-boss damage resumes
  await p.click('#portalBtn'); await p.waitForTimeout(8000); const w4 = await world(p); assert(w4.f > w3.f || w4.d > w3.d, 'tower damage resumes');
  assert.equal(await p.$eval('#arena', a => a.classList.contains('sanctum')), false); assert.deepEqual(hits, []); await ctx.close(); }
await b.close(); assert.deepEqual(errs, []); console.log('sanctum e2e ok');

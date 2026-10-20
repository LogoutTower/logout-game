// Offline e2e: the staff hero auto-equips The Root Key (Divine trinket); players never get it. Mobile ID card shows it.
// Writes /workspace/rootkey-*.png. Supabase blocked (never the live DB).
import assert from 'node:assert/strict'; import { chromium } from 'playwright-core'; import { createHash } from 'node:crypto'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js'); const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', SHOTS = process.env.RK_SHOTS || '/workspace';
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` }), errs = [];
async function page(gm, mobile) { const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 900, height: 900 } }); const hits = await offline(ctx);
  if (gm) await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('rootkey-test').digest('hex')}'`) }); });
  await ctx.addInitScript(([h, gm]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', 'rootkey-test'); }, [TEAM_PASS_HASH, gm]);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Builder'); await p.click('#start');
  await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip');
  if (gm) { await p.evaluate(() => { const k = 'logout.v1.save', s = JSON.parse(localStorage.getItem(k)); s.heroes[0].prevCls = s.heroes[0].cls; s.heroes[0].cls = 'GameMaster'; s.heroes[0].level = 40; localStorage.setItem(k, JSON.stringify(s)); }); await p.reload(); await p.waitForTimeout(2500); if (await p.isVisible('#tskip')) await p.click('#tskip'); }
  return { ctx, p, hits }; }
const trinketOf = p => p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0].equip?.trinket?.id || null);
{ const { ctx, p, hits } = await page(false); await p.waitForTimeout(1500); assert.notEqual(await trinketOf(p), 'gm-rootkey', 'players never get it'); assert.deepEqual(hits, []); await ctx.close(); }
{ const { ctx, p, hits } = await page(true); assert.equal(await trinketOf(p), 'gm-rootkey', 'auto-equipped');
  await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.getElementById('tabHero').click(); });
  await p.waitForTimeout(400); await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /^\s*Bag/.test(x.textContent) && x.offsetParent)?.click()); await p.waitForSelector('#bag[open] #eqrow .item');
  const card = p.locator('#eqrow .eqslot').nth(2); assert.match(await card.textContent(), /The Root Key/); assert.match(await card.textContent(), /Divine/);
  await p.locator('#bag').screenshot({ path: `${SHOTS}/rootkey-item.png` }); assert.deepEqual(hits, []); await ctx.close(); }
{ const { ctx, p, hits } = await page(true, true); assert.equal(await trinketOf(p), 'gm-rootkey');
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
  await p.evaluate(() => [...document.querySelectorAll('.cardlink')].find(e => e.dataset.card === 'Builder')?.click()); await p.waitForSelector('#idCard[open] .idcard');
  const t = await p.textContent('#idCardBody'); assert.match(t, /The Root Key/); assert.match(t, /Divine/); assert.match(t, /Every Door/);
  await p.screenshot({ path: `${SHOTS}/rootkey-idcard-mobile.png` }); assert.deepEqual(hits, []); await ctx.close(); }
assert.deepEqual(errs, []); await b.close(); console.log('rootkey e2e ok');

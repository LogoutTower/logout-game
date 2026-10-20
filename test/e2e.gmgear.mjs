// Offline e2e: staff gear tiers by forced level (test only): I (28), II (35), III (50), Divine Awakening (65) + one-time banner + mobile ID card.
// Writes /workspace/gmgear-tier*.png. Supabase blocked (never the live DB).
import assert from 'node:assert/strict'; import { chromium } from 'playwright-core'; import { createHash } from 'node:crypto'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js'); const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', SHOTS = process.env.GG_SHOTS || '/workspace';
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` }), errs = [];
async function page(gm, mobile, lv = 40) { const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 900, height: 900 } }); const hits = await offline(ctx);
  if (gm) await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('gmgear-test').digest('hex')}'`) }); });
  await ctx.addInitScript(([h, gm]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', 'gmgear-test'); }, [TEAM_PASS_HASH, gm]);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Builder'); await p.click('#start');
  await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip');
  if (gm) { await p.evaluate(LV => { const k = 'logout.v1.save', s = JSON.parse(localStorage.getItem(k)); s.heroes[0].prevCls = s.heroes[0].cls; s.heroes[0].cls = 'GameMaster'; s.heroes[0].level = LV; localStorage.setItem(k, JSON.stringify(s)); }, lv); await p.reload(); await p.waitForTimeout(2500); if (await p.isVisible('#tskip')) await p.click('#tskip'); }
  return { ctx, p, hits }; }
const gear = p => p.evaluate(() => { const e = JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0].equip; return [e.weapon?.tier, e.armor?.tier, e.weapon?.name]; });
const openBag = async p => { await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.getElementById('tabHero').click(); }); await p.waitForTimeout(400);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /^\s*Bag/.test(x.textContent) && x.offsetParent)?.click()); await p.waitForSelector('#bag[open] #eqrow .item'); };
for (const [lv, n, label] of [[28, 1, 'Tier I'], [35, 2, 'Tier II'], [50, 3, 'Tier III'], [65, 4, 'Awakened']]) {
  const { ctx, p, hits } = await page(true, false, lv); await p.waitForTimeout(500); const [wt, at, wn] = await gear(p); assert.equal(wt, n); assert.equal(at, n);
  if (n === 4) { assert.equal(wn, 'Eventide, Awakened'); } else assert.equal(wn, 'Eventide, the Final Shape');
  if (n > 1) { assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).gmTierSeen), n, 'banner marker'); }
  await openBag(p); const t = await p.locator('#eqrow').textContent(); assert(t.includes(label), `${label} on the item card`);
  await p.locator('#bag').screenshot({ path: `${SHOTS}/gmgear-tier${n}.png` });
  if (n === 4) { await p.reload(); await p.waitForTimeout(2500); assert.equal(await p.locator('#gearBanner').count(), 0, 'banner only once'); }
  assert.deepEqual(hits, []); await ctx.close(); }
{ const { ctx, p, hits } = await page(true, true, 65); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.evaluate(() => [...document.querySelectorAll('.cardlink')].find(e => e.dataset.card === 'Builder')?.click());
  await p.waitForSelector('#idCard[open] .idcard'); const t = await p.textContent('#idCardBody'); assert.match(t, /Eventide, Awakened/); assert.match(t, /Vesperveil, Awakened/); assert.match(t, /Awakened/);
  assert(!/Dusk Remembered|Gilded Unwriting/.test(t), 'no staff internals'); await p.screenshot({ path: `${SHOTS}/gmgear-tier4-idcard-mobile.png` }); assert.deepEqual(hits, []); await ctx.close(); }
{ const { ctx, p, hits } = await page(false); const [wt] = await gear(p); assert.equal(wt, undefined, 'players never get staff gear'); assert.deepEqual(hits, []); await ctx.close(); }
assert.deepEqual(errs, []); await b.close(); console.log('gm gear e2e ok');

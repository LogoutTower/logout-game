// Offline e2e: hero art v2 (64x64, FEATURES.heroV2). Flag 'gm': players keep v1, no origin picker. Flag forced on (test only): origin at creation,
// 128px (2x) battle hero that fits next to the v2 boss (192px phone / 288px desktop), one free origin change for an old hero, town NPCs,
// creator lineup, ID card, staff hero at the Divine form. Supabase blocked (never the live DB), fresh contexts. Screenshots: HV_SHOTS/heroes64-*.png.
import assert from 'node:assert/strict'; import { chromium } from 'playwright-core'; import { createHash } from 'node:crypto'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js'); const URL = process.argv[2] || 'http://127.0.0.1:8812/app.html', SHOTS = process.env.HV_SHOTS || '/workspace/shots';
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` }), errs = [];
async function open({ v2 = 'gm', gm = false, mobile = false } = {}) {
  const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1100, height: 900 } }); const hits = await offline(ctx);
  await ctx.route(/\/config\.js(\?|$)/, async r => { const res = await r.fetch(); let t = (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/heroV2:\s*'[a-z]+'/, `heroV2: '${v2}'`);
    if (gm) t = t.replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('herov2-test').digest('hex')}'`); r.fulfill({ response: res, body: t }); });
  await ctx.addInitScript(([h, gm]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', 'herov2-test'); }, [TEAM_PASS_HASH, gm]);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)'); return { ctx, p, hits }; }
const calm = p => p.addStyleTag({ content: '.notice,.toast,.banner-pop,.awaken,.cutscene,#awaken,.sysbanner{display:none!important}' }).then(() => p.waitForTimeout(300));
const start = async (p, name = 'Pixel') => { await p.fill('#hname', name); await p.click('#start'); await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip'); await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.waitForTimeout(500); };
const heroBox = p => p.evaluate(() => { const r = document.getElementById('hero').getBoundingClientRect(), b = document.getElementById('boss').getBoundingClientRect(); return { w: r.width, h: r.height, right: r.right, bossL: b.left, bossR: b.right, bossW: b.width, vw: innerWidth, v2: document.getElementById('hero').classList.contains('v2') }; });
const fits = (x, boss) => { assert(Math.abs(x.w - 128) < 0.6 && Math.abs(x.h - 128) < 0.6, `hero 128px (${x.w}x${x.h})`); assert(Math.abs(x.bossW - boss) < 0.6, `boss ${boss}px (${x.bossW})`); assert(x.right <= x.bossL + 0.5 && x.bossR <= x.vw + 0.5, `hero + boss fit (${JSON.stringify(x)})`); };
// 1) flag 'gm', normal player: v1 everywhere, no origin picker
{ const { ctx, p, hits } = await open({ mobile: true }); assert.equal(await p.$('#cpick [data-id="race-shade"]'), null, 'no race picker for players yet'); await start(p);
  const v1 = await heroBox(p); assert.equal(v1.v2, false); globalThis.v1 = v1; assert.deepEqual(hits, []); await ctx.close(); }
// 2) flag forced on (mobile): pick Female + Shade at creation, battle hero is v2 at the same on-screen size
{ const { ctx, p, hits } = await open({ v2: 'all', mobile: true }); await p.click('#cpick [data-id="body-f"]'); await p.click('#cpick [data-id="race-shade"]'); await p.click('#cpick [data-id="hs-long"]');
  assert.match(await p.textContent('#cpick'), /\+2% offline time/); await p.screenshot({ path: `${SHOTS}/heroes64-creator-mobile.png`, fullPage: true }); await start(p);
  const v2 = await heroBox(p); assert.equal(v2.v2, true); fits(v2, 192); console.log('mobile fit', JSON.stringify(v2));
  const s = await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0]); assert.equal(s.look.body, 'body-f'); assert.equal(s.look.race, 'race-shade'); assert.equal(s.originSet, true);
  await calm(p); await p.screenshot({ path: `${SHOTS}/heroes64-battle-mobile.png` }); assert.deepEqual(hits, []); await ctx.close(); }
// 3) old hero (no origin): one free change in the Wardrobe, then locked
{ const { ctx, p, hits } = await open({ v2: 'all' }); await start(p, 'Oldtimer');
  await p.evaluate(() => { const k = 'logout.v1.save', s = JSON.parse(localStorage.getItem(k)); delete s.heroes[0].originSet; delete s.heroes[0].look.body; delete s.heroes[0].look.race; localStorage.setItem(k, JSON.stringify(s)); });
  await p.reload(); await p.waitForSelector('#game:not(.hidden)'); await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
  const look0 = await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0].look); assert.equal(look0.body ?? 'body-m', 'body-m');
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /Wardrobe/.test(x.textContent) && x.offsetParent)?.click() || document.getElementById('tabHero')?.click()); await p.waitForTimeout(300);
  if (!(await p.isVisible('#wardrobe[open]'))) await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /Wardrobe/.test(x.textContent) && x.offsetParent)?.click());
  await p.waitForSelector('#worigin:not([hidden]) [data-id="race-beastkin"]'); await p.click('#worigin [data-id="race-beastkin"]'); await p.click('#worigin [data-id="body-f"]'); await p.click('#originLock');
  await p.waitForTimeout(200); assert(await p.isHidden('#worigin'), 'origin locked'); const h = await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0]);
  assert.equal(h.look.race, 'race-beastkin'); assert.equal(h.look.body, 'body-f'); assert.equal(h.originSet, true); assert.deepEqual(hits, []); await ctx.close(); }
// 4) staff hero, flag 'gm': v2 hooded coat with the Galaxy aura behind it
{ const { ctx, p, hits } = await open({ gm: true }); await start(p, 'Builder');
  await p.evaluate(() => { const k = 'logout.v1.save', s = JSON.parse(localStorage.getItem(k)); s.heroes[0].prevCls = s.heroes[0].cls; s.heroes[0].cls = 'GameMaster'; s.heroes[0].level = 60; Object.assign(s.heroes[0].look, { skin: 'skin-1', hairColor: 'hc-ink', hairStyle: 'gm-hood', outfitColor: 'gm-black', outfitStyle: 'gm-coat', trim: 'gm-gold', weapon: 'gm-katana', weaponColor: 'gm-edge', aura: 'gm-aura', title: 'gm-title', nameColor: 'gm-name' }); localStorage.setItem(k, JSON.stringify(s)); });
  await p.reload(); await p.waitForSelector('#game:not(.hidden)'); await p.waitForTimeout(1200); await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.waitForTimeout(600);
  assert.equal((await heroBox(p)).v2, true); const kb = await p.evaluate(() => { const e = document.getElementById('hero'), s = JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0]; return { on: e.classList.contains('keybob'), f1: /png/.test(e.style.getPropertyValue('--kf1')), key: s.equip?.trinket?.id }; });
  assert.deepEqual(kb, { on: true, f1: true, key: 'gm-rootkey' }, 'Root Key equipped: key layer with a 2-frame bob'); const gal = await p.evaluate(() => { const g = document.getElementById('galaxy'), h = document.getElementById('hero'); if (!g || g.style.display === 'none') return null; const a = g.getBoundingClientRect(), c = h.getBoundingClientRect(); return Math.abs((a.left + a.width / 2) - (c.left + c.width / 2)) + Math.abs((a.top + a.height / 2) - (c.top + c.height / 2)); });
  assert(gal !== null && gal < 12, `galaxy centred on the hero, within the 4px attack bob (${gal})`);
  await p.waitForTimeout(6000); await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await calm(p); await calm(p); await (await p.$('#arena'))?.screenshot({ path: `${SHOTS}/heroes64-gm-form3.png` }) ?? p.screenshot({ path: `${SHOTS}/heroes64-gm-form3.png` }); assert.deepEqual(hits, []); await ctx.close(); }

// 5) flag on, desktop: battle next to the 288px boss, creator lineup (2 bodies x 4 races), town NPCs, ID card
{ const { ctx, p, hits } = await open({ v2: 'all' });
  const lineup = await p.evaluate(() => [...document.querySelectorAll('#cpick [data-id^="race-"]')].map(b => b.dataset.id));
  const tiles = []; for (const body of ['body-m', 'body-f']) for (const race of lineup) { await p.click(`#cpick [data-id="${body}"]`); await p.click(`#cpick [data-id="${race}"]`); await p.waitForTimeout(60);
    tiles.push(await p.evaluate(() => getComputedStyle(document.getElementById('cpreview')).backgroundImage)); }
  await p.evaluate(t => { const d = document.createElement('div'); d.id = 'lineup'; d.style.cssText = 'position:fixed;left:0;top:0;width:max-content;z-index:999;background:#140826;display:grid;grid-template-columns:repeat(4,128px);gap:16px;padding:24px;align-content:start';
    d.innerHTML = t.map(u => `<div style="width:128px;height:128px;background:${u.replace(/"/g, "'")} center/128px no-repeat;image-rendering:pixelated;border:1px solid #3a2a5a;border-radius:8px"></div>`).join(''); document.body.append(d); }, tiles);
  await p.locator('#lineup').screenshot({ path: `${SHOTS}/heroes64-creator-lineup.png` }); await p.evaluate(() => document.getElementById('lineup').remove());
  await p.click('#cpick [data-id="body-m"]'); await p.click('#cpick [data-id="race-human"]'); await start(p, 'Pixel');
  const d = await heroBox(p); assert.equal(d.v2, true); fits(d, 288); console.log('desktop fit', JSON.stringify(d)); await calm(p); await p.screenshot({ path: `${SHOTS}/heroes64-battle-desktop.png` });
  await p.click('#tabTown'); await p.waitForTimeout(300); for (const k of ['sell', 'inn']) { const b = await p.$(`#townTabs [data-pane="${k}"]`); if (b && await b.isVisible()) await b.click(); await p.waitForTimeout(200);
    const npc = await p.$(k === 'sell' ? '#merchant' : '#innkeeper'); const r = await npc.boundingBox(); assert(r && Math.abs(r.width - 128) < 0.6, `npc 128px (${r?.width})`); assert(await npc.evaluate(e => e.classList.contains('v2') && /png/.test(e.style.backgroundImage)));
    await p.locator(`section.pane[data-pane="${k}"]`).screenshot({ path: `${SHOTS}/heroes64-town-${k}.png` }); }
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.waitForTimeout(300); await p.evaluate(() => document.querySelector('[data-card="Pixel"]')?.click()); await p.waitForSelector('#idCard[open] .idspr'); await p.waitForTimeout(700);
  const sz = await p.$eval('#idCard .idspr', e => e.getBoundingClientRect().width); assert(Math.abs(sz - 64) < 0.6, `ID card sprite 64px (${sz})`); await p.locator('#idCard').screenshot({ path: `${SHOTS}/heroes64-idcard.png` });
  assert.deepEqual(hits, []); await ctx.close(); }
await b.close(); assert.deepEqual(errs, [], 'no JS errors'); console.log('e2e hero64 passed');

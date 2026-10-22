// Offline mobile e2e (Chromium mobile emulation: iPhone 390x844 and Pixel 7, touch): bag on a phone (selected item card and Equip in view
// without scrolling, equip via tap with the same rules as desktop incl. one-Unique), tappable gear slots, tap-to-see tooltips.
// Normal hero and a staff hero with a full bag. Supabase blocked. Writes $MT_SHOTS (default /tmp/mobile-tap).
import assert from 'node:assert/strict'; import { chromium, devices } from 'playwright-core'; import { createHash } from 'node:crypto'; import { mkdirSync } from 'node:fs'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js'); const { rollItem, RARITIES } = await import('../js/loot.js'); const { rng } = await import('../js/floors.js');
const UW = RARITIES.map(x => x.id === 'unique' ? 1 : 0), U = {}; for (let sd = 1; sd < 500 && !(U.weapon && U.armor); sd++) { const it = rollItem(rng(sd), 3, 'fire', sd, UW); if (it.rarity === 'unique' && !U[it.slot] && it.drawback?.id !== 'jealous') U[it.slot] = it; }
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', OUT = process.env.MT_SHOTS || '/tmp/mobile-tap'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` }), errs = [];
const { userAgent: _u, defaultBrowserType: _d, ...pixel } = devices['Pixel 7'];
const DEV = { iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, android: pixel, desktop: { viewport: { width: 1100, height: 900 } } };
const mk = (slot, i, rarity = 'rare', extra = {}) => ({ id: `t-${slot}-${i}`, name: `Test ${slot} ${i}`, slot, rarity, floor: 3, element: 'fire', stats: { dps: 5 + i }, ...extra });
async function page(dev, gm) { const ctx = await b.newContext(DEV[dev]); const hits = await offline(ctx);
  const pass = 'mt-' + Math.random().toString(36).slice(2);
  if (gm) await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update(pass).digest('hex')}'`) }); });
  await ctx.addInitScript(([h, gm, pass]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', pass); }, [TEAM_PASS_HASH, gm, pass]);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Tester'); await p.click('#start');
  await p.waitForTimeout(1500); await p.evaluate(() => document.querySelectorAll('#cutscene .cs-skip').forEach(x => x.click())); if (await p.isVisible('#tskip')) await p.click('#tskip');
  await p.evaluate(([gm, U]) => { const k = 'logout.v1.save', s = JSON.parse(localStorage.getItem(k)); const h = s.heroes[0]; if (gm) { h.prevCls = h.cls; h.cls = 'GameMaster'; h.level = 40; }
    const mk = (slot, i, rarity = 'rare', extra = {}) => ({ id: `t-${slot}-${i}`, name: `Test ${slot} ${i}`, slot, rarity, floor: 3, element: 'fire', stats: { dps: 5 + i }, ...extra });
    s.inv = []; for (let i = 0; i < (gm ? 50 : 24); i++) s.inv.push(mk(['weapon', 'armor', 'trinket'][i % 3], i));
    s.inv.push(U.weapon, U.armor);
    s.tutorialSeen = true; s.cutscenes = ['intro', ...(s.cutscenes || [])]; localStorage.setItem(k, JSON.stringify(s)); }, [gm, U]);
  await p.reload(); await p.waitForTimeout(2200); await p.evaluate(() => document.querySelectorAll('#cutscene .cs-skip').forEach(x => x.click())); if (await p.isVisible('#tskip')) await p.click('#tskip');
  return { ctx, p, hits }; }
const openBag = async p => { await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.getElementById('tabHero').click(); }); await p.waitForTimeout(400);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /^\s*Bag/.test(x.textContent) && x.offsetParent)?.click()); await p.waitForSelector('#bag[open] #bagGrid .cell'); };
const tap = async (p, sel, mobile) => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded(); mobile ? await l.tap() : await l.click(); };
const inView = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  return r.top >= 0 && r.bottom <= innerHeight && (document.elementFromPoint(x, y) === e || e.contains(document.elementFromPoint(x, y))); }, sel);
const save = p => p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')));
async function flow(dev, gm) { const mobile = dev !== 'desktop', tag = `${dev}${gm ? '-staff' : ''}`, { ctx, p, hits } = await page(dev, gm); await openBag(p);
  const n = await p.locator('#bagGrid .cell').count(); assert.ok(n >= 26, `${tag}: bag has items (${n})`);
  // pick a late cell (far down the grid) to make sure its card still lands in view
  const idx = (await save(p)).inv.findIndex(x => x.name === 'Test weapon 21');
  await tap(p, `#bagGrid .cell[data-i="${idx}"]`, mobile); await p.waitForTimeout(400);
  assert.ok(await inView(p, '#bEquip'), `${tag}: Equip visible and tappable without scrolling`); assert.ok(await inView(p, '#bagDetail .item'), `${tag}: item card in view`);
  if (mobile && !gm) await p.screenshot({ path: `${OUT}/${dev}-bag-selected.png` });
  await p.locator('#bEquip').tap?.call ? (mobile ? p.tap('#bEquip') : p.click('#bEquip')) : null; await p.waitForTimeout(400);
  let s = await save(p); assert.equal(s.heroes[0].equip.weapon?.name, 'Test weapon 21', `${tag}: equipped by tap (shared equipItem, same as desktop)`);
  // one-Unique rule, same code path as desktop: equipping a Unique armor sends the Unique weapon back to the bag
  if (!gm) { for (const nm of [U.weapon.name, U.armor.name]) { const i = s.inv.findIndex(x => x.name === nm); assert.ok(i >= 0, nm); await tap(p, `#bagGrid .cell[data-i="${i}"]`, mobile); await p.waitForTimeout(300);
      assert.ok(await inView(p, '#bEquip'), `${tag}: Equip in view`); mobile ? await p.tap('#bEquip') : await p.click('#bEquip'); await p.waitForTimeout(400); s = await save(p); }
    assert.equal(s.heroes[0].equip.armor?.name, U.armor.name, `${tag}: unique armor on`); assert.notEqual(s.heroes[0].equip.weapon?.rarity, 'unique', `${tag}: one-Unique rule`); assert.ok(s.inv.some(x => x.name === U.weapon.name)); }
  else { assert.ok(s.inv.length >= 50, `${tag}: replaced weapon went back to the bag`); }
  // gear slot tap shows its card
  await tap(p, '#eqrow button.eqslot[data-slot="armor"]', mobile); await p.waitForTimeout(400);
  assert.match(await p.textContent('#bagDetail'), /equipped · armor/, `${tag}: gear slot card`); assert.ok(await inView(p, '#bagDetail .item'), `${tag}: gear card in view`);
  if (mobile) await p.screenshot({ path: `${OUT}/${dev}${gm ? '-staff' : ''}-gear-tap.png` });
  // tooltip popup on a bag cell long-press (cells act on tap) and on a buff/non-button title
  if (mobile) { const c = p.locator('#bagGrid .cell').first(); await c.scrollIntoViewIfNeeded(); const bb = await c.boundingBox();
    const cdp = await ctx.newCDPSession(p); const pt = [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt }); await p.waitForTimeout(700); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(200);
    assert.ok(await p.isVisible('#tip'), `${tag}: long-press shows the cell tip`); assert.equal(await p.textContent('#tip'), await c.getAttribute('title'));
    if (!gm) await p.screenshot({ path: `${OUT}/${dev}-tip-longpress.png` });
    await p.tap('#bag h2'); await p.waitForTimeout(150); assert.ok(!(await p.isVisible('#tip')), `${tag}: tap elsewhere hides`);
    await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.waitForTimeout(300);
    const t = await p.$('#hhp[title]'); if (t) { await p.tap('#hhp'); await p.waitForTimeout(200); assert.ok(await p.isVisible('#tip'), `${tag}: tap shows HP tip`); assert.match(await p.textContent('#tip'), /^HP /);
      if (!gm) await p.screenshot({ path: `${OUT}/${dev}-tip-hp.png` }); await p.tap('#boss', { force: true }).catch(() => {}); await p.waitForTimeout(150); assert.ok(!(await p.isVisible('#tip'))); } }
  assert.deepEqual(hits, [], `${tag}: no Supabase`); await ctx.close(); }
for (const dev of ['iphone', 'android', 'desktop']) for (const gm of [false, true]) await flow(dev, gm);
assert.deepEqual(errs, []); await b.close(); console.log('mobile tap e2e ok');

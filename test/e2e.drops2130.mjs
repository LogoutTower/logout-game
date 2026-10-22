// Offline e2e for the Floors 21-30 signature drops: local mode only (Supabase blocked), fresh browser contexts.
// Regular player on F20: no arc 3 signatures anywhere. Staff (arc 3 preview): signature items roll, show custom icon + flavor in the Bag,
// and equipped weapon/armor change the hero sprite. Screenshots to DROPS_SHOTS (default /tmp/drops-21-30).
import assert from 'node:assert/strict'; import { createHash } from 'node:crypto'; import { mkdirSync } from 'node:fs'; import { chromium } from 'playwright-core'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js');
const URL = process.argv[2] || 'http://127.0.0.1:8840/app.html', OUT = process.env.DROPS_SHOTS || '/tmp/drops-21-30', CHROME = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: CHROME });
async function page(dev, gm, floor) {
  const ctx = await b.newContext({ ...dev }); const hits = await offline(ctx);
  await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('drops-test').digest('hex')}'`) }); });
  await ctx.addInitScript(([h, gm, floor]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', 'drops-test');
    if (!localStorage.getItem('d.seeded')) { localStorage.setItem('d.seeded', '1'); localStorage.setItem('logout.v1.world', JSON.stringify({ floor, hp: 9e15, dmg: {}, marks: {}, t: Date.now() })); } }, [TEAM_PASS_HASH, gm, floor]);
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now());
  await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Tess'); await p.click('#start'); await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip');
  await p.waitForTimeout(2500); await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); }); await p.waitForTimeout(300);
  return { ctx, p, errs, hits };
}
const sigs = p => p.evaluate(async () => { const L = await import('./js/loot.js'); return L.signatureList().filter(s => s.floor > 20).map(s => s.name); });
{ const { ctx, p, errs, hits } = await page({ viewport: { width: 1280, height: 900 } }, false, 20);
  assert.deepEqual(await sigs(p), [], 'locked for regular players'); assert.deepEqual(errs, []); assert.deepEqual(hits, []); await ctx.close(); console.log('regular F20: no arc 3 signatures ok'); }
async function staff(dev, tag) {
  const { ctx, p, errs, hits } = await page(dev, true, 25);
  assert.equal((await sigs(p)).length, 10, 'staff preview: 10 arc 3 signatures');
  await p.evaluate(async () => { const L = await import('./js/loot.js'); const s = JSON.parse(localStorage.getItem('logout.v1.save'));
    const mk = (f, slot, rarity) => L.signature(() => 0.1, f, { id: 'sig' + f, slot, rarity, name: 'x', floor: f, element: 'storm', stats: slot === 'weapon' ? { dps: 120 } : slot === 'armor' ? { dpsPct: 12 } : { goldPct: 10 } });
    s.inv = [mk(30, 'weapon', 'legendary'), mk(29, 'armor', 'epic'), mk(25, 'trinket', 'legendary'), mk(23, 'weapon', 'epic'), mk(26, 'armor', 'epic'), mk(21, 'trinket', 'epic'), mk(22, 'weapon', 'epic'), mk(27, 'weapon', 'epic'), mk(24, 'armor', 'epic'), mk(28, 'trinket', 'epic')];
    localStorage.setItem('logout.v1.save', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(3000); await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); });
  const before = await p.evaluate(() => getComputedStyle(document.getElementById('hero')).backgroundImage);
  for (const n of ["Archive-Heart Glaive", "Shepherd's Lightless Shroud", 'Tide-Ring of Six Eyes']) {
    await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.click('#tabbar [data-tab="hero"]'); await p.waitForTimeout(200); await p.click('dialog[open] .herotabs [data-sub="bag"]'); await p.waitForSelector('#bag[open]');
    const i = await p.evaluate(n => { const s = JSON.parse(localStorage.getItem('logout.v1.save')); return s.inv.findIndex(x => x.name === n); }, n); assert(i >= 0, n);
    await p.click(`#bagGrid button.cell[data-i="${i}"]`); await p.waitForTimeout(200);
    if (n.startsWith('Archive')) { const d = await p.textContent('#bagDetail'); assert.match(d, /Every floor it ever drowned/, 'flavor shown'); await p.screenshot({ path: `${OUT}/bag-detail-${tag}.png` }); }
    await p.$eval('#bEquip', e => e.click()); /* layout of the equip button is the mobile-tap task's */ await p.waitForTimeout(300); }
  await p.screenshot({ path: `${OUT}/bag-equipped-${tag}.png` });
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.waitForTimeout(500);
  const after = await p.evaluate(() => getComputedStyle(document.getElementById('hero')).backgroundImage); assert.notEqual(after, before, 'equipped signature gear changes the hero');
  await p.screenshot({ path: `${OUT}/hero-equipped-${tag}.png` });
  const hb = await p.$('#hero'); if (hb) await hb.screenshot({ path: `${OUT}/hero-only-${tag}.png` });
  assert.deepEqual(errs, []); assert.deepEqual(hits, []); await ctx.close(); console.log(`staff ${tag}: icons, flavor, equip look ok`); }
await staff({ viewport: { width: 1280, height: 900 } }, 'desktop');
await staff({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'mobile');
await b.close(); console.log('drops 21-30 e2e passed');

// Offline e2e for arena background art (FEATURES.arenaBg = 'all'): local mode only (Supabase blocked), fresh browser contexts.
// Checks: non-staff players get arc art too (live for everyone); staff gets arc art (arc 1 for Floors 1-10, arc 2 for 11-20) at a whole-number scale (3x desktop, 2x phones),
// pixelated, old floor strip/props off. Writes screenshots to ABG_SHOTS (default /tmp/abg).
import assert from 'node:assert/strict'; import { createHash } from 'node:crypto'; import { chromium, devices } from 'playwright-core'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js');
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', OUT = process.env.ABG_SHOTS || '/tmp/abg', CHROME = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const FLOORS = (process.env.ABG_FLOORS || '1,10,15,20').split(',').map(Number);
const b = await chromium.launch({ executablePath: CHROME });
async function page(dev, gm, floor) {
  const ctx = await b.newContext({ ...dev }); await offline(ctx);
  await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('arenabg-test').digest('hex')}'`) }); });
  await ctx.addInitScript(([h, gm, floor]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', 'arenabg-test');
    if (!localStorage.getItem('abg.seeded')) { localStorage.setItem('abg.seeded', '1'); localStorage.setItem('logout.v1.world', JSON.stringify({ floor, hp: 9e15, dmg: {}, marks: {}, t: Date.now() })); } }, [TEAM_PASS_HASH, gm, floor]);
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now());
  await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Tess'); await p.click('#start'); await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip');
  await p.waitForTimeout(2500); await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); }); await p.waitForTimeout(400);
  return { ctx, p, errs };
}
const info = p => p.evaluate(() => { const a = document.getElementById('arena'), cs = getComputedStyle(a), af = getComputedStyle(a, '::after'), t = a.querySelector('.torch');
  return { abg: a.classList.contains('abg'), bgVar: a.style.getPropertyValue('--a-bg'), img: cs.backgroundImage, size: cs.backgroundSize, ir: cs.imageRendering, strip: af.display, torch: t ? getComputedStyle(t).display : 'none', vw: innerWidth }; });
const RUNS = [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', devices['iPhone 13']]];
{ const { ctx, p, errs } = await page(RUNS[0][1], false, 1); const i = await info(p); assert.equal(i.abg, true, 'non-staff: arena art live for everyone'); assert.match(i.img, /arc-1\.png/); assert.deepEqual(errs, []); await ctx.close(); console.log('non-staff ok'); }
for (const [name, dev] of RUNS) for (const f of FLOORS) {
  const { ctx, p, errs } = await page(dev, true, f); const onFloor = () => p.evaluate(n => new RegExp(`· Floor ${n} / `).test(document.getElementById('floor')?.textContent || ''), f);
  const reseed = async k => { await p.evaluate(n => localStorage.setItem('logout.v1.world', JSON.stringify({ floor: n, hp: 9e15, dmg: {}, marks: {}, t: Date.now() })), f); await p.reload(); await p.waitForTimeout(1200 + 300 * k); await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); };
  const tag = `F${String(f).padStart(2, '0')}-${name}`; let good = false; // the staff hero can clear a seeded floor mid-shot on phones: retake until the HUD shows the same floor before and after
  for (let k = 0; k < 6 && !good; k++) { if (k || !(await onFloor())) await reseed(k); if (!(await onFloor())) continue; await p.addStyleTag({ content: '#boss.hit,.hit{filter:none!important}' }); // screenshots only: no mid-hit white flash
    await p.screenshot({ path: `${OUT}/arena-${tag}.png`, animations: 'disabled' }); await p.locator('#arena').screenshot({ path: `${OUT}/arena-only-${tag}.png`, animations: 'disabled' }); good = await onFloor(); }
  assert.ok(good, `${name}: stable shot of Floor ${f}`);
  const i = await info(p), arc = f <= 10 ? 1 : 2, s = i.vw <= 640 ? 2 : 3;
  assert.equal(i.abg, true, `${name} F${f}: art on for staff`); assert.match(i.bgVar, new RegExp(`arc-${arc}\\.png`)); assert.match(i.img, new RegExp(`arc-${arc}\\.png`));
  assert.ok(i.size.includes(`${480 * s}px ${96 * s}px`), `${name} F${f}: integer ${s}x (${i.size})`); assert.equal(i.ir, 'pixelated'); assert.equal(i.strip, 'none', 'old floor strip off'); assert.equal(i.torch, 'none', 'baked props off');
  assert.deepEqual(errs, []); const hud = await p.evaluate(() => [document.getElementById('floor')?.textContent, document.getElementById('bname')?.textContent].join(' | ')); await ctx.close(); console.log(`${name} F${f} ok (${s}x) ${hud}`);
}
await b.close(); console.log('arena bg e2e ok');

// Offline e2e for the arc 3 preview (FEATURES.arc3 = 'gm'): local mode only (Supabase blocked), fresh browser contexts.
// Regular player seeded on Floor 25: classic generated boss, no arc 3 art. Staff: Wisp's boss, Tidewire Depths scene (arc-3.png, bubbles), mech chip.
// Writes screenshots to ARC3_SHOTS (default /tmp/arc3).
import assert from 'node:assert/strict'; import { createHash } from 'node:crypto'; import { mkdirSync } from 'node:fs'; import { chromium, devices } from 'playwright-core'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js'); const { floorBossHp } = await import('../js/floors.js');
const HPF = { 25: 0.9, 30: 0.35 }, seedHp = f => HPF[f] ? Math.round(floorBossHp(f) * HPF[f]) : 9e15; // F25 tide in (layer 5), F30 undertow pulling (below 50%)
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', OUT = process.env.ARC3_SHOTS || '/tmp/arc3', CHROME = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: CHROME });
async function page(dev, gm, floor) {
  const ctx = await b.newContext({ ...dev }); await offline(ctx);
  await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('arc3-test').digest('hex')}'`) }); });
  await ctx.addInitScript(([h, gm, floor, hp]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', 'arc3-test');
    if (!localStorage.getItem('a3.seeded')) { localStorage.setItem('a3.seeded', '1'); localStorage.setItem('logout.v1.world', JSON.stringify({ floor, hp, dmg: {}, marks: {}, t: Date.now() })); } }, [TEAM_PASS_HASH, gm, floor, seedHp(floor)]);
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now());
  await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Tess'); await p.click('#start'); await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip');
  await p.waitForTimeout(2500); await p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); }); await p.waitForTimeout(400);
  return { ctx, p, errs };
}
const info = p => p.evaluate(() => { const a = document.getElementById('arena'), cs = getComputedStyle(a);
  return { arc: a.dataset.arc, particles: a.dataset.particles, img: cs.backgroundImage, size: cs.backgroundSize, name: document.getElementById('bname')?.textContent || '', buffs: document.body.innerText, finale: a.classList.contains('finale'), vw: innerWidth }; });
// regular player: locked while the shared floor is <= 20 (server floor = the seeded world floor in local mode)
{ const { ctx, p, errs } = await page({ viewport: { width: 1280, height: 900 } }, false, 20); const i = await info(p);
  assert.doesNotMatch(i.img, /arc-3\.png/); assert.notEqual(i.particles, 'bubbles'); assert.doesNotMatch(i.buffs, /Tidewire|unlocked/); assert.match(await p.textContent('#floorTxt'), /\/20/); assert.deepEqual(errs, []); await ctx.close(); console.log('non-staff F20: locked ok'); }
// regular player once the shared floor is past 20: unlocked for everyone + one-time notice; cap 30
{ const { ctx, p, errs } = await page({ viewport: { width: 1280, height: 900 } }, false, 21); const i = await info(p);
  assert.match(i.name, /Lantern Angler/); assert.match(i.img, /arc-3\.png/); assert.equal(i.particles, 'bubbles'); assert.match(await p.evaluate(() => document.body.textContent), /Floors 21–30 unlocked: Tidewire Depths/); assert.match(await p.textContent('#floorTxt'), /21\/30/);
  assert.equal(await p.evaluate(() => localStorage.getItem('logout.v1.arc3Ann')), '1'); await p.screenshot({ path: `${OUT}/unlock-notice-desktop.png` });
  await p.evaluate(() => localStorage.setItem('logout.v1.world', JSON.stringify({ floor: 1, hp: 86000, dmg: {}, marks: {}, t: Date.now() }))); await p.reload(); await p.waitForTimeout(2500); // tower reset -> locked again, notice re-armed
  const j = await info(p); assert.doesNotMatch(j.img, /arc-3\.png/); assert.equal(await p.evaluate(() => localStorage.getItem('logout.v1.arc3Ann')), null); assert.deepEqual(errs, []); await ctx.close(); console.log('non-staff F21: unlocked + notice, reset relocks ok'); }
const RUNS = [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', devices['iPhone 13']]];
for (const [name, dev] of RUNS) for (const [f, boss, mech] of [[25, 'The Lumen Jelly Oracle', 'Tide'], [30, 'The Tidewire Leviathan', 'Undertow']]) {
  const { ctx, p, errs } = await page(dev, true, f); const onFloor = () => p.evaluate(n => new RegExp(`· Floor ${n} / `).test(document.getElementById('floor')?.textContent || ''), f);
  const reseed = async k => { await p.evaluate(([n, hp]) => localStorage.setItem('logout.v1.world', JSON.stringify({ floor: n, hp, dmg: {}, marks: {}, t: Date.now() })), [f, seedHp(f)]); await p.reload(); await p.waitForTimeout(1200 + 300 * k); await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); };
  let good = false; for (let k = 0; k < 6 && !good; k++) { if (k || !(await onFloor())) await reseed(k); if (!(await onFloor())) continue; await p.addStyleTag({ content: '#boss.hit,.hit{filter:none!important}' }); await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/battle-F${f}-${name}.png`, animations: 'disabled' }); good = await onFloor(); }
  assert.ok(good, `${name}: stable shot of Floor ${f}`); const i = await info(p), s = i.vw <= 640 ? 2 : 3;
  assert.match(i.name, new RegExp(boss)); assert.equal(i.arc, '3'); assert.equal(i.particles, 'bubbles'); assert.match(i.img, /arc-3\.png/); assert.ok(i.size.includes(`${480 * s}px ${96 * s}px`), i.size);
  assert.match(i.buffs, new RegExp(mech)); assert.equal(i.finale, f === 30); assert.deepEqual(errs, []); await ctx.close(); console.log(`${name} F${f} ok`);
}
await b.close(); console.log('arc 3 e2e ok');

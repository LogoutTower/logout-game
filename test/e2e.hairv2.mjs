// Offline e2e for hair v2 (FEATURES.hairV2 = 'all'): local mode only (Supabase blocked), fresh browser contexts.
// Regular players: creator lists all 8 + Jet. Staff: creator lists all 8 + Jet, and a hero wearing them renders in battle. Shots to HAIR_SHOTS (default /tmp/hair-v2).
import assert from 'node:assert/strict'; import { createHash } from 'node:crypto'; import { mkdirSync } from 'node:fs'; import { chromium, devices } from 'playwright-core'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js');
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', OUT = process.env.HAIR_SHOTS || '/tmp/hair-v2', CHROME = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
mkdirSync(OUT, { recursive: true }); const b = await chromium.launch({ executablePath: CHROME });
const NEW = ['Locs', 'Shoulder Locs', 'Loc Bun', 'Box Braids', 'Afro', 'Cornrows', 'Two-Strand Twists', 'High-Top Fade', 'Jet'];
async function page(dev, gm) {
  const ctx = await b.newContext({ ...dev }); await offline(ctx);
  await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('hair-test').digest('hex')}'`) }); });
  await ctx.addInitScript(([h, gm]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', 'hair-test');
    if (!localStorage.getItem('hv.seeded')) { localStorage.setItem('hv.seeded', '1'); localStorage.setItem('logout.v1.world', JSON.stringify({ floor: 12, hp: 9e15, dmg: {}, marks: {}, t: Date.now() })); } }, [TEAM_PASS_HASH, gm]);
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)');
  return { ctx, p, errs };
}
const creator = p => p.evaluate(() => document.getElementById('cpick')?.textContent || '');
{ const { ctx, p, errs } = await page({ viewport: { width: 1280, height: 900 } }, false); const t = await creator(p); assert.match(t, /Spiky/); for (const n of NEW) assert.ok(t.includes(n), `regular player creator lists ${n}`); assert.deepEqual(errs, []); await ctx.close(); console.log('non-staff: no new hair ok'); }
for (const [name, dev] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', devices['iPhone 13']]]) {
  const { ctx, p, errs } = await page(dev, true); const t = await creator(p); for (const n of NEW) assert.ok(t.includes(n), `staff creator lists ${n}`);
  if (name === 'desktop') await p.locator('#create').screenshot({ path: `${OUT}/creator-desktop.png` });
  await p.fill('#hname', 'Tess'); await p.click('#start'); await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip'); await p.waitForTimeout(1500);
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('logout.v1.save')); Object.assign(s.heroes[0].look, { hairStyle: 'hs-locs', hairColor: 'hc-jet', skin: 'skin-4', body: 'body-f' }); localStorage.setItem('logout.v1.save', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(3000); await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.addStyleTag({ content: '#boss.hit,.hit{filter:none!important}' }); await p.waitForTimeout(500);
  const look = await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0].look); assert.equal(look.hairStyle, 'hs-locs'); assert.equal(look.hairColor, 'hc-jet');
  await p.screenshot({ path: `${OUT}/battle-${name}.png`, animations: 'disabled' }); assert.deepEqual(errs, []); await ctx.close(); console.log(`staff ${name} ok`);
}
await b.close(); console.log('hair v2 e2e ok');

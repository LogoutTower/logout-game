// Browser test for Floor Zero (local mode, Supabase blocked): node test/e2e.floorzero.mjs [url] [shot.png]
// Staff guild panel: zero banner next to [ZERO], prestige level/XP bar, "Prestige only, no rewards", exclusive sigil in the picker. Players never see it.
import assert from 'node:assert'; import { chromium } from 'playwright-core'; import { createHash } from 'node:crypto'; import { TEAM_PASS_HASH } from '../config.js'; import { offline } from './e2e-offline.mjs';
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', SHOT = process.argv[3] || '';
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` }), errs = [];
async function page(gm, hero) {
  const ctx = await b.newContext({ viewport: { width: 760, height: 980 } }); const hits = await offline(ctx);
  if (gm) await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('floor-zero-test').digest('hex')}'`) }); });
  await ctx.addInitScript(([h, gm]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', 'floor-zero-test'); }, [TEAM_PASS_HASH, gm]);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', hero); await p.click('#start');
  await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip'); return { ctx, p, hits };
}
const openGuild = async p => { await p.click('#tabGuild'); await p.waitForTimeout(600); };
const tab = async (p, t) => { await p.click(`#guildBody [data-tab="${t}"]`); await p.waitForTimeout(250); };
// ---- player guild: the zero sigil is never offered
{ const { ctx, p, hits } = await page(false, 'Tess'); await openGuild(p); await p.fill('#gName', 'Lantern Watch'); await p.fill('#gTag', 'LW'); await p.click('#gCreate'); await p.waitForTimeout(700);
  await tab(p, 'banner'); assert.equal(await p.$$eval('#guildBody [data-sig="zero"]', x => x.length), 0, 'players never see the Floor Zero sigil');
  assert.equal(await p.$$eval('#guildBody [data-h="#050505"], #guildBody [data-h="#e8b923"]', x => x.length), 0, 'nor its colours'); assert.deepEqual(hits, []); await ctx.close(); }
// ---- staff guild
{ const { ctx, p, hits } = await page(true, 'Warden'); await openGuild(p); await p.click('#gCreate'); await p.waitForTimeout(700);
  await p.evaluate(() => { const g = JSON.parse(localStorage.getItem('logout.v1.guilds')), sg = g.guilds.find(x => x.is_staff), t = new Date().toISOString();
    sg.xp = 1450000; g.members.find(m => m.name === 'Warden').contrib = 980000;
    g.members.push({ name: 'Ash', guild_id: sg.id, role: 'officer', contrib: 310000, last_active: t }, { name: 'Wren', guild_id: sg.id, role: 'member', contrib: 160000, last_active: t }); localStorage.setItem('logout.v1.guilds', JSON.stringify(g)); });
  await p.keyboard.press('Escape'); await p.click('#tabBattle'); await openGuild(p);
  const ui = await p.evaluate(() => ({ head: document.querySelector('#guildBody .ghead').innerText, badge: getComputedStyle(document.querySelector('#guildBody .ghead .gbadge')).backgroundImage, body: document.getElementById('guildBody').innerText, xpbar: !!document.querySelector('#guildBody .gxp.prestige') }));
  assert.match(ui.head, /\[ZERO\]/); assert.match(ui.head, /Prestige Lv 9/); assert.match(ui.head, /Prestige only, no rewards/); assert.ok(ui.xpbar, 'prestige XP bar');
  assert.match(decodeURIComponent(ui.badge), /#050505/, 'zero banner next to [ZERO]'); assert.match(ui.body, /no bonus/);
  assert.deepEqual(await p.$$eval('#guildBody .gtabs [data-tab]', x => x.map(e => e.dataset.tab)), ['overview', 'members', 'banner', 'chat']);
  if (SHOT) await p.screenshot({ path: SHOT });
  await tab(p, 'banner'); assert.equal(await p.$$eval('#guildBody [data-sig="zero"]', x => x.length), 1, 'exclusive sigil offered to the staff guild');
  await p.click('#guildBody [data-sig="moon"]'); await p.click('#gBan'); await p.waitForTimeout(300); await p.click('#guildBody [data-sig="zero"]'); await p.click('#gBan'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.guilds')).guilds.find(x => x.is_staff).banner.sigil), 'zero');
  assert.deepEqual(hits, []); await ctx.close(); }
await b.close(); assert.deepEqual(errs, []); console.log('floor zero e2e ok');

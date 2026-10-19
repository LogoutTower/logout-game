// Browser test for the staff guild (local mode, Supabase blocked): node test/e2e.staffguild.mjs [url] [shotDir]
// GM: founding form enabled and pre-filled with the reserved staff name; founding makes a private staff guild (mark, note, no Bank/Quests, off the board).
// Player: the reserved name is refused in the form.
import assert from 'node:assert'; import { chromium } from 'playwright-core'; import { createHash } from 'node:crypto'; import { TEAM_PASS_HASH } from '../config.js'; import { offline } from './e2e-offline.mjs';
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', SHOT = process.argv[3] || '';
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` }), errs = [];
async function page(gm, hero) {
  const ctx = await b.newContext({ viewport: { width: 760, height: 900 } }); const hits = await offline(ctx);
  if (gm) await ctx.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'").replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('staff-guild-test').digest('hex')}'`) }); });
  await ctx.addInitScript(([h, gm]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', 'staff-guild-test'); }, [TEAM_PASS_HASH, gm]);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', hero); await p.click('#start');
  await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip'); return { ctx, p, hits };
}
const openGuild = async p => { await p.click('#tabGuild'); await p.waitForTimeout(600); };
// ---- player: reserved name refused
{ const { ctx, p, hits } = await page(false, 'Tess'); await openGuild(p);
  assert.equal(await p.inputValue('#gName'), '', 'players get an empty form'); await p.fill('#gName', 'Floor 0'); await p.fill('#gTag', 'FZ'); await p.click('#gCreate'); await p.waitForTimeout(200);
  assert.equal(await p.textContent('#gMsg'), 'That name is reserved.'); assert.deepEqual(hits, []); await ctx.close(); }
// ---- GM: form enabled + pre-filled; founding the staff guild
{ const { ctx, p, hits } = await page(true, 'Warden'); await openGuild(p);
  assert.equal(await p.inputValue('#gName'), 'Floor Zero'); assert.equal(await p.inputValue('#gTag'), 'ZERO'); assert.equal(await p.isDisabled('#gCreate'), false, 'founding enabled for staff');
  assert.match(await p.textContent('#gMsg'), /Staff guild: no bonus · invite only/);
  if (SHOT) await p.screenshot({ path: SHOT + '/staff-guild-form.png' });
  await p.click('#gCreate'); await p.waitForTimeout(800);
  // mock a couple of invited members so the panel looks lived-in
  await p.evaluate(() => { const g = JSON.parse(localStorage.getItem('logout.v1.guilds')), sg = g.guilds.find(x => x.is_staff), t = new Date().toISOString();
    g.members.push({ name: 'Ash', guild_id: sg.id, role: 'officer', contrib: 0, last_active: t }, { name: 'Wren', guild_id: sg.id, role: 'member', contrib: 0, last_active: t }); localStorage.setItem('logout.v1.guilds', JSON.stringify(g)); });
  await p.keyboard.press('Escape'); await p.click('#tabBattle'); await openGuild(p);
  const ui = await p.evaluate(() => ({ head: document.querySelector('#guildBody .ghead')?.innerText, mark: !!document.querySelector('#guildBody .ghead .smark'), tabs: [...document.querySelectorAll('#guildBody .gtabs [data-tab]')].map(x => x.dataset.tab),
    note: document.querySelector('#guildBody')?.innerText, open: !!document.getElementById('gOpen'), invite: !!document.getElementById('gInvB') }));
  assert.match(ui.head, /\[ZERO\]/); assert.ok(ui.mark, 'staff mark next to the tag'); assert.deepEqual(ui.tabs, ['overview', 'members', 'banner', 'chat'], 'no Bank or Quests tabs');
  assert.match(ui.note, /Staff guild: no bonus · invite only/); assert.equal(ui.open, false, 'cannot be opened'); assert.ok(ui.invite, 'leader invites by Tower ID');
  const board = await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.guilds')).guilds.find(x => x.is_staff));
  assert.equal(board.open, false);
  if (SHOT) await p.screenshot({ path: SHOT + '/staff-guild-panel.png' });
  assert.deepEqual(hits, []); await ctx.close(); }
await b.close(); assert.deepEqual(errs, []); console.log('staff guild e2e ok');

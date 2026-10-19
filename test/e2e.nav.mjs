// Browser test for the UI v2 shell: node test/e2e.nav.mjs [url]. Runs in local mode (Supabase blocked, so nothing is written live).
// Every feature must be reachable from the 5-tab nav; badges, toasts, the slim top bar and the no-scroll battle screen on a 390x844 phone.
import assert from 'node:assert'; import { chromium } from 'playwright-core'; import { TEAM_PASS_HASH } from '../config.js';
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html';
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ctx.route(/supabase\.co/, r => r.abort());
await ctx.addInitScript(h => localStorage.setItem('logout.v1.gate', h), TEAM_PASS_HASH);
const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'NavTest'); await p.click('#start');
await p.waitForSelector('#tour:not(.hidden)'); const steps = []; for (;;) { steps.push(await p.textContent('#ttitle')); if ((await p.textContent('#tnext')) === 'Done') { await p.click('#tnext'); break; } await p.click('#tnext'); }
assert.ok(steps.includes('Hero') && steps.includes('More') && steps.includes('Town: Train · Forge'), 'tour covers the new nav: ' + steps);
await p.waitForTimeout(2500);
const ui = await p.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); return { tabs: [...document.querySelectorAll('#tabbar [data-tab]')].map(b => b.dataset.tab), floor: document.getElementById('floorTxt').textContent, gold: document.getElementById('goldTop').textContent, fold: r('top3').bottom <= r('tabbar').top && r('arena').top >= 0, h: document.documentElement.scrollHeight, banner: !!document.querySelector('img.banner, header h1') }; });
assert.deepEqual(ui.tabs, ['battle', 'hero', 'town', 'guild', 'more']); assert.match(ui.floor, /^Floor \d+\/\d+$/); assert.match(ui.gold, /^⛁ \d/);
assert.ok(ui.fold, 'boss, arena, hero strip and top-3 fit above the tab bar'); assert.ok(ui.h <= 844 + 1, 'battle screen does not scroll'); assert.ok(!ui.banner, 'old banner/title gone');
const top = () => p.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(d => d.id).join(','));
const closeAll = () => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
const where = {}, tap = async sel => { const q = await p.locator(sel).boundingBox(); await p.mouse.click(q.x + q.width / 2, q.y + q.height / 2); }; // a tab under an open sheet is reached through the backdrop
const check = async (feature, act, want, extra) => { await act(); await p.waitForTimeout(350); const t = await top(); assert.ok(t.split(',').includes(want), `${feature}: expected #${want} open, got ${t}`); if (extra) assert.ok(await p.evaluate(extra), feature + ' content'); where[feature] = want; };
await check('Gear (stats, equipped)', () => p.click('#tabHero'), 'gearSheet', () => /DPS/.test(document.getElementById('stats').textContent));
await check('Bag', () => p.click('#gearSheet [data-sub="bag"]'), 'bag');
await check('Talents', () => p.click('#bag [data-sub="talents"]'), 'talents', () => !!document.querySelector('#talTree *'));
await check('Wardrobe', () => p.click('#talents [data-sub="wardrobe"]'), 'wardrobe', () => !!document.querySelector('#wpick button'));
assert.equal(await p.getAttribute('#tabHero', 'aria-current'), 'page');
await check('Town · Train', () => tap('#tabTown'), 'town', () => getComputedStyle(document.getElementById('lvl')).display !== 'none' && document.getElementById('lvl').offsetParent);
assert.equal(await top(), 'town', 'switching tabs closes the previous sheet');
for (const [pane, sel] of [['forge', '#gear'], ['sell', '#shopList'], ['sell', '#sellBox'], ['inn', '#restBtn']]) { await p.click(`#townTabs [data-pane="${pane}"]`); await p.waitForTimeout(150); assert.ok(await p.isVisible(sel), `Town · ${pane} shows ${sel}`); where['Town · ' + pane] = 'town'; }
// backdrop tap on the tab bar switches tab
await tap('#tabGuild'); await p.waitForTimeout(600);
assert.equal(await top(), 'guild', 'tapping the tab bar behind a sheet switches tab'); where['Guild (board, create/join, v2 tabs)'] = 'guild';
await closeAll(); await p.waitForTimeout(250); assert.equal(await p.getAttribute('#tabBattle', 'aria-current'), 'page', 'closing returns to Battle');
for (const [f, btn, want] of [['Tower Map', '#mapBtn', 'map'], ['Leaderboard', '#lbBtn', 'lbSheet'], ['Floor chat', '#chatBtn', 'chat'], ['Chronicle', '#logBtn', 'logSheet'], ['System / identity / settings', '#sysBtn', 'system']]) { await check(f, async () => { await p.click('#tabMore'); await p.waitForTimeout(200); await p.click(btn); }, want); await closeAll(); }
await p.click('#tabMore'); await p.click('#helpBtn'); await p.waitForSelector('#tour:not(.hidden)'); where.Guide = 'tour'; await p.click('#tskip');
await check('Map via floor', () => p.click('#floorBtn'), 'map'); await closeAll();
await check('Leaderboard via top-3', () => p.click('#top3'), 'lbSheet'); await closeAll();
assert.ok(await p.isHidden('#sbBtn'), 'sandbox hidden for players');
// badges: unspent talent points / near-full bag light the Hero dot
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('logout.v1.save')); s.heroes[0].level = 12; s.lastTick = Date.now(); localStorage.setItem('logout.v1.save', JSON.stringify(s)); }); await p.reload(); await p.waitForTimeout(2500);
assert.ok(await p.isVisible('#dotHero'), 'Hero dot for talent points'); await p.click('#tabHero'); assert.ok(await p.isVisible('#gearSheet [data-sub="talents"] .sdot'), 'Talents sub-tab dot'); await closeAll();
// staff: GM unlock (test passphrase swapped into config.js) shows Sandbox under More and Codex under Hero
{ const { createHash } = await import('node:crypto'); const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }); await c2.route(/supabase\.co/, r => r.abort());
  await c2.route(/config\.js/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update('nav-gm-test').digest('hex')}'`) }); });
  await c2.addInitScript(h => { localStorage.setItem('logout.v1.gate', h); localStorage.setItem('logout.v1.gm', 'nav-gm-test'); }, TEAM_PASS_HASH);
  const g = await c2.newPage(); g.on('pageerror', e => errs.push(e.message)); await g.goto(URL + '?t=' + Date.now()); await g.waitForSelector('#create:not(.hidden)'); await g.fill('#hname', 'NavGm'); await g.click('#start');
  await g.waitForTimeout(1500); if (await g.isVisible('#tskip')) await g.click('#tskip');
  await g.click('#tabMore'); await g.waitForTimeout(300); assert.ok(await g.isVisible('#sbBtn'), 'Sandbox listed under More for staff'); await g.click('#sbBtn'); await g.waitForTimeout(400);
  assert.ok(await g.evaluate(() => document.getElementById('sandbox').open), 'Sandbox opens'); where['Sandbox (staff)'] = 'sandbox'; await c2.close(); }
await b.close(); assert.deepEqual(errs, []);
console.log('nav ok; feature → sheet:', JSON.stringify(where));

// Offline e2e for daily quests, guild weekly shares and player ID cards: desktop Chromium, iPhone (WebKit) and Android (Chromium).
// Local mode only (Supabase blocked, never the live DB). Writes /workspace/quests-*.png and /workspace/idcard-*.png.
import assert from 'node:assert/strict'; import { webkit, chromium, devices } from 'playwright-core'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js');
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', SHOTS = process.env.QI_SHOTS || '/workspace', CHROME = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const RUNS = [['desktop', chromium, { executablePath: CHROME }, { viewport: { width: 1280, height: 900 } }], ['iphone', webkit, {}, devices['iPhone 13']], ['android', chromium, { executablePath: CHROME }, devices['Pixel 7']]];
const shot = (p, path) => p.screenshot({ path, timeout: 60000, animations: 'disabled' }).catch(() => p.screenshot({ path, timeout: 60000 }));
const onScreen = (p, sel) => p.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); return b.x >= -0.5 && b.right <= innerWidth + 0.5 && b.width > 0 && document.querySelector(s).scrollWidth <= document.querySelector(s).clientWidth + 1; }, sel);
for (const [name, eng, launch, dev] of RUNS) {
  const b = await eng.launch(launch), errs = [], mobile = name !== 'desktop', tap = (p, s) => mobile ? p.tap(s) : p.click(s);
  const ctx = await b.newContext({ ...dev }); const hits = await offline(ctx);
  await ctx.addInitScript(h => localStorage.setItem('logout.v1.gate', h), TEAM_PASS_HASH);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now());
  await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Tess'); await tap(p, '#start'); await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await tap(p, '#tskip');
  await p.waitForTimeout(6500); // one local sync: quests drawn, damage counted
  // seed: finish the damage quest and join a local guild whose weekly damage quest is done and that we helped with
  await p.evaluate(() => { const k = 'logout.v1.save', s = JSON.parse(localStorage.getItem(k)); s.dq.p[0] = s.dq.t[0]; localStorage.setItem(k, JSON.stringify(s));
    const gk = 'logout.v1.guilds', g = JSON.parse(localStorage.getItem(gk) || 'null') || { next: 4, guilds: [{ id: 1, name: 'Night Bell', tag: 'NB' }, { id: 2, name: 'Ember Court', tag: 'EMB' }], members: [{ name: 'SableFen', guild_id: 1 }, { name: 'Grimhallow', guild_id: 1 }, { name: 'Brightmoor', guild_id: 2 }], me: null };
    g.members.push({ name: 'Tess', guild_id: 1 }); g.me = 'Tess'; localStorage.setItem(gk, JSON.stringify(g)); });
  await p.reload(); await p.waitForSelector('#tabbar:not(.hidden)'); await p.waitForTimeout(2500); if (await p.isVisible('#away').catch(() => false)) await p.evaluate(() => document.getElementById('away').close());
  // ---- daily quests in Town → Goods
  await tap(p, '#tabTown'); await p.waitForSelector('#town[open]'); await tap(p, '#townTabs [data-pane="goods"]'); await p.waitForSelector('.dquest');
  assert.equal(await p.locator('.dquest').count(), 3, 'three daily quests'); assert.match(await p.textContent('#goodsBody'), /00:00 UTC/);
  assert.ok(await onScreen(p, '.dquests'), `${name}: quests fit the screen`);
  await p.locator('.dquests').scrollIntoViewIfNeeded(); await shot(p, `${SHOTS}/quests-${name}-daily.png`);
  const g0 = await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).gold);
  await tap(p, '[data-dq="0"]:not([disabled])'); await p.waitForTimeout(800);
  assert.match(await p.textContent('[data-dq="0"]'), /Claimed/); const g1 = await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).gold); assert.ok(g1 > g0, `${name}: gold paid (${g0} → ${g1})`);
  assert.ok(await p.isDisabled('[data-dq="0"]'), 'no double claim');
  await p.evaluate(() => document.getElementById('town').close());
  // ---- guild weekly quests: member share
  await p.evaluate(() => { const gk = 'logout.v1.guilds', g = JSON.parse(localStorage.getItem(gk)); const gu = g.guilds.find(x => x.id === 1), w = Math.floor((Date.now() / 1000 - 345600) / 604800);
    const day = 864e5; gu.quests = gu.quests || {}; gu.quests[w] = gu.quests[w] || {}; for (const i of [0, 1, 2]) gu.quests[w][i] = { progress: 1e9, done: true, by: { Tess: 1e9 } }; localStorage.setItem(gk, JSON.stringify(g)); });
  await tap(p, '#tabGuild'); await p.waitForSelector('#guild[open]'); await p.waitForSelector('#guildBody [data-tab="quests"]'); await tap(p, '#guildBody [data-tab="quests"]'); await p.waitForSelector('[data-gqc]');
  assert.match(await p.textContent('#guildBody'), /Monday 00:00 UTC/); assert.ok(await onScreen(p, '#guildBody'), `${name}: guild quests fit`);
  await shot(p, `${SHOTS}/quests-${name}-guild.png`);
  const gg0 = await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).gold);
  await tap(p, '[data-gqc]:not([disabled])'); await p.waitForTimeout(1200); await p.waitForSelector('#guildBody [data-gqc]');
  assert.ok((await p.locator('[data-gqc]', { hasText: 'Claimed' }).count()) >= 1, 'share claimed'); const gg1 = await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).gold); assert.ok(gg1 > gg0, `${name}: share paid`);
  // ---- ID card from the guild roster
  await tap(p, '#guildBody [data-tab="members"]'); await p.waitForSelector('#guildBody .cardlink'); await tap(p, '#guildBody .cardlink[data-card="SableFen"]'); await p.waitForSelector('#idCard[open] .idcard');
  assert.match(await p.textContent('#idCardBody'), /SableFen/); await p.evaluate(() => document.getElementById('idCard').close()); await p.evaluate(() => document.getElementById('guild').close());
  // ---- ID card from the leaderboard (other hero) and own card
  if (mobile) { await tap(p, '#tabMore'); await p.waitForSelector('#more[open]'); await tap(p, '#lbBtn'); await p.waitForSelector('#lbSheet[open]'); }
  const lb = mobile ? '#lb' : '#lbSide';
  const other = await p.$eval(lb, l => [...l.querySelectorAll('.cardlink')].map(x => x.dataset.card).find(n => n !== 'Tess'));
  await p.$eval(`${lb} .cardlink[data-card="${other}"]`, e => e.click()); // the board redraws every sync await p.waitForSelector('#idCard[open] .idcard');
  const t = await p.textContent('#idCardBody'); assert.ok(t.includes(other) && /Lv \d+/.test(t) && /DPS/.test(t) && /Gear/.test(t) && /Abilities/.test(t) && /Pet/.test(t) && /Guild/.test(t), `${name}: card content`);
  assert.equal(await p.locator('#idCard .cgear').count(), 3, 'three gear slots'); assert.ok(await onScreen(p, '#idCard'), `${name}: card fits the screen`);
  const rcol = await p.$eval('#idCard .cgear b', e => getComputedStyle(e).color); assert.ok(rcol && rcol !== 'rgb(244, 241, 255)', 'gear name in rarity colour');
  await shot(p, `${SHOTS}/idcard-${name}-player.png`); await p.evaluate(() => document.getElementById('idCard').close());
  await p.$eval(`${lb} .cardlink[data-card="Tess"]`, e => e.click()); await p.waitForSelector('#idCard[open] .idcard'); assert.match(await p.textContent('#idCardBody'), /Tess/); assert.match(await p.textContent('#idCardBody'), /\[NB\]/, 'own guild on own card');
  await shot(p, `${SHOTS}/idcard-${name}-self.png`); await p.evaluate(() => document.getElementById('idCard').close());
  if (mobile) await p.evaluate(() => document.getElementById('lbSheet').close());
  // ---- ID card from floor chat
  if (!(await p.isVisible('#more[open]'))) { await tap(p, '#tabMore'); await p.waitForSelector('#more[open]'); }
  await tap(p, '#chatBtn'); await p.waitForSelector('#chat[open]'); await p.waitForSelector('#chatLog .cardlink'); const cn = await p.$eval('#chatLog .cardlink', e => e.dataset.card);
  await tap(p, '#chatLog .cardlink'); await p.waitForSelector('#idCard[open] .idcard'); assert.match(await p.textContent('#idCardBody'), new RegExp(cn));
  if (name !== 'desktop') await shot(p, `${SHOTS}/idcard-${name}-chat.png`);
  assert.deepEqual(hits, [], 'no request to the live backend'); assert.deepEqual(errs, []); await b.close(); console.log(`quests/idcard e2e ok · ${name}`);
}

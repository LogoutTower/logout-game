// Offline e2e for the Guild Hub preview (FEATURES.guildHub). Supabase blocked, fresh context per case, Chromium desktop + phone emulation.
//  1) regular player with the shipped flag ('gm'): no Race tab, no presence column, no buffs (no change)
//  2) staff with the shipped flag: Race tab, presence and buffs show
//  3) mockups: flag forced to 'all' for a regular player (what players get at launch): members, race, bank + buff, ID card presence
// node test/e2e.guildhub.mjs [url]   shots: $GH_SHOTS (default /tmp/guild-hub)
import assert from 'node:assert/strict'; import { chromium } from 'playwright-core'; import { createHash } from 'node:crypto'; import { mkdirSync } from 'node:fs'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js');
const URL = process.argv[2] || 'http://127.0.0.1:8851/app.html', OUT = process.env.GH_SHOTS || '/tmp/guild-hub'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` }), errs = [];
const DEV = { desktop: { viewport: { width: 1100, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
async function page(dev, { gm = false, flag = null } = {}) {
  const ctx = await b.newContext(DEV[dev]); const hits = await offline(ctx), pass = 'gh-' + Math.random().toString(36).slice(2);
  await ctx.route(/\/config\.js(\?|$)/, async r => { const res = await r.fetch(); let t = (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'");
    if (gm) t = t.replace(/GM_PASS_HASH = '[0-9a-f]*'/, `GM_PASS_HASH = '${createHash('sha256').update(pass).digest('hex')}'`); if (flag) t = t.replace(/guildHub:\s*'[a-z]+'/, `guildHub: '${flag}'`); r.fulfill({ response: res, body: t }); });
  await ctx.addInitScript(([h, gm, pass]) => { localStorage.setItem('logout.v1.gate', h); if (gm) localStorage.setItem('logout.v1.gm', pass); }, [TEAM_PASS_HASH, gm, pass]);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Tester'); await p.click('#start');
  await p.waitForTimeout(1500); await p.evaluate(() => document.querySelectorAll('#cutscene .cs-skip').forEach(x => x.click())); if (await p.isVisible('#tskip')) await p.click('#tskip');
  await p.evaluate(() => { const ago = s => new Date(Date.now() - s * 1000).toISOString(), k = 'logout.v1';
    const s = JSON.parse(localStorage.getItem(k + '.save')); s.tutorialSeen = true; s.cutscenes = ['intro', ...(s.cutscenes || [])]; s.gold = Math.max(s.gold || 0, 5000); localStorage.setItem(k + '.save', JSON.stringify(s));
    const w = JSON.parse(localStorage.getItem(k + '.world')); w.floor = Math.max(w.floor, 12); const f = w.floor;
    const g = JSON.parse(localStorage.getItem(k + '.guilds') || 'null') || { next: 10, guilds: [{ id: 1, name: 'Night Bell', tag: 'NB' }, { id: 2, name: 'Ember Court', tag: 'EMB' }, { id: 3, name: 'Thornwardens', tag: 'THRN' }], members: [['SableFen', 1], ['Grimhallow', 1], ['Brightmoor', 2], ['Ravensong', 2], ['LyssDawn', 2]].map(([name, guild_id]) => ({ name, guild_id })), me: null };
    g.guilds = g.guilds.filter(x => x.id !== 9); g.members = g.members.filter(m => m.guild_id !== 9 && m.name !== 'Tester');
    g.guilds.push({ id: 9, name: 'Lantern Watch', tag: 'LW', owner: 'Tester', open: false, xp: 900000, bank: 120000, bonus_tier: 1, hall: 2, banner_unlocks: 1, banner: { sigil: 'flame', c1: '#ff9b3d', c2: '#2a1450' },
      ledger: [{ id: 3, kind: 'donate', name: 'Wren', amount: 25000, at: ago(1800) }, { id: 2, kind: 'donate', name: 'Ash', amount: 12000, at: ago(7200) }, { id: 1, kind: 'quest', amount: 2000, item: 'Weekly quest: damage (+16000 guild XP)', at: ago(86400) }] });
    const M = [['Tester', 'leader', 0], ['Wren', 'officer', 20], ['Ash', 'officer', 2400], ['Mira', 'member', 60], ['Holt', 'member', 5 * 3600], ['Juno', 'member', 3 * 86400]];
    for (const [name, role, sec] of M) g.members.push({ name, guild_id: 9, role, contrib: name === 'Tester' ? 0 : Math.max(9000, 80000 - Math.round(sec / 4)), last_active: ago(sec) });
    g.me = 'Tester'; g.raceWins = [{ floor: Math.max(1, f - 2), guild_id: 2, tag: 'EMB', name: 'Ember Court', banner: { sigil: 'tower', c1: '#ffd76a', c2: '#2a1450' }, damage: 3100000, at: ago(9000) },
      { floor: Math.max(1, f - 1), guild_id: 9, tag: 'LW', name: 'Lantern Watch', banner: { sigil: 'flame', c1: '#ff9b3d', c2: '#2a1450' }, damage: 4200000, at: ago(1200) }];
    localStorage.setItem(k + '.guilds', JSON.stringify(g));
    Object.assign(w.dmg, { Wren: 900000, Ash: 640000, Mira: 220000, Brightmoor: 700000, Ravensong: 380000, SableFen: 300000 }); localStorage.setItem(k + '.world', JSON.stringify(w)); });
  await p.reload(); await p.waitForTimeout(2200); await p.evaluate(() => document.querySelectorAll('#cutscene .cs-skip').forEach(x => x.click())); if (await p.isVisible('#tskip')) await p.click('#tskip');
  return { ctx, p, hits }; }
const openGuild = async p => { await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.click('#tabGuild'); await p.waitForSelector('#guild[open] .gtabs'); await p.waitForTimeout(300); };
const tab = async (p, t) => { await p.click(`#guildBody [data-tab="${t}"]`); await p.waitForTimeout(400); };
const tabs = p => p.evaluate(() => [...document.querySelectorAll('#guildBody .gtabs [data-tab]')].map(x => x.dataset.tab));
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
for (const dev of ['desktop', 'phone']) {
  // 1) regular player, shipped flag: nothing new
  { const { ctx, p, hits } = await page(dev); await openGuild(p);
    assert.deepEqual(await tabs(p), ['overview', 'members', 'bank', 'quests', 'banner', 'chat'], 'no Race tab for players');
    await tab(p, "members"); if (!(await p.isVisible(`#guildBody th:has-text("Seen")`))) { await shot(p, "debug"); console.log((await p.textContent("#guildBody")).slice(0, 600)); } assert.ok(await p.isVisible(`#guildBody th:has-text("Seen")`)); assert.equal(await p.locator('#guildBody .pres').count(), 0, 'no presence');
    await tab(p, 'bank'); assert.equal(await p.locator('#guildBody [data-buff]').count(), 0, 'no buffs'); assert.equal(await p.locator('.gchamp').count(), 0);
    await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.evaluate(() => document.querySelector('[data-card]')?.click()); await p.waitForTimeout(500);
    assert.equal(await p.locator('#idCardBody .idpres').count(), 0, 'no presence on cards'); assert.deepEqual(hits, []); await ctx.close(); }
  // 2) staff, shipped flag: preview visible
  { const { ctx, p, hits } = await page(dev, { gm: true }); await openGuild(p);
    assert.ok((await tabs(p)).includes('race'), 'staff sees the Race tab'); await tab(p, 'members'); assert.ok(await p.locator('#guildBody .pres.on').count() >= 2, 'online dots');
    assert.deepEqual(hits, []); await ctx.close(); }
  // 3) mockups: regular player with the flag on (launch view)
  { const { ctx, p, hits } = await page(dev, { flag: 'all' }); await openGuild(p);
    assert.ok(await p.isVisible('#guildBody .ghead .gchamp'), 'champion title in the header');
    await tab(p, 'members'); const pres = await p.evaluate(() => [...document.querySelectorAll('#guildBody .gmem tr')].slice(1).map(r => r.querySelector('.pres')?.textContent || ''));
    assert.match(pres[1] || pres.join('|'), /online|last seen/); assert.ok(pres.some(x => /F\d+ · online/.test(x))); assert.ok(pres.some(x => /last seen 5h ago/.test(x)));
    await shot(p, `${dev}-guild-hub-members`);
    await tab(p, 'race'); assert.ok(await p.isVisible('#guildBody .gchampcard')); assert.ok(await p.locator('#guildBody .grace tr').count() >= 3); await shot(p, `${dev}-guild-race`);
    await tab(p, 'bank'); p.once('dialog', d => d.accept()); await p.click('#guildBody [data-buff="dmg5"]'); await p.waitForTimeout(600);
    if (!(await p.isVisible('#guildBody .gbuff.on'))) await tab(p, 'bank');
    assert.ok(await p.isVisible('#guildBody .gbuff.on'), 'buff active'); assert.match(await p.textContent('#guildBody .gledger'), /bought \+5% damage for 24h/);
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.guilds')).guilds.find(g => g.id === 9).bank), 80000);
    await p.evaluate(() => document.querySelector('#guildBody .gbuff')?.scrollIntoView()); await shot(p, `${dev}-guild-bank`);
    await tab(p, 'members'); await p.click('#guildBody .gmem [data-card="Wren"]'); await p.waitForSelector('#idCard[open] .idpres'); await p.waitForTimeout(400);
    assert.match(await p.textContent('#idCardBody .idpres'), /F\d+ · online/); await shot(p, `${dev}-idcard-presence`);
    // a stranger's card shows no presence
    await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.evaluate(() => { const e = document.createElement('b'); e.dataset.card = 'Brightmoor'; document.body.append(e); e.click(); });
    await p.waitForSelector('#idCard[open] .idcard'); assert.equal(await p.locator('#idCardBody .idpres').count(), 0, 'stranger: no presence');
    assert.deepEqual(hits, []); await ctx.close(); }
}
await b.close(); assert.deepEqual(errs, []); console.log('guild hub e2e ok');

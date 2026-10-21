// Forge upgrades / Farm / evolution, offline (fresh browser context, live backend blocked). node test/e2e.forge.mjs [url] [shotsDir]
import assert from 'node:assert'; import { TEAM_PASS_HASH } from '../config.js'; import { offline } from './e2e-offline.mjs';
const { chromium } = await import('playwright-core');
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', SHOTS = process.argv[3] || null;
const browser = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
const errs = [];
async function run(viewport, tag) {
  const bctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 }); const supa = await offline(bctx); await bctx.addInitScript(h => localStorage.setItem('logout.v1.gate', h), TEAM_PASS_HASH);
  const page = await bctx.newPage(); page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto(URL + '?t=' + Date.now()); await page.waitForSelector('#create:not(.hidden)'); await page.fill('#hname', 'Tester'); await page.click('#start'); await page.waitForTimeout(1500);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('logout.v1.save')); s.gold = 5e7; s.tutorialSeen = true; s.introDue = false;
    s.mats = { shard: 200, ess1: 80, core3: 20, sigil10: 5 }; s.heroes[0].equip.weapon = { id: 'w-e2e', slot: 'weapon', rarity: 'epic', floor: 3, element: 'fire', name: 'Runed Warblade', stats: { dps: 12 }, affixes: [], up: 4 };
    localStorage.setItem('logout.v1.save', JSON.stringify(s)); });
  if (tag === 'desktop') { // Farm: floor 4 open, farm the Floor 3 echo; the live guardian takes no damage from this hero
    await page.evaluate(() => { const w = JSON.parse(localStorage.getItem('logout.v1.world')); w.floor = 4; w.dmg = {}; localStorage.setItem('logout.v1.world', JSON.stringify(w)); const s = JSON.parse(localStorage.getItem('logout.v1.save')); s.farm = 3; localStorage.setItem('logout.v1.save', JSON.stringify(s)); });
    await page.reload(); await page.waitForTimeout(4000); await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); document.getElementById('tour')?.classList.add('hidden'); });
    const st = await page.evaluate(() => ({ name: document.getElementById('bname').textContent, dmg: JSON.parse(localStorage.getItem('logout.v1.world')).dmg.Tester || 0, c: JSON.parse(localStorage.getItem('logout.v1.save')).matc?.core3 || 0 }));
    assert.match(st.name, /^Echo of/); assert.equal(st.dmg, 0, 'farming deals no live damage'); assert(st.c > 0, 'core accrues while farming');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/farm-arena-${tag}.png` });
    await page.click('#floorBtn'); await page.waitForSelector('#mapProg [data-farm="0"]'); await page.click('#mapTower button.fl.cleared[data-f="3"]'); await page.waitForSelector('#mapDetail .lootkey');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/farm-lootkey-${tag}.png` });
    await page.click('#mapProg [data-farmhelp]'); await page.waitForSelector('#helpSheet[open] .hsteps'); if (SHOTS) await page.screenshot({ path: `${SHOTS}/farm-help-${tag}.png` }); await page.click('#helpSheet [data-close]');
    await page.click('#mapProg [data-farm="0"]'); await page.waitForTimeout(500); assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).farm), null);
    await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); }); }
  await page.reload(); await page.waitForTimeout(1500); await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); document.getElementById('tour')?.classList.add('hidden'); });
  await page.click('#tabbar [data-tab="town"]'); await page.click('#townTabs [data-pane="forge"]'); await page.waitForSelector('#upBody [data-up]');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/forge-pane-${tag}.png` });
  await page.click('#upBody [data-up]'); await page.waitForTimeout(300); if (SHOTS) await page.screenshot({ path: `${SHOTS}/forge-strike-${tag}.png` });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0].equip.weapon.up === 5, null, { timeout: 8000 });
  // evolution: +10 → evolve with the sigil; capture the animation beats
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); const s = JSON.parse(localStorage.getItem('logout.v1.save')); s.heroes[0].equip.weapon.up = 10; localStorage.setItem('logout.v1.save', JSON.stringify(s)); });
  await page.reload(); await page.waitForTimeout(1500); await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); document.getElementById('tour')?.classList.add('hidden'); });
  await page.click('#tabbar [data-tab="town"]'); await page.click('#townTabs [data-pane="forge"]'); await page.waitForSelector('#upBody [data-up="evo"]');
  await page.click('#upBody [data-up="evo"]');
  let el0 = 0; for (const [ms, n] of [[900, 'strikes'], [1950, 'crack'], [2400, 'shatter'], [3900, 'card']]) { await page.waitForTimeout(ms - el0); el0 = ms; if (SHOTS) await page.screenshot({ path: `${SHOTS}/forge-evo-${n}-${tag}.png` }); }
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0].equip.weapon.evo, null, { timeout: 8000 });
  assert.match(await page.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0].equip.weapon.name), /^Cinderborn /);
  await page.waitForSelector('.fanim', { state: 'detached', timeout: 8000 }); if (SHOTS) await page.screenshot({ path: `${SHOTS}/forge-evolved-${tag}.png` });
  // prestige to Evo II + replay + transfer panel
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); const s = JSON.parse(localStorage.getItem('logout.v1.save')); s.heroes[0].equip.weapon.up = 10;
    s.inv.push({ id: 'u-e2e', slot: 'weapon', rarity: 'unique', floor: 3, element: 'void', name: 'Glass Fang', stats: { dps: 30 }, affixes: [], ability: { id: 'tenth', text: '' }, drawback: { id: 'whisper', text: '' } }); localStorage.setItem('logout.v1.save', JSON.stringify(s)); });
  await page.reload(); await page.waitForTimeout(1500); await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); document.getElementById('tour')?.classList.add('hidden'); });
  await page.click('#tabbar [data-tab="town"]'); await page.click('#townTabs [data-pane="forge"]'); await page.waitForSelector('#upBody [data-up="evo"]'); await page.click('#upBody [data-up="evo"]');
  await page.waitForSelector('.fcard:not([hidden])', { timeout: 8000 }); assert.match(await page.textContent('.fcard'), /Evo II/); if (SHOTS) await page.screenshot({ path: `${SHOTS}/forge-prestige-card-${tag}.png` });
  await page.waitForSelector('.fanim', { state: 'detached', timeout: 8000 }); assert.match(await page.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0].equip.weapon.name), / II$/);
  await page.click('#upBody details.xfer summary'); await page.waitForSelector('#upBody [data-xfer]'); assert.match(await page.textContent('#upBody details.xfer'), /fee ×2\.25/); if (SHOTS) await page.screenshot({ path: `${SHOTS}/forge-prestige-panel-${tag}.png` });
  await page.click('#upBody [data-replay]'); await page.waitForSelector('.fcard:not([hidden])', { timeout: 8000 }); await page.waitForSelector('.fanim', { state: 'detached', timeout: 8000 });
  await bctx.close(); assert.deepEqual(supa, [], 'no request reached the live backend');
}
await run({ width: 1280, height: 800 }, 'desktop'); await run({ width: 390, height: 844 }, 'mobile');
await browser.close(); assert.deepEqual(errs, [], 'no JS errors: ' + errs.join(' | ')); console.log('e2e forge passed');

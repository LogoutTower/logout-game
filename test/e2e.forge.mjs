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
    s.mats = { shard: 60, ess1: 30, core3: 20, sigil10: 1 }; s.heroes[0].equip.weapon = { id: 'w-e2e', slot: 'weapon', rarity: 'epic', floor: 3, element: 'fire', name: 'Runed Warblade', stats: { dps: 12 }, affixes: [], up: 4 };
    localStorage.setItem('logout.v1.save', JSON.stringify(s)); });
  await page.reload(); await page.waitForTimeout(1500); await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); document.getElementById('tour')?.classList.add('hidden'); });
  await page.click('#tabbar [data-tab="town"]'); await page.click('#townTabs [data-pane="forge"]'); await page.waitForSelector('#upBody [data-up]');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/forge-pane-${tag}.png` });
  await page.click('#upBody [data-up]'); await page.waitForTimeout(300); if (SHOTS) await page.screenshot({ path: `${SHOTS}/forge-strike-${tag}.png` });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0].equip.weapon.up === 5, null, { timeout: 8000 });
  await bctx.close(); assert.deepEqual(supa, [], 'no request reached the live backend');
}
await run({ width: 1280, height: 800 }, 'desktop'); await run({ width: 390, height: 844 }, 'mobile');
await browser.close(); assert.deepEqual(errs, [], 'no JS errors: ' + errs.join(' | ')); console.log('e2e forge passed');

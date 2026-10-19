// Browser regression (needs playwright-core + Chromium): node test/e2e.play.mjs [url] [ms]
// Fresh profile, creates a hero, plays ~10s of real time, asserts gold, XP, damage and leaderboard presence.
import assert from 'node:assert';
const { chromium } = await import('playwright-core');
const URL = process.argv[2] || 'http://127.0.0.1:8765/', WAIT = +(process.argv[3] || 11000);
const browser = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
const page = await (await browser.newContext()).newPage(), errs = [];
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
await page.goto(URL + (URL.includes('?') ? '&' : '?') + 't=' + Date.now()); await page.waitForSelector('#create:not(.hidden)');
await page.fill('#hname', 'Tester'); await page.click('#start'); await page.waitForTimeout(WAIT);
const r = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('logout.v1.save')), w = JSON.parse(localStorage.getItem('logout.v1.world')), n = s.heroes[0].name;
  return { gold: s.gold, xp: s.heroes[0].xp, level: s.heroes[0].level, damage: w ? (w.dmg[n] || 0) : (() => { const li = [...document.querySelectorAll('#lb li.me')].find(li => li.textContent.includes(n)); const m = li && li.textContent.match(/— ([\d.]+)/); return m ? +m[1] : 0; })() /* local world or the online leaderboard row */, onBoard: [...document.querySelectorAll('#lb li.me')].some(li => li.textContent.includes(n)), log: document.getElementById('log').innerText.split('\n').slice(0, 3) }; });
console.log(JSON.stringify(r));
await browser.close();
assert(r.gold > 0, 'gold > 0'); assert(r.xp > 0 || r.level > 1, 'xp > 0'); assert(r.damage > 0, 'player damage > 0'); assert(r.onBoard, 'player on leaderboard');
assert.deepEqual(errs, [], 'no JS errors');
console.log('e2e play regression passed');

// Browser regression (needs playwright-core + Chromium): node test/e2e.buttons.mjs [url]. Tour auto-open, purchase clicks + instant HUD, stable buttons.
import { chromium } from 'playwright-core'; import assert from 'node:assert';
const URL = process.argv[2] || 'http://127.0.0.1:8765/';
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' });
const p = await (await b.newContext({ viewport: { width: 900, height: 1000 } })).newPage(), errs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
// fresh profile: tour must auto-open right after creation
await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Tester'); await p.click('#start');
await p.waitForSelector('#tour:not(.hidden)', { timeout: 1500 }); console.log('tour auto-opened:', await p.textContent('#ttitle')); await p.click('#tskip');
// purchases: rich save, click Train 5x fast across ticks; HUD must update immediately each time
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('logout.v1.save')); s.gold = 5000; s.lastTick = Date.now(); localStorage.setItem('logout.v1.save', JSON.stringify(s)); });
await p.reload(); await p.waitForTimeout(1200);
const read = () => p.evaluate(() => ({ lv: document.getElementById('hlv').textContent, stats: document.getElementById('stats').innerText.replace(/\n/g, ' ') }));
const box = await p.locator('#lvl').boundingBox(); let res = [];
for (let i = 0; i < 5; i++) { await p.mouse.move(box.x + 25, box.y + 25); await p.mouse.down(); await p.waitForTimeout(150 + i * 230); await p.mouse.up(); res.push(await read()); }
console.log(JSON.stringify(res.map(r => r.lv + ' | ' + r.stats.match(/Gold \S+/)[0])));
assert.equal(res[4].lv, 'LV 6', 'all 5 Train clicks registered'); new Set(res.map(r => r.stats)).size === 5 || assert.fail('gold updated after each click');
// node stability: Train button element must not be replaced by ticks
const same = await p.evaluate(async () => { const a = document.getElementById('lvl'); await new Promise(r => setTimeout(r, 2500)); return a === document.getElementById('lvl') && a.isConnected; }); assert(same, 'button not rebuilt');
// tour once for an existing save with tutorialSeen false
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('logout.v1.save')); s.tutorialSeen = false; s.lastTick = Date.now(); localStorage.setItem('logout.v1.save', JSON.stringify(s)); });
await p.reload(); await p.waitForSelector('#tour:not(.hidden)', { timeout: 2000 }); await p.click('#tskip'); await p.reload(); await p.waitForTimeout(1500);
assert(await p.locator('#tour.hidden').count() === 1, 'not again'); console.log('existing-save tour: once');
// leaderboard hint under own row
console.log('climb hint:', await p.evaluate(() => document.querySelector('#lb li.me .climb')?.textContent || '(player in top 3)'));
await b.close(); assert.deepEqual(errs, []); console.log('buttons/tour checks passed, no JS errors');

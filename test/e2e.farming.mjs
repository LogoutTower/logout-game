// Farm mode regression (offline, fresh contexts, live backend blocked): the farmed echo has its own HP bar that the hero's
// damage drains (and re-forms), hit numbers show, materials and drops accrue, and the live guardian takes nothing.
// Runs as a regular player and as a mocked staff GM (arc 3 floor), desktop + phone. node test/e2e.farming.mjs [url] [shotsDir] [tag]
import assert from 'node:assert'; import { TEAM_PASS_HASH } from '../config.js'; import { offline } from './e2e-offline.mjs';
const { chromium } = await import('playwright-core');
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html', SHOTS = process.argv[3] || null, PRE = process.argv[4] || 'after';
const browser = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
const errs = [], fails = [];
async function run(viewport, tag, gm) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 }); const supa = await offline(ctx);
  await ctx.addInitScript(h => localStorage.setItem('logout.v1.gate', h), TEAM_PASS_HASH);
  if (gm) await ctx.route(/\/js\/gm\.js(\?|$)/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/export const staffActive = [^\n]*/, 'export const staffActive = () => true;') }); }); // mock staff status; no passphrase involved
  const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL + '?t=' + Date.now()); await page.waitForSelector('#create:not(.hidden)'); await page.fill('#hname', gm ? 'Warden' : 'Tester'); await page.click('#start'); await page.waitForTimeout(1500);
  const [cur, f] = gm ? [23, 21] : [4, 3];
  await page.evaluate(async ([cur, f, gm]) => { const { floorBossHp } = await import('/js/floors.js'); const w = JSON.parse(localStorage.getItem('logout.v1.world')); w.floor = cur; w.dmg = {}; w.hp = floorBossHp(cur); localStorage.setItem('logout.v1.world', JSON.stringify(w));
    const s = JSON.parse(localStorage.getItem('logout.v1.save')); s.farm = f; s.tutorialSeen = true; s.introDue = false; s.heroes[0].level = gm ? 40 : 12; if (gm) { s.heroes[0].prevCls = s.heroes[0].cls; s.heroes[0].cls = 'GameMaster'; } localStorage.setItem('logout.v1.save', JSON.stringify(s)); }, [cur, f, gm]);
  await page.reload(); await page.waitForTimeout(2500); await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); document.getElementById('tour')?.classList.add('hidden'); });
  const read = () => page.evaluate(() => ({ name: document.getElementById('bname').textContent, hp: document.getElementById('hptext').textContent, live: JSON.parse(localStorage.getItem('logout.v1.world')).dmg[JSON.parse(localStorage.getItem('logout.v1.save')).heroes[0].name] || 0, echo: JSON.parse(localStorage.getItem('logout.v1.save')).echo || null, fx: document.querySelectorAll('#fx .dmg').length }));
  const a = await read(); await page.waitForTimeout(3000); const b = await read(); let fxSeen = 0; for (let i = 0; i < 10 && !fxSeen; i++) { fxSeen = (await read()).fx; await page.waitForTimeout(200); }
  const name = `${PRE}-${gm ? 'gm' : 'player'}-${tag}`; if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log(name, JSON.stringify({ a: { hp: a.hp, echo: a.echo }, b: { name: b.name, hp: b.hp, echo: b.echo, live: b.live }, fxSeen }));
  try {
    assert.match(b.name, /^Echo of/); assert.equal(b.live, 0, 'live guardian untouched');
    assert(b.echo && b.echo.f === f, 'echo state for the farmed floor'); assert(b.echo.maxHp > 0 && b.echo.maxHp < 1e8, 'echo has its own (small) HP pool');
    assert.match(b.hp, /^Echo /, 'HP bar shows the echo'); assert(a.echo && (b.echo.hp < a.echo.hp || b.echo.kills > a.echo.kills), 'hero damage drains the echo');
    assert(fxSeen > 0, 'hit numbers show while farming'); assert.deepEqual(supa, []);
  } catch (e) { fails.push(`${name}: ${e.message}`); }
  await ctx.close();
}
for (const gm of [false, true]) { await run({ width: 1280, height: 800 }, 'desktop', gm); await run({ width: 390, height: 844 }, 'phone', gm); }
await browser.close();
if (errs.length) fails.push('page errors: ' + errs.join(' | '));
if (fails.length) { console.error('FAIL\n' + fails.join('\n')); process.exit(1); } console.log('e2e.farming OK');

// Browser test for floors 11-20 (local mode, Supabase blocked): arc scene, titles, mechanic chip, arc toast, map bands, finale, end of content.
import assert from 'node:assert'; import { chromium } from 'playwright-core'; import { TEAM_PASS_HASH } from '../config.js'; import { offline } from './e2e-offline.mjs';
import { floorBossHp } from '../js/floors.js'; import { ARC_NAMES } from '../js/arcs.js';
const URL = process.argv[2] || 'http://127.0.0.1:8765/app.html';
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` }), errs = [];
const ctx = await b.newContext({ viewport: { width: 760, height: 900 } }); const hits = await offline(ctx); await ctx.addInitScript(h => localStorage.setItem('logout.v1.gate', h), TEAM_PASS_HASH);
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now()); await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Wren'); await p.click('#start'); await p.waitForTimeout(1500); if (await p.isVisible('#tskip')) await p.click('#tskip');
const go = async (f, pct, seen = '2') => { await p.evaluate(([f, hp, seen]) => { localStorage.setItem('logout.v1.world', JSON.stringify({ floor: f, hp, dmg: { Wren: 10 }, t: Date.now(), hist: [] })); localStorage.setItem('logout.v1.arcSeen', seen); }, [f, Math.round(floorBossHp(f) * pct), seen]); await p.reload(); await p.waitForTimeout(1800); if (await p.isVisible('#tskip')) await p.click('#tskip'); };
await go(5, 0.5); assert.equal(await p.getAttribute('#arena', 'data-arc'), '1'); assert.equal(await p.getAttribute('#arena', 'data-props'), 'torches'); assert.match(await p.textContent('#floor'), new RegExp(`Floor 5 / 20 · ${ARC_NAMES[1]}`));
await go(12, 0.5, '1'); assert.equal(await p.getAttribute('#arena', 'data-arc'), '2'); assert.equal(await p.getAttribute('#arena', 'data-props'), 'gears');
assert.match(await p.textContent('#floor'), /Spinner of Still Frost · Floor 12 \/ 20/); assert.match(await p.textContent('#buffs'), /Frostbite/);
await p.waitForTimeout(3600); assert.match(await p.evaluate(() => document.body.innerText), new RegExp(`Entering ${ARC_NAMES[2]}`), 'arc toast'); assert.equal(await p.evaluate(() => localStorage.getItem('logout.v1.arcSeen')), '2');
assert.notEqual(await p.evaluate(() => getComputedStyle(document.getElementById('arena')).getPropertyValue('--a-sky')), '', 'scene vars');
await p.click('#floorBtn'); await p.waitForTimeout(500); const bands = await p.$$eval('#mapTower .band', x => x.map(e => e.textContent)); assert(bands.some(t => t.includes(ARC_NAMES[2])) && bands.some(t => t.includes(ARC_NAMES[1])), 'map band labels'); await p.keyboard.press('Escape');
await go(20, 0.3); assert.equal(await p.evaluate(() => document.getElementById('arena').classList.contains('finale')), true); assert.match(await p.textContent('#buffs'), /Overclock/);
await go(20, 0); assert.match(await p.textContent('#floor'), /Floor 21 is sealed/); assert.equal(await p.textContent('#bname'), 'The spire falls silent');
assert.deepEqual(hits, []); await b.close(); assert.deepEqual(errs, []); console.log('floors 11-20 e2e ok');

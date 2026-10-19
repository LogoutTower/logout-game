// Offline e2e: intro for a fresh hero, arc 1 cutscene once after floor 10 falls, skip, replay from the map band. Writes /tmp/cs/*.png.
import fs from 'node:fs'; import assert from 'node:assert/strict'; import { chromium } from 'playwright-core'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js'); const { CUTSCENES } = await import('../js/cutscenes.js');
fs.mkdirSync('/tmp/cs', { recursive: true });
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' }), errs = [];
const ctx = await b.newContext({ viewport: { width: 760, height: 620 } });
await offline(ctx);
await ctx.addInitScript(h => { localStorage.setItem('logout.v1.gate', h); localStorage.setItem('logout.v1.csTest', '1'); }, TEAM_PASS_HASH);
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto('http://127.0.0.1:8765/app.html');
await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Wren'); await p.click('#start');
const shoot = async key => { for (let i = 0; i < CUTSCENES[key].panels.length; i++) { await p.waitForTimeout(3000); await p.screenshot({ path: `/tmp/cs/${key}-${i}.png` }); if (i < CUTSCENES[key].panels.length - 1) await p.click('#cutscene .cs-box', { force: true }); } };
await p.waitForSelector('#cutscene'); assert.match(await p.textContent('#cutscene .cs-h'), /Session start/); await shoot('intro'); await p.click('#cutscene .cs-box', { force: true }); await p.waitForSelector('#cutscene', { state: 'detached' });
// shared floor moves past 10 -> arc 1 cutscene once
await p.evaluate(() => { const w = JSON.parse(localStorage.getItem('logout.v1.world')); Object.assign(w, { floor: 11, hp: 3e7, t: Date.now() }); localStorage.setItem('logout.v1.world', JSON.stringify(w)); });
await p.reload();
await p.waitForSelector('#cutscene'); await shoot('1'); await p.click('#cutscene .cs-box', { force: true }); await p.waitForSelector('#cutscene', { state: 'detached' });
const tskip = async () => { if (await p.isVisible('#tskip').catch(() => false)) await p.click('#tskip'); }; await tskip();
await p.reload(); await p.waitForTimeout(2500); await tskip(); assert.equal(await p.$('#cutscene'), null, 'shown once');
// replay from the Tower Map band
await p.evaluate(() => document.getElementById('floorBtn').click()); await p.waitForSelector('#map[open] button.replay'); await p.click('#map button.replay[data-cs="1"]');
await p.waitForSelector('#cutscene'); await p.click('#cutscene .cs-skip', { force: true }); await p.waitForSelector('#cutscene', { state: 'detached' });
// arc 2 (via sandbox-style direct preview) for the contact sheet
await p.evaluate(async () => { const m = await import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports['./js/cutscene-player.js']); m.playCutscene('2'); });
await shoot('2'); await p.click('#cutscene .cs-skip', { force: true });
// reduced motion: full text appears immediately
await p.emulateMedia({ reducedMotion: 'reduce' }); await p.evaluate(async () => { const m = await import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports['./js/cutscene-player.js']); m.playCutscene('intro'); });
await p.waitForTimeout(100); assert.ok((await p.textContent('#cutscene .cs-t')).length > 30, 'reduced motion: no typewriter');
assert.deepEqual(errs, []); await b.close(); console.log('cutscenes e2e ok');

// Offline mobile e2e for cutscenes: iPhone (WebKit) and Android (Chromium) emulation. Full-viewport overlay (not the bottom-sheet
// dialog), Skip in the corner, art + typewriter text visible, tap to advance, seen only after finishing, arc 1 re-queued for old
// saves, reload mid-cutscene replays it, Replay reachable on the mobile Tower Map, reduced motion. Writes /workspace/cutscene-mobile-*.png.
import assert from 'node:assert/strict'; import { webkit, chromium, devices } from 'playwright-core'; import { offline } from './e2e-offline.mjs';
const { TEAM_PASS_HASH } = await import('../config.js'); const { CUTSCENES } = await import('../js/cutscenes.js');
const SHOTS = process.env.CS_SHOTS || '/workspace';
const RUNS = [['iphone', webkit, {}, devices['iPhone 13']], ['android', chromium, { executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' }, devices['Pixel 7']]];
const shot = (p, path) => p.screenshot({ path, timeout: 60000, animations: 'disabled' }).catch(() => p.screenshot({ path, timeout: 60000 }));
async function layout(p, tag) {
  const L = await p.evaluate(() => { const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    const cv = document.querySelector('#cutscene canvas'), px = cv.getContext('2d').getImageData(80, 40, 1, 1).data;
    return { vw: innerWidth, vh: innerHeight, d: r('#cutscene'), art: r('#cutscene .cs-art'), box: r('#cutscene .cs-box'), skip: r('#cutscene .cs-skip'), cv: [cv.width, cv.height], drawn: px[3] > 0, sw: document.querySelector('#cutscene').scrollWidth };
  });
  assert.deepEqual([L.d.x, L.d.y, L.d.w, L.d.h], [0, 0, L.vw, L.vh], `${tag}: overlay covers the viewport`);
  assert.ok(L.sw <= L.vw, `${tag}: no horizontal overflow`);
  assert.ok(L.art.x >= 0 && L.art.r <= L.vw + 0.5 && L.art.w > 100 && L.art.h > 50, `${tag}: art on screen ${JSON.stringify(L.art)}`); assert.deepEqual(L.cv, [160, 96]); assert.ok(L.drawn, `${tag}: canvas drawn`);
  assert.ok(L.box.x >= 0 && L.box.r <= L.vw && L.box.b <= L.vh, `${tag}: text box on screen`);
  assert.ok(L.skip.w < 140 && L.skip.h >= 40 && L.skip.r > L.vw - 40 && L.skip.y < 80, `${tag}: Skip is a corner button ${JSON.stringify(L.skip)}`);
  assert.ok(L.skip.b <= L.art.y || L.skip.x >= L.art.r - 140, `${tag}: Skip does not cover the text`);
}
for (const [name, eng, launch, dev] of RUNS) {
  const b = await eng.launch(launch), errs = [];
  const ctx = await b.newContext({ ...dev }); const hits = await offline(ctx);
  await ctx.addInitScript(h => { localStorage.setItem('logout.v1.gate', h); localStorage.setItem('logout.v1.csTest', '1'); }, TEAM_PASS_HASH);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto('http://127.0.0.1:8765/app.html');
  await p.waitForSelector('#create:not(.hidden)'); await p.fill('#hname', 'Wren'); await p.tap('#start');
  await p.waitForSelector('#cutscene[open]'); await p.waitForTimeout(2200);
  await layout(p, name + ' intro'); assert.match(await p.textContent('#cutscene .cs-t'), /Session established/, 'typewriter finished');
  await shot(p, `${SHOTS}/cutscene-mobile-${name}-intro.png`);
  // reload mid-intro: not marked seen, so it plays again
  await p.reload(); await p.waitForSelector('#cutscene[open]', { timeout: 8000 }); assert.match(await p.textContent('#cutscene .cs-h'), /Session start/, 'intro replays after an interrupted load');
  // tap to advance: first tap completes the line, second goes to the next panel
  await p.waitForTimeout(1200); await p.tap('#cutscene .cs-art'); await p.waitForFunction(() => /^2 \//.test(document.querySelector('#cutscene .cs-n').textContent));
  await p.evaluate(() => document.querySelector('#cutscene .cs-art').click()); // mid-typewriter tap (synthetic: emulated taps are slower than the typewriter) completes the line
  assert.match(await p.textContent('#cutscene .cs-t'), /simply gone\.$/); assert.match(await p.textContent('#cutscene .cs-n'), /^2 \//);
  await p.tap('#cutscene .cs-skip'); await p.waitForSelector('#cutscene', { state: 'detached' });
  assert.ok((await p.evaluate(() => JSON.parse(localStorage.getItem('logout.v1.save')).cutscenes)).includes('intro'));
  // old save that had arc 1 "seen" (marked before playing) while offline when Floor 10 fell: gets it on the next load
  await p.evaluate(() => { const w = JSON.parse(localStorage.getItem('logout.v1.world')); Object.assign(w, { floor: 11, hp: 3e7, t: Date.now() }); localStorage.setItem('logout.v1.world', JSON.stringify(w));
    const s = JSON.parse(localStorage.getItem('logout.v1.save')); s.cutscenes = ['intro', '1']; delete s.csV; s.tutorialSeen = true; localStorage.setItem('logout.v1.save', JSON.stringify(s)); });
  await p.reload(); await p.waitForSelector('#cutscene[open]'); assert.match(await p.textContent('#cutscene .cs-h'), new RegExp(CUTSCENES[1].title, 'i'), 'arc 1 re-queued');
  await p.waitForTimeout(2500); await layout(p, name + ' arc1'); await shot(p, `${SHOTS}/cutscene-mobile-${name}-arc1.png`);
  for (let i = 0; i < CUTSCENES[1].panels.length * 2 + 2 && await p.$('#cutscene'); i++) { await p.tap('#cutscene .cs-box').catch(() => {}); await p.waitForTimeout(350); }
  await p.waitForSelector('#cutscene', { state: 'detached' });
  await p.reload(); await p.waitForTimeout(2500); assert.equal(await p.$('#cutscene'), null, 'arc 1 shown once after finishing');
  // Replay on the mobile Tower Map
  await p.tap('#floorBtn'); const rp = await p.waitForSelector('#map[open] button.replay[data-cs="1"]'); await rp.scrollIntoViewIfNeeded();
  const bb = await rp.boundingBox(), vp = p.viewportSize(); assert.ok(bb && bb.x >= 0 && bb.x + bb.width <= vp.width && bb.height >= 28, `${name}: replay reachable ${JSON.stringify(bb)}`);
  await shot(p, `${SHOTS}/cutscene-mobile-${name}-map.png`);
  await rp.tap(); await p.waitForSelector('#cutscene[open]'); await p.tap('#cutscene .cs-skip'); await p.waitForSelector('#map[open]');
  // landscape + reduced motion: still full screen, text immediate
  await p.setViewportSize({ width: vp.height, height: vp.width }); await p.emulateMedia({ reducedMotion: 'reduce' }); await p.keyboard.press('Escape').catch(() => {});
  await p.evaluate(() => document.getElementById('map').close());
  await p.evaluate(async () => { const m = await import(JSON.parse(document.querySelector('script[type=importmap]').textContent).imports['./js/cutscene-player.js']); m.playCutscene('2'); });
  await p.waitForTimeout(150); assert.ok((await p.textContent('#cutscene .cs-t')).length > 30, 'reduced motion: no typewriter'); await layout(p, name + ' landscape');
  await shot(p, `${SHOTS}/cutscene-mobile-${name}-landscape.png`); await p.tap('#cutscene .cs-skip');
  assert.deepEqual(errs, []); assert.deepEqual(hits, []); await b.close(); console.log(`cutscenes mobile e2e ok (${name})`);
}

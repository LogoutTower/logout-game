// Browser test for the pre-launch gate: node test/e2e.gate.mjs [base]. Serves the real files but swaps the gate hashes for test ones
// (the real team code and GM passphrase are never in the repo), then checks: locked root shows only the gate and loads nothing else,
// a wrong code fails, the team code and the GM pass both unlock (and are remembered), app.html bounces to the gate, and LAUNCH_AT auto-opens it.
import assert from 'node:assert'; import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core'; import { LAUNCH_AT } from '../config.js'; import { offline } from './e2e-offline.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:8765/', sha = s => createHash('sha256').update(s).digest('hex');
const TEAM = 'test-team-code-11', GM = 'test-gm-pass-22', G = { lock: true, at: LAUNCH_AT, h: [sha(TEAM), sha(GM)] }, launch = Date.parse(LAUNCH_AT);
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
async function page(now) {
  const ctx = await b.newContext(), p = await ctx.newPage(), reqs = []; await offline(ctx);
  await ctx.route(/\/(index\.html|app\.html)?(\?.*)?$/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/<!--gate-->[\s\S]*?<!--\/gate-->/, `<!--gate--><script>var G=${JSON.stringify(G)};</script><!--/gate-->`) }); });
  p.on('request', q => reqs.push(q.url())); if (now) await p.clock.install({ time: now });
  return { p, ctx, reqs };
}
const atGame = p => p.waitForURL(/app\.html/, { timeout: 8000 }).then(() => p.waitForSelector('#create, #game', { state: 'attached', timeout: 8000 }));
const enter = async (p, code) => { await p.fill('#c', code); await p.press('#c', 'Enter'); };
const before = launch - 86400e3;
{ // locked: only the gate, nothing else requested
  const { p, ctx, reqs } = await page(before); await p.goto(BASE); await p.waitForTimeout(800);
  assert.ok(!/app\.html/.test(p.url()), 'stays on the gate before launch');
  const vis = await p.evaluate(() => ({ text: document.body.innerText.replace(/Passcode/, '').trim(), inputs: document.querySelectorAll('input').length, title: document.title, game: !!document.getElementById('create') }));
  assert.deepEqual(vis, { text: '', inputs: 1, title: '$LOGOUT', game: false });
  const other = reqs.filter(u => !/\/(\?.*)?$/.test(u) && !/favicon/.test(u)); assert.deepEqual(other, [], 'the gate loads no game files');
  // wrong code
  await enter(p, 'wrong-code-00'); await p.waitForTimeout(900);
  assert.ok(!/app\.html/.test(p.url())); assert.equal(await p.evaluate(() => [document.getElementById('c').className, localStorage.getItem('logout.v1.gate')].join('|')), 'no|');
  // team code unlocks and is remembered
  await enter(p, TEAM); await atGame(p);
  assert.equal(await p.evaluate(() => localStorage.getItem('logout.v1.gate')), sha(TEAM));
  await p.goto(BASE); await atGame(p); await ctx.close();
}
{ // GM pass unlocks the gate and stores the pass the game's staff unlock reads
  const { p, ctx } = await page(before); await p.goto(BASE); await p.waitForTimeout(300); await enter(p, GM); await atGame(p);
  assert.deepEqual(await p.evaluate(() => [localStorage.getItem('logout.v1.gate'), localStorage.getItem('logout.v1.gm')]), [sha(GM), GM]); await ctx.close();
}
{ // app.html directly while locked bounces to the gate
  const { p, ctx } = await page(before); await p.goto(BASE + 'app.html'); await p.waitForTimeout(800);
  assert.ok(!/app\.html/.test(p.url()) && await p.$('#c'), 'app.html sends a locked visitor back to the gate'); await ctx.close();
}
{ // after LAUNCH_AT the gate opens by itself
  const { p, ctx } = await page(launch + 60e3); await p.goto(BASE); await atGame(p); await ctx.close();
}
{ // a gate left open across LAUNCH_AT opens on its next check
  const { p, ctx } = await page(launch - 10e3); await p.goto(BASE); await p.waitForTimeout(300); assert.ok(!/app\.html/.test(p.url()));
  await p.clock.runFor(40e3); await atGame(p); await ctx.close();
}
await b.close(); console.log('ok pre-launch gate: locked, wrong code, team code, GM pass, direct app.html, LAUNCH_AT auto-open');

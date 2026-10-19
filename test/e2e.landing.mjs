// Browser test for /landing/: node test/e2e.landing.mjs [url] [screenshot]. Fully offline: every supabase.co request is mocked here
// (waitlist_count / join_waitlist) and anything else is aborted, so nothing reaches the live backend.
import assert from 'node:assert'; import { chromium } from 'playwright-core';
const URL = process.argv[2] || 'http://127.0.0.1:8765/landing/', SHOT = process.argv[3];
const b = await chromium.launch({ executablePath: process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` });
async function run(count, { mobile = false } = {}) {
  const c = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true } : { viewport: { width: 1100, height: 800 } }), calls = [], errs = [];
  let n = count;
  await c.route(/supabase\.co/, r => { const u = r.request().url(); calls.push(u.replace(/^.*\/rpc\//, ''));
    if (u.endsWith('/rpc/waitlist_count')) return typeof n === 'number' ? r.fulfill({ status: 200, contentType: 'application/json', body: String(n) }) : r.fulfill({ status: n.status, contentType: 'application/json', body: JSON.stringify(n.body) });
    if (u.endsWith('/rpc/join_waitlist')) { if (typeof n === 'number') n++; return r.fulfill({ status: 200, contentType: 'application/json', body: '"ok"' }); }
    return r.abort(); });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '?t=' + Date.now()); await p.waitForTimeout(800);
  const line = () => p.evaluate(() => { const e = document.getElementById('cnt'); return e.hidden || getComputedStyle(e).display === 'none' ? null : e.textContent; });
  return { p, c, calls, errs, line };
}
{ const t = await run(1234); assert.equal(await t.line(), '1,234 registered.');
  await t.p.waitForTimeout(2600); await t.p.fill('#em', 'mock.signup@example.org'); await t.p.click('#go'); await t.p.waitForTimeout(800);
  assert.equal(await t.p.textContent('#go'), 'Noted'); assert.equal(await t.line(), '1,235 registered.', 'count refreshed after signup');
  assert.deepEqual(t.calls, ['waitlist_count', 'join_waitlist', 'waitlist_count']); assert.deepEqual(t.errs, []); await t.c.close(); }
for (const [why, n] of [['zero', 0], ['missing rpc', { status: 404, body: { code: 'PGRST202', message: 'Could not find the function' } }], ['error', { status: 500, body: { message: 'boom' } }]]) {
  const t = await run(n); assert.equal(await t.line(), null, `count hidden when ${why}`); assert.deepEqual(t.errs, []); await t.c.close(); }
if (SHOT) { const t = await run(1337, { mobile: true }); await t.p.waitForTimeout(500); await t.p.screenshot({ path: SHOT }); await t.c.close(); }
await b.close(); console.log('landing count ok: shown, refreshed after signup, hidden on 0 / missing / error');

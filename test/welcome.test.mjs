// waitlist-welcome Edge Function handler + email template, with a mocked fetch (no live Supabase or Brevo calls).
import assert from 'node:assert';
import { makeHandler } from '../supabase/functions/waitlist-welcome/handler.js';
import { render, SUBJECTS, DEFAULT_X_URL } from '../supabase/functions/waitlist-welcome/template.js';
const ENV = { WEBHOOK_SECRET: 's3cret-test', BREVO_API_KEY: 'brevo-test', SUPABASE_URL: 'https://proj.example', SUPABASE_SERVICE_ROLE_KEY: 'svc-test', X_URL: 'https://x.com/LogOutDisabled' };
function world({ brevo = 201, claimed = new Set() } = {}) {
  const rows = new Map([[7, 'new.climber@example.org']]), sent = [], calls = [];
  const fetch = async (url, o = {}) => { calls.push(url.replace(/^https:\/\/[^/]+/, '')); const b = o.body ? JSON.parse(o.body) : {};
    if (url.startsWith('https://proj.example/rest/v1/rpc/')) { assert.equal(o.headers.apikey, 'svc-test');
      if (url.endsWith('waitlist_claim_welcome')) { const e = rows.get(b.p_id); if (!e || claimed.has(b.p_id)) return new Response('null', { status: 200 }); claimed.add(b.p_id); return new Response(JSON.stringify(e), { status: 200 }); }
      if (url.endsWith('waitlist_mark_welcome')) { if (!b.p_sent) claimed.delete(b.p_id); return new Response('', { status: 204 }); } }
    if (url === 'https://api.brevo.com/v3/smtp/email') { assert.equal(o.headers['api-key'], 'brevo-test'); sent.push(b); return new Response(JSON.stringify(brevo < 300 ? { messageId: '<m1@brevo>' } : { message: 'nope' }), { status: brevo }); }
    throw new Error('unexpected fetch ' + url); };
  return { h: makeHandler({ env: k => ENV[k], fetch }), sent, calls, claimed };
}
const req = (body, secret = ENV.WEBHOOK_SECRET, method = 'POST') => new Request('https://fn.example/waitlist-welcome', { method, headers: secret ? { 'x-webhook-secret': secret, 'content-type': 'application/json' } : { 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const ins = (id = 7) => ({ type: 'INSERT', table: 'waitlist', schema: 'public', record: { id, email: 'ignored@payload.example', created_at: 'now' }, old_record: null });
const out = async r => ({ status: r.status, body: await r.json() });

{ const w = world(); // happy path: one send, from the right sender, marked afterwards
  const r = await out(await w.h(req(ins()))); assert.deepEqual(r, { status: 200, body: { sent: true, messageId: '<m1@brevo>' } });
  assert.equal(w.sent.length, 1); const m = w.sent[0];
  assert.deepEqual(m.sender, { name: '$LOGOUT', email: 'logouttower@mail.grokbot.com' }); assert.deepEqual(m.to, [{ email: 'new.climber@example.org' }], 'address comes from the DB claim, not the payload');
  assert.equal(m.subject, SUBJECTS[0]); assert.match(m.htmlContent, /https:\/\/x\.com\/LogOutDisabled/); assert.match(m.textContent, /Reply REMOVE/); assert.match(m.headers['List-Unsubscribe'], /mailto:logouttower@mail\.grokbot\.com\?subject=REMOVE/);
  assert.deepEqual(w.calls, ['/rest/v1/rpc/waitlist_claim_welcome', '/v3/smtp/email', '/rest/v1/rpc/waitlist_mark_welcome']);
  // duplicate delivery of the same webhook: no second send
  assert.deepEqual(await out(await w.h(req(ins()))), { status: 200, body: { skipped: 'already welcomed or in flight' } }); assert.equal(w.sent.length, 1); }
{ const w = world(); // auth
  for (const s of [null, 'wrong', 's3cret-tes', 's3cret-test!']) assert.equal((await w.h(req(ins(), s))).status, 401, `secret ${s}`);
  assert.equal((await makeHandler({ env: k => (k === 'WEBHOOK_SECRET' ? '' : ENV[k]), fetch: async () => { throw new Error('no'); } })(req(ins(), ''))).status, 401, 'empty secret never authorizes');
  assert.equal((await w.h(req(null, ENV.WEBHOOK_SECRET, 'GET'))).status, 405); assert.equal(w.sent.length, 0); assert.deepEqual(w.calls, []); }
{ const w = world(); // non-inserts and junk are ignored without sending
  for (const b of [{ ...ins(), type: 'UPDATE' }, { ...ins(), table: 'profiles' }, { ...ins(), schema: 'auth' }, { ...ins(), record: { id: 'x' } }, {}]) assert.equal((await out(await w.h(req(b)))).body.skipped, 'not a waitlist insert');
  assert.equal(w.sent.length, 0); }
{ const w = world({ brevo: 500 }); // failed send releases the claim, so a retry can try again
  assert.equal((await w.h(req(ins()))).status, 502); assert.equal(w.claimed.has(7), false, 'claim released'); assert.equal(w.sent.length, 1); }
// template: size, placeholders, no game details, no personal names
const r = render(); assert.ok(Buffer.byteLength(r.html) < 30 * 1024); assert.doesNotMatch(r.html + r.text, /\{\{/); assert.match(r.html, /mail-tower\.png/);
assert.doesNotMatch(r.html + r.text, /floor|boss|guild|hero|idle|crawler|token/i, 'no game details'); assert.doesNotMatch(r.html + r.text, /Wanderer|Architect|/i);
assert.match(render({ xUrl: 'javascript:alert(1)' }).html, new RegExp(DEFAULT_X_URL.replace(/[./]/g, '\\$&')), 'unsafe X url falls back');
console.log('ok waitlist-welcome handler + template');

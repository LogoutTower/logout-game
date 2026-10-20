// waitlist-welcome Edge Function handler + email template, with a mocked fetch (no live Supabase or email provider calls).
import assert from 'node:assert';
import { makeHandler } from '../supabase/functions/waitlist-welcome/handler.js';
import { render, SUBJECTS, DEFAULT_X_URL } from '../supabase/functions/waitlist-welcome/template.js';
const BASE = { WEBHOOK_SECRET: 's3cret-test', MAILJET_API_KEY: 'mj-key', MAILJET_SECRET_KEY: 'mj-secret', BREVO_API_KEY: 'brevo-test', RESEND_API_KEY: 're-test',
  SUPABASE_URL: 'https://proj.example', SUPABASE_SERVICE_ROLE_KEY: 'svc-test', X_URL: 'https://x.com/LogOutDisabled' };
const MJ = 'https://api.mailjet.com/v3.1/send', BR = 'https://api.brevo.com/v3/smtp/email', RS = 'https://api.resend.com/emails';
function world({ code = 200, mjStatus = 'success', env = {}, claimed = new Set() } = {}) {
  const ENV = { ...BASE, ...env }, rows = new Map([[7, 'new.climber@example.org']]), sent = [], calls = [];
  const fetch = async (url, o = {}) => { calls.push(url.replace(/^https:\/\/[^/]+/, '')); const b = o.body ? JSON.parse(o.body) : {};
    if (url.startsWith('https://proj.example/rest/v1/rpc/')) { assert.equal(o.headers.apikey, 'svc-test');
      if (url.endsWith('waitlist_claim_welcome')) { const e = rows.get(b.p_id); if (!e || claimed.has(b.p_id)) return new Response('null', { status: 200 }); claimed.add(b.p_id); return new Response(JSON.stringify(e), { status: 200 }); }
      if (url.endsWith('waitlist_mark_welcome')) { if (!b.p_sent) claimed.delete(b.p_id); return new Response('', { status: 204 }); } }
    if (url === MJ) { assert.equal(o.headers.authorization, 'Basic ' + Buffer.from('mj-key:mj-secret').toString('base64')); sent.push({ url, b });
      return new Response(JSON.stringify(code < 300 ? { Messages: [{ Status: mjStatus, To: [{ Email: 'new.climber@example.org', MessageUUID: 'uuid-1', MessageID: 1 }] }] } : { ErrorMessage: 'nope' }), { status: code }); }
    if (url === BR) { assert.equal(o.headers['api-key'], 'brevo-test'); sent.push({ url, b }); return new Response(JSON.stringify({ messageId: '<m1@brevo>' }), { status: code }); }
    if (url === RS) { assert.equal(o.headers.authorization, 'Bearer re-test'); sent.push({ url, b }); return new Response(JSON.stringify({ id: 're-1' }), { status: code }); }
    throw new Error('unexpected fetch ' + url); };
  return { h: makeHandler({ env: k => ENV[k], fetch }), sent, calls, claimed };
}
const req = (body, secret = BASE.WEBHOOK_SECRET, method = 'POST') => new Request('https://fn.example/waitlist-welcome', { method, headers: secret ? { 'x-webhook-secret': secret, 'content-type': 'application/json' } : { 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const ins = (id = 7) => ({ type: 'INSERT', table: 'waitlist', schema: 'public', record: { id, email: 'ignored@payload.example', created_at: 'now' }, old_record: null });
const out = async r => ({ status: r.status, body: await r.json() });

{ const w = world(); // default provider = Mailjet v3.1: one send, right sender, text + html parts, marked afterwards
  assert.deepEqual(await out(await w.h(req(ins()))), { status: 200, body: { sent: true, messageId: 'uuid-1' } });
  assert.equal(w.sent.length, 1); const m = w.sent[0].b.Messages[0]; assert.equal(w.sent[0].b.Messages.length, 1);
  assert.deepEqual(m.From, { Email: 'LogoutTower@proton.me', Name: '$LOGOUT Tower' }); assert.deepEqual(m.To, [{ Email: 'new.climber@example.org' }], 'address comes from the DB claim, not the payload');
  assert.equal(m.Subject, SUBJECTS[0]); assert.match(m.HTMLPart, /https:\/\/x\.com\/LogOutDisabled/); assert.match(m.TextPart, /signup confirmed/); assert.match(m.TextPart, /Reply REMOVE/);
  assert.match(m.Headers['List-Unsubscribe'], /mailto:LogoutTower@proton\.me\?subject=REMOVE/);
  assert.deepEqual(w.calls, ['/rest/v1/rpc/waitlist_claim_welcome', '/v3.1/send', '/rest/v1/rpc/waitlist_mark_welcome']);
  assert.deepEqual(await out(await w.h(req(ins()))), { status: 200, body: { skipped: 'already welcomed or in flight' } }); assert.equal(w.sent.length, 1); }
{ const w = world({ env: { SENDER_EMAIL: 'LogoutTower+test@proton.me', SENDER_NAME: 'Other' } }); await w.h(req(ins()));
  assert.deepEqual(w.sent[0].b.Messages[0].From, { Email: 'LogoutTower+test@proton.me', Name: 'Other' }); }
for (const [code, st] of [[500, 'success'], [200, 'error']]) { const w = world({ code, mjStatus: st }); // failed send releases the claim
  assert.equal((await w.h(req(ins()))).status, 502); assert.equal(w.claimed.has(7), false, 'claim released'); }
{ const w = world({ env: { PROVIDER: 'brevo' }, code: 201 }); // brevo kept
  assert.deepEqual((await out(await w.h(req(ins())))).body, { sent: true, messageId: '<m1@brevo>' }); assert.equal(w.sent[0].url, BR); assert.match(w.sent[0].b.textContent, /signup confirmed/); }
{ const w = world({ env: { PROVIDER: 'resend' } }); // resend optional
  assert.deepEqual((await out(await w.h(req(ins())))).body, { sent: true, messageId: 're-1' }); assert.equal(w.sent[0].b.from, '$LOGOUT Tower <LogoutTower@proton.me>'); }
{ const w = world({ env: { PROVIDER: 'nope' } }); assert.equal((await w.h(req(ins()))).status, 500); assert.equal(w.sent.length, 0); assert.equal(w.claimed.has(7), false); }
{ const w = world({ env: { MAILJET_SECRET_KEY: '' } }); assert.equal((await w.h(req(ins()))).status, 502, 'missing key = failed send'); assert.equal(w.claimed.has(7), false); }
{ const w = world(); // auth
  for (const s of [null, 'wrong', 's3cret-tes', 's3cret-test!']) assert.equal((await w.h(req(ins(), s))).status, 401, `secret ${s}`);
  assert.equal((await makeHandler({ env: k => (k === 'WEBHOOK_SECRET' ? '' : BASE[k]), fetch: async () => { throw new Error('no'); } })(req(ins(), ''))).status, 401, 'empty secret never authorizes');
  assert.equal((await w.h(req(null, BASE.WEBHOOK_SECRET, 'GET'))).status, 405); assert.equal(w.sent.length, 0); assert.deepEqual(w.calls, []); }
{ const w = world();
  for (const b of [{ ...ins(), type: 'UPDATE' }, { ...ins(), table: 'profiles' }, { ...ins(), schema: 'auth' }, { ...ins(), record: { id: 'x' } }, {}]) assert.equal((await out(await w.h(req(b)))).body.skipped, 'not a waitlist insert');
  assert.equal(w.sent.length, 0); }
// template: transactional only, glitched notice, one small footer X link, no promo/coin/token/game language
const r = render(), all = r.html + r.text; assert.ok(Buffer.byteLength(r.html) < 30 * 1024); assert.doesNotMatch(all, /\{\{/); assert.match(r.html, /mail-tower\.png/);
assert.match(all, /WELC0ME T0 THE T0WER/); assert.match(all, /signup confirmed/i);
assert.doesNotMatch(all, /floor|boss|guild|hero|idle|crawler|token|coin|\$LOGOUT token|airdrop|presale|buy|price|launch|offer|reward|free|wallet|crypto|follow|watch the signal/i, 'no promo/coin/game language');
assert.equal((r.html.match(/<a /g) || []).length, 1, 'exactly one link (footer)'); assert.ok(r.html.indexOf('<a ') > r.html.indexOf('</table>'), 'link sits in the footer, below the notice card');
assert.match(render({ xUrl: 'javascript:alert(1)' }).html, new RegExp(DEFAULT_X_URL.replace(/[./]/g, '\\$&')), 'unsafe X url falls back');
console.log('ok waitlist-welcome handler + template (mailjet/brevo/resend)');

// waitlist-welcome: Supabase Database Webhook (INSERT on public.waitlist) -> one Brevo transactional email per new address.
// Checks the shared secret, claims the row (waitlist_claim_welcome) so retries/duplicates never double-send, sends, then marks it.
// Plain JS with injected env + fetch so it runs under Deno (index.ts) and in the Node unit test with a mocked fetch.
import { render } from './template.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function sameSecret(a, b) { // constant-time compare
  const x = new TextEncoder().encode(String(a || '')), y = new TextEncoder().encode(String(b || ''));
  let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0); return d === 0 && x.length > 0;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i;

export function makeHandler({ env, fetch: f = globalThis.fetch }) {
  const need = k => { const v = env(k); if (!v) throw new Error(`missing env ${k}`); return v; };
  const rpc = async (name, args) => {
    const r = await f(`${need('SUPABASE_URL')}/rest/v1/rpc/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: need('SUPABASE_SERVICE_ROLE_KEY'), authorization: `Bearer ${need('SUPABASE_SERVICE_ROLE_KEY')}` }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error(`${name} failed: ${r.status}`); const t = await r.text(); return t ? JSON.parse(t) : null;
  };
  return async req => {
    if (req.method !== 'POST') return json(405, { error: 'method' });
    const secret = env('WEBHOOK_SECRET');
    if (!secret || !sameSecret(req.headers.get('x-webhook-secret'), secret)) return json(401, { error: 'unauthorized' });
    let p; try { p = await req.json(); } catch { return json(400, { error: 'bad json' }); }
    const id = Number(p?.record?.id);
    if (p?.type !== 'INSERT' || p?.table !== 'waitlist' || (p?.schema && p.schema !== 'public') || !Number.isSafeInteger(id) || id <= 0) return json(200, { skipped: 'not a waitlist insert' });
    let email; try { email = await rpc('waitlist_claim_welcome', { p_id: id }); } catch (e) { return json(500, { error: 'claim failed' }); }
    if (!email) return json(200, { skipped: 'already welcomed or in flight' });
    if (!EMAIL.test(email)) { await rpc('waitlist_mark_welcome', { p_id: id, p_sent: true }).catch(() => {}); return json(200, { skipped: 'unsendable address' }); }
    const sender = env('SENDER_EMAIL') || 'logouttower@mail.grokbot.com', mail = render({ xUrl: env('X_URL') || undefined });
    let ok = false, status = 0, messageId = null;
    try {
      const r = await f('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'api-key': need('BREVO_API_KEY') },
        body: JSON.stringify({ sender: { name: env('SENDER_NAME') || '$LOGOUT', email: sender }, replyTo: { email: sender }, to: [{ email }], subject: mail.subject, htmlContent: mail.html, textContent: mail.text,
          headers: { 'List-Unsubscribe': `<mailto:${sender}?subject=REMOVE>` }, tags: ['waitlist-welcome'] }) });
      status = r.status; ok = r.ok; if (ok) messageId = (await r.json().catch(() => ({}))).messageId || null;
    } catch { ok = false; }
    await rpc('waitlist_mark_welcome', { p_id: id, p_sent: ok }).catch(() => {});
    return ok ? json(200, { sent: true, messageId }) : json(502, { error: 'send failed', status });
  };
}

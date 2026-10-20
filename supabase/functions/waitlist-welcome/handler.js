// waitlist-welcome: Supabase Database Webhook (INSERT on public.waitlist) -> one transactional signup confirmation per new address.
// Provider via PROVIDER env: mailjet (default, Send API v3.1), brevo, resend.
// Checks the shared secret, claims the row (waitlist_claim_welcome) so retries/duplicates never double-send, sends, then marks it.
// Plain JS with injected env + fetch so it runs under Deno (index.ts) and in the Node unit test with a mocked fetch.
import { render } from './template.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function sameSecret(a, b) { // constant-time compare
  const x = new TextEncoder().encode(String(a || '')), y = new TextEncoder().encode(String(b || ''));
  let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0); return d === 0 && x.length > 0;
}
export const DEFAULT_SENDER = 'LogoutTower@proton.me', DEFAULT_NAME = '$LOGOUT Tower';
const unsubHeader = sender => `<mailto:${sender}?subject=REMOVE>`;
const b64 = s => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s).toString('base64'));
export const PROVIDERS = {
  async mailjet({ f, need, sender, name, to, mail }) {
    const r = await f('https://api.mailjet.com/v3.1/send', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Basic ${b64(`${need('MAILJET_API_KEY')}:${need('MAILJET_SECRET_KEY')}`)}` },
      body: JSON.stringify({ Messages: [{ From: { Email: sender, Name: name }, ReplyTo: { Email: sender }, To: [{ Email: to }], Subject: mail.subject, TextPart: mail.text, HTMLPart: mail.html,
        Headers: { 'List-Unsubscribe': unsubHeader(sender) }, CustomCampaign: 'waitlist-welcome', TrackOpens: 'disabled', TrackClicks: 'disabled' }] }) });
    const b = await r.json().catch(() => ({})), m = b?.Messages?.[0];
    const ok = r.ok && m?.Status === 'success';
    return { ok, status: r.status, messageId: ok ? String(m?.To?.[0]?.MessageUUID || m?.To?.[0]?.MessageID || '') || null : null };
  },
  async brevo({ f, need, sender, name, to, mail }) {
    const r = await f('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'api-key': need('BREVO_API_KEY') },
      body: JSON.stringify({ sender: { name, email: sender }, replyTo: { email: sender }, to: [{ email: to }], subject: mail.subject, htmlContent: mail.html, textContent: mail.text,
        headers: { 'List-Unsubscribe': unsubHeader(sender) }, tags: ['waitlist-welcome'] }) });
    return { ok: r.ok, status: r.status, messageId: r.ok ? (await r.json().catch(() => ({}))).messageId || null : null };
  },
  async resend({ f, need, sender, name, to, mail }) {
    const r = await f('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${need('RESEND_API_KEY')}` },
      body: JSON.stringify({ from: `${name} <${sender}>`, reply_to: sender, to: [to], subject: mail.subject, html: mail.html, text: mail.text, headers: { 'List-Unsubscribe': unsubHeader(sender) } }) });
    return { ok: r.ok, status: r.status, messageId: r.ok ? (await r.json().catch(() => ({}))).id || null : null };
  },
};
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
    const sender = env('SENDER_EMAIL') || DEFAULT_SENDER, name = env('SENDER_NAME') || DEFAULT_NAME, mail = render({ xUrl: env('X_URL') || undefined });
    const provider = PROVIDERS[(env('PROVIDER') || 'mailjet').toLowerCase()];
    if (!provider) { await rpc('waitlist_mark_welcome', { p_id: id, p_sent: false }).catch(() => {}); return json(500, { error: 'unknown provider' }); }
    let ok = false, status = 0, messageId = null;
    try { ({ ok, status, messageId } = await provider({ f, need, sender, name, to: email, mail })); } catch { ok = false; }
    await rpc('waitlist_mark_welcome', { p_id: id, p_sent: ok }).catch(() => {});
    return ok ? json(200, { sent: true, messageId }) : json(502, { error: 'send failed', status });
  };
}

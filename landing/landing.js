// Waitlist signup → Supabase RPC public.join_waitlist (see supabase/waitlist.sql). No SDK, just one POST.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
const form = document.getElementById('wl'), email = document.getElementById('em'), hp = document.getElementById('site'), btn = document.getElementById('go'), msg = document.getElementById('msg');
const shownAt = Date.now(), MIN_MS = 3000, RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i;
const say = (text, cls) => { msg.textContent = text; msg.className = 'msg ' + cls; };
if (localStorage.getItem('logout.waitlist') === '1') say('Your address is on file. Wait for the call.', 'ok');
form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const e = email.value.trim();
  if (!RE.test(e) || e.length > 254) { say('That email doesn’t look right. Try again?', 'err'); email.focus(); return; }
  if (Date.now() - shownAt < MIN_MS) { say('One moment. Try again in a second.', 'err'); return; }
  btn.disabled = true; btn.textContent = 'Sending…';
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { say('The doors aren’t ready. Check back later.', 'soon'); btn.textContent = 'Notify me'; btn.disabled = false; return; }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/join_waitlist`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ p_email: e, p_hp: hp.value }) });
    if (r.ok) { localStorage.setItem('logout.waitlist', '1'); say('Address received. We’ll call you.', 'ok'); btn.textContent = 'Noted'; form.reset(); return; }
    const body = await r.json().catch(() => ({})), m = `${body.message || ''} ${body.code || ''}`;
    if (r.status === 404 || /PGRST202|PGRST205|42883|42P01|function .* does not exist|schema cache/i.test(m)) say('The doors aren’t ready. Check back later.', 'soon');
    else if (/invalid_email/.test(m)) say('That email doesn’t look right. Try again?', 'err');
    else if (/slow_down/.test(m)) say('Too many at the door. Try again in a minute.', 'err');
    else say('Something flickered. Try again in a moment.', 'err');
  } catch { say('Couldn’t reach the server. Check your connection and try again.', 'err'); }
  btn.disabled = false; btn.textContent = 'Notify me';
});

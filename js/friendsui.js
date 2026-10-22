// Friends view (Guild Hub update, FEATURES.guildHub): render only; every write goes through the backend (server RPCs online).
import { presenceHtml } from './guildhubui.js';
import { presenceOf } from './guildhub.js';
import { FRIEND_CAP } from './friends.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const ago = at => { const s = (Date.now() - Date.parse(at)) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
/** Online first, then most recently seen. */
export const sortFriends = (fr, now = Date.now()) => [...fr].sort((a, b) => (Date.parse(b.seen || 0) || 0) - (Date.parse(a.seen || 0) || 0) || String(a.name).localeCompare(b.name));
export function friendsHtml(L) {
  if (!L) return '<p class="sub">Friends are unavailable right now.</p>';
  const fr = sortFriends(L.friends || []), on = fr.filter(f => presenceOf(f)?.online).length;
  return `<div class="grow fadd"><input id="frName" placeholder="Hero name" maxlength="20" autocomplete="off"><button id="frAdd" class="cta">Add friend</button></div><p class="sub" id="frMsg"></p>
    ${(L.incoming || []).length ? `<h3>Requests</h3>${L.incoming.map(r => `<div class="grow freq"><span><span class="cardlink" data-card="${esc(r.name)}" role="button" tabindex="0">${esc(r.name)}</span> <small class="sub">${ago(r.at)}</small></span><span class="gacts"><button class="cta" data-fracc="${esc(r.id)}">Accept</button><button data-frdec="${esc(r.id)}">Decline</button><button data-frblk="${esc(r.h)}">Block</button></span></div>`).join('')}` : ''}
    <h3>Friends <small class="sub">${fr.length}/${L.cap || FRIEND_CAP} · ${on} online</small></h3>
    ${fr.length ? `<table class="gmem frl"><tr><th>Name</th><th>Floor · status</th><th></th></tr>${fr.map(f => `<tr><td><span class="cardlink" data-card="${esc(f.name)}" role="button" tabindex="0">${esc(f.name)}</span></td><td>${presenceHtml(f) || '<small class="sub">not seen yet</small>'}</td><td class="gacts"><button data-frrm="${esc(f.h)}" data-n="${esc(f.name)}">Remove</button><button data-frblk="${esc(f.h)}">Block</button></td></tr>`).join('')}</table>` : '<p class="sub">No friends yet. Add someone by hero name, or open their ID card and tap Add friend.</p>'}
    ${(L.outgoing || []).length ? `<h3>Sent</h3>${L.outgoing.map(r => `<div class="grow freq"><span>${esc(r.name)} <small class="sub">waiting · ${ago(r.at)}</small></span><button data-frrm="${esc(r.h)}" data-n="${esc(r.name)}">Cancel</button></div>`).join('')}` : ''}
    ${(L.blocked || []).length ? `<details class="frb"><summary>Blocked (${L.blocked.length})</summary>${L.blocked.map(b => `<div class="grow"><span>${esc(b.name)}</span><button data-frunb="${esc(b.h)}">Unblock</button></div>`).join('')}</details>` : ''}
    <p class="sub">Friends see each other's floor and online or last-seen status, nothing else. Up to ${L.cap || FRIEND_CAP} friends. Blocking removes them and stops their requests; they are not told.</p>`;
}
/** Wire the view. ctx: { be, el, refresh } */
export function wireFriends(ctx) {
  const el = ctx.el, $q = s => el.querySelector(s), msg = m => { const x = $q('#frMsg'); if (x) x.textContent = m; };
  const act = async (fn, ok) => { try { await fn(); await ctx.refresh(); const x = $q('#frMsg'); if (x && ok) x.textContent = ok; } catch (e) { msg(String(e.message || e).replace(/^.*?: /, '')); } };
  const add = () => { const n = $q('#frName').value.trim(); if (!n) return msg('enter a hero name'); act(() => ctx.be.friendRequest(n), `friend request sent to ${n}.`); };
  if ($q('#frAdd')) { $q('#frAdd').onclick = add; $q('#frName').onkeydown = e => { if (e.key === 'Enter') add(); }; }
  el.querySelectorAll('[data-fracc]').forEach(b => b.onclick = () => act(() => ctx.be.friendRespond(b.dataset.fracc, true), 'friend added.'));
  el.querySelectorAll('[data-frdec]').forEach(b => b.onclick = () => act(() => ctx.be.friendRespond(b.dataset.frdec, false), 'request declined.'));
  el.querySelectorAll('[data-frrm]').forEach(b => b.onclick = () => confirm(`Remove ${b.dataset.n}?`) && act(() => ctx.be.friendRemove(b.dataset.frrm), 'removed.'));
  el.querySelectorAll('[data-frblk]').forEach(b => b.onclick = () => confirm('Block this hero? They are removed and cannot send you requests.') && act(() => ctx.be.friendBlock(b.dataset.frblk), 'blocked.'));
  el.querySelectorAll('[data-frunb]').forEach(b => b.onclick = () => act(() => ctx.be.friendUnblock(b.dataset.frunb), 'unblocked.'));
}
/** ID card footer: Add friend / Friends ✓ / Requested, plus Block. Never shown on your own card. */
export function cardFriendHtml(name, L) {
  if (!L) return ''; const is = k => (L[k] || []).some(x => x.name === name);
  if (is('blocked')) return `<div class="grow idfr"><small class="sub">Blocked</small></div>`;
  const main = is('friends') ? '<button disabled>Friends ✓</button>' : is('outgoing') ? '<button disabled>Request sent</button>' : `<button class="cta" id="cardFrAdd" data-n="${esc(name)}">${is('incoming') ? 'Accept friend request' : 'Add friend'}</button>`;
  return `<div class="grow idfr">${main}<button id="cardFrBlk" data-n="${esc(name)}">Block</button><small class="sub" id="cardFrMsg"></small></div>`;
}

// Guild Hub UI pieces (FEATURES.guildHub): presence chips, race board, bank buffs. Render only; every write goes through the backend.
import * as H from './guildhub.js';
import { bannerBadge } from './banner.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmtN = n => Number(n || 0).toLocaleString('en-US');
const left = until => { const s = Math.max(0, (Date.parse(until) - Date.now()) / 1000); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m left` : `${Math.max(1, Math.round(s / 60))}m left`; };
/** "● F21 · online" / "○ F20 · last seen 3h ago"; empty when the viewer may not see it. */
export function presenceHtml(p, now = Date.now()) { const x = H.presenceOf(p, now); if (!x) return '';
  return `<span class="pres ${x.online ? 'on' : 'off'}" title="${x.online ? 'Online now' : esc(x.label)}"><i class="pdot" aria-hidden="true"></i>${x.floor ? `F${x.floor} · ` : ''}${esc(x.label)}</span>`; }
export const champHtml = c => c ? `<span class="gchamp" title="Top guild damage on Floor ${c.floor}; held until the next floor falls">🏆 ${H.RACE_TITLE} · F${c.floor}</span>` : '';
export function raceHtml(hub, myId) { if (!hub) return '<p class="sub">Race board unavailable right now.</p>';
  const rows = hub.live.map((r, i) => `<tr class="${r.guild_id === myId ? 'mine' : ''}"><td>${i + 1}</td><td>${bannerBadge(r.banner, r.tag)}[${esc(r.tag)}] ${esc(r.name)}${i === 0 ? ' <small class="lead">leading</small>' : ''}</td><td>${fmtN(r.damage)}</td></tr>`).join('');
  const c = hub.champion;
  return `<div class="grace">${c ? `<div class="gchampcard">${bannerBadge(c.banner, c.tag, 'gbadge big')}<div><b>[${esc(c.tag)}] ${esc(c.name)}</b><div>${champHtml(c)}</div><small class="sub">${fmtN(c.damage)} damage on Floor ${c.floor}. The title moves when the next floor falls.</small></div></div>` : '<p class="sub">No champion yet: the first guild to top a floor takes the title.</p>'}
    <h3>Guild race · Floor ${hub.floor}</h3><table class="gmem"><tr><th>#</th><th>Guild</th><th>Damage</th></tr>${rows || '<tr><td colspan="3" class="sub">No guild damage on this floor yet.</td></tr>'}</table>
    ${(hub.history || []).length ? `<h3>Recent champions</h3><div class="gledger">${hub.history.map(h => `<div>F${h.floor} · ${bannerBadge(h.banner, h.tag)}[${esc(h.tag)}] ${esc(h.name)} <small class="sub">· ${fmtN(h.damage)}</small></div>`).join('')}</div>` : ''}
    <p class="sub">Members' boss damage on the current floor, counted by the server. Staff and team accounts never count. Title only: no gold or items.</p></div>`; }
export function buffsHtml(hub, { mgr, bank, staff }) { const act = hub?.buffs || [];
  return `<h3>Guild buffs</h3>${act.length ? act.map(b => `<div class="grow gbuff on"><span>⚔ <b>+${b.pct}% damage</b> for every member <small class="sub">· ${left(b.until)}${b.by ? ` · bought by ${esc(b.by)}` : ''}</small></span></div>`).join('') : '<p class="sub">No buff active.</p>'}
    ${Object.entries(H.BUFFS).map(([k, b]) => { const on = act.some(a => a.kind === b.kind); return `<div class="grow gup"><span><b>${esc(b.label)}</b> <small class="sub">${fmtN(b.price)}g from the bank · one at a time</small></span>${mgr && !staff ? `<button data-buff="${k}" ${on || bank < b.price ? 'disabled' : ''}>${on ? 'Active' : 'Buy'}</button>` : ''}</div>`; }).join('')}
    <p class="sub">Officers and the leader spend bank gold on buffs. Damage buffs are capped at +${H.MAX_DMG_PCT}% and the server's damage limits rise by the same amount, never more. Staff never get them.</p>`; }

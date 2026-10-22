// Guilds v2 panel (FEATURES.guildsV2): ranks, bank, quests, banner picker, guild chat. All actions go through the backend;
// the server (or LocalBackend) re-checks every rule, the client only hides buttons the player can't use.
import * as R from './guildsv2.js';
import { STAFF_MARK } from './guilds.js';
import { isTeam, teamTag } from './teamstaff.js';
import { bannerIcon, bannerBadge, hallArt } from './banner.js';
import { cleanChat } from './chatfilter.js';
import { presenceHtml, champHtml, raceHtml, buffsHtml } from './guildhubui.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmtN = n => Number(n || 0).toLocaleString('en-US');
const ago = at => { const s = (Date.now() - Date.parse(at)) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
export const TABS = ['overview', 'members', 'race', 'bank', 'quests', 'banner', 'chat'];
let tab = 'overview', draft = null, gchat = [], gchatLast = 0, gchatTimer = null, gchatGuild = null;
export const setGuildTab = t => { if (TABS.includes(t)) tab = t; };
/** Render the v2 panel for a member. ctx: { be, save, el, name, canPost, staff, refresh, log } */
export function renderGuildV2(info, ctx) {
  const g0 = info.guild, sg = !!g0.is_staff, g = { ...g0, banner: R.displayBanner(g0.banner, sg) }, me = info.me, hub = ctx.hub || null, tabs = TABS.filter(t => !(sg && (t === 'bank' || t === 'quests' || t === 'race')) && !(t === 'race' && !hub)), mgr = R.canManage(me.role), lead = me.role === 'leader', el = ctx.el;
  if (!tabs.includes(tab)) tab = 'overview';
  if (gchatGuild !== g.id) { gchatGuild = g.id; gchat = []; gchatLast = 0; }
  const next = R.xpForLevel(g.level + 1), cur = R.xpForLevel(g.level), pct = g.level >= R.LEVEL_CAP ? 100 : Math.min(100, ((g.xp - cur) / (next - cur)) * 100);
  const head = `<div class="ghead">${bannerBadge(g.banner, g.tag, 'gbadge big')}<div><b>[${esc(g.tag)}]${sg ? ` <span class="smark" title="Staff guild">${STAFF_MARK}</span>` : ''} ${esc(g.name)}</b> <small class="role r-${me.role}">${me.role}</small>${hub && hub.champion?.guild_id === g.id ? ' ' + champHtml(hub.champion) : ''}${hub && !sg && hub.buffs?.length ? ` <span class="gbuffchip">⚔ +${hub.buffs[0].pct}% dmg</span>` : ''}
    <div class="sub">${sg ? `Staff guild · Prestige Lv ${g.level}${g.level >= R.LEVEL_CAP ? ' (max)' : ''} · ${info.members.length}/${g.slots} members · invite-only · private · <b class="prest">Prestige only, no rewards</b>` : `Level ${g.level}${g.level >= R.LEVEL_CAP ? ' (max)' : ''} · ${info.members.length}/${g.slots} members · bank ${fmtN(g.bank)}g · ${g.open ? 'open' : 'invite-only'}`}</div>
    <div class="gxp${sg ? ' prestige' : ''}" title="${fmtN(g.xp)} ${sg ? 'prestige' : 'guild'} XP"><i style="width:${pct.toFixed(1)}%"></i></div></div></div>
    <div class="grow tabs gtabs">${tabs.map(t => `<button data-tab="${t}" aria-pressed="${tab === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div><p class="sub" id="gMsg"></p>`;
  let body = ''; const hallLv = sg ? (g.hall_display ?? R.staffHall(g.level)) : g.hall;
  if (tab === 'overview') body = `<p>${sg ? `${STAFF_MARK} Staff guild: no bonus · invite only. <b>Prestige only, no rewards:</b> members' boss damage (staff included) earns guild XP and levels for show. No bonus, bank, quests or payouts; hidden from the guild board.` : ctx.staff ? 'Staff: no guild bonus, and your damage, donations and quests never count for the guild.' : `Guild bonus: <b>+${g.bonus_pct}% XP and gold</b> (max ${R.MAX_BONUS}%). It never changes damage, ranks or rewards.`}</p>
    ${sg ? `<p class="sub">Prestige XP ${fmtN(g.xp)}. Levels only add member slots (up to ${R.MAX_SLOTS}) and cosmetic hall pieces (${hallLv}/5 shown); they never change stats.</p>` : `<p class="sub">Guild XP comes from members' boss damage, counted by the server. Levels add member slots (up to ${R.MAX_SLOTS}) and banner sigils.</p>`}
    <div class="ghall" style='background-image:${hallArt(g.level, hallLv, g.banner)}' role="img" aria-label="Guild hall, ${sg ? 'cosmetic pieces' : 'upgrade'} ${hallLv} of 5"></div>
    ${mgr ? `<div class="grow">${sg ? '' : `<button id="gOpen">${g.open ? 'Make invite-only' : 'Open to everyone'}</button>`}<input id="gInv" placeholder="Tower ID to invite" maxlength="40"><button id="gInvB">Invite</button></div>` : ''}
    ${mgr && info.requests.length ? `<h3>Join requests</h3>${info.requests.map(r => `<div class="grow greq"><span>${esc(r.name)} <small class="sub">${ago(r.at)}</small></span><button data-acc="${esc(r.user_id)}" class="cta">Accept</button><button data-deny="${esc(r.user_id)}">Deny</button></div>`).join('')}` : ''}
    <button id="gLeave">Leave guild</button>`;
  else if (tab === 'members') body = `<table class="gmem"><tr><th>Name</th><th>Rank</th><th>Damage</th><th>${hub ? 'Floor · status' : 'Seen'}</th><th></th></tr>${info.members.map(m => {
      const self = m.user_id === me.user_id, acts = [];
      if (!self && R.canKick(me.role, m.role)) acts.push(`<button data-kick="${esc(m.user_id)}">Kick</button>`);
      if (!self && lead && !m.is_staff) { if (m.role === 'member') acts.push(`<button data-role="officer" data-u="${esc(m.user_id)}">Promote</button>`); if (m.role === 'officer') acts.push(`<button data-role="member" data-u="${esc(m.user_id)}">Demote</button>`); acts.push(`<button data-role="leader" data-u="${esc(m.user_id)}">Make leader</button>`); }
      return `<tr class="${self ? 'mine' : ''}"><td>${hub ? bannerBadge(g.banner, g.tag) : ''}<span class="cardlink" data-card="${esc(m.name)}" role="button" tabindex="0">${m.is_staff ? '◈ ' : ''}${esc(m.name)}${isTeam(m.name) ? ' ' + teamTag() : ''}</span></td><td><small class="role r-${m.role}">${m.role}</small></td><td>${fmtN(m.contrib)}</td><td class="sub">${hub && hub.presence?.[m.name] ? presenceHtml(hub.presence[m.name]) : ago(m.last_active)}</td><td class="gacts">${acts.join('')}</td></tr>`; }).join('')}</table>
    <p class="sub">Officers and the leader invite, kick members and answer requests. The leader promotes, demotes and hands over leadership. A leader inactive for ${R.INACTIVE_DAYS} days passes it to the most active officer.</p>`;
  else if (tab === 'race') body = raceHtml(hub, g.id);
  else if (tab === 'bank') body = `<p>Bank: <b>${fmtN(g.bank)} gold</b>. Gold only: it is spent on guild upgrades and never paid out to players.</p>
    ${ctx.staff ? '<p class="sub">Staff cannot donate.</p>' : `<div class="grow"><input id="gDon" type="number" min="1" max="${R.DONATE_DAILY_CAP}" placeholder="Gold to donate" inputmode="numeric"><button id="gDonB" class="cta">Donate</button></div><p class="sub">You have ${fmtN(Math.floor(ctx.save.gold))}g. At most ${fmtN(R.DONATE_DAILY_CAP)} a day, one donation every ${R.DONATE_COOLDOWN_S}s.</p>`}
    <h3>Upgrades</h3>${Object.entries(R.UPGRADES).map(([k, u]) => { const n = R.nextUpgrade(g, k), cur = g[R.upgradeCol[k]];
      return `<div class="grow gup"><span><b>${esc(u.label)}</b> <small class="sub">${cur}/${u.max}${n ? ` · next ${fmtN(n.cost)}g, guild Lv ${n.level}` : ' · max'}</small></span>${mgr && n ? `<button data-up="${k}" ${n.ok ? '' : 'disabled'}>Buy</button>` : ''}</div>`; }).join('')}
    ${hub ? buffsHtml(hub, { mgr, bank: g.bank, staff: ctx.staff }) : ''}
    <h3>Log</h3><div class="gledger">${info.ledger.length ? info.ledger.map(l => `<div class="l-${l.kind}">${l.kind === 'donate' ? `+${fmtN(l.amount)}g · ${esc(l.name)} donated` : l.kind === 'spend' ? `−${fmtN(l.amount)}g · ${esc(l.name)} bought ${esc(l.item)}` : `+${fmtN(l.amount)}g · ${esc(l.item)}`}<small class="sub"> · ${ago(l.at)}</small></div>`).join('') : '<p class="sub">No donations yet.</p>'}</div>`;
  else if (tab === 'quests') { const mr = info.mreward, share = mr ? `${fmtN(mr.g)}g + XP each` : null;
    body = `<p class="sub">Week ${info.week}: three goals, the same for every guild, counted by the server. Resets Monday 00:00 UTC. Rewards go to guild XP and the bank${share ? `, and every member who helped claims a share (${share}; damage and donations: at least 1% of the goal)` : ''}.</p>${info.quests.map(q => { const p = Math.min(100, (Number(q.progress) / Number(q.target)) * 100), can = share && q.done && q.ok && !q.claimed;
      const mine = q.mine == null ? '' : ` · you: ${q.kind === 'active' ? (q.mine ? 'active' : 'not yet') : fmtN(q.mine)}`;
      const btn = !share || q.mine == null ? '' : `<button data-gqc="${info.week}:${q.idx}" ${can ? '' : 'disabled'}>${q.claimed ? 'Claimed' : can ? 'Claim share' : q.done ? (q.ok ? 'Claim share' : 'No share') : 'In progress'}</button>`;
      return `<div class="gquest ${q.done ? 'done' : ''}"><div><b>${q.done ? '✓ ' : ''}${esc(R.questText(q.kind, Number(q.target)))}</b><div class="gxp"><i style="width:${p.toFixed(1)}%"></i></div><small class="sub">${fmtN(Math.min(Number(q.progress), Number(q.target)))} / ${fmtN(q.target)} · reward ${fmtN(q.xp)} guild XP + ${fmtN(q.gold)}g${mine}</small></div>${btn}</div>`; }).join('')}
      ${(info.prev || []).map(q => `<div class="gquest done"><div><b>Last week: ${esc(R.questText(q.kind, Number(q.target)))}</b><small class="sub">finished · your share is waiting</small></div><button data-gqc="${q.week}:${q.idx}">Claim share</button></div>`).join('')}`; }
  else if (tab === 'banner') { const d = draft || { ...g.banner }; draft = d;
    body = `<div class="gbanner"><i class="gbadge huge" style='background-image:${bannerIcon(d, true)}'></i><div>${mgr ? '' : '<p class="sub">Officers and the leader choose the banner.</p>'}
      <div class="sigils">${sg ? `<button class="sig zero ${d.sigil === R.STAFF_SIGIL ? 'on' : ''}" data-sig="${R.STAFF_SIGIL}" ${mgr ? '' : 'disabled'} title="Floor Zero (staff guild only)"><i style='background-image:${bannerIcon(R.ZERO_BANNER)}'></i></button>` : ''}${R.SIGILS.map((s, i) => `<button class="sig ${d.sigil === s ? 'on' : ''}" data-sig="${s}" ${i < g.sigils && mgr ? '' : 'disabled'} title="${i < g.sigils ? s : 'locked: guild level or a banner unlock'}"><i style='background-image:${bannerIcon({ ...d, sigil: s })}'></i>${i < g.sigils ? '' : '<span class="lk">🔒</span>'}</button>`).join('')}</div>
      ${['c1', 'c2'].map(c => `<div class="pal">${c === 'c1' ? 'Sigil' : 'Field'}: ${R.PALETTE.map(h => `<button class="sw ${d[c] === h ? 'on' : ''}" data-c="${c}" data-h="${h}" style="background:${h}" ${mgr && d.sigil !== R.STAFF_SIGIL ? '' : 'disabled'} aria-label="${h}"></button>`).join('')}</div>`).join('')}
      ${mgr ? '<button id="gBan" class="cta">Save banner</button>' : ''}<p class="sub">${sg ? 'The Floor Zero sigil is exclusive to this guild; its black and gold are fixed. ' : ''}${g.sigils} of ${R.SIGILS.length} sigils unlocked. Shown next to members on the leaderboard, in chat and on the guild board.</p></div></div>`; }
  else if (tab === 'chat') body = `<div class="chatlog gchatlog" id="gChatLog"></div>${ctx.canPost ? `<form class="grow" id="gChatF"><input id="gChatIn" maxlength="200" placeholder="Message your guild" autocomplete="off"><button class="cta">Send</button></form>` : '<p class="sub">Bind your identity (System) to post. You can still read.</p>'}<p class="sub" id="gChatNote">Guild members only. Same filter as floor chat: no links or addresses, 1 message every 10 s.</p>`;
  el.innerHTML = head + body;
  const msg = t => { const m = el.querySelector('#gMsg'); if (m) m.textContent = t; };
  const act = async (f, ok) => { try { await f(); if (ok) ctx.log(ok); await ctx.refresh(); } catch (e) { msg(e.message); } };
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; draft = null; renderGuildV2(info, ctx); });
  const $q = s => el.querySelector(s);
  if ($q('#gOpen')) $q('#gOpen').onclick = () => act(() => ctx.be.guildSetOpen(!g.open), g.open ? 'your guild is now invite-only.' : 'your guild is open to everyone.');
  if ($q('#gInvB')) $q('#gInvB').onclick = () => act(() => ctx.be.guildInvite($q('#gInv').value.trim()), 'invite sent.');
  el.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => act(() => ctx.be.guildAnswer(b.dataset.acc, true), 'request accepted.'));
  el.querySelectorAll('[data-deny]').forEach(b => b.onclick = () => act(() => ctx.be.guildAnswer(b.dataset.deny, false), 'request denied.'));
  el.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => confirm('Kick this member?') && act(() => ctx.be.guildKick(b.dataset.kick), 'member removed.'));
  el.querySelectorAll('[data-role]').forEach(b => b.onclick = () => (b.dataset.role !== 'leader' || confirm('Hand over leadership? You become an officer.')) && act(() => ctx.be.guildSetRole(b.dataset.u, b.dataset.role), `rank changed: ${b.dataset.role}.`));
  if ($q('#gLeave')) $q('#gLeave').onclick = () => confirm('Leave the guild?') && act(() => ctx.be.leaveGuild(), 'you left the guild.');
  if ($q('#gDonB')) $q('#gDonB').onclick = () => { const n = Math.floor(+$q('#gDon').value); if (!(n >= 1)) return msg('enter an amount'); if (n > ctx.save.gold) return msg('not enough gold');
    act(async () => { await ctx.be.guildDonate(n, ctx.save); await ctx.be.saveSave(ctx.save); }, `donated ${fmtN(n)} gold to the guild bank.`); };
  el.querySelectorAll('[data-gqc]').forEach(b => b.onclick = () => { const [w, i] = b.dataset.gqc.split(':').map(Number); b.disabled = true; act(() => ctx.claimQuest ? ctx.claimQuest(w, i) : ctx.be.guildQuestClaim(w, i, ctx.save)); });
  el.querySelectorAll('[data-buff]').forEach(b => b.onclick = () => confirm('Spend bank gold on this guild buff?') && act(() => ctx.be.guildBuyBuff(b.dataset.buff), 'guild buff bought.'));
  el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => confirm(`Spend bank gold on ${R.UPGRADES[b.dataset.up].label}?`) && act(() => ctx.be.guildUpgrade(b.dataset.up), 'guild upgrade bought.'));
  el.querySelectorAll('[data-sig]').forEach(b => b.onclick = () => { if (b.dataset.sig === R.STAFF_SIGIL) draft = { ...R.ZERO_BANNER }; else { if (draft.sigil === R.STAFF_SIGIL) draft = { ...R.DEFAULT_BANNER }; draft.sigil = b.dataset.sig; } renderGuildV2(info, ctx); });
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { draft[b.dataset.c] = b.dataset.h; renderGuildV2(info, ctx); });
  if ($q('#gBan')) $q('#gBan').onclick = () => { const c = R.checkBanner(draft, g.level, g.banner_unlocks, sg); if (!c.ok) return msg(c.reason); act(async () => { try { await ctx.be.guildSetBanner(c.banner.sigil, c.banner.c1, c.banner.c2); } catch (e) { throw c.banner.sigil === R.STAFF_SIGIL && /locked/.test(e.message) ? new Error('The Floor Zero sigil arrives soon.') : e; } draft = null; }, 'banner saved.'); };
  clearInterval(gchatTimer); gchatTimer = null;
  if (tab === 'chat') { const draw = () => { const l = $q('#gChatLog'); if (!l) return; const atEnd = l.scrollHeight - l.scrollTop - l.clientHeight < 40;
      l.innerHTML = gchat.map(m => `<div class="msg ${m.author === 'me' || m.name === ctx.name ? 'me' : ''} ${m.is_staff ? 'staff' : ''}">${bannerBadge(g.banner, g.tag)}<b class="cardlink" data-card="${esc(m.name)}" role="button" tabindex="0">${esc(m.name)}${isTeam(m.name, m.author) ? ' ' + teamTag() : ''}</b><time>${new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time> ${esc(m.body)}</div>`).join('') || '<p class="sub">Quiet in the hall.</p>'; if (atEnd) l.scrollTop = l.scrollHeight; };
    const poll = async () => { if (!el.isConnected || !el.closest('dialog')?.open || document.hidden) return; try { const n = await ctx.be.guildChatFetch(gchatLast); for (const m of n) { gchat.push(m); gchatLast = Math.max(gchatLast, m.id); } gchat = gchat.slice(-100); draw(); } catch {} };
    draw(); poll(); gchatTimer = setInterval(() => { if (!el.closest('dialog')?.open) { clearInterval(gchatTimer); return; } poll(); }, 5000);
    if ($q('#gChatF')) $q('#gChatF').onsubmit = async e => { e.preventDefault(); const v = $q('#gChatIn').value, c = cleanChat(v); if (!c.ok) { $q('#gChatNote').textContent = c.reason; return; }
      try { const m = await ctx.be.guildChatPost(ctx.name, v); $q('#gChatIn').value = ''; if (m && !gchat.some(x => x.id === m.id)) { gchat.push(m); gchatLast = Math.max(gchatLast, m.id); } draw(); } catch (er) { $q('#gChatNote').textContent = er.message; } }; }
}
/** Invites for a player outside any guild. */
export function invitesHtml(info) { return (info?.invites || []).map(i => `<div class="grow greq">${bannerBadge(R.displayBanner(i.banner, i.is_staff), i.tag)}<span>Invite from <b>[${esc(i.tag)}] ${esc(i.name)}</b>${i.is_staff ? ` <small class="sub">${STAFF_MARK} Staff guild: no bonus · invite only</small>` : ''}</span><button class="cta" data-ainv="${i.guild_id}">Accept</button><button data-dinv="${i.guild_id}">Decline</button></div>`).join('')
  + (info?.requests || []).map(r => `<p class="sub">Request pending at [${esc(r.tag)}].</p>`).join(''); }

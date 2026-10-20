// Guilds v2 for LocalBackend (offline/prototype): same rules as the SQL addendum (js/guildsv2.js), stored in this browser only.
import * as R from './guildsv2.js';
import { cleanChat } from './chatfilter.js';
import { localQuest } from './quests.js';
const now = () => Date.now(), iso = () => new Date().toISOString();
const GCHAT = ['regroup at the next layer', 'donated for the hall', 'nice push everyone', 'who is on tonight?', 'quest is almost done', 'officers: accept the new request pls'];
export const localGuildV2 = {
  _gx(g, gu) {
    if (!gu) return null;
    for (const [k, v] of Object.entries({ open: true, xp: 0, bank: 0, bonus_tier: 0, hall: 0, banner_unlocks: 0, banner: { ...R.DEFAULT_BANNER }, ledger: [], quests: {}, requests: [], invites: [], msgs: [], msgNext: 1 })) if (gu[k] === undefined) gu[k] = v;
    const ms = g.members.filter(m => m.guild_id === gu.id);
    for (const m of ms) { if (!m.role) m.role = gu.owner === m.name ? 'leader' : 'member'; if (m.contrib === undefined) m.contrib = 0; if (!m.last_active) m.last_active = iso(); }
    if (gu.is_staff) gu.open = false;
    if (!gu.is_staff && !ms.some(m => m.role === 'leader')) { const h = ms.find(m => !m.is_staff); if (h) { h.role = 'leader'; gu.owner = h.name; } }
    return gu;
  },
  _mine(need = null) {
    const g = this._g(), me = g.members.find(m => m.name === g.me); if (!me) throw new Error('not in a guild');
    const gu = this._gx(g, g.guilds.find(x => x.id === me.guild_id));
    if (need === 'officer' && !R.canManage(me.role)) throw new Error('officers and the leader only');
    if (need === 'leader' && me.role !== 'leader') throw new Error('the leader only');
    return { g, me, gu };
  },
  _qbump(gu, kind, amt, set = false, who = null) {
    if (gu.is_staff) return; // a staff guild never earns quest rewards
    const w = R.weekOf(now()), q = R.weekQuests(w).find(x => x.kind === kind); if (!q) return; const wk = gu.quests[w] || (gu.quests[w] = {}), p = wk[q.idx] || (wk[q.idx] = { progress: 0, done: false });
    if (p.done) return;
    for (const n of [].concat(who || [])) { const c = (p.by ||= {}); c[n] = kind === 'active' ? 1 : (c[n] || 0) + (kind === 'floors' ? 1 : amt); } /* member contributions (personal rewards) */ p.progress = set ? Math.max(p.progress, amt) : p.progress + amt;
    if (p.progress >= q.target) { p.done = true; gu.xp += q.xp; gu.bank += q.gold; gu.ledger.unshift({ id: now(), kind: 'quest', amount: q.gold, item: `Weekly quest: ${kind} (+${q.xp} guild XP)`, at: iso() }); }
    for (const k of Object.keys(gu.quests)) if (+k < w - 1) delete gu.quests[k];
  },
  _gv2Damage(name, amount, staff) {
    if (amount <= 0) return; const g = this._g(), m = g.members.find(x => x.name === name); if (!m) return;
    const gu = this._gx(g, g.guilds.find(x => x.id === m.guild_id)); if (!gu) return;
    // staff guild: prestige XP from every member's damage (staff included); no quests, bank or bonus
    if (gu.is_staff) { m.contrib += amount; m.last_active = iso(); gu.xp += amount; this._sg(g); return; }
    if (staff || m.is_staff) return; m.contrib += amount; m.last_active = iso(); m.active_week = R.weekOf(now()); gu.xp += amount;
    this._qbump(gu, 'damage', amount, false, name); this._qbump(gu, 'active', g.members.filter(x => x.guild_id === gu.id && !x.is_staff && x.active_week === R.weekOf(now())).length, true, name); this._sg(g);
  },
  _gv2Clear(floorDmg) { const g = this._g(); let ch = false; for (const gu of g.guilds) { if (g.members.some(m => m.guild_id === gu.id && !m.is_staff && (floorDmg[m.name] || 0) > 0)) { this._qbump(this._gx(g, gu), 'floors', 1, false, g.members.filter(m => m.guild_id === gu.id && !m.is_staff && (floorDmg[m.name] || 0) > 0).map(m => m.name)); ch = true; } } if (ch) this._sg(g); },
  async guildInfo() {
    const g = this._g(), me = g.members.find(m => m.name === g.me);
    if (!me) return { guild: null, invites: g.guilds.filter(gu => (gu.invites || []).includes(g.me)).map(gu => ({ guild_id: gu.id, name: gu.name, tag: gu.tag, banner: gu.banner || R.DEFAULT_BANNER, is_staff: !!gu.is_staff })), requests: g.guilds.filter(gu => (gu.requests || []).some(r => r.name === g.me)).map(gu => ({ guild_id: gu.id, tag: gu.tag })) };
    const gu = this._gx(g, g.guilds.find(x => x.id === me.guild_id)); this._sg(g); const lv = R.levelOf(gu.xp), w = R.weekOf(now());
    const { ledger, quests, requests, invites, msgs, msgNext, ...pub } = gu;
    return { guild: { ...pub, level: lv, slots: R.slotsOf(lv), bonus_pct: gu.is_staff ? 0 : R.bonusPctOf(gu.bonus_tier), prestige: !!gu.is_staff, hall_display: gu.is_staff ? R.staffHall(lv) : gu.hall, sigils: R.sigilsAvailable(lv, gu.banner_unlocks) }, me: { role: me.role, is_staff: !!me.is_staff, user_id: me.name },
      members: g.members.filter(m => m.guild_id === gu.id).map(m => ({ user_id: m.name, name: m.name, role: m.role, contrib: m.contrib, last_active: m.last_active, is_staff: !!m.is_staff })).sort((a, b) => R.ROLES.indexOf(a.role) - R.ROLES.indexOf(b.role) || b.contrib - a.contrib),
      requests: R.canManage(me.role) && !gu.is_staff ? requests.map(r => ({ user_id: r.name, name: r.name, at: r.at })) : [], ledger: ledger.slice(0, 30),
      quests: gu.is_staff ? [] : R.weekQuests(w).map(q => { const p = quests[w]?.[q.idx], mine = p?.by?.[me.name] || 0; return { ...q, progress: p?.progress || 0, done: !!p?.done, mine, claimed: !!p?.got?.includes(me.name), ok: R.eligible(q.kind, q.target, mine) }; }),
      prev: gu.is_staff ? [] : R.weekQuests(w - 1).filter(q => { const p = quests[w - 1]?.[q.idx]; return p?.done && !p.got?.includes(me.name) && R.eligible(q.kind, q.target, p.by?.[me.name]); }).map(q => ({ week: w - 1, idx: q.idx, kind: q.kind, target: q.target })),
      mreward: R.memberReward(this._w().floor), week: w };
  },
  async guildQuestClaim(week, idx, save) { const { g, me, gu } = this._mine(); const w = R.weekOf(now()); if (week !== w && week !== w - 1) throw new Error('that week is closed');
    const q = R.weekQuests(week).find(x => x.idx === idx), p = gu.quests[week]?.[idx]; if (!q || !p?.by?.[me.name]) throw new Error('you did not help with that quest');
    if ((p.got ||= []).includes(me.name)) throw new Error('already claimed'); if (!p.done) throw new Error('quest not finished yet'); if (!R.eligible(q.kind, q.target, p.by[me.name])) throw new Error('help with at least 1% of the goal to earn a share');
    const rw = R.memberReward(this._w().floor); p.got.push(me.name); save.gold += rw.g; this._sg(g); return { gold: save.gold, add: rw.g, xp: rw.x };
  },
  async guildSetOpen(open) { const { g, gu } = this._mine('officer'); if (gu.is_staff) throw new Error('a staff guild is always invite-only'); gu.open = !!open; this._sg(g); },
  async guildInvite(user) { const { g, gu } = this._mine('officer'); if (!user) throw new Error('no such player'); if (g.members.some(m => m.name === user)) throw new Error('already in a guild'); if (!gu.invites.includes(user)) gu.invites.push(user); this._sg(g); },
  async guildAcceptInvite(gid) { const g = this._g(), gu = this._gx(g, g.guilds.find(x => x.id === gid)); if (!gu || !gu.invites.includes(g.me)) throw new Error('no such invite'); if (g.members.some(m => m.name === g.me)) throw new Error('already in a guild');
    if (g.members.filter(m => m.guild_id === gu.id).length >= R.slotsOf(R.levelOf(gu.xp))) throw new Error('guild is full'); gu.invites = gu.invites.filter(n => n !== g.me); g.members.push({ name: g.me, guild_id: gu.id, role: 'member', contrib: 0, last_active: iso() }); this._sg(g); },
  async guildDeclineInvite(gid) { const g = this._g(), gu = g.guilds.find(x => x.id === gid); if (gu?.invites) { gu.invites = gu.invites.filter(n => n !== g.me); this._sg(g); } },
  async guildAnswer(user, accept) { const { g, gu } = this._mine('officer'); const i = gu.requests.findIndex(r => r.name === user); if (i < 0) throw new Error('no such request'); gu.requests.splice(i, 1);
    if (accept) { if (g.members.filter(m => m.guild_id === gu.id).length >= R.slotsOf(R.levelOf(gu.xp))) throw new Error('guild is full'); g.members.push({ name: user, guild_id: gu.id, role: 'member', contrib: 0, last_active: iso() }); } this._sg(g); },
  async guildKick(user) { const { g, me, gu } = this._mine('officer'); const t = g.members.find(m => m.name === user && m.guild_id === gu.id); if (!t) throw new Error('not in your guild'); if (!R.canKick(me.role, t.role)) throw new Error('you cannot kick that member'); g.members = g.members.filter(m => m !== t); this._sg(g); },
  async guildSetRole(user, role) { const { g, me, gu } = this._mine('leader'); const t = g.members.find(m => m.name === user && m.guild_id === gu.id); if (!t || t === me) throw new Error('not a member you can change');
    if (!R.ROLES.includes(role)) throw new Error('bad role'); if (role !== 'member' && t.is_staff) throw new Error('staff cannot lead or officer a guild');
    if (role === 'leader' && gu.is_staff) throw new Error('staff guild leadership cannot be transferred'); if (role === 'leader') { me.role = 'officer'; gu.owner = t.name; } t.role = role; this._sg(g); },
  async guildDonate(amount, save) { const { g, me, gu } = this._mine(); if (gu.is_staff) throw new Error('a staff guild has no bank'); amount = Math.floor(+amount); if (me.is_staff) throw new Error('staff cannot donate'); if (!(amount >= 1)) throw new Error('amount must be at least 1');
    const mine = gu.ledger.filter(l => l.kind === 'donate' && l.name === me.name && now() - Date.parse(l.at) < 864e5), today = mine.reduce((a, l) => a + l.amount, 0);
    if (mine[0] && now() - Date.parse(mine[0].at) < R.DONATE_COOLDOWN_S * 1000) throw new Error('slow down: one donation every 30 seconds');
    if (today + amount > R.DONATE_DAILY_CAP) throw new Error(`daily donation cap is 25,000 gold (${R.DONATE_DAILY_CAP - today} left today)`);
    if ((save?.gold || 0) < amount) throw new Error('not enough gold in your saved game');
    save.gold -= amount; gu.bank += amount; me.last_active = iso(); me.active_week = R.weekOf(now()); gu.ledger.unshift({ id: now(), name: me.name, kind: 'donate', amount, item: null, at: iso() }); this._qbump(gu, 'donate', amount, false, me.name); this._sg(g); if (save?.heroes) localQuest(save, 'donate', amount, this._w().floor, { inGuild: true }); return { gold: save.gold, bank: gu.bank }; },
  async guildUpgrade(kind) { const { g, me, gu } = this._mine('officer'); if (gu.is_staff) throw new Error('a staff guild has no bank'); const u = R.UPGRADES[kind]; if (!u) throw new Error('unknown upgrade'); const n = R.nextUpgrade(gu, kind);
    if (!n) throw new Error('already at max'); if (R.levelOf(gu.xp) < n.level) throw new Error(`needs guild level ${n.level}`); if (gu.bank < n.cost) throw new Error(`the bank needs ${n.cost} gold`);
    gu.bank -= n.cost; gu[R.upgradeCol[kind]]++; gu.ledger.unshift({ id: now(), name: me.name, kind: 'spend', amount: n.cost, item: `${kind} ${n.step}`, at: iso() }); this._sg(g); },
  async guildSetBanner(sigil, c1, c2) { const { g, gu } = this._mine('officer'); const c = R.checkBanner({ sigil, c1, c2 }, R.levelOf(gu.xp), gu.banner_unlocks, !!gu.is_staff); if (!c.ok) throw new Error(c.reason); gu.banner = c.banner; this._sg(g); },
  async guildChatFetch(after = 0) { const { g, gu } = this._mine(); const t = now(); if (!gu.chatSim) gu.chatSim = t - 60000;
    const mates = g.members.filter(m => m.guild_id === gu.id && m.name !== g.me);
    while (mates.length && gu.chatSim < t - 30000) { gu.chatSim += 30000 + Math.floor(Math.random() * 40000); const n = mates[Math.floor(Math.random() * mates.length)].name; gu.msgs.push({ id: gu.msgNext++, author: 'sim-' + n, name: n, is_staff: false, body: GCHAT[Math.floor(Math.random() * GCHAT.length)], at: new Date(gu.chatSim).toISOString() }); }
    gu.msgs = gu.msgs.slice(-100); this._sg(g); return gu.msgs.filter(m => m.id > after); },
  async guildChatPost(name, body) { const { g, gu } = this._mine(); const r = cleanChat(body); if (!r.ok) throw new Error(r.reason); if (now() - (gu.lastPost || 0) < 10000) throw new Error('slow mode: 1 message every 10 seconds');
    gu.lastPost = now(); const m = { id: gu.msgNext++, author: 'me', name, is_staff: false, body: r.text, at: iso() }; gu.msgs.push(m); gu.msgs = gu.msgs.slice(-100); this._sg(g); return m; },
  async guildTags() { const g = this._g(), out = {}; for (const m of g.members) { const gu = g.guilds.find(x => x.id === m.guild_id); if (gu) out[m.name] = { tag: gu.tag, banner: R.displayBanner(gu.banner, !!gu.is_staff), staff: !!gu.is_staff }; } return out; },
};

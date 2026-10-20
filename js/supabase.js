// SupabaseBackend: same interface as LocalBackend (init, loadSave, saveSave, getFloor, submitDamage, leaderboard) plus identity helpers.
// Only constructed when SUPABASE_URL and SUPABASE_ANON_KEY are set. Free-tier friendly: damage is batched and flushed every
// 60 s, the floor is polled every 60 s (free-tier egress), no realtime subscriptions. The client is injected so tests can use a mock.
import { sanitizeSave } from './gm.js';
import { boardWithStaff } from './ranks.js';
export const FLUSH_MS = 60000, POLL_MS = 60000, LB_MS = 300000, SAVE_MS = 300000; // free-tier egress budget: docs/SCALING-PLAYBOOK.md
// Adaptive cadence: visible + active → FLUSH_MS; background tab → 10 min; idle (no input) 10+ min → 15 min. Offline progress covers the gap.
export const CADENCE = { activeMs: FLUSH_MS, hiddenMs: 600000, idleMs: 900000, idleAfter: 600000 };
// Public board snapshot published by .github/workflows/snapshot.yml (served by GitHub, not billed to Supabase). Fallback: the RPCs.
export const SNAPSHOT_URL = 'https://raw.githubusercontent.com/LogoutTower/logout-game/snapshot/snapshot.json', SNAP_MS = 300000, SNAP_STALE = 1800000;
const SIGN_STATEMENT = 'Sign in to $LOGOUT. This is a signature only: it does not send a transaction, move funds or share your keys.';
/** Last-write-wins by updatedAt. Ties keep the local copy (the cloud copy may be a staff-stripped mirror of it). */
export function mergeSaves(local, cloud) {
  if (!cloud) return local || null; if (!local) return cloud;
  return (local.updatedAt || 0) >= (cloud.updatedAt || 0) ? local : cloud;
}
/** Auth errors that mean "this stored session can never work again" (deleted user, revoked or invalid refresh token). */
export const isDeadSession = e => { const m = String(e?.message || ''), st = e?.status;
  return /user not found|does not exist|invalid refresh token|refresh token not found|session.*(missing|not found)|invalid jwt|bad_jwt/i.test(m) || st === 401 || st === 403 || (st === 400 && /refresh/i.test(m)); };
export class SupabaseBackend {
  name = 'supabase';
  constructor(client, { maxFloor = 20, cacheKey = 'logout.v1', storage = globalThis.localStorage, now = () => Date.now(), redirectTo = '' } = {}) {
    Object.assign(this, { sb: client, maxFloor, k: cacheKey, store: storage, now, redirectTo });
    this.pending = 0; this.lastFlush = 0; this.lastInput = now(); this.snap = null; this.snapAt = 0; this.heads = {}; this.floor = null; this.lastPoll = 0; this.seenClear = 0; this.user = null; this.role = 'player'; this.meta = {};
  }
  async init() {
    let { data } = await this.sb.auth.getSession();
    if (data?.session && await this._staleSession()) { // stored guest was deleted server-side (or its refresh token is dead): start a fresh guest; the local save is kept and merged in by loadSave
      try { await this.sb.auth.signOut({ scope: 'local' }); } catch {} data = null; this.recovered = true;
    }
    if (!data?.session) { const r = await this.sb.auth.signInAnonymously(); if (r.error) throw r.error; data = { session: r.data.session }; } // guest-first
    this.user = data.session.user; await this._profile();
    const seen = this.store.getItem(this.k + '.seenClear'); // clears since this browser last looked are credited; a brand-new guest starts at "now"
    if (seen != null) this.seenClear = +seen || 0;
    else { const { data: lc } = await this.sb.from('floor_clears').select('id').order('id', { ascending: false }).limit(1); this.seenClear = lc?.[0]?.id || 0; this.store.setItem(this.k + '.seenClear', String(this.seenClear)); }
  }
  /** True only when the server definitively rejects the stored session (4xx); network trouble is not "stale". */
  async _staleSession() {
    let r; try { r = await this.sb.auth.getUser(); } catch (e) { return isDeadSession(e); }
    return !!(r?.error && isDeadSession(r.error)) || (!r?.error && !r?.data?.user);
  }
  async _profile() { const { data } = await this.sb.from('profiles').select('role, holder').eq('id', this.user.id).maybeSingle(); this.role = data?.role === 'gm' ? 'gm' : 'player'; this.holder = !!data?.holder; }
  isGm() { return this.role === 'gm'; } // server-decided; profiles.role cannot be self-assigned (see schema.sql)
  isAnonymous() { return !!this.user?.is_anonymous; }
  _local() { return JSON.parse(this.store.getItem(this.k + '.save') || 'null'); }
  async loadSave() {
    const { data } = await this.sb.from('saves').select('data, updated_at').eq('user_id', this.user.id).maybeSingle();
    const cloud = data?.data ? { ...data.data, updatedAt: Date.parse(data.updated_at) || data.data.updatedAt || 0 } : null;
    const s = mergeSaves(this._local(), cloud); if (s) this.store.setItem(this.k + '.save', JSON.stringify(s));
    if (s && s !== cloud) await this._push(s); // first bind / offline edits: local copy wins and is uploaded
    return s;
  }
  async saveSave(s) { // cache locally every time; push to the cloud at most every FLUSH_MS (60 s)
    s.updatedAt = this.now(); this.store.setItem(this.k + '.save', JSON.stringify(s)); this._dirty = s;
    if (this.now() - (this._lastPush || 0) >= SAVE_MS) await this._push(s);
  }
  async _push(s) { if (this.holdUploads) return; this._lastPush = this.now(); this._dirty = null; const { ctx, ...data0 } = s; const data = JSON.parse(JSON.stringify(data0)); if (!this.isGm()) sanitizeSave(data, false); // no staff data reaches the server without the server role
    try { await this.sb.from('saves').upsert({ user_id: this.user.id, data, updated_at: new Date(s.updatedAt || this.now()).toISOString() }); } catch (e) { this._dirty = s; } } // offline/rate-limited: retried on the next flush
  touch() { this.lastInput = this.now(); } // main.js calls this on input
  /** App resumed (load, visibilitychange → visible, pageshow, focus): count it as activity and send the offline/background batch now
   *  instead of waiting for the next 60 s / 10 min / 15 min slot. At most one forced flush per 15 s, so focus/visibility storms cost nothing. */
  resume() { this.lastInput = this.now(); if (this.now() - (this._resumeAt || 0) < 15000) return false; this._resumeAt = this.now(); this.lastFlush = 0; return true; }
  flushEvery() { const hidden = !!globalThis.document?.hidden; if (this.now() - this.lastInput > CADENCE.idleAfter) return CADENCE.idleMs; return hidden ? CADENCE.hiddenMs : CADENCE.activeMs; }
  /** Public snapshot (GitHub-served JSON); null if missing or stale. Fetched at most every SNAP_MS. */
  async snapshot() { if (this.snapUrl === null || typeof this.now !== 'function' || (!this.fetch && !globalThis.document)) return null; // node tests: never the network
    if (this.now() - this.snapAt >= SNAP_MS) { this.snapAt = this.now(); try { const r = await (this.fetch || globalThis.fetch)(this.snapUrl || SNAPSHOT_URL, { cache: 'no-cache' }); if (r.ok) this.snap = await r.json(); } catch {} }
    const s = this.snap; return s && this.now() - Date.parse(s.at) < SNAP_STALE ? s : null; }
  async getFloor() {
    if (!this.floor || this.now() - this.lastPoll >= Math.max(POLL_MS, this.flushEvery())) {
      const { data, error } = await this.sb.from('floor_state').select('*').eq('id', 1).single(); this.lastPoll = this.now();
      if (error || !data) { if (this.floor) return { ...this.floor, hp: this.floor.hp - this.pending }; throw error || new Error('floor unavailable'); } // keep the cached floor when the poll fails
      this.floor = { floor: data.floor, hp: Number(data.hp), maxHp: Number(data.max_hp), gmUntil: Date.parse(data.gm_present_until || 0) || 0, announce: data.gm_announce || null, marks: data.gm_marks || {} };
    }
    return { ...this.floor, hp: this.floor.hp - this.pending };
  }
  /** Batched: damage accumulates locally and is sent to submit_damage at most every FLUSH_MS (60 s). The server clamps it. */
  async submitDamage(playerName, amount, hero = {}) {
    if (this.holdUploads) { const f = await this.getFloor(); return { ...f, advanced: false, accepted: 0, clears: [] }; } // local-only staff: nothing is sent
    this.pending += amount; this.meta = { name: playerName, level: hero.level || 1, gear: hero.gear || 0 }; // staff status is decided by the server role
    if (this.now() - this.lastFlush < this.flushEvery()) { const f = await this.getFloor(); return { ...f, advanced: false, accepted: amount, clears: [] }; }
    return this.flush();
  }
  async flush() {
    const amt = Math.floor(this.pending); this.pending -= amt; this.lastFlush = this.now(); this._lb = null; if (this._dirty) await this._push(this._dirty);
    const args = { p_amount: amt, p_name: this.meta.name || 'Nameless', p_level: this.meta.level || 1, p_gear: this.meta.gear || 0 };
    if (!this.noTick) { const t = await this.sb.rpc('tick', { ...args, p_after: this.seenClear }); // one compact call (egress addendum)
      if (!t.error && t.data) { const d = t.data, before = this.floor?.floor;
        this.floor = { floor: d.f, hp: Number(d.hp), maxHp: Number(d.mx), gmUntil: Date.parse(d.gm || 0) || 0, announce: d.an || null, marks: d.mk || {} }; this.lastPoll = this.now();
        this.heads = { chat: d.cv || 0, guild: d.gv || 0 }; const me = args.p_name;
        const clears = (d.cl || []).map(([id, floor, mx, rank, dm]) => { this.seenClear = Math.max(this.seenClear, id); return { floor, rank: Number(rank), ranking: [], dmg: { [me]: Number(dm) }, maxHp: Number(mx) }; });
        if (clears.length) this.store.setItem(this.k + '.seenClear', String(this.seenClear));
        return { ...this.floor, advanced: d.f !== before && before != null, accepted: Number(d.a), clears, daily: d.dl || null, quests: d.q || null }; }
      if (t.error && /tick|function|schema cache|PGRST202/i.test(t.error.message || '') && !/not signed in/.test(t.error.message || '')) this.noTick = true; // older server: classic path
      else if (t.error) { this.pending += amt; const f = await this.getFloor(); return { ...f, advanced: false, accepted: 0, clears: [], offline: true }; } }
    const { data, error } = await this.sb.rpc('submit_damage', args);
    if (error) { this.pending += amt; const f = await this.getFloor(); return { ...f, advanced: false, accepted: 0, clears: [], offline: true }; } // unreachable / rate-limited: keep the damage and retry next flush
    const before = this.floor?.floor; this.floor = { floor: data.floor, hp: Number(data.hp), maxHp: Number(data.max_hp), gmUntil: Date.parse(data.gm_present_until || 0) || 0, announce: data.gm_announce || null, marks: data.gm_marks || {} }; this.lastPoll = this.now();
    const clears = await this._clears();
    return { ...this.floor, advanced: data.floor !== before && before != null, accepted: Number(data.accepted), clears };
  }
  /** Tower Map history from floor_clears; [] if the table/read is unavailable (never throws). */
  async floorHistory() { const sn = await this.snapshot(); if (sn?.h) return sn.h.map(([floor, at, top]) => ({ floor, at, top }));
    try { const r = await this.sb.rpc('floor_history'); if (!r.error && Array.isArray(r.data)) return r.data; } catch {} // lean RPC (open-chat addendum); older servers: full rows
    try { const { data, error } = await this.sb.from('floor_clears').select('floor, ranking, at').order('id', { ascending: false }).limit(300); if (error || !data) return [];
    return data.map(r => ({ floor: r.floor, at: r.at, top: r.ranking?.[0] || null })); } catch { return []; } }
  /** Heroes who dealt damage on this floor (cheap head count); null if unavailable. */
  async floorHeroes(floor) { try { const { count, error } = await this.sb.from('damage').select('user_id', { count: 'exact', head: true }).eq('floor', floor); return error ? null : count; } catch { return null; } }
  async _clears() { // floors cleared since we last looked: { floor, ranking (non-staff names), dmg {name: dmg}, maxHp }
    try { const me = this.meta?.name || 'Nameless', r = await this.sb.rpc('my_clears', { p_after: this.seenClear, p_name: me }); // lean: my rank + my damage only
      if (!r.error && Array.isArray(r.data)) return r.data.map(c => { this.seenClear = Math.max(this.seenClear, c.id); this.store.setItem(this.k + '.seenClear', String(this.seenClear)); return { floor: c.floor, rank: Number(c.rank), ranking: [], dmg: { [me]: Number(c.dmg) }, maxHp: Number(c.max_hp) }; }); } catch {}
    const { data, error } = await this.sb.from('floor_clears').select('*').gt('id', this.seenClear).order('id'); const out = []; if (error) return out;
    for (const c of data || []) { this.seenClear = Math.max(this.seenClear, c.id); this.store.setItem(this.k + '.seenClear', String(this.seenClear)); out.push({ floor: c.floor, ranking: c.ranking || [], dmg: c.dmg || {}, maxHp: Number(c.max_hp) }); }
    return out;
  }
  async leaderboard(me = null) { // cached LB_MS: the board is redrawn every sync (5 s) but only refetched twice a minute (free-tier egress)
    const f = (await this.getFloor()).floor; const c = this._lb;
    if (c && c.f === f && c.me === me && this.now() - c.at < LB_MS) return c.rows;
    const sn = await this.snapshot(); let rows;
    if (sn && sn.f === f) rows = boardWithStaff(sn.lb.map(([name, damage, staff]) => ({ name, damage: Number(damage), staff: !!staff })), me, 10, { truncated: sn.lb.length >= 25 });
    else rows = await this._leaderboard(f, me);
    this._lb = { f, me, at: this.now(), rows }; return rows;
  }
  async _leaderboard(f, me) {
    const { data, error } = await this.sb.from('damage').select('name, damage, is_staff').eq('floor', f).order('damage', { ascending: false }).limit(25);
    return boardWithStaff((error ? [] : data || []).map(r => ({ name: r.name, damage: Number(r.damage), staff: !!r.is_staff })), me, 10, { truncated: (data || []).length >= 25 });
  }
  // ---- guilds + floor chat (tables from supabase/schema-addendum-guilds-chat.sql; all writes are RPCs)
  async _rpc(fn, args) { if (this.holdUploads) throw new Error('local staff unlock: nothing is sent until the server role is granted'); const { data, error } = await this.sb.rpc(fn, args); if (error) throw new Error(error.message || String(error)); return data; }
  async myGuild() { const { data: m } = await this.sb.from('guild_members').select('guild_id').eq('user_id', this.user.id).maybeSingle(); if (!m) return null;
    const { data: g } = await this.sb.from('guilds').select('*').eq('id', m.guild_id).maybeSingle(); if (!g) return null;
    const board = (await this.guildBoard(true)).find(x => x.id === g.id); return { id: g.id, name: g.name, tag: g.tag, is_staff: !!g.is_staff, owner: g.owner === this.user.id, members: board?.members ?? 1 }; }
  async guildBoard(all = false) { const f = all ? null : (await this.getFloor()).floor; const { data, error } = await this.sb.rpc('guild_board', { p_floor: f }); return error ? [] : (data || []).map((g, i) => ({ ...g, damage: Number(g.damage), members: Number(g.members), rank: i + 1 })); }
  async createGuild(name, tag) { return this._rpc('guild_create', { p_name: name, p_tag: tag }); }
  async joinGuild(tag) { return this._rpc('guild_join', { p_tag: tag }); }
  async leaveGuild() { return this._rpc('guild_leave', {}); }
  // ---- Guilds v2 (FEATURES.guildsV2; needs supabase/schema-addendum-guilds-v2.sql). All writes are RPCs; the server decides.
  async dailyStatus() { try { const { data, error } = await this.sb.rpc('daily_status'); return error ? null : data; } catch { return null; } } // only when the calendar opens
  async guildInfo() { return this._rpc('guild_info', {}); }
  async guildSetOpen(open) { return this._rpc('guild_set_open', { p_open: !!open }); }
  async guildInvite(user) { return this._rpc('guild_invite', { p_user: String(user || '').trim() || null }); }
  async guildAcceptInvite(gid) { return this._rpc('guild_accept_invite', { p_gid: gid }); }
  async guildDeclineInvite(gid) { return this._rpc('guild_decline_invite', { p_gid: gid }); }
  async guildAnswer(user, accept) { return this._rpc('guild_answer', { p_user: user, p_accept: !!accept }); }
  async guildKick(user) { return this._rpc('guild_kick', { p_user: user }); }
  async guildSetRole(user, role) { return this._rpc('guild_set_role', { p_user: user, p_role: role }); }
  /** The server checks and deducts the gold from the cloud save, so push the current save first, then mirror the deduction locally. */
  async guildDonate(amount, save) { if (this.holdUploads) throw new Error('local staff unlock: nothing is sent'); await this._push(save); const r = await this._rpc('guild_donate', { p_amount: Math.floor(+amount) }); save.gold -= Math.floor(+amount); save.updatedAt = this.now(); await this._push(save); return r; }
  // ---- Late-game shop (supabase/schema-addendum-shop.sql). The server prices, gates and takes the gold from the cloud save, so push first, then adopt its gold.
  // ---- Daily quests + guild weekly member rewards + ID cards (schema-addendum-quests-profile.sql). Before it runs these return null / throw a clear message.
  async questState(h = {}) { try { return await this._rpc('quest_state', { p_level: h.level || 1, p_gear: h.gear || 0 }); } catch { return null; } } // only when the panel opens without today's defs
  async questClaim(i, save) { return this._spendRpc('quest_claim', { p_idx: i }, save); }
  async guildQuestClaim(week, idx, save) { return this._spendRpc('guild_quest_claim', { p_week: week, p_idx: idx }, save); }
  /** Read-only public card by board name or chat author; one call per card per CARD_TTL (cached in main.js). null if unknown or the SQL isn't live. */
  async playerCard({ name = null, author = null } = {}) { if (this.noCard) return null; const { data, error } = await this.sb.rpc('player_card', { p_name: name, p_author: author && /^[0-9a-f]{12}$/.test(author) ? author : null });
    if (error) { if (/player_card|function|schema cache|PGRST202/i.test(error.message || '')) this.noCard = true; return null; } return data || null; }
  async staffSanctum(on) { return this._rpc('staff_sanctum', { p_on: !!on }); } // gm role only (schema-addendum-sanctum.sql)
  async shopState() { try { return await this._rpc('shop_state', {}); } catch { return null; } } // only when Goods / the pet panel opens
  async _spendRpc(fn, args, save) { if (this.holdUploads) throw new Error('local staff unlock: nothing is sent'); await this._push(save); const r = await this._rpc(fn, args);
    if (r && r.gold != null) { save.gold = Number(r.gold); save.updatedAt = this.now(); this.store.setItem(this.k + '.save', JSON.stringify(save)); } return r; }
  async shopBuy(id, save) { return this._spendRpc('shop_buy', { p_id: id }, save); }
  async memorialCarve(floor, name, save) { return this._spendRpc('memorial_carve', { p_floor: floor, p_name: name }, save); }
  async tokenUse(kind, name, save) { const r = await this._rpc('token_use', { p_kind: kind, p_name: name || null }); if (kind === 'tok-rename' && r?.name) { save.heroes[0].name = r.name; save.updatedAt = this.now(); } return r; }
  async petEquip(id) { return this._rpc('pet_equip', { p_pet: id }); }
  async memorialWall(floor) { const sn = await this.snapshot(); if (sn?.mw) return sn.mw[floor] || []; try { const { data } = await this.sb.rpc('memorial_wall', { p_floor: floor }); return data || []; } catch { return []; } }
  async decorList() { try { return (await this._rpc('guild_decor_list', {})) || []; } catch { return []; } }
  async decorBuy(id, save) { return this._spendRpc('guild_decor_buy', { p_id: id }, save); }
  async guildUpgrade(kind) { return this._rpc('guild_upgrade', { p_kind: kind }); }
  async guildSetBanner(sigil, c1, c2) { return this._rpc('guild_set_banner', { p_sigil: sigil, p_c1: c1, p_c2: c2 }); }
  async guildChatFetch(after = 0) { const { data, error } = await this.sb.from('guild_messages').select('id, author, name, is_staff, body, at').gt('id', after).order('id', { ascending: true }).limit(50); return error ? [] : data || []; }
  async guildChatPost(name, body) { const m = await this._rpc('guild_chat_post', { p_name: name, p_body: body }); (this.mine ||= new Set()).add(m?.id); return m; }
  async guildTags(floor) { const sn = await this.snapshot(); if (sn && sn.f === floor && sn.tg) return Object.fromEntries(Object.entries(sn.tg).map(([n, [tag, banner, staff]]) => [n, { tag, banner, staff: !!staff }]));
    try { const { data, error } = await this.sb.rpc('guild_tags', { p_floor: floor }); return error ? {} : data || {}; } catch { return {}; } }
  canChat() { return !this.holdUploads; } // every player may post; the server gates guests (5 min of play, rate limits: schema-addendum-open-chat.sql)
  async chatFetch(after = 0) { const f = (await this.getFloor()).floor;
    const { data, error } = await this.sb.from('chat_messages').select('id, floor, author, name, guild_tag, is_staff, body, at').eq('floor', f).gt('id', after).order('id', { ascending: true }).limit(50);
    return error ? [] : data || []; }
  async chatPost(name, body) { const m = await this._rpc('chat_post', { p_name: name, p_body: body }); (this.mine ||= new Set()).add(m?.id); return m; } // own posts never light the badge
  async chatReport(id, reason = null) { return this._rpc('chat_report', { p_id: id, p_reason: reason }); }
  // ---- identity ("bind your identity"). Wallet = message signature only; never transactions, never keys, never funds.
  async bindWallet(wallet = globalThis.window?.phantom?.solana) {
    if (!wallet) throw new Error('Phantom not found');
    const local = this._local();
    const { data, error } = await this.sb.auth.signInWithWeb3({ chain: 'solana', statement: SIGN_STATEMENT, wallet });
    if (error) throw error; this.user = data.user || data.session?.user; await this._profile();
    if (local) { const s = await this.loadSave(); return s; } // merge local progress into the bound account
    return null;
  }
  async bindEmail(email) { // anonymous → permanent via updateUser keeps the same user id (progress carries over); else magic link
    const opts = { emailRedirectTo: this.redirectTo };
    const r = this.isAnonymous() ? await this.sb.auth.updateUser({ email }, opts) : await this.sb.auth.signInWithOtp({ email, options: opts });
    if (r.error) throw r.error; return true;
  }
  async sever() { await this.sb.auth.signOut(); this.store.removeItem(this.k + '.save'); this.user = null; }
  async gmPresence() { if (this.isGm()) await this.sb.rpc('gm_presence'); } // server checks role; non-GMs get an error
  async gmMark(kind, floor, text = null) { if (!this.isGm()) return false; const { data, error } = await this.sb.rpc('gm_mark', { p_kind: kind, p_floor: floor, p_text: text }); if (error) throw new Error(error.message); return data; } // server role only
  async gmAnnounce(floor) { if (this.isGm()) { const { data } = await this.sb.rpc('gm_announce', { p_floor: floor }); return data; } return false; }
}
/** Read-only holder check through a public Solana RPC. Disabled while the mint is empty. */
export async function holderStatus(owner, { rpc, mint, threshold = 0, fetchFn = globalThis.fetch } = {}) {
  if (!mint || !owner) return { enabled: false, holder: false, amount: 0 };
  const res = await fetchFn(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [owner, { mint }, { encoding: 'jsonParsed' }] }) });
  const j = await res.json(), amount = (j.result?.value || []).reduce((s, a) => s + (a.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0), 0);
  return { enabled: true, holder: amount >= threshold && amount > 0, amount };
}

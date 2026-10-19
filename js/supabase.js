// SupabaseBackend: same interface as LocalBackend (init, loadSave, saveSave, getFloor, submitDamage, leaderboard) plus identity helpers.
// Only constructed when SUPABASE_URL and SUPABASE_ANON_KEY are set. Free-tier friendly: damage is batched and flushed every
// 30s, the floor is polled every 30s, no realtime subscriptions. The client is injected so tests can use a mock.
import { sanitizeSave } from './gm.js';
import { boardWithStaff } from './ranks.js';
export const FLUSH_MS = 30000, POLL_MS = 30000;
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
  constructor(client, { maxFloor = 10, cacheKey = 'logout.v1', storage = globalThis.localStorage, now = () => Date.now(), redirectTo = '' } = {}) {
    Object.assign(this, { sb: client, maxFloor, k: cacheKey, store: storage, now, redirectTo });
    this.pending = 0; this.lastFlush = 0; this.floor = null; this.lastPoll = 0; this.seenClear = 0; this.user = null; this.role = 'player'; this.meta = {};
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
  async saveSave(s) { // cache locally every time; push to the cloud at most every FLUSH_MS
    s.updatedAt = this.now(); this.store.setItem(this.k + '.save', JSON.stringify(s)); this._dirty = s;
    if (this.now() - (this._lastPush || 0) >= FLUSH_MS) await this._push(s);
  }
  async _push(s) { if (this.holdUploads) return; this._lastPush = this.now(); this._dirty = null; const { ctx, ...data0 } = s; const data = JSON.parse(JSON.stringify(data0)); if (!this.isGm()) sanitizeSave(data, false); // no staff data reaches the server without the server role
    try { await this.sb.from('saves').upsert({ user_id: this.user.id, data, updated_at: new Date(s.updatedAt || this.now()).toISOString() }); } catch (e) { this._dirty = s; } } // offline/rate-limited: retried on the next flush
  async getFloor() {
    if (!this.floor || this.now() - this.lastPoll >= POLL_MS) {
      const { data, error } = await this.sb.from('floor_state').select('*').eq('id', 1).single(); this.lastPoll = this.now();
      if (error || !data) { if (this.floor) return { ...this.floor, hp: this.floor.hp - this.pending }; throw error || new Error('floor unavailable'); } // keep the cached floor when the poll fails
      this.floor = { floor: data.floor, hp: Number(data.hp), maxHp: Number(data.max_hp), gmUntil: Date.parse(data.gm_present_until || 0) || 0, announce: data.gm_announce || null, marks: data.gm_marks || {} };
    }
    return { ...this.floor, hp: this.floor.hp - this.pending };
  }
  /** Batched: damage accumulates locally and is sent to submit_damage at most every FLUSH_MS. The server clamps it. */
  async submitDamage(playerName, amount, hero = {}) {
    if (this.holdUploads) { const f = await this.getFloor(); return { ...f, advanced: false, accepted: 0, clears: [] }; } // local-only staff: nothing is sent
    this.pending += amount; this.meta = { name: playerName, level: hero.level || 1, gear: hero.gear || 0 }; // staff status is decided by the server role
    if (this.now() - this.lastFlush < FLUSH_MS) { const f = await this.getFloor(); return { ...f, advanced: false, accepted: amount, clears: [] }; }
    return this.flush();
  }
  async flush() {
    const amt = Math.floor(this.pending); this.pending -= amt; this.lastFlush = this.now(); if (this._dirty) await this._push(this._dirty);
    const { data, error } = await this.sb.rpc('submit_damage', { p_amount: amt, p_name: this.meta.name || 'Nameless', p_level: this.meta.level || 1, p_gear: this.meta.gear || 0 });
    if (error) { this.pending += amt; const f = await this.getFloor(); return { ...f, advanced: false, accepted: 0, clears: [], offline: true }; } // unreachable / rate-limited: keep the damage and retry next flush
    const before = this.floor?.floor; this.floor = { floor: data.floor, hp: Number(data.hp), maxHp: Number(data.max_hp), gmUntil: Date.parse(data.gm_present_until || 0) || 0, announce: data.gm_announce || null, marks: data.gm_marks || {} }; this.lastPoll = this.now();
    const clears = await this._clears();
    return { ...this.floor, advanced: data.floor !== before && before != null, accepted: Number(data.accepted), clears };
  }
  /** Tower Map history from floor_clears; [] if the table/read is unavailable (never throws). */
  async floorHistory() { try { const { data, error } = await this.sb.from('floor_clears').select('floor, ranking, at').order('id', { ascending: false }).limit(300); if (error || !data) return [];
    return data.map(r => ({ floor: r.floor, at: r.at, top: r.ranking?.[0] || null })); } catch { return []; } }
  /** Heroes who dealt damage on this floor (cheap head count); null if unavailable. */
  async floorHeroes(floor) { try { const { count, error } = await this.sb.from('damage').select('user_id', { count: 'exact', head: true }).eq('floor', floor); return error ? null : count; } catch { return null; } }
  async _clears() { // floors cleared since we last looked: { floor, ranking (non-staff names), dmg {name: dmg}, maxHp }
    const { data, error } = await this.sb.from('floor_clears').select('*').gt('id', this.seenClear).order('id'); const out = []; if (error) return out;
    for (const c of data || []) { this.seenClear = Math.max(this.seenClear, c.id); this.store.setItem(this.k + '.seenClear', String(this.seenClear)); out.push({ floor: c.floor, ranking: c.ranking || [], dmg: c.dmg || {}, maxHp: Number(c.max_hp) }); }
    return out;
  }
  async leaderboard(me = null) {
    const f = (await this.getFloor()).floor;
    const { data, error } = await this.sb.from('damage').select('name, damage, is_staff').eq('floor', f).order('damage', { ascending: false }).limit(50);
    return boardWithStaff((error ? [] : data || []).map(r => ({ name: r.name, damage: Number(r.damage), staff: !!r.is_staff })), me, 10, { truncated: (data || []).length >= 50 });
  }
  // ---- guilds + floor chat (tables from supabase/schema-addendum-guilds-chat.sql; all writes are RPCs)
  async _rpc(fn, args) { if (this.holdUploads) throw new Error('local staff unlock: nothing is sent until the server role is granted'); const { data, error } = await this.sb.rpc(fn, args); if (error) throw new Error(error.message || String(error)); return data; }
  async myGuild() { const { data: m } = await this.sb.from('guild_members').select('guild_id').eq('user_id', this.user.id).maybeSingle(); if (!m) return null;
    const { data: g } = await this.sb.from('guilds').select('*').eq('id', m.guild_id).maybeSingle(); if (!g) return null;
    const board = (await this.guildBoard(true)).find(x => x.id === g.id); return { id: g.id, name: g.name, tag: g.tag, owner: g.owner === this.user.id, members: board?.members ?? 1 }; }
  async guildBoard(all = false) { const f = all ? null : (await this.getFloor()).floor; const { data, error } = await this.sb.rpc('guild_board', { p_floor: f }); return error ? [] : (data || []).map((g, i) => ({ ...g, damage: Number(g.damage), members: Number(g.members), rank: i + 1 })); }
  async createGuild(name, tag) { return this._rpc('guild_create', { p_name: name, p_tag: tag }); }
  async joinGuild(tag) { return this._rpc('guild_join', { p_tag: tag }); }
  async leaveGuild() { return this._rpc('guild_leave', {}); }
  canChat() { return !this.isAnonymous() && !this.holdUploads; } // identity-bound accounts only (the server checks too)
  async chatFetch(after = 0) { const f = (await this.getFloor()).floor;
    const { data, error } = await this.sb.from('chat_messages').select('id, floor, author, name, guild_tag, is_staff, body, at').eq('floor', f).gt('id', after).order('id', { ascending: true }).limit(50);
    return error ? [] : data || []; }
  async chatPost(name, body) { return this._rpc('chat_post', { p_name: name, p_body: body }); }
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

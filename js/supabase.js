// SupabaseBackend: same interface as LocalBackend (init, loadSave, saveSave, getFloor, submitDamage, leaderboard) plus identity helpers.
// Only constructed when SUPABASE_URL and SUPABASE_ANON_KEY are set. Free-tier friendly: damage is batched and flushed every
// 30s, the floor is polled every 30s, no realtime subscriptions. The client is injected so tests can use a mock.
import { sanitizeSave } from './gm.js';
export const FLUSH_MS = 30000, POLL_MS = 30000;
const SIGN_STATEMENT = 'Sign in to $LOGOUT. This is a signature only: it does not send a transaction, move funds or share your keys.';
/** Last-write-wins by updatedAt. Ties keep the local copy (the cloud copy may be a staff-stripped mirror of it). */
export function mergeSaves(local, cloud) {
  if (!cloud) return local || null; if (!local) return cloud;
  return (local.updatedAt || 0) >= (cloud.updatedAt || 0) ? local : cloud;
}
export class SupabaseBackend {
  name = 'supabase';
  constructor(client, { maxFloor = 10, cacheKey = 'logout.v1', storage = globalThis.localStorage, now = () => Date.now(), redirectTo = '' } = {}) {
    Object.assign(this, { sb: client, maxFloor, k: cacheKey, store: storage, now, redirectTo });
    this.pending = 0; this.lastFlush = 0; this.floor = null; this.lastPoll = 0; this.seenClear = 0; this.user = null; this.role = 'player'; this.meta = {};
  }
  async init() {
    let { data } = await this.sb.auth.getSession();
    if (!data?.session) { const r = await this.sb.auth.signInAnonymously(); if (r.error) throw r.error; data = { session: r.data.session }; } // guest-first
    this.user = data.session.user; await this._profile();
    const seen = this.store.getItem(this.k + '.seenClear'); // clears since this browser last looked are credited; a brand-new guest starts at "now"
    if (seen != null) this.seenClear = +seen || 0;
    else { const { data: lc } = await this.sb.from('floor_clears').select('id').order('id', { ascending: false }).limit(1); this.seenClear = lc?.[0]?.id || 0; this.store.setItem(this.k + '.seenClear', String(this.seenClear)); }
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
  async _push(s) { this._lastPush = this.now(); this._dirty = null; const { ctx, ...data0 } = s; const data = JSON.parse(JSON.stringify(data0)); if (!this.isGm()) sanitizeSave(data, false); // no staff data reaches the server without the server role
    try { await this.sb.from('saves').upsert({ user_id: this.user.id, data, updated_at: new Date(s.updatedAt || this.now()).toISOString() }); } catch (e) { this._dirty = s; } } // offline/rate-limited: retried on the next flush
  async getFloor() {
    if (!this.floor || this.now() - this.lastPoll >= POLL_MS) {
      const { data, error } = await this.sb.from('floor_state').select('*').eq('id', 1).single(); this.lastPoll = this.now();
      if (error || !data) { if (this.floor) return { ...this.floor, hp: this.floor.hp - this.pending }; throw error || new Error('floor unavailable'); } // keep the cached floor when the poll fails
      this.floor = { floor: data.floor, hp: Number(data.hp), maxHp: Number(data.max_hp), gmUntil: Date.parse(data.gm_present_until || 0) || 0, announce: data.gm_announce || null };
    }
    return { ...this.floor, hp: this.floor.hp - this.pending };
  }
  /** Batched: damage accumulates locally and is sent to submit_damage at most every FLUSH_MS. The server clamps it. */
  async submitDamage(playerName, amount, hero = {}) {
    this.pending += amount; this.meta = { name: playerName, level: hero.level || 1, gear: hero.gear || 0 }; // staff status is decided by the server role
    if (this.now() - this.lastFlush < FLUSH_MS) { const f = await this.getFloor(); return { ...f, advanced: false, accepted: amount, clears: [] }; }
    return this.flush();
  }
  async flush() {
    const amt = Math.floor(this.pending); this.pending -= amt; this.lastFlush = this.now(); if (this._dirty) await this._push(this._dirty);
    const { data, error } = await this.sb.rpc('submit_damage', { p_amount: amt, p_name: this.meta.name || 'Nameless', p_level: this.meta.level || 1, p_gear: this.meta.gear || 0 });
    if (error) { this.pending += amt; const f = await this.getFloor(); return { ...f, advanced: false, accepted: 0, clears: [], offline: true }; } // unreachable / rate-limited: keep the damage and retry next flush
    const before = this.floor?.floor; this.floor = { floor: data.floor, hp: Number(data.hp), maxHp: Number(data.max_hp), gmUntil: Date.parse(data.gm_present_until || 0) || 0, announce: data.gm_announce || null }; this.lastPoll = this.now();
    const clears = await this._clears();
    return { ...this.floor, advanced: data.floor !== before && before != null, accepted: Number(data.accepted), clears };
  }
  async _clears() { // floors cleared since we last looked: { floor, ranking (non-staff names), dmg {name: dmg}, maxHp }
    const { data, error } = await this.sb.from('floor_clears').select('*').gt('id', this.seenClear).order('id'); const out = []; if (error) return out;
    for (const c of data || []) { this.seenClear = Math.max(this.seenClear, c.id); this.store.setItem(this.k + '.seenClear', String(this.seenClear)); out.push({ floor: c.floor, ranking: c.ranking || [], dmg: c.dmg || {}, maxHp: Number(c.max_hp) }); }
    return out;
  }
  async leaderboard(me = null) {
    const f = (await this.getFloor()).floor;
    const { data, error } = await this.sb.from('damage').select('name, damage, is_staff').eq('floor', f).order('damage', { ascending: false }).limit(25);
    const rows = (error ? [] : data || []).map(r => ({ name: r.name, damage: Number(r.damage), staff: !!r.is_staff }));
    const ranked = rows.filter(r => !r.staff).map((r, i) => ({ ...r, rank: i + 1 })), top = ranked.slice(0, 10);
    if (me && !top.some(r => r.name === me) && !rows.some(r => r.staff && r.name === me)) top.push(ranked.find(r => r.name === me) || { name: me, damage: 0, rank: ranked.length + 1 });
    return [...rows.filter(r => r.staff).map(r => ({ ...r, rank: 0 })), ...top];
  }
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
  async gmAnnounce(floor) { if (this.isGm()) { const { data } = await this.sb.rpc('gm_announce', { p_floor: floor }); return data; } return false; }
}
/** Read-only holder check through a public Solana RPC. Disabled while the mint is empty. */
export async function holderStatus(owner, { rpc, mint, threshold = 0, fetchFn = globalThis.fetch } = {}) {
  if (!mint || !owner) return { enabled: false, holder: false, amount: 0 };
  const res = await fetchFn(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [owner, { mint }, { encoding: 'jsonParsed' }] }) });
  const j = await res.json(), amount = (j.result?.value || []).reduce((s, a) => s + (a.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0), 0);
  return { enabled: true, holder: amount >= threshold && amount > 0, amount };
}

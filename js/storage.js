// Backend abstraction: LocalBackend (simulated shared tower) or SupabaseBackend.
import { floorBossHp } from './game.js';
import { boardWithStaff } from './ranks.js';
import { GUILD_CAP, checkGuild, guildBoard } from './guilds.js';
import { cleanChat, CHAT_SLOW_MS, CHAT_KEEP } from './chatfilter.js';
import { MAX_FLOOR, SUPABASE_URL, SUPABASE_ANON_KEY, FEATURES } from '../config.js';
// Pre-restyle handles, renamed in older saved worlds so leaderboards stay in-theme.
const LEGACY = ['xX_Reaper', 'mossgirl', 'NoRespawn', 'kaito.exe', 'LastLight', 'Wren', 'gl1tch', 'Ophelia', 'tankmom', 'Byte'];
const FAKE = ['Eldrinn', 'Mossveil', 'Thornwick', 'Kaelith', 'Ravensong', 'Brightmoor', 'LyssDawn', 'Grimhallow', 'SableFen', 'Ironbough'];

// Simulated players arrive on each new floor having already dealt 1-3% of max HP each (~20% total).
export function headStart(w, rnd = Math.random) {
  const max = floorBossHp(w.floor);
  for (const n of FAKE) { const d = Math.floor(max * (0.01 + 0.02 * rnd())); w.dmg[n] = (w.dmg[n] || 0) + d; w.hp -= d; }
}
export class LocalBackend {
  name = 'local';
  constructor() { this.k = 'logout.v1'; }
  async init() {}
  _w() { const w = JSON.parse(localStorage.getItem(this.k + '.world') || 'null'); if (w) { LEGACY.forEach((o, i) => { if (o in w.dmg) { w.dmg[FAKE[i]] = (w.dmg[FAKE[i]] || 0) + w.dmg[o]; delete w.dmg[o]; } }); return w; } const n = { floor: 1, hp: floorBossHp(1), dmg: {}, t: Date.now() }; headStart(n); return n; }
  _sw(w) { localStorage.setItem(this.k + '.world', JSON.stringify(w)); }
  async loadSave() { return JSON.parse(localStorage.getItem(this.k + '.save') || 'null'); }
  async saveSave(s) { s.updatedAt = Date.now(); const { ctx, ...rest } = s; localStorage.setItem(this.k + '.save', JSON.stringify(rest)); } // ctx is runtime-only
  _sim(w) { // fake other players chip at the boss
    const secs = Math.min((Date.now() - w.t) / 1000, 3600); w.t = Date.now();
    for (const n of FAKE) { const d = Math.floor(secs * (5 + (n.length * 7) % 40) * Math.random() * 2 * (this.decree ? 1 + (this.decreePct || 5) / 100 : 1)); /* Shaper's Decree lifts everyone on the floor */ w.dmg[n] = (w.dmg[n] || 0) + d; w.hp -= d; }
    this._adv(w);
  }
  _adv(w) { let adv = 0; w.clears = w.clears || []; while (w.hp <= 0 && w.floor < MAX_FLOOR) { const over = -w.hp; w.clears.push({ floor: w.floor, ranking: Object.entries(w.dmg).sort((a, b) => b[1] - a[1]).filter(e => !(w.staff || {})[e[0]]).map(e => e[0]), dmg: { ...w.dmg }, maxHp: floorBossHp(w.floor) }); w.floor++; adv++; w.hp = floorBossHp(w.floor) - over; w.dmg = {}; headStart(w); } if (w.hp < 0) w.hp = 0; if (w.floor >= MAX_FLOOR && w.hp <= 0 && !w.final) { w.final = 1; w.clears.push({ floor: MAX_FLOOR, ranking: Object.entries(w.dmg).sort((a, b) => b[1] - a[1]).map(e => e[0]), dmg: { ...w.dmg }, maxHp: floorBossHp(w.floor) }); } return adv; }
  async getFloor() { const w = this._w(); this._sim(w); this._sw(w); return { floor: w.floor, hp: w.hp, maxHp: floorBossHp(w.floor), marks: w.marks || {} }; }
  async gmMark(kind, floor, text = null) { const w = this._w(), m = w.marks || (w.marks = {}), p = m[kind]; if (kind !== 'decree6' && kind !== 'echo' && p && p.floor === floor && Date.now() - Date.parse(p.at) < 10 * 60e3) return false;
    m[kind] = { floor, at: new Date().toISOString(), text, until: kind === 'decree6' ? new Date(Date.now() + (text === 'final' ? 120e3 : 10e3)).toISOString() : undefined }; this._sw(w); return true; } // local: this browser only
  async submitDamage(playerName, amount, hero = {}) {
    const w = this._w(); w.dmg[playerName] = (w.dmg[playerName] || 0) + amount; w.hp -= amount; w.staff = w.staff || {}; if (hero.staff) w.staff[playerName] = true; else delete w.staff[playerName];
    const advanced = this._adv(w); const clears = w.clears; w.clears = []; this._sw(w); return { floor: w.floor, hp: w.hp, maxHp: floorBossHp(w.floor), advanced, accepted: amount, clears };
  }
  async leaderboard(me = null) { // staff rows first (rank 0, never ranked), then top 10, plus the player's own row if outside it
    const w = this._w(), st = w.staff || {}; return boardWithStaff(Object.entries(w.dmg).map(([name, damage]) => ({ name, damage, staff: !!st[name] })), me); }
}

// ---- Local guilds + chat (prototype/offline): the simulated players have guilds and chatter; nothing leaves this browser.
const LOCAL_GUILDS = [{ id: 1, name: 'Night Bell', tag: 'NB', members: ['SableFen', 'Grimhallow', 'Kaelith', 'Ironbough'] }, { id: 2, name: 'Ember Court', tag: 'EMB', members: ['Brightmoor', 'Ravensong', 'LyssDawn'] }, { id: 3, name: 'Thornwardens', tag: 'THRN', members: ['Thornwick', 'Mossveil', 'Eldrinn'] }];
const CHATTER = ['anyone else stuck on this layer?', 'Train before Forge early on, trust me', 'that guardian hits like a wall', 'inn is cheap, rest at 30%', 'gg on the last floor', 'saw a Unique drop yesterday, unreal', 'who keeps topping the board', 'push, it is almost down'];
Object.assign(LocalBackend.prototype, {
  _g() { return JSON.parse(localStorage.getItem(this.k + '.guilds') || 'null') || { next: 4, guilds: LOCAL_GUILDS.map(({ members, ...g }) => g), members: LOCAL_GUILDS.flatMap(g => g.members.map(name => ({ name, guild_id: g.id }))), me: null }; },
  _sg(g) { localStorage.setItem(this.k + '.guilds', JSON.stringify(g)); },
  async myGuild() { const g = this._g(), m = g.me && g.members.find(x => x.name === g.me); const gu = m && g.guilds.find(x => x.id === m.guild_id); return gu ? { ...gu, owner: gu.owner === g.me, members: g.members.filter(x => x.guild_id === gu.id).length } : null; },
  async guildBoard(all = false) { const w = this._w(), st = w.staff || {}, g = this._g(); return guildBoard(Object.entries(w.dmg).map(([name, damage]) => ({ name, damage, staff: !!st[name] })), g.members, g.guilds); },
  async createGuild(name, tag, me) { const g = this._g(), c = checkGuild(name, tag); if (!c.ok) throw new Error(c.reason); if (me?.staff) throw new Error('staff cannot own a guild');
    if (g.members.some(x => x.name === me?.name)) throw new Error('already in a guild'); if (g.guilds.some(x => x.name.toLowerCase() === c.name.toLowerCase() || x.tag === c.tag)) throw new Error('name or tag taken');
    const gu = { id: g.next++, name: c.name, tag: c.tag, owner: me.name }; g.guilds.push(gu); g.members.push({ name: me.name, guild_id: gu.id }); g.me = me.name; this._sg(g); return gu; },
  async joinGuild(tag, me) { const g = this._g(), gu = g.guilds.find(x => x.tag === String(tag).toUpperCase()); if (!gu) throw new Error('no such guild');
    if (g.members.some(x => x.name === me?.name)) throw new Error('already in a guild'); if (g.members.filter(x => x.guild_id === gu.id).length >= GUILD_CAP) throw new Error('guild is full');
    g.members.push({ name: me.name, guild_id: gu.id, is_staff: !!me.staff }); g.me = me.name; this._sg(g); return gu; },
  async leaveGuild() { const g = this._g(), m = g.members.find(x => x.name === g.me); if (!m) return; g.members = g.members.filter(x => x !== m); const gu = g.guilds.find(x => x.id === m.guild_id);
    if (gu && gu.owner === g.me) { const heir = g.members.find(x => x.guild_id === gu.id && !x.is_staff); if (heir) gu.owner = heir.name; } if (!g.members.some(x => x.guild_id === m.guild_id)) g.guilds = g.guilds.filter(x => x.id !== m.guild_id); g.me = null; this._sg(g); },
  canChat() { return true; },
  _c() { return JSON.parse(localStorage.getItem(this.k + '.chat') || 'null') || { next: 1, msgs: [], last: 0, sim: 0 }; },
  async chatFetch(after = 0) { const f = this._w().floor, c = this._c(), now = Date.now(), g = this._g();
    if (!c.sim) c.sim = now - 90000; while (c.sim < now - 20000) { c.sim += 20000 + Math.floor(Math.random() * 25000); const n = FAKE[Math.floor(Math.random() * FAKE.length)], m = g.members.find(x => x.name === n), tg = m && g.guilds.find(x => x.id === m.guild_id)?.tag;
      c.msgs.push({ id: c.next++, floor: f, author: 'sim-' + n, name: n, guild_tag: tg || null, is_staff: false, body: CHATTER[Math.floor(Math.random() * CHATTER.length)], at: new Date(c.sim).toISOString() }); }
    c.msgs = c.msgs.filter(m => m.floor === f).slice(-CHAT_KEEP); localStorage.setItem(this.k + '.chat', JSON.stringify(c)); return c.msgs.filter(m => m.id > after && !m.hidden); },
  async chatPost(name, body, me = {}) { const c = this._c(); if (Date.now() - c.last < CHAT_SLOW_MS) throw new Error('slow mode: 1 message every 10 seconds');
    const r = cleanChat(body); if (!r.ok) throw new Error(r.reason); const n = cleanChat(name, 20); if (!n.ok || n.text !== name) throw new Error('name not allowed in chat');
    const g = this._g(), mm = g.members.find(x => x.name === name), tg = mm && g.guilds.find(x => x.id === mm.guild_id)?.tag;
    const m = { id: c.next++, floor: this._w().floor, author: 'me', name, guild_tag: tg || null, is_staff: !!me.staff, body: r.text, at: new Date().toISOString() };
    c.last = Date.now(); c.msgs.push(m); c.msgs = c.msgs.slice(-CHAT_KEEP); localStorage.setItem(this.k + '.chat', JSON.stringify(c)); return m; },
  async chatReport(id) { const c = this._c(), m = c.msgs.find(x => x.id === id); if (m) m.hidden = true; localStorage.setItem(this.k + '.chat', JSON.stringify(c)); },
});
/** Online only when configured AND flagged on; any failure falls back to the local backend so the game always starts. */
export const onlineConfigured = (url = SUPABASE_URL, key = SUPABASE_ANON_KEY, flags = FEATURES) => !!(url && key && flags?.online === 'all');
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
export const ONLINE_TIMEOUT_MS = 15000; // slow mobile networks need headroom for sign-in + first floor read
/** Plain-words reason the game is playing locally; shown in the System panel. */
export function fallbackReason(e, { configured = onlineConfigured(), storageOk = true } = {}) {
  if (!configured) return 'Online mode is switched off on this server.';
  if (!storageOk) return 'This browser is blocking site storage (private browsing or a storage setting), so the tower cannot keep you signed in.';
  const m = String(e?.message || e || ''), st = e?.status || e?.code;
  if (st === 429 || /rate limit|too many/i.test(m)) return 'The tower is rate-limiting new guest sign-ins from this network. Try again in a little while.';
  if (/timeout/i.test(m)) return 'The tower did not answer in time (slow or blocked connection).';
  if (/fetch|network|load failed|import/i.test(m)) return 'Could not reach the tower (network error or a content blocker).';
  return 'Online sign-in failed: ' + m.slice(0, 120);
}
const storageWorks = () => { try { localStorage.setItem('logout.v1.probe', '1'); localStorage.removeItem('logout.v1.probe'); return true; } catch { return false; } };
export async function makeBackend() {
  let reason = null; const storageOk = storageWorks();
  if (onlineConfigured() && storageOk) {
    try {
      const [{ createClient }, { SupabaseBackend }] = await Promise.all([import('./vendor/supabase.js'), import('./supabase.js')]); // self-hosted: no third-party CDN to block or stall
      const b = new SupabaseBackend(createClient(SUPABASE_URL, SUPABASE_ANON_KEY), { maxFloor: MAX_FLOOR, redirectTo: location.origin + location.pathname });
      await withTimeout((async () => { await b.init(); await b.getFloor(); })(), ONLINE_TIMEOUT_MS); return b; // sign-in + first floor read must succeed, else play locally
    } catch (e) { reason = fallbackReason(e); console.warn('Online mode unavailable, playing offline:', e?.message || e); }
  } else reason = fallbackReason(null, { storageOk });
  const b = new LocalBackend(); b.fallback = reason; await b.init(); return b;
}

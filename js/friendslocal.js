// Friends list for LocalBackend (offline/prototype): same rules as the SQL (js/friends.js), this browser only. Handles are hero names here;
// the server hands out opaque handles instead (never user ids).
import * as F from './friends.js';
const iso = (ms = Date.now()) => new Date(ms).toISOString();
export const localFriends = {
  _f() { return JSON.parse(localStorage.getItem(this.k + '.friends') || 'null') || { next: 1, friends: [], incoming: [], outgoing: [], blocked: [], sent: [] }; },
  _sf(f) { localStorage.setItem(this.k + '.friends', JSON.stringify(f)); },
  _meName() { try { return JSON.parse(localStorage.getItem(this.k + '.save'))?.heroes?.[0]?.name || null; } catch { return null; } },
  _isFriend(n) { return this._f().friends.some(x => x.name === n); },
  _exists(n) { const w = this._w(), g = this._g(); return n in (w.dmg || {}) || g.members.some(m => m.name === n); },
  _pres(n) { const g = this._g(), w = this._w(), m = g.members.find(x => x.name === n), f = this._f().friends.find(x => x.name === n);
    return { floor: Math.min(w.floor, f?.floor ?? m?.floor ?? w.floor), seen: f?.seen || m?.last_active || null }; },
  async friendsList() { const f = this._f(); return { cap: F.FRIEND_CAP,
    friends: f.friends.map(x => ({ h: x.name, name: x.name, since: x.since, ...this._pres(x.name) })),
    incoming: f.incoming.map(x => ({ id: x.id, h: x.name, name: x.name, at: x.at })), outgoing: f.outgoing.map(x => ({ id: x.id, h: x.name, name: x.name, at: x.at })),
    blocked: f.blocked.map(x => ({ h: x.name, name: x.name })) }; },
  async friendRequest(name) { const f = this._f(), n = F.cleanName(name), hour = Date.now() - 3600e3; f.sent = f.sent.filter(t => t > hour);
    const inc = f.incoming.find(x => x.name === n); if (inc) return this.friendRespond(inc.id, true); // they already asked: accept
    const c = F.checkRequest(this._meName(), n, { exists: this._exists(n), friends: f.friends.map(x => x.name), outgoing: f.outgoing.map(x => x.name), blocked: f.blocked.map(x => x.name), sentLastHour: f.sent.length });
    if (!c.ok) throw new Error(c.reason); f.sent.push(Date.now()); f.outgoing.push({ id: f.next++, name: n, at: iso() }); this._sf(f); return { sent: true }; },
  async friendRespond(id, accept) { const f = this._f(), r = f.incoming.find(x => x.id === +id); if (!r) throw new Error('request not found');
    f.incoming = f.incoming.filter(x => x !== r);
    if (accept) { if (f.friends.length >= F.FRIEND_CAP) throw new Error(`friend list full (${F.FRIEND_CAP})`); if (!f.friends.some(x => x.name === r.name)) f.friends.push({ name: r.name, since: iso() }); f.outgoing = f.outgoing.filter(x => x.name !== r.name); }
    this._sf(f); return { ok: true }; },
  async friendRemove(h) { const f = this._f(); f.friends = f.friends.filter(x => x.name !== h); this._sf(f); return { ok: true }; },
  async friendBlock(ref) { const f = this._f(), n = F.cleanName(ref); if (!n || n === this._meName()) throw new Error('cannot block that hero');
    f.friends = f.friends.filter(x => x.name !== n); f.incoming = f.incoming.filter(x => x.name !== n); f.outgoing = f.outgoing.filter(x => x.name !== n);
    if (!f.blocked.some(x => x.name === n)) f.blocked.push({ name: n, at: iso() }); this._sf(f); return { ok: true }; },
  async friendUnblock(h) { const f = this._f(); f.blocked = f.blocked.filter(x => x.name !== h); this._sf(f); return { ok: true }; },
};

// Guild Hub for LocalBackend (offline/prototype): same rules as supabase/schema-addendum-guild-hub.sql (js/guildhub.js), this browser only.
import * as H from './guildhub.js';
import { displayBanner } from './guildsv2.js';
const iso = () => new Date().toISOString();
const raceRows = (dmg = {}, staff = {}) => Object.entries(dmg).map(([name, damage]) => ({ name, damage, staff: !!staff[name] }));
const pub = (gu, r) => ({ guild_id: gu.id, tag: gu.tag, name: gu.name, banner: displayBanner(gu.banner, false), damage: r.damage });
export const localGuildHub = {
  _ghClear(floor, dmg, staff) { const g = this._g(), top = H.raceBoard(raceRows(dmg, staff), g.members, g.guilds)[0]; if (!top) return; const gu = g.guilds.find(x => x.id === top.id);
    const first = !(g.raceWins || []).some(x => x.floor === floor), pay = H.racePayout(floor);
    g.raceWins = (g.raceWins || []).filter(x => x.floor !== floor).concat({ floor, ...pub(gu, top), payout: pay, at: iso() }).slice(-30);
    if (first && !gu.is_staff) { gu.bank = (gu.bank || 0) + pay; (gu.ledger ||= []).unshift({ id: Date.now(), kind: 'race', amount: pay, item: `${H.RACE_TITLE} · Floor ${floor}`, at: iso() }); } this._sg(g); },
  async guildHub() { const g = this._g(), w = this._w(), me = g.members.find(m => m.name === g.me), gu = me && g.guilds.find(x => x.id === me.guild_id);
    const live = H.raceBoard(raceRows(w.dmg, w.staff), g.members, g.guilds).slice(0, 10).map(r => pub(g.guilds.find(x => x.id === r.id), r));
    const champ = (g.raceWins || []).find(x => x.floor === w.floor - 1) || null, now = Date.now(); // like the server: only the floor that just fell
    return { floor: w.floor, live, champion: champ, history: (g.raceWins || []).filter(x => x.floor < w.floor).sort((a, b) => b.floor - a.floor).slice(0, 5), buffs: gu ? (gu.buffs || []).filter(b => Date.parse(b.until) > now) : [] }; },
  async guildBuyBuff(key) { const { g, me, gu } = this._mine('officer'); gu.buffs = (gu.buffs || []).filter(b => Date.parse(b.until) > Date.now());
    const c = H.checkBuff(key, { role: me.role, bank: gu.bank, staffGuild: !!gu.is_staff, active: gu.buffs }); if (!c.ok) throw new Error(c.reason);
    const until = new Date(Date.now() + c.buff.hours * 3600e3).toISOString(); gu.bank -= c.buff.price; gu.buffs.push({ kind: c.buff.kind, pct: c.buff.pct, until, by: me.name });
    gu.ledger.unshift({ id: Date.now(), kind: 'spend', name: me.name, amount: c.buff.price, item: c.buff.label, at: iso() }); this._sg(g); return { until }; },
  /** Presence for names: only yourself, your guildmates and your friends; everyone else is left out (the server does the same). */
  async guildPresence(names) { const g = this._g(), w = this._w(), me = g.members.find(m => m.name === g.me), out = {};
    for (const n of [].concat(names || []).slice(0, H.PRESENCE_MAX)) { const self = n === g.me, m = g.members.find(x => x.name === n);
      if (!H.canSeePresence(me?.guild_id, m?.guild_id, self, !!this._isFriend?.(n))) continue; out[n] = self ? { floor: w.floor, seen: iso() } : this._isFriend?.(n) ? this._pres(n) : { floor: m?.floor ?? w.floor, seen: m?.last_active || null }; }
    return out; },
};

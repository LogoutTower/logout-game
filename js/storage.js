// Backend abstraction: LocalBackend (simulated shared tower) or SupabaseBackend.
import { floorBossHp } from './game.js';
import { MAX_FLOOR } from '../config.js';
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
  async saveSave(s) { localStorage.setItem(this.k + '.save', JSON.stringify(s)); }
  _sim(w) { // fake other players chip at the boss
    const secs = Math.min((Date.now() - w.t) / 1000, 3600); w.t = Date.now();
    for (const n of FAKE) { const d = Math.floor(secs * (5 + (n.length * 7) % 40) * Math.random() * 2); w.dmg[n] = (w.dmg[n] || 0) + d; w.hp -= d; }
    this._adv(w);
  }
  _adv(w) { let adv = 0; w.clears = w.clears || []; while (w.hp <= 0 && w.floor < MAX_FLOOR) { const over = -w.hp; w.clears.push({ floor: w.floor, ranking: Object.entries(w.dmg).sort((a, b) => b[1] - a[1]).map(e => e[0]), dmg: { ...w.dmg }, maxHp: floorBossHp(w.floor) }); w.floor++; adv++; w.hp = floorBossHp(w.floor) - over; w.dmg = {}; headStart(w); } if (w.hp < 0) w.hp = 0; if (w.floor >= MAX_FLOOR && w.hp <= 0 && !w.final) { w.final = 1; w.clears.push({ floor: MAX_FLOOR, ranking: Object.entries(w.dmg).sort((a, b) => b[1] - a[1]).map(e => e[0]), dmg: { ...w.dmg }, maxHp: floorBossHp(w.floor) }); } return adv; }
  async getFloor() { const w = this._w(); this._sim(w); this._sw(w); return { floor: w.floor, hp: w.hp, maxHp: floorBossHp(w.floor) }; }
  async submitDamage(playerName, amount) {
    const w = this._w(); w.dmg[playerName] = (w.dmg[playerName] || 0) + amount; w.hp -= amount;
    const advanced = this._adv(w); const clears = w.clears; w.clears = []; this._sw(w); return { floor: w.floor, hp: w.hp, maxHp: floorBossHp(w.floor), advanced, accepted: amount, clears };
  }
  async leaderboard(me = null) { // top 10, plus the player's own row (with rank) if they are outside it
    const all = Object.entries(this._w().dmg).map(([name, damage]) => ({ name, damage })).sort((a, b) => b.damage - a.damage).map((r, i) => ({ ...r, rank: i + 1 }));
    const top = all.slice(0, 10); if (me && !top.some(r => r.name === me)) top.push(all.find(r => r.name === me) || { name: me, damage: 0, rank: all.length + 1 }); return top; }
}

// Future: add SupabaseBackend with the same interface and select it here.
export async function makeBackend() { const b = new LocalBackend(); await b.init(); return b; }

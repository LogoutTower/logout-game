// Late-game shop for LocalBackend (offline/prototype): same rules as supabase/schema-addendum-shop.sql, stored in this browser only.
import { SHOP, DECOR, memorialPrice, prestigePrice, petPerk, PETS, PET_RARITY, MEMORIAL_SHOW } from './prestige.js';
import { cleanChat } from './chatfilter.js';
export const RESERVED_NAME = /(staff|admin|moderator|\bgm\b|umbra|architect|shaper|system)/i;
export const nameOk = n => { const c = cleanChat(n, 20); return n.length >= 2 && n.length <= 20 && c.ok && c.text === n && !RESERVED_NAME.test(n); };
const ODDS = a => a >= 2 ? [35, 30, 20, 10, 4, 1] : [55, 27, 12, 5, 0.9, 0.1];
const UNIQUE_NAMES = ['Cinderwake', 'Hollowlight', 'Gearheart', 'Rimesong', 'Lastlantern', 'Stonewhisper', 'Brassveil', 'Emberhush'];
/** Server-equivalent pet roll (used by the local backend only; the live game rolls in pet_grant()). */
export function rollPet(arc, taken = [], r = Math.random) { let x = r() * 100, i = 0; const w = ODDS(arc); while (i < 5 && x >= w[i]) { x -= w[i]; i++; }
  let rarity = PET_RARITY[i], uname = null; const sp = PETS[Math.floor(r() * PETS.length)].sp;
  if (rarity === 'unique') { const free = UNIQUE_NAMES.filter(n => !taken.includes(n)); if (free.length) uname = free[Math.floor(r() * free.length)]; else rarity = 'legendary'; }
  return { sp, rarity, perk: petPerk(sp, rarity), uname }; }
const arcOf = f => Math.ceil(f / 10);
export const localShop = {
  _sh() { const s = JSON.parse(localStorage.getItem(this.k + '.shop') || 'null') || {}; return { owned: [], tokens: {}, sold: {}, pets: [], active: null, walls: {}, carved: [], decor: {}, petSeq: 1, ...s }; },
  _ssh(s) { localStorage.setItem(this.k + '.shop', JSON.stringify(s)); },
  _spend(save, n) { if (!(save.gold >= n)) throw new Error('not enough gold in your saved game'); save.gold -= n; save.updatedAt = Date.now(); },
  async shopState() { const s = this._sh(), w = this._w(); return { owned: s.owned, tokens: s.tokens, pets: s.pets, active: s.active, arc: w.floor, prices: Object.fromEntries(SHOP.filter(i => i.kind === 'prestige').map(i => [i.id, prestigePrice(i, s.sold[i.id] || 0)])) }; },
  async shopBuy(id, save) { const s = this._sh(), w = this._w(), it = SHOP.find(i => i.id === id); if (!it) throw new Error('unknown item');
    const cleared = w.floor > it.arc * 10 || (w.floor === it.arc * 10 && w.hp <= 0);
    if (it.kind === 'trophy' && !cleared) throw new Error('this arc has not fallen yet'); if (it.kind !== 'trophy' && w.floor < (it.arc - 1) * 10 + 1) throw new Error('reach this arc first');
    if (['trophy', 'skin', 'prestige'].includes(it.kind) && s.owned.includes(id)) throw new Error('already owned');
    const price = it.kind === 'prestige' ? prestigePrice(it, s.sold[id] || 0) : it.price; this._spend(save, price); let pet;
    if (it.kind === 'prestige') s.sold[id] = (s.sold[id] || 0) + 1; if (['trophy', 'skin', 'prestige'].includes(it.kind)) s.owned.push(id);
    if (it.kind === 'token') s.tokens[id] = (s.tokens[id] || 0) + 1;
    if (it.kind === 'egg') { pet = { id: s.petSeq++, ...rollPet(it.arc, s.pets.map(p => p.uname)) }; s.pets.push(pet); }
    this._ssh(s); await this.saveSave(save); return { gold: save.gold, price, pet }; },
  async petGrantLocal(arc, src) { const s = this._sh(), pet = { id: s.petSeq++, ...rollPet(arc, s.pets.map(p => p.uname)), src }; s.pets.push(pet); this._ssh(s); return pet; },
  async petEquip(id) { const s = this._sh(); if (id != null && !s.pets.some(p => p.id === id)) throw new Error('not your pet'); s.active = id; this._ssh(s); },
  async tokenUse(kind, name, save) { const s = this._sh(); const n = String(name || '').replace(/\s+/g, ' ').trim(); if (kind === 'tok-rename' && !nameOk(n)) throw new Error('that name is not allowed');
    if (!(s.tokens[kind] > 0)) throw new Error('no token left'); s.tokens[kind]--; this._ssh(s); if (kind === 'tok-rename') { save.heroes[0].name = n; await this.saveSave(save); } return { kind, name: n || null }; },
  async memorialCarve(floor, name, save) { const s = this._sh(), w = this._w(); const n = String(name || '').replace(/\s+/g, ' ').trim();
    if (!(floor >= 1 && floor <= w.floor)) throw new Error('that floor has not been reached'); if (!nameOk(n)) throw new Error('that name is not allowed');
    if (s.carved.includes(floor)) throw new Error('your name is already on this wall'); this._spend(save, memorialPrice(floor));
    s.carved.push(floor); (s.walls[floor] ||= []).unshift(n); s.walls[floor] = s.walls[floor].slice(0, MEMORIAL_SHOW); this._ssh(s); await this.saveSave(save); return { gold: save.gold, floor, name: n }; },
  async memorialWall(floor) { return this._sh().walls[floor] || []; },
  async decorList() { try { const { gu } = this._mine(); return this._sh().decor[gu.id] || []; } catch { return []; } },
  async decorBuy(id, save) { const { g, gu } = this._mine('officer'), it = DECOR.find(d => d.id === id), s = this._sh(); if (!it) throw new Error('unknown decor'); const d = s.decor[gu.id] ||= [];
    if (d.includes(id)) throw new Error('the hall already has that');
    if (gu.is_staff) { this._spend(save, it.price); await this.saveSave(save); } else { if (gu.bank < it.price) throw new Error(`the bank needs ${it.price} gold`); gu.bank -= it.price; this._sg(g); }
    d.push(id); this._ssh(s); return { item: id, bank: gu.bank }; },
};
export const arcOfFloor = arcOf;

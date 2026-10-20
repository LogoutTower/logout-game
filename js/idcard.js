// Player ID card: hero, level, class, title, stats, abilities, equipped gear (rarity colours), skin, pet and guild.
// Online it comes from the read-only player_card() RPC (whitelisted fields only; schema-addendum-quests-profile.sql), fetched only when a
// card is opened and cached for CARD_TTL. The renderer strips staff items again unless the server marks the card as staff.
import { CLASSES, heroDps, heroMaxHp, gearBonus } from './game.js';
import { RARITIES, statLabel, rollItem } from './loot.js';
import { rng } from './floors.js';
import { byId, titleOf, nameColorOf, defaultLook, fakeProfile, itemsFor } from './cosmetics.js';
import { GM_CLASS, GM_TITLE, sanitizeSave } from './gm.js';
import { nodeById } from './talents.js';
import { SHOP, PETS, PERK_LABEL, DIVINE, SPIRIT, spiritStage } from './prestige.js';
export const CARD_TTL = 300000; // 5 min client cache: re-opening a card costs nothing
const SLOTS = ['weapon', 'armor', 'trinket'], LOOK_KEYS = ['title', 'ptitle', 'nameColor', 'aura', 'skin', 'skinSet', 'outfitStyle', 'outfitColor', 'hairStyle', 'hairColor', 'weapon', 'weaponColor', 'trim'];
/** The public card for a save (own hero, local mode) in the same shape the server returns. */
export function cardFromSave(save, { guild = null, staff = false } = {}) {
  const h = save.heroes[0], eq = {}, look = {};
  for (const k of SLOTS) { const it = h.equip?.[k]; if (it) eq[k] = { name: it.name, slot: it.slot || k, rarity: it.rarity, element: it.element, floor: it.floor, stats: { ...(it.stats || {}) }, ...(it.ability ? { ability: it.ability, drawback: it.drawback } : {}), ...(it.gm ? { gm: true } : {}) }; }
  for (const k of LOOK_KEYS) if (typeof h.look?.[k] === 'string') look[k] = h.look[k];
  const pet = (save.pets || []).find(p => p.id === save.activePet && p.rarity !== 'divine');
  return { v: 1, name: h.name, cls: h.cls, level: h.level, gear: h.gear || 0, equip: eq, look, talents: { ...(h.talents || {}) }, pet: pet ? { sp: pet.sp, rarity: pet.rarity, perk: pet.perk?.k, v: pet.perk?.v, name: pet.uname || pet.name } : null, guild, ...(staff ? { st: true, spirit: !!save.spirit } : {}) };
}
const hashS = s => { let x = 2166136261; for (const c of String(s)) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; };
/** Simulated players (local mode): a deterministic card that matches their board profile. */
export function fakeCard(name, f = 1, guild = null) {
  const x = hashS(name), r = rng(x), cls = Object.keys(CLASSES)[x % 3], pr = fakeProfile(name), lv = Math.max(1, f + 2 + (x % 8)), eq = {};
  for (let i = 0; i < 12 && Object.keys(eq).length < 3; i++) { const it = rollItem(rng(x + i * 7919), Math.max(1, f - (x >> (i + 3)) % 3), ['fire', 'frost', 'void', 'storm'][(x >> i) % 4], `fake${i}`, [40, 30, 18, 9, 3, 0]); eq[it.slot] ||= it; }
  const title = itemsFor('title').find(t => t.value === pr.title)?.id, nameColor = itemsFor('nameColor').find(t => t.value === pr.color)?.id;
  return { v: 1, name, cls, level: lv, gear: Math.min(f + 8, Math.floor(lv * 0.7 * r() + 1)), equip: eq, look: { title, nameColor }, talents: {}, pet: x % 3 === 0 ? { sp: PETS[x % PETS.length].sp, rarity: ['common', 'uncommon', 'rare'][x % 3] } : null, guild, sim: true };
}
/** Pseudo hero/save from a card, for stats and sprite. Non-staff cards lose any staff content (defence in depth). */
export function heroOf(card) {
  const st = !!card.st, cls = CLASSES[card.cls] || (st && card.cls === GM_CLASS) ? card.cls : 'Vanguard';
  const h = { name: String(card.name || 'Nameless').slice(0, 20), cls, level: Math.max(1, card.level | 0), gear: Math.max(0, card.gear | 0), xp: 0, look: { ...defaultLook(cls === GM_CLASS ? 'Vanguard' : cls), ...(card.look || {}) }, equip: {}, talents: { ...(card.talents || {}) } };
  for (const k of SLOTS) if (card.equip?.[k]) h.equip[k] = { ...card.equip[k], stats: { ...(card.equip[k].stats || {}) } };
  const s = { heroes: [h], inv: [], pets: [] }; sanitizeSave(s, st); return h;
}
const rc = r => RARITIES.find(x => x.id === r)?.color || '#c9c2d8', rl = r => RARITIES.find(x => x.id === r)?.label || r || '';
export function cardHtml(card, { fmt = String, esc = String, guildBadge = () => '', sprite = null } = {}) {
  if (!card) return '<p class="sub">No ID card for this hero yet (they need to play and sync once).</p>';
  const h = heroOf(card), st = !!card.st, c = CLASSES[h.cls], g = gearBonus(h);
  let title = ''; try { title = st ? GM_TITLE : titleOf(h) || ''; } catch { title = ''; }
  let color = '#f4f1ff'; try { color = nameColorOf(h) || color; } catch {}
  let spr = ''; try { spr = (sprite ? String(sprite(h.look, h.cls)) : '').replace(/"/g, '&quot;'); } catch {}
  const skin = SHOP.find(i => i.id === h.look.skinSet && i.kind === 'skin');
  const tal = Object.entries(h.talents).filter(([, r]) => r > 0).map(([id, r]) => ({ n: nodeById(id), r })).filter(x => x.n).sort((a, b) => b.r - a.r).slice(0, 8);
  const ab = [c ? `${c.icon || ''} ${esc(h.cls)} class` : st ? '◈ GameMaster' : '', ...SLOTS.flatMap(k => h.equip[k]?.ability ? [`<b style="color:${rc('unique')}">${esc(h.equip[k].ability.text || h.equip[k].ability.id)}</b> <small class="sub">· ${esc(h.equip[k].drawback?.text || '')}</small>`] : []),
    ...tal.map(x => `${esc(x.n.name || x.n.id)} <small class="sub">rank ${x.r}</small>`)].filter(Boolean);
  const gear = SLOTS.map(k => { const it = h.equip[k]; return `<div class="cgear" style="--rc:${it ? (it.gm ? '#ffd76a' : rc(it.rarity)) : '#3a2a5a'}"><small class="sub">${k}</small>${it ? `<b>${esc(it.name || '')}</b><small style="color:${it.gm ? '#ffd76a' : rc(it.rarity)}">${esc(it.gm ? 'Staff' : rl(it.rarity))}${it.floor ? ` · F${it.floor}` : ''}</small><small>${Object.entries(it.stats || {}).map(([s, v]) => esc(statLabel(s, v) || '')).join(' · ')}</small>` : '<small class="sub">empty</small>'}</div>`; }).join('');
  const p = card.pet, pet = st && card.spirit ? `<span style="color:${DIVINE.color}">${esc(spiritStage(h.level).name)}</span> <small class="sub">${DIVINE.label} · stage ${spiritStage(h.level).n} of 3</small>`
    : p ? `<span style="color:${rc(p.rarity)}">${esc(p.name || PETS.find(x => x.sp === p.sp)?.label || p.sp)}</span> <small class="sub">${esc(rl(p.rarity))}${p.perk && PERK_LABEL[p.perk] ? ' · ' + esc(PERK_LABEL[p.perk](p.v)) : ''}</small>` : '<small class="sub">none</small>';
  const gu = card.guild ? `${guildBadge(card.guild)}[${esc(card.guild.tag)}] ${esc(card.guild.name || '')}` : '<small class="sub">no guild</small>';
  let dps = 0, hp = 0; try { dps = heroDps(h); hp = heroMaxHp(h); } catch {}
  return `<div class="idcard ${st ? 'staff' : ''}"><div class="idhead"><div class="idspr" style="background-image:${spr}"></div><div><div class="idname" style="color:${st ? '#ffd76a' : color}">${st ? '◈ ' : ''}${esc(h.name)}</div><div class="ttl">${esc(title)}</div>
    <div class="sub">Lv ${h.level} · ${esc(h.cls === GM_CLASS ? 'Tower Staff' : h.cls)}${card.sim ? ' · simulated' : ''}</div></div></div>
    <div class="idstats"><span><small>DPS</small><b>${fmt(dps)}</b></span><span><small>HP</small><b>${fmt(hp)}</b></span><span><small>Forge</small><b>+${h.gear}</b></span><span><small>Gold</small><b>+${g.goldPct || 0}%</b></span><span><small>XP</small><b>+${g.xpPct || 0}%</b></span></div>
    <h3>Gear</h3><div class="cgears">${gear}</div><h3>Abilities</h3><ul class="idab">${ab.map(a => `<li>${a}</li>`).join('') || '<li class="sub">none yet</li>'}</ul>
    <div class="idmeta"><span><small>Skin</small>${skin ? esc(skin.label) : '<small class="sub">default</small>'}</span><span><small>Pet</small>${pet}</span><span><small>Guild</small>${gu}</span></div></div>`;
}
/** Tiny TTL cache so a card is fetched once per CARD_TTL however often it's opened. */
export class CardCache {
  constructor(ttl = CARD_TTL, now = () => Date.now()) { this.ttl = ttl; this.now = now; this.m = new Map(); }
  async get(key, fetcher) { const c = this.m.get(key); if (c && this.now() - c.at < this.ttl) return c.v; const v = await fetcher(); this.m.set(key, { v, at: this.now() }); if (this.m.size > 60) this.m.delete(this.m.keys().next().value); return v; }
}

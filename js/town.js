// Town hub (one safe town per floor): inn rest + Well Rested buff, a seeded rotating shop, and original NPC sprites. Pure (no DOM).
import { heroMaxHp, heroHp, buffsOf, effectsOf, RESTED, ELIXIR } from './game.js';
import { rng, baseHp, bossInfo } from './floors.js';
import { rollItem, salvageValue, INV_SIZE } from './loot.js';
import { talentBonus } from './talents.js';
import { canvas, shadeShape } from './bosses.js';
const tier = f => Math.sqrt(baseHp(f) / baseHp(1)); // price scale per floor
export const innCost = (f, save) => Math.round(30 * tier(f) * (save && effectsOf(save.heroes[0]).has('innTax') ? 1.25 : 1) * (save ? 1 - talentBonus(save.heroes[0]).innPct / 100 : 1));
/** Shop price after talent discounts. */
export const priceFor = (save, it) => Math.round(it.price * (save ? 1 - talentBonus(save.heroes[0]).shopPct / 100 : 1));
export function rest(save, floor) {
  const c = innCost(floor, save); if (save.gold < c) return false;
  save.gold -= c; const h = save.heroes[0]; h.hp = heroMaxHp(h); buffsOf(save).rested = Math.round(RESTED.secs * (1 + talentBonus(h).restedPct / 100)); return true;
}
export const SHOP_BUCKET_MS = 4 * 3600e3; // stock rotates every 4 hours
export const POTION_HEAL = 0.5, VIGIL_HOURS = 4;
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
/** Deterministic stock for (floor, time bucket): 3 consumables + 3 gear pieces at the floor's loot tier. */
export function shopStock(floor, now) {
  const bucket = Math.floor(now / SHOP_BUCKET_MS), r = rng(hash(`shop|${floor}|${bucket}`)), t = tier(floor), el = bossInfo(floor).lootElement;
  const items = [
    { kind: 'potion', name: 'Healing Draught', desc: `Restore ${POTION_HEAL * 100}% HP now`, price: Math.round(15 * t) },
    { kind: 'elixir', name: 'Elixir of Fury', desc: `+${Math.round((ELIXIR.mul - 1) * 100)}% DPS for ${ELIXIR.secs / 60} min`, price: Math.round(45 * t) },
    { kind: 'vigil', name: 'Scroll of Vigil', desc: `+${VIGIL_HOURS}h offline cap, once`, price: Math.round(120 * t) },
  ];
  for (let i = 0; i < 3; i++) { const it = rollItem(r, floor, el, `shop${bucket}.${i}`, [60, 25, 10, 4, 1, 0]); /* shops never sell Unique */ items.push({ kind: 'gear', name: it.name, item: it, price: Math.round(salvageValue(it) * 3), desc: '' }); }
  return { floor, bucket, endsAt: (bucket + 1) * SHOP_BUCKET_MS, items };
}
/** Buy stock index i. Gear can be bought once per rotation. Returns a short result string or null if not possible. */
export function buy(save, floor, now, i) {
  const st = shopStock(floor, now), it = st.items[i]; if (!it || save.gold < priceFor(save, it)) return null;
  if (!save.shop || save.shop.floor !== floor || save.shop.bucket !== st.bucket) save.shop = { floor, bucket: st.bucket, bought: [] };
  const h = save.heroes[0], b = buffsOf(save);
  if (it.kind === 'gear') { if (save.shop.bought.includes(i) || save.inv.length >= INV_SIZE) return null; save.inv.push({ ...it.item }); save.shop.bought.push(i); }
  if (it.kind === 'potion') { if (heroHp(h) >= heroMaxHp(h)) return null; h.hp = Math.min(heroMaxHp(h), heroHp(h) + POTION_HEAL * heroMaxHp(h)); }
  if (it.kind === 'elixir') b.elixir = ELIXIR.secs;
  if (it.kind === 'vigil') { if (b.vigil > 0) return null; b.vigil = VIGIL_HOURS; }
  save.gold -= priceFor(save, it); return it.name;
}
export const soldOut = (save, st, i) => st.items[i].kind === 'gear' && save.shop?.bucket === st.bucket && save.shop?.floor === st.floor && save.shop.bought.includes(i);
// ---- NPC sprites (original): a stout innkeeper with apron and mug, a hooded peddler with an overloaded pack.
const NPC = {
  innkeeper: { pal: { S: '#e8b88a', H: '#b4532a', A: '#e6dcc8', B: '#6a4bd8', D: '#5a3825', M: '#c9a24a', E: '#12062a', k: '#12062a' }, draw: ({ rect, ell, px, line }) => {
    ell(16, 22, 9, 8, 'B'); rect(11, 16, 10, 13, 'A'); rect(12, 20, 8, 1, 'D');            // round body, apron
    ell(16, 10, 6, 6, 'S'); ell(16, 5, 6, 3, 'H'); rect(10, 6, 2, 5, 'H'); rect(21, 6, 2, 5, 'H'); line(12, 13, 20, 13, 'H'); // head, hair, moustache
    px(14, 10, 'E'); px(18, 10, 'E'); rect(15, 14, 3, 1, 'k');
    line(8, 18, 5, 23, 'B', 2); rect(3, 22, 4, 5, 'M'); rect(3, 22, 4, 1, 'A'); rect(7, 23, 1, 3, 'M'); // arm + mug of cider
    line(24, 18, 26, 24, 'B', 2); rect(11, 29, 4, 2, 'D'); rect(17, 29, 4, 2, 'D');
  } },
  merchant: { pal: { C: '#2f6f6a', L: '#5fb8a8', S: '#c9a27a', P: '#8a5a32', D: '#5a3820', G: '#ffd84f', E: '#5ff6ff', k: '#12062a' }, draw: ({ rect, ell, px, line, flare }) => {
    rect(19, 6, 11, 16, 'P'); rect(20, 4, 9, 2, 'D'); rect(22, 2, 4, 2, 'P'); rect(19, 12, 11, 1, 'D'); px(27, 9, 'G'); px(21, 16, 'G'); line(29, 8, 31, 4, 'D'); // big pack + rolled map
    flare(12, 29, 13, 4, 8, 'C'); line(13, 14, 13, 28, 'L');                                // long coat
    ell(13, 8, 5, 5, 'C'); ell(13, 9, 3, 3, 'S'); px(12, 9, 'k'); px(15, 9, 'k'); rect(12, 11, 3, 1, 'D'); // hood + face
    line(9, 15, 5, 20, 'C', 2); ell(4, 21, 2, 2, 'G'); px(4, 21, 'E');                       // hand holding a coin
    rect(9, 29, 4, 2, 'D'); rect(14, 29, 4, 2, 'D');
  } },
};
export function npcGrid(key) { const c = canvas(); NPC[key].draw(c); return shadeShape({ rows: c.rows(), pal: NPC[key].pal }); }

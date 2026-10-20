// The Root Key: staff-only Divine trinket. Auto-equipped for the staff hero, Legendary-parity stats, capped offline passive,
// never rolled/sold/rerolled, stripped from non-staff saves and never shown as Divine on a player card.
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem();
const G = await import('../js/gm.js'); const Gm = await import('../js/game.js'); const L = await import('../js/loot.js'); const T = await import('../js/town.js');
const C = await import('../js/cosmetics.js'); const I = await import('../js/idcard.js'); const { rng } = await import('../js/floors.js');
const mk = () => { const h = Gm.newHero('Tess', 'Blade'); h.hp = null; return C.migrateSave({ version: 2, heroes: [h], gold: 0, lastTick: 0, progress: { cleared: [], top3: [], rank1: 0 } }); };
// auto-equip on becoming staff; a player's own trinket goes to the bag
const s = mk(); const own = L.rollItem(rng(3), 5, 'void', 1, [0, 0, 0, 0, 1, 0]); s.heroes[0].equip.trinket = { ...own, slot: 'trinket', id: 'own-t' };
G.becomeGm(s, L.legendaryWeaponDps(5), 5); const k = s.heroes[0].equip.trinket;
assert.equal(k.id, G.ROOT_KEY.id); assert(k.gm && k.divine && k.rarity === 'legendary'); assert.equal(k.name, 'The Root Key'); assert(s.inv.some(i => i.id === 'own-t'));
assert.equal(k.stats.goldPct, G.legendaryTrinketPct(5)); assert.equal(k.stats.xpPct, G.legendaryTrinketPct(5));
// a rolled Legendary trinket on the same floor has the same base %
for (let i = 0; i < 400; i++) { const it = L.rollItem(rng(i), 5, 'void', i, [0, 0, 0, 0, 1, 0]); if (it.slot === 'trinket') { assert.equal(it.stats.goldPct, G.legendaryTrinketPct(5)); break; } }
// parity follows the floor; older staff saves without it get it
assert(G.gmGear(s, 12, L.legendaryWeaponDps(12), L.legendaryArmorPct(12))); assert.equal(s.heroes[0].equip.trinket.floor, 12);
delete s.heroes[0].equip.trinket; assert(G.gmGear(s, 12, 1, 1)); assert.equal(s.heroes[0].equip.trinket.id, G.ROOT_KEY.id);
// never sellable, rerollable, or generated
assert(!T.sellable(k)); s.inv.push(k); assert.equal(L.rerollItem?.(s, s.inv.length - 1, 99) ?? null, null); s.inv.pop();
for (let i = 0; i < 3000; i++) { const j = JSON.stringify(L.rollItem(rng(i), 1 + (i % 100), 'void', i, i % 2 ? [0, 0, 0, 0, 0, 1] : null)); assert(!/Root Key|gm-rootkey|divine/i.test(j)); }
for (let i = 0; i < 1000; i++) assert(!/Root Key|rootkey/i.test(JSON.stringify(L.rollDrops({ heroId: 'h' + i, floor: 1 + (i % 100), share: 1, seq: i }))));
// passive: +5% offline only while staff, clamped to the public ceiling
const h = s.heroes[0]; s.ctx = { gm: true }; assert.equal(Gm.offlinePctOf(s), (Gm.talentBonus?.(h)?.offlinePct || 0) + 5);
const capped = { heroes: [{ ...h, talents: {} }], ctx: { gm: true } }; const tb = (await import('../js/talents.js')).talentBonus;
capped.heroes[0].talents = { 'sh-idle': 3, 'sh-phantom': 1 }; capped.heroes[0].cls = 'Blade'; const base = tb(capped.heroes[0]).offlinePct; capped.heroes[0].cls = G.GM_CLASS;
assert(Gm.offlinePctOf(capped) <= Math.max(base, G.OFFLINE_PCT_MAX)); s.ctx = { gm: false }; assert.equal(Gm.offlinePctOf(s), tb(h).offlinePct || 0, 'no passive without the live staff flag');
// leaving staff removes it; non-staff saves are stripped (equipped and in the bag)
const p = mk(); p.heroes[0].equip.trinket = G.rootKey(5, 9); p.inv.push(G.rootKey(5, 9), { ...G.rootKey(5, 9), gm: undefined });
assert(G.sanitizeSave(p, false)); assert.equal(p.heroes[0].equip.trinket, null); assert(!JSON.stringify(p).includes('rootkey'));
const q = mk(); G.becomeGm(q, 1, 5); G.leaveGm(q); assert.equal(q.heroes[0].equip.trinket, null);
// ID card: Divine + passive on the staff card (server strips flags, keeps name/stats); never on a player card
const esc = x => String(x), item = { name: 'The Root Key', slot: 'trinket', rarity: 'legendary', floor: 5, stats: { goldPct: 9, xpPct: 9 } };
const st = I.cardHtml({ name: 'S', cls: G.GM_CLASS, level: 40, st: true, equip: { trinket: item }, look: {} }, { esc });
assert(st.includes('Divine') && st.includes('Every Door') && st.includes('dvgear'));
const pl = I.cardHtml({ name: 'X', cls: 'Blade', level: 40, equip: { trinket: { ...item, gm: true } }, look: {} }, { esc });
assert(!pl.includes('Root Key') && !pl.includes('Every Door'));
const pl2 = I.cardHtml({ name: 'X', cls: 'Blade', level: 40, equip: { trinket: item }, look: {} }, { esc }); assert(!pl2.includes('Divine') && !pl2.includes('Every Door'), 'a renamed player trinket never shows as Divine');
// card from the staff save keeps the gm flag only for the staff card
assert(I.cardFromSave(s, { staff: true }).equip.trinket.gm);
console.log('rootkey tests passed');

// Merchant sell (NPC only) + procedural item icons.
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem();
const T = await import('../js/town.js'); const L = await import('../js/loot.js'); const { rng } = await import('../js/floors.js'); const { newHero } = await import('../js/game.js'); const G = await import('../js/gm.js');
const I = await import('../js/icons.js');
const roll = (ri, seed, f = 5) => L.rollItem(rng(seed), f, 'fire', seed, RW(ri)), RW = ri => L.RARITIES.map((_, i) => i === ri ? 1 : 0);
const mk = () => { const h = newHero('T', 'Blade'); h.id = 'h'; return { gold: 0, heroes: [h], inv: [], buffs: {}, progress: { cleared: [], drops: [] } }; };
{ const s = mk(); s.inv = [roll(0, 1), roll(1, 2), roll(2, 3), roll(5, 4), roll(0, 5), G.eventide(5, 10)]; s.inv[4].locked = true;
  const price = T.sellPrice(s, s.inv[0]); assert.equal(price, L.salvageGold(s, s.inv[0]), 'sell price = old salvage value (balance unchanged)');
  const pv = T.bulkPreview(s); assert.equal(pv.count, 2, 'bulk: only unlocked Common/Uncommon');
  const r = T.sellBulk(s); assert.equal(r.count, 2); assert.equal(s.gold, pv.gold); assert.deepEqual(s.inv.map(i => i.rarity), ['rare', 'unique', 'common', 'legendary'], 'rare, unique, locked and staff kept');
  assert.equal(T.sellItem(s, 1), 0, 'Unique needs its own confirm'); assert.equal(T.sellItem(s, 2), 0, 'locked never sells');
  assert.equal(T.sellItem(s, 3, { confirmUnique: true }), 0, 'staff items cannot be sold'); assert(!T.toggleLock(s, 3), 'staff items have no lock');
  assert(T.toggleLock(s, 2) && !s.inv[2].locked); const g0 = s.gold; assert(T.sellItem(s, 1, { confirmUnique: true }) > 0 && s.gold > g0, 'confirmed Unique sells'); }
// icons: every shape is 16x16, seeded per id, tinted by rarity/element, Unique framed, cached
{ for (const it of [roll(0, 7), roll(3, 8), roll(5, 9), { ...roll(2, 10), slot: 'armor', id: 'a1' }, { ...roll(2, 11), slot: 'trinket', id: 't1' }, G.eventide(5, 10)]) { const u = I.itemIcon(it); assert(u.startsWith('url("data:image/svg+xml')); }
  assert.equal(I.iconShape(G.eventide(1, 1)), 'katana'); assert.equal(I.iconShape({ id: 'x', slot: 'weapon', name: 'Ember Glaive' }), 'axe'); assert.equal(I.iconShape({ id: 'x', slot: 'armor' }), 'armor');
  const a = roll(2, 20), b = { ...a }; assert.equal(I.itemIcon(a), I.itemIcon(b), 'same item, same icon'); const n = I.iconCacheSize(); I.itemIcon(a); assert.equal(I.iconCacheSize(), n, 'cached');
  const c = { ...a, rarity: 'epic' }; assert.notEqual(I.itemIcon(c), I.itemIcon(a), 'rarity tints'); const d = { ...a, element: 'frost' }; assert.notEqual(I.itemIcon(d), I.itemIcon(a), 'element tints');
  const u = roll(5, 21); assert(I.itemIcon(u).includes(encodeURIComponent('#7ff6ff').slice(0, 3)), 'unique frame'); }
for (const [k, rows] of Object.entries(I.SHAPES)) assert(rows.length === 16 && rows.every(r => r.length === 16), 'shape 16x16: ' + k);
console.log('sell + icon tests passed');

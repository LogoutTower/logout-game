import assert from 'node:assert';
import { towerRows, towerProgress, TOWER_TOP, CROWN_FROM } from '../js/towermap.js';
import { LocalBackend } from '../js/storage.js';
const hist = [{ floor: 1, at: '2026-10-18T10:00:00Z', top: 'Eldrinn' }, { floor: 2, at: '2026-10-18T11:00:00Z', top: 'Tess' }, { floor: 2, at: '2026-10-19T11:00:00Z', top: 'Newer' }];
const rows = towerRows({ current: 4, maxFloor: 10, history: hist }), at = f => rows.find(r => r.f === f);
assert.equal(rows.length, TOWER_TOP); assert.equal(rows[0].f, 100, 'top first');
assert.equal(at(1).state, 'cleared'); assert.equal(at(1).top, 'Eldrinn'); assert.equal(at(2).top, 'Newer', 'newest record per floor'); assert.equal(at(3).state, 'cleared'); assert.equal(at(3).at, null, 'cleared without history');
assert.equal(at(4).state, 'current'); assert.notEqual(at(4).name, '???'); assert.equal(at(5).state, 'fog'); assert.equal(at(5).name, '???'); assert.equal(at(5).top, null);
assert.equal(at(11).state, 'undiscovered'); assert.equal(at(11).name, 'Not yet discovered'); assert(at(10).milestone && at(10).special);
assert(rows.filter(r => r.crown).every(r => r.f >= CROWN_FROM) && rows.filter(r => r.crown).length === 10, 'crowned 91-100');
assert(at(95).special && !at(89).special);
const p = towerProgress({ current: 4, hp: 50, maxHp: 200, maxFloor: 10 }); assert.equal(p.cleared, 3); assert.equal(p.pct, 3); assert.equal(p.bossPct, 0.25);
assert.equal(towerProgress({ current: 10, hp: 0, maxHp: 200, maxFloor: 10 }).cleared, 10, 'last floor counts once it falls');
// local history is recorded by the floor-advance logic
{ const mem = new Map(); globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  const be = new LocalBackend(); const f0 = await be.getFloor(); await be.submitDamage('Tess', f0.hp + 5, {}); const h = await be.floorHistory();
  const last = h[h.length - 1]; assert.equal(last.floor, f0.floor); assert(Date.parse(last.at) > 0); assert.equal(typeof last.top, 'string'); assert.equal(await be.floorHeroes(1), null); }
// Supabase: tolerate a missing/broken floor_clears read
{ const { SupabaseBackend } = await import('../js/supabase.js'); const sb = { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'relation does not exist' } }) }), eq: async () => ({ count: null, error: { message: 'x' } }) }) }) };
  const b = Object.create(SupabaseBackend.prototype); b.sb = sb; assert.deepEqual(await b.floorHistory(), []); assert.equal(await b.floorHeroes(3), null);
  b.sb = { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [{ floor: 2, ranking: ['Tess', 'B'], at: '2026-10-19T01:00:00Z' }], error: null }) }), eq: async () => ({ count: 7, error: null }) }) }) };
  assert.deepEqual(await b.floorHistory(), [{ floor: 2, at: '2026-10-19T01:00:00Z', top: 'Tess' }]); assert.equal(await b.floorHeroes(3), 7); }
console.log('tower map tests passed');

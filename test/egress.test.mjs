// Egress diet (schema-addendum-egress.sql + js/supabase.js): one compact tick per flush, adaptive cadence, GitHub snapshot, fallbacks.
import assert from 'node:assert';
import { SupabaseBackend, CADENCE } from '../js/supabase.js';
const calls = []; let tickOn = true; const snap = { v: 1, at: null, f: 3, lb: [['Ash', 900, false], ['Bell', 500, false]], tg: { Ash: ['NB', null, false] }, h: [[2, '2026-10-22T16:00:00Z', 'Ash']] };
const sb = { rpc: async (fn, a) => { calls.push(fn);
    if (fn === 'tick') return tickOn ? { data: { f: 3, hp: 500, mx: 1000, a: a.p_amount, cl: [[7, 2, 400, 1, 200]], cv: 12, gv: 4 } } : { error: { message: 'Could not find the function public.tick in the schema cache' } };
    if (fn === 'submit_damage') return { data: { floor: 3, hp: 400, max_hp: 1000, accepted: a.p_amount } }; return { data: [] }; },
  from: () => { const q = { select: () => q, eq: () => q, gt: () => q, order: () => q, limit: () => q, single: async () => ({ data: { floor: 3, hp: 1, max_hp: 1000 } }), then: r => r({ data: [] }) }; return q; } };
let t = 1e9; const be = new SupabaseBackend(sb, { storage: { getItem: () => null, setItem() {} }, now: () => t });
be.user = { id: 'u' }; be.fetch = async () => ({ ok: true, json: async () => ({ ...snap, at: new Date(t).toISOString() }) });
// cadence: active 60 s, idle 15 min
assert.equal(be.flushEvery(), CADENCE.activeMs); t += CADENCE.idleAfter + 1; assert.equal(be.flushEvery(), CADENCE.idleMs); be.touch(); assert.equal(be.flushEvery(), CADENCE.activeMs);
// one compact call per flush: floor, clears (my rank + damage) and chat heads come back together
t += 61e3; let r = await be.submitDamage('Ash', 50, { level: 2 }); assert.deepEqual(calls, ['tick']); assert.equal(r.maxHp, 1000);
assert.deepEqual(r.clears, [{ floor: 2, rank: 1, ranking: [], dmg: { Ash: 200 }, maxHp: 400 }]); assert.equal(be.seenClear, 7); assert.deepEqual(be.heads, { chat: 12, guild: 4 });
// leaderboard, tags and history come from the GitHub snapshot: zero Supabase calls
calls.length = 0; const lb = await be.leaderboard('Ash'); assert.equal(lb[0].name, 'Ash'); assert.equal((await be.guildTags(3)).Ash.tag, 'NB'); assert.equal((await be.floorHistory())[0].top, 'Ash'); assert.deepEqual(calls, []);
// older server (no tick): falls back to submit_damage once, then stays on the classic path
tickOn = false; t += 61e3; r = await be.submitDamage('Ash', 5, {}); assert(calls.includes('submit_damage') && be.noTick); assert.equal(r.accepted, 5);
console.log('egress tests passed');

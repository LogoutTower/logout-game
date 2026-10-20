// Resume flush: after the app is backgrounded/closed for 1-2 h, the away batch is sent at once (load / visibilitychange / pageshow), not on the next slot.
import assert from 'node:assert';
import { SupabaseBackend, CADENCE } from '../js/supabase.js';
import { newHero, offlineProgress } from '../js/game.js';
let t = Date.UTC(2026, 9, 19, 12), calls = [];
const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const sb = { rpc: async (fn, a) => { calls.push({ fn, a, t }); return { data: { f: 3, hp: 1e6, mx: 2e6, a: a.p_amount, cl: [] }, error: null }; } };
globalThis.document = { hidden: false };
const be = new SupabaseBackend(sb, { storage, now: () => t }); be.user = { id: 'u' };
// on load: the first submit (the offline batch) goes out immediately
await be.submitDamage('Hero', 5000, { level: 3 }); assert.equal(calls.length, 1, 'load: offline batch flushed at once'); assert.equal(calls[0].a.p_amount, 5000);
// a normal slot: a second submit 10 s later is batched
t += 10e3; await be.submitDamage('Hero', 10, {}); assert.equal(calls.length, 1, 'batched within the 60 s slot');
// background 2 h (mobile Safari/Chrome freezes timers), then resume: idle + hidden cadence would wait up to 15 min without resume()
for (const staff of [false, true]) {
  document.hidden = true; t += 2 * 3600e3; document.hidden = false;
  const s = { gold: 0, heroes: [newHero('Hero', 'Blade')], lastTick: t - 2 * 3600e3, ctx: { gm: staff } }; const p = offlineProgress(s, t, 12);
  assert.equal(p.secs, 7200, 'two hours accrued'); const before = calls.length;
  assert.equal(be.flushEvery(), CADENCE.idleMs, 'without resume the next slot would be the 15-min idle one');
  assert(be.resume(), 'resume forces a flush'); await be.submitDamage('Hero', p.damage, { level: 3 }); assert.equal(calls.length, before + 1, `${staff ? 'staff' : 'player'}: away batch sent on resume`);
  assert(!be.resume(), 'a second resume within 15 s does not force another call');
  t += 1000; await be.submitDamage('Hero', 1, {}); assert.equal(calls.length, before + 1);
  t += 30e3;
}
// 12 h cap: a 15 h absence is sent as 12 h on resume
{ const s = { gold: 0, heroes: [newHero('Hero', 'Blade')], lastTick: t - 15 * 3600e3, ctx: {} }; const p = offlineProgress(s, t, 12); assert.equal(p.secs, 12 * 3600); assert(p.capped);
  t += 20e3; be.resume(); const n = calls.length; await be.submitDamage('Hero', p.damage, {}); assert.equal(calls.length, n + 1); assert(calls.at(-1).a.p_amount >= Math.floor(p.damage)); }
console.log('resume flush tests passed');

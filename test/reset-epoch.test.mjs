// Pre-release reset epoch (client): a newer epoch discards a pre-reset local save once; new heroes and the staff save are kept.
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem();
const { SupabaseBackend, shouldDiscard } = await import('../js/supabase.js');
const mk = (role, save) => { const b = Object.create(SupabaseBackend.prototype); Object.assign(b, { store: mem(), k: 'logout.v1', role, pending: 7 }); if (save) b.store.setItem('logout.v1.save', JSON.stringify(save)); return b; };
const AT = 1_800_000_000_000;
assert(shouldDiscard({ heroes: [] }, 1, AT, 0), 'old save (no createdAt)'); assert(!shouldDiscard({ createdAt: AT + 1 }, 1, AT, 0), 'new hero kept'); assert(!shouldDiscard({}, 1, AT, 1), 'epoch already seen'); assert(!shouldDiscard(null, 1, AT, 0));
// tester: old save discarded once, uploads held, nothing written after
{ const b = mk('player', { heroes: [{ level: 30 }], createdAt: AT - 1 }); assert.equal(b.resetCheck([1, AT]), true); assert.equal(b.store.getItem('logout.v1.save'), null); assert.equal(b.store.getItem('logout.v1.epoch'), '1');
  assert(b.holdUploads && b.pending === 0); await b.saveSave({ x: 1 }); assert.equal(b.store.getItem('logout.v1.save'), null, 'no write after wipe'); assert.equal(b.resetCheck([1, AT]), false, 'same epoch: once'); }
// staff: kept
{ const b = mk('gm', { heroes: [{ level: 90 }] }); assert.equal(b.resetCheck([1, AT]), false); assert(b.store.getItem('logout.v1.save'), 'staff save kept'); assert.equal(b.store.getItem('logout.v1.epoch'), '1'); }
// fresh hero after the reset on a new device: kept
{ const b = mk('player', { heroes: [{}], createdAt: AT + 5000 }); assert.equal(b.resetCheck([1, AT]), false); assert(b.store.getItem('logout.v1.save')); }
// no reset yet / malformed
{ const b = mk('player', { heroes: [{}] }); assert.equal(b.resetCheck(null), false); assert.equal(b.resetCheck('x'), false); assert(b.store.getItem('logout.v1.save')); }
// second reset discards a hero made after the first
{ const b = mk('player', { createdAt: AT + 10 }); b.store.setItem('logout.v1.epoch', '1'); assert.equal(b.resetCheck([2, AT + 1e6]), true); }
const fs = await import('node:fs'), m = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8'); assert(/createdAt: Date\.now\(\)/.test(m) && /r\?\.wiped/.test(m));
console.log('reset epoch tests passed');

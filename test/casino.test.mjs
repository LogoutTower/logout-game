// The Glitch Den rules (js/casino.js): house edge per game, limits, payouts, "opening soon" and the gold-only line.
import assert from 'node:assert';
import { EDGE, WHEEL, denLimits, diceMult, resolve, checkBet, denHtml, DEN_LINE, denBackend } from '../js/casino.js';
for (const [g, e] of Object.entries(EDGE)) assert(e >= 0.03 - 1e-9 && e <= 0.06, `${g} edge ${e}`);
for (let c = 5; c <= 95; c++) { const ev = c / 100 * diceMult(c); assert(ev <= 0.97 && ev >= 0.94, `dice ${c}% ev ${ev}`); }
assert.equal(WHEEL.reduce((s, x) => s + x.w, 0), 1000);
assert.equal(resolve('flip', 100, 1, 1).p, 194); assert.equal(resolve('flip', 100, 1, 0).p, 0);
assert.equal(resolve('dice', 100, 50, 51).p, 192); assert.equal(resolve('dice', 100, 50, 50).p, 0); assert.equal(resolve('dice', 100, -11, 10).p, 960);
assert.equal(resolve('wheel', 100, 0, 0).s, 0); assert.equal(resolve('wheel', 100, 0, 0).p, 2500); assert.equal(resolve('wheel', 100, 0, 999).s, 5); assert.equal(resolve('wheel', 100, 0, 999).p, 0);
const L = denLimits(1); assert.deepEqual(L, { min: 10, max: 2000, lim: 100000, cd: 1500 }); assert(denLimits(15).max > L.max);
assert.match(checkBet('flip', 5000, 0, L, 0, 1e9), /max bet/); assert.match(checkBet('flip', 100, 0, L, 99950, 1e9), /daily/); assert.match(checkBet('flip', 100, 0, L, 0, 50), /not enough/);
const soon = denHtml(null, { gold: 100 }); assert.match(soon, /opening soon/); assert(soon.includes(DEN_LINE)); assert.equal(DEN_LINE, 'Gold only. No real money, no token.');
assert(denHtml({ ...L, used: 0 }, { gold: 500, game: 'wheel' }).includes(DEN_LINE));
// online backend with the SQL missing -> null state (opening soon)
const be = { name: 'supabase', sb: { rpc: async () => ({ data: null, error: { message: 'Could not find the function public.casino_state' } }) } };
assert.equal(await denBackend(be).state(), null);
// local backend never lets gold go below zero
const save = { gold: 50 }, lb = denBackend({ name: 'local' }); await assert.rejects(lb.play(save, 1, 'flip', 60, 0), /not enough/); assert.equal(save.gold, 50);
console.log('casino rules ok', EDGE);

// Player counter client helpers (js/towercount.js) + Tower Map players column. No network.
import assert from 'node:assert';
import { countText, clearPlayers, countPoller, COUNT_MS } from '../js/towercount.js';
import { towerRows } from '../js/towermap.js';
assert.equal(countText({ t: 1204, o: 87 }), '1,204 trapped · 87 online now');
assert.equal(countText({ t: 3, o: 0 }), '3 trapped · 0 online now');
for (const bad of [null, undefined, {}, { t: 0, o: 0 }, { t: 'x' }]) assert.equal(countText(bad), '', 'hidden when missing');
assert.deepEqual([...clearPlayers({ f: [[1, 40], [2, null], [3, 7], 'junk'] })], [[1, 40], [3, 7]]); assert.equal(clearPlayers(null).size, 0);
const rows = towerRows({ current: 4, maxFloor: 10, history: [], players: new Map([[1, 40], [4, 99], [9, 5]]) });
const r = f => rows.find(x => x.f === f); assert.equal(r(1).players, 40); assert.equal(r(2).players, null); assert.equal(r(4).players, null, 'current floor: not cleared yet'); assert.equal(r(9).players, null);
assert.equal(towerRows({ current: 2, maxFloor: 10 }).find(x => x.f === 1).players, null, 'default: no players map');
assert.equal(COUNT_MS, 180000);
// poller: throttled to 3 min, skips hidden tabs, hides on errors
let t = 0, calls = 0, shown = [], timer; const doc = { hidden: false, l: null, addEventListener: (_, f) => { doc.l = f; }, removeEventListener() {} };
let next = () => ({ t: 10, o: 2 });
const p = countPoller({ fetchCounts: async () => { calls++; return next(); }, render: c => shown.push(countText(c)), doc, now: () => t, setTimer: f => { timer = f; return 1; }, clearTimer() {} });
await new Promise(r => setTimeout(r)); assert.equal(calls, 1); assert.equal(shown.at(-1), '10 trapped · 2 online now');
t = 60000; await timer(); assert.equal(calls, 1, 'not before 3 minutes');
t = 180000; doc.hidden = true; await timer(); assert.equal(calls, 1, 'hidden tab: no call');
doc.hidden = false; doc.l(); await new Promise(r => setTimeout(r)); assert.equal(calls, 2, 'visible again: refresh');
t = 400000; next = () => { throw new Error('function public.tower_counts() does not exist'); }; await timer(); assert.equal(calls, 3); assert.equal(shown.at(-1), '', 'missing RPC hides'); assert.equal(p.last, null);
t = 600000; next = () => null; await timer(); assert.equal(shown.at(-1), '', 'offline/null hides');
console.log('towercount ok');

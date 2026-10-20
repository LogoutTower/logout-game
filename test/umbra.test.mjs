import assert from 'node:assert/strict'; import { bossInfo, bossPhase, bossGrid, AWAKEN_NAME, PLAN_FLOORS } from '../js/floors.js';
const i = bossInfo(PLAN_FLOORS); assert.equal(i.name, 'Umbra'); assert.equal(i.phases, 2); assert.equal(i.placeholder_special, false); assert.equal(i.big, true);
assert.equal(bossPhase(100, 100, 100), 1); assert.equal(bossPhase(100, 51, 100), 1); assert.equal(bossPhase(100, 50, 100), 2); assert.equal(bossPhase(100, 1, 100), 2); assert.equal(bossPhase(100, 0, 100), 1);
for (let f = 1; f < 100; f++) { assert.equal(bossPhase(f, 1, 100), 1); assert.notEqual(bossInfo(f).base, 'umbra'); assert.notEqual(bossInfo(f).base, 'umbraAwake'); }
assert.notDeepEqual(bossGrid(100, 1).rows, bossGrid(100, 2).rows); assert.deepEqual(bossGrid(50, 2).rows, bossGrid(50, 1).rows); assert.equal(AWAKEN_NAME, 'Umbra Awakened');
console.log('umbra ok');

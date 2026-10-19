// "Tower Staff · would rank #N": staff never takes a numbered slot; players keep real ranks; rewards ignore staff.
import assert from 'node:assert';
import { rankRows, boardWithStaff } from '../js/ranks.js';
import { staffActive, STAFF_POLICY } from '../js/gm.js';
const rows = [{ name: 'A', damage: 100 }, { name: 'B', damage: 80 }, { name: 'S', damage: 70, staff: true }, { name: 'C', damage: 60 }, { name: 'D', damage: 40 }];
const { players, staff } = rankRows(rows);
assert.deepEqual(players.map(p => [p.name, p.rank]), [['A', 1], ['B', 2], ['C', 3], ['D', 4]], 'players keep their real ranks');
assert.equal(staff[0].wouldRank, 3); assert.equal(staff[0].rank, 0);
assert.equal(rankRows([{ name: 'S', damage: 999, staff: true }, { name: 'A', damage: 1 }]).staff[0].wouldRank, 1);
assert.equal(rankRows([{ name: 'S', damage: 0, staff: true }, { name: 'A', damage: 1 }]).staff[0].wouldRank, 2);
const top3 = players.slice(0, 3).map(p => p.name); assert.deepEqual(top3, ['A', 'B', 'C'], 'reward positions unchanged (C is not pushed out)');
const b = boardWithStaff(rows, 'D', 3); assert(b[0].staff && b[0].wouldRank === 3); assert.deepEqual(b.slice(1).map(r => r.rank), [1, 2, 3, 4], 'me (D) appended with real rank');
// guild board uses the same helper (staff guild rows would be informational only)
const g = rankRows([{ name: 'G1', damage: 500 }, { name: 'G2', damage: 300 }]); assert.deepEqual(g.players.map(x => x.rank), [1, 2]);
// staff policy switch points
assert(staffActive({ serverRole: true })); assert(staffActive({ localUnlock: true })); assert(!staffActive({ localUnlock: true, staffMode: false }), 'toggle off');
STAFF_POLICY.allowLocalUnlock = false; assert(!staffActive({ localUnlock: true }), 'local unlock can be removed'); assert(staffActive({ serverRole: true })); STAFF_POLICY.allowLocalUnlock = true;
console.log('rank tests passed');

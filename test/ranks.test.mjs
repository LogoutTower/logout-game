// "Tower Staff · would rank #N": staff never takes a numbered slot; players keep real ranks; rewards ignore staff.
import assert from 'node:assert';
import { rankRows, boardWithStaff, wouldRankLabel } from '../js/ranks.js';
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
assert.equal(wouldRankLabel(staff[0]), 'Tower Staff · would rank #3');
{ const many = Array.from({ length: 50 }, (_, i) => ({ name: 'P' + i, damage: 1000 - i })), t = rankRows([...many, { name: 'S', damage: 1, staff: true }], { truncated: true });
  assert.equal(wouldRankLabel(t.staff[0]), 'Tower Staff · would rank #51+', 'server list cut off: shown as N+');
  assert.equal(rankRows([...many, { name: 'S', damage: 975.5, staff: true }], { truncated: true }).staff[0].wouldRank, 26, 'inside the slice: exact');
  const bb = boardWithStaff([...many, { name: 'S', damage: 500, staff: true }], null, 10); assert.equal(bb.length, 11); assert.equal(bb.players.length, 50, 'full list kept for local staff rows');
  assert(bb.slice(1).every((r, i) => r.rank === i + 1 && !r.staff), 'numbered slots are players only'); }
console.log('rank tests passed');
{ const t = boardWithStaff([{ name: 'A', damage: 5 }], 'Nyx', 10, { meHidden: true }); const m = t.find(r => r.name === 'Nyx'); assert(m.hidden && m.damage === null && m.rank === 0, 'hidden team hero is not shown as 0 damage');
  assert.equal(boardWithStaff([{ name: 'A', damage: 5 }], 'Z', 10).find(r => r.name === 'Z').damage, 0, 'normal player with no hits still shows 0'); }

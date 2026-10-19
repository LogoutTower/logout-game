import assert from 'node:assert/strict';
import { CUTSCENES, RIVAL_NAME, pendingCutscene, clearedArcs, fillText } from '../js/cutscenes.js';
import { bossInfo } from '../js/floors.js';
import { towerRows } from '../js/towermap.js';
assert.deepEqual(clearedArcs({ floor: 10, hp: 5 }, 20), []);
assert.deepEqual(clearedArcs({ floor: 11, hp: 5 }, 20), [1]);
assert.deepEqual(clearedArcs({ floor: 20, hp: 0 }, 20), [1, 2]);
assert.deepEqual(clearedArcs({ floor: 10, hp: 0 }, 10), [1]); // pre-addendum server: cap 10, floor 10 cleared
assert.equal(pendingCutscene({ floor: 1, hp: 1 }, 20, [], { fresh: true }), 'intro');
assert.equal(pendingCutscene({ floor: 1, hp: 1 }, 20, []), null); // returning players do not get the intro
assert.equal(pendingCutscene({ floor: 12, hp: 1 }, 20, ['intro']), '1');
assert.equal(pendingCutscene({ floor: 12, hp: 1 }, 20, ['intro', '1']), null); // once per player
assert.equal(pendingCutscene({ floor: 20, hp: 0 }, 20, ['1']), '2');
for (const [k, cs] of Object.entries(CUTSCENES)) { assert.ok(cs.panels.length >= 4 && cs.panels.length <= 6, k); for (const p of cs.panels) assert.ok(p.art && p.text, k); }
assert.equal(fillText('Ahead: {next}.', CUTSCENES[1], n => 'X' + n), 'Ahead: X2.');
assert.ok(CUTSCENES[2].panels.some(p => p.text.includes('{rival}')));
const top = bossInfo(100); assert.equal(top.name, RIVAL_NAME); assert.ok(top.sealed && top.rival);
const r = towerRows({ current: 12, maxFloor: 20 })[0]; assert.equal(r.f, 100); assert.ok(r.rival); assert.ok(!r.name.includes(RIVAL_NAME)); // sealed, name hidden
console.log('cutscenes ok');

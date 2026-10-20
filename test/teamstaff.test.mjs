// STAFF tag for team accounts (js/teamstaff.js): display only, distinct from the GM sigil.
import assert from 'node:assert';
import { setTeam, isTeam, teamTag, loadTeam } from '../js/teamstaff.js';
import { cardHtml, fakeCard } from '../js/idcard.js';
setTeam([{ n: 'Helper', a: 'abcdef012345' }]);
assert.ok(isTeam('Helper')); assert.ok(isTeam('Someone', 'abcdef012345')); assert.ok(!isTeam('Pilgrim', '000000000000')); assert.ok(!isTeam(null));
assert.match(teamTag(), /class="tstaff"[^>]*>STAFF</); assert.doesNotMatch(teamTag(), /◈/);
const c = fakeCard('Helper', 3, null), h1 = cardHtml(c, { team: true }), h0 = cardHtml(c);
assert.ok(h1.includes('STAFF') && !h0.includes('tstaff'));
assert.ok(!cardHtml({ ...c, st: true }, { team: true }).includes('tstaff'), 'the GM card never shows the team tag');
await loadTeam({ name: 'local' }); assert.ok(isTeam('Helper'), 'local backend: no fetch, roster kept');
let calls = 0; const be = { sb: { rpc: async n => { calls++; assert.equal(n, 'team_roster'); return { data: [{ n: 'Other', a: null }], error: null }; } } };
assert.equal(await loadTeam(be, 1e12), true); assert.ok(isTeam('Other') && !isTeam('Helper')); await loadTeam(be, 1e12 + 1000); assert.equal(calls, 1, 'cached');
console.log('teamstaff ok');

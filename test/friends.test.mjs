// Friends list (Guild Hub update): rules, LocalBackend flow, presence via friends, Supabase wiring (mock), UI render, race payout.
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem();
const F = await import('../js/friends.js'); const H = await import('../js/guildhub.js');
const { LocalBackend } = await import('../js/storage.js'); const { SupabaseBackend } = await import('../js/supabase.js');
const { friendsHtml, cardFriendHtml, sortFriends } = await import('../js/friendsui.js'); const { GUILD_RACE_PAYOUT } = await import('../config.js');
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
// ---- rules
const ok = { exists: true }; assert.ok(F.checkRequest('Me', 'Wren', ok).ok);
assert.equal(F.checkRequest('Me', '  ', ok).reason, 'enter a hero name'); assert.equal(F.checkRequest('Me', 'Me', ok).reason, 'that is you');
assert.equal(F.checkRequest('Me', 'X', {}).reason, 'no hero with that name');
assert.equal(F.checkRequest('Me', 'W', { ...ok, blocked: ['W'] }).reason, 'unblock them first'); assert.equal(F.checkRequest('Me', 'W', { ...ok, friends: ['W'] }).reason, 'already friends');
assert.equal(F.checkRequest('Me', 'W', { ...ok, outgoing: ['W'] }).reason, 'request already sent');
assert.match(F.checkRequest('Me', 'W', { ...ok, friends: Array.from({ length: F.FRIEND_CAP }, (_, i) => 'f' + i) }).reason, /friend list full \(100\)/);
assert.match(F.checkRequest('Me', 'W', { ...ok, sentLastHour: F.REQ_PER_HOUR }).reason, /too many requests/); assert.equal(F.checkRequest('Me', 'W', { ...ok, theirCount: 100 }).reason, 'their friend list is full');
assert.deepEqual(F.checkRequest('Me', 'W', { ...ok, blockedByThem: true }), { ok: true, silent: true }, 'a block is never revealed');
assert.equal(F.FRIEND_CAP, 100); assert.equal(F.cleanName('x'.repeat(40)).length, 20);
assert.equal(H.canSeePresence(1, 2, false, true), true, 'friends see presence'); assert.equal(H.canSeePresence(null, null, false, false), false);
// ---- payout (config)
assert.deepEqual(GUILD_RACE_PAYOUT, { base: 2500, perFloor: 500, max: 50000 });
assert.deepEqual([1, 10, 20, 21, 30, 100, 0].map(f => H.racePayout(f)), [3000, 7500, 12500, 13000, 17500, 50000, 3000]);
// ---- LocalBackend flow
const be = new LocalBackend(); localStorage.setItem(be.k + '.save', JSON.stringify({ heroes: [{ name: 'Tess' }] }));
await be.createGuild('Lantern Watch', 'LW', { name: 'Tess', staff: false });
const g = be._g(), stranger = g.members.find(m => m.guild_id !== g.members.find(x => x.name === 'Tess').guild_id).name;
assert.deepEqual(Object.keys(await be.guildPresence([stranger])), [], 'stranger hidden');
assert.match(await err(be.friendRequest('Nobody_here')), /no hero/); assert.match(await err(be.friendRequest('Tess')), /that is you/);
await be.friendRequest(stranger); assert.match(await err(be.friendRequest(stranger)), /already sent/);
let L = await be.friendsList(); assert.deepEqual(L.outgoing.map(x => x.name), [stranger]); assert.equal(L.cap, 100);
// an incoming request (seeded, as the server would deliver it), accept → friends both see presence
{ const f = be._f(); f.incoming.push({ id: 99, name: stranger, at: new Date().toISOString() }); be._sf(f); }
await be.friendRespond(99, true); L = await be.friendsList(); assert.deepEqual(L.friends.map(x => x.name), [stranger]); assert.equal(L.outgoing.length, 0, 'own request to them cleared');
assert.deepEqual(Object.keys(await be.guildPresence([stranger])), [stranger], 'friend sees presence');
assert.match(await err(be.friendRequest(stranger)), /already friends/);
await be.friendRemove(stranger); assert.deepEqual(Object.keys(await be.guildPresence([stranger])), [], 'removed: hidden again');
{ const f = be._f(); f.incoming.push({ id: 7, name: 'Wren', at: new Date().toISOString() }); be._sf(f); } await be.friendRespond(7, false); assert.equal((await be.friendsList()).friends.length, 0, 'declined');
await be.friendBlock(stranger); assert.match(await err(be.friendRequest(stranger)), /unblock them first/); await be.friendUnblock(stranger); assert.equal((await be.friendsList()).blocked.length, 0);
// rate limit
{ const f = be._f(); f.sent = Array.from({ length: F.REQ_PER_HOUR }, () => Date.now()); be._sf(f); } const other = g.members.find(m => m.name !== stranger && m.name !== 'Tess').name;
assert.match(await err(be.friendRequest(other)), /too many requests/);
// ---- local race payout: champion bank +payout once, ledger 'race'
{ const w = be._w(); for (const k of Object.keys(w.dmg)) w.dmg[k] = 1; w.dmg.Tess = 1e9; be._sw(w); const gid = be._g().members.find(x => x.name === 'Tess').guild_id, b0 = be._g().guilds.find(x => x.id === gid).bank || 0;
  be._ghClear(w.floor, w.dmg, {}); be._ghClear(w.floor, w.dmg, {}); const gu = be._g().guilds.find(x => x.id === gid); assert.equal(gu.bank, b0 + H.racePayout(w.floor), 'paid once'); assert.equal(gu.ledger[0].kind, 'race'); }
// ---- Supabase wiring (mock): RPC names + args, nothing else
const calls = []; const sbe = Object.assign(Object.create(SupabaseBackend.prototype), { sb: { rpc: async (fn, a) => { calls.push([fn, a]); return { data: {}, error: null }; } }, holdUploads: false });
await sbe.friendsList(); await sbe.friendRequest('  Wren  '); await sbe.friendRespond('5', true); await sbe.friendRemove('abc'); await sbe.friendBlock('abc'); await sbe.friendBlock('Wren', true); await sbe.friendUnblock('abc');
assert.deepEqual(calls, [['friends_list', {}], ['friend_request', { p_name: 'Wren' }], ['friend_respond', { p_id: 5, p_accept: true }], ['friend_remove', { p_handle: 'abc' }],
  ['friend_block', { p_handle: 'abc', p_name: null }], ['friend_block', { p_handle: null, p_name: 'Wren' }], ['friend_unblock', { p_handle: 'abc' }]]);
sbe.holdUploads = true; assert.match(await err(sbe.friendsList()), /local staff unlock/, 'local staff unlock sends nothing');
// ---- UI
const now = Date.now(), Lx = { cap: 100, friends: [{ h: 'a', name: 'Old', floor: 3, seen: new Date(now - 86400e3).toISOString() }, { h: 'b', name: 'Live', floor: 12, seen: new Date(now - 30e3).toISOString() }], incoming: [{ id: 1, h: 'c', name: 'Asker', at: new Date().toISOString() }], outgoing: [], blocked: [] };
assert.deepEqual(sortFriends(Lx.friends).map(f => f.name), ['Live', 'Old']); const html = friendsHtml(Lx);
assert.ok(/2\/100 · 1 online/.test(html)); assert.ok(/data-fracc="1"/.test(html) && /data-frdec="1"/.test(html)); assert.ok(/F12 · online/.test(html) && /last seen 1d ago/.test(html));
assert.ok(!/(cls|class=\"idcard|gear|Tower Staff|◈)/.test(html.replace(/class="[a-z ]+"/g, '')), 'no class/gear/staff details');
assert.ok(/id="cardFrAdd"/.test(cardFriendHtml('X', Lx))); assert.ok(/Friends ✓/.test(cardFriendHtml('Live', Lx))); assert.ok(/Accept friend request/.test(cardFriendHtml('Asker', Lx))); assert.equal(cardFriendHtml('X', null), '');
assert.ok(/<script/.test(friendsHtml({ ...Lx, friends: [{ h: 'z', name: '<script>' }] })) === false, 'escaped');
console.log('friends ok');

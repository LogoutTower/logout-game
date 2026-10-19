// Guilds + floor chat: rules, buff, staff exclusion, local backend, Supabase backend wiring (mock), flags off by default.
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem();
const { checkGuild, guildBoard, GUILD_BUFF, GUILD_CAP } = await import('../js/guilds.js');
const { cleanChat } = await import('../js/chatfilter.js');
const { newHero, simulate, guildMul } = await import('../js/game.js');
const { LocalBackend } = await import('../js/storage.js');
const { SupabaseBackend } = await import('../js/supabase.js');
const { FEATURES } = await import('../config.js');
assert.equal(FEATURES.guilds, 'all'); assert.equal(FEATURES.chat, 'all'); assert.equal(FEATURES.bindIdentity, 'all'); // open to every player; guests may chat after the open-chat addendum gate
// validation
assert(checkGuild('Night Bell', 'nb').ok && checkGuild('Night Bell', 'nb').tag === 'NB');
for (const [n, t] of [['ab', 'AB'], ['x'.repeat(25), 'AB'], ['Good', 'A'], ['Good', 'ABCDE'], ['evil.com', 'EV'], ['Shitlords', 'SL'], ['Ok Name', 'F4CK'.replace('4', 'U')]]) assert(!checkGuild(n, t).ok, `rejected: ${n} ${t}`);
// chat filter basics (SQL parity is in schema-addendum.pglite.mjs)
assert(!cleanChat('see https://a.b').ok && !cleanChat('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU').ok && !cleanChat('x'.repeat(201)).ok && cleanChat('gg all').ok);
// board: staff damage never counts, ranks are 1..n
const b = guildBoard([{ name: 'a', damage: 10 }, { name: 'b', damage: 5 }, { name: 'S', damage: 999, staff: true }], [{ name: 'a', guild_id: 1 }, { name: 'S', guild_id: 2, is_staff: true }, { name: 'b', guild_id: 2 }], [{ id: 1, name: 'One', tag: 'ONE' }, { id: 2, name: 'Two', tag: 'TWO' }]);
assert.deepEqual(b.map(g => [g.tag, g.damage, g.rank]), [['ONE', 10, 1], ['TWO', 5, 2]], 'staff adds nothing');
// buff: +2% XP and gold, not damage; never for staff
const mk = () => { const h = newHero('T', 'Blade'); h.hp = null; return { version: 9, gold: 0, heroes: [h], lastTick: 0, buffs: {}, inv: [] }; };
const a = mk(), g = mk(); g.ctx = { guild: true }; const ra = simulate(a, 600), rg = simulate(g, 600);
assert.equal(rg.damage, ra.damage, 'no damage change'); assert(Math.abs(rg.gold / ra.gold - (1 + GUILD_BUFF)) < 0.01 && Math.abs(rg.xp / ra.xp - (1 + GUILD_BUFF)) < 0.01, 'gold/xp +2%');
assert.equal(guildMul({ ctx: { guild: true, gm: true } }), 1, 'staff: no guild buff');
// local backend
const be = new LocalBackend(); const me = { name: 'Tess' };
// staff founding (one private staff guild, no bonus): see test/staffguild.test.mjs
assert.equal(checkGuild('Floor 0', 'FZ').reason, 'That name is reserved.'); assert.equal(checkGuild('Floor Zero', 'ZERO', true).ok, true);
await be.createGuild('Ash Court', 'ash', me); assert.equal((await be.myGuild()).tag, 'ASH'); await assert.rejects(be.joinGuild('NB', me), /already/);
await be.leaveGuild(); assert.equal(await be.myGuild(), null); await be.joinGuild('nb', me); assert.equal((await be.myGuild()).tag, 'NB');
const gg = be._g(); for (let i = 0; gg.members.filter(x => x.guild_id === 1).length < GUILD_CAP; i++) gg.members.push({ name: 'F' + i, guild_id: 1 }); be._sg(gg); await assert.rejects(be.joinGuild('NB', { name: 'Late' }), /full/);
await be.chatPost('Tess', 'what the fuck'); const msgs = await be.chatFetch(0); assert(msgs.some(m => m.name === 'Tess' && m.body === 'what the ****' && m.guild_tag === 'NB'));
await assert.rejects(be.chatPost('Tess', 'again'), /slow mode/); const c = be._c(); c.last = 0; localStorage.setItem('logout.v1.chat', JSON.stringify(c)); await assert.rejects(be.chatPost('Tess', 'go evil.com'), /links/);
const mine = (await be.chatFetch(0)).find(m => m.name === 'Tess'); await be.chatReport(mine.id); assert(!(await be.chatFetch(0)).some(m => m.id === mine.id), 'reported message hidden');
// supabase backend: RPC names/args, guests cannot chat, local-only staff sends nothing
const calls = []; const sb = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', is_anonymous: true } } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  from: () => { const q = { select: () => q, eq: () => q, gt: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null }), single: async () => ({ data: { id: 1, floor: 3, hp: 1, max_hp: 1, max_floor: 10 } }), then: r => r({ data: [] }) }; return q; },
  rpc: async (fn, a) => (calls.push([fn, a]), { data: fn === 'guild_board' ? [{ id: 1, name: 'One', tag: 'ONE', members: 2, damage: '5' }] : {} }) };
const s = new SupabaseBackend(sb, { storage: mem() }); await s.init();
assert.equal(s.canChat(), true, 'guests may post (server gates them)'); await s.chatPost('Tess', 'hi'); await s.createGuild('One', 'ONE'); assert.deepEqual(calls.map(c => c[0]), ['chat_post', 'guild_create']);
assert.equal((await s.guildBoard())[0].damage, 5); s.holdUploads = true; await assert.rejects(s.joinGuild('ONE'), /local staff/); assert.equal(s.canChat(), false);
console.log('guild + chat tests passed');

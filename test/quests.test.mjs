// Daily quests (js/quests.js) + guild weekly member shares: rules mirror the SQL, local mode, claims, caps, Supabase wiring (mock).
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem();
const Q = await import('../js/quests.js'); const R = await import('../js/guildsv2.js'); const { newHero, xpToNext, levelCap } = await import('../js/game.js');
const { SupabaseBackend } = await import('../js/supabase.js'); const { LocalBackend } = await import('../js/storage.js');
const T0 = Date.parse('2026-10-19T12:00:00Z');
// reset at 00:00 UTC, same as the streak
assert.equal(Q.utcDay(Date.parse('2026-10-19T23:59:59Z')), '2026-10-19'); assert.equal(Q.utcDay(Date.parse('2026-10-20T00:00:00Z')), '2026-10-20');
// rotation mirrors dq_third(): day 0 = 2026-01-01 → chat, then clear, then donate; donate → clear outside a guild
assert.equal(Q.dqThird('2026-01-01'), 'chat'); assert.equal(Q.dqThird('2026-01-02'), 'clear'); assert.equal(Q.dqThird('2026-01-03'), 'donate'); assert.equal(Q.dqThird('2026-01-03', false), 'clear');
// rewards: tier × base, sane vs the login streak and gold sinks
assert.deepEqual(Q.dqReward('dmg', 1), { g: 150, x: 0.25 }); assert(Q.dqReward('chat', 10).g > Q.dqReward('chat', 1).g);
const day = ['dmg', 'online', 'chat'].reduce((a, k) => a + Q.dqReward(k, 20).g, 0); assert(day < 3 * 2000 * Q.dqTier(20), 'a full quest day pays less than three day-7 login chests');
// damage target respects the caps (a faked level/forge can't shrink or inflate it past the server's)
assert.equal(Q.dqDmgTarget(500, 200, 5), Q.dqDmgTarget(15, 13, 5)); assert(Q.dqDmgTarget(30, 0, 50, true) > Q.dqDmgTarget(30, 0, 5));
// local flow
const h = newHero('Tess', 'Blade'); h.level = 4; const save = { heroes: [h], gold: 0, progress: {} };
assert.equal(Q.localQuest(save, 'dmg', 10, 3, { now: T0 }), false); assert.equal(save.dq.d, '2026-10-19'); assert.equal(save.dq.k.length, 3);
assert.equal(Q.claimLocal(save, 0, 3, false, T0), null, 'unfinished: no claim');
assert.equal(Q.localQuest(save, 'dmg', 1e12, 3, { now: T0 }), true, 'completion reported once'); assert.equal(save.dq.p[0], save.dq.t[0], 'progress clamps at the target');
assert.equal(Q.claimable(save, T0), 1); const g0 = save.gold, xp0 = h.xp, r = Q.claimLocal(save, 0, 3, false, T0); assert.equal(save.gold - g0, r.add); assert(h.xp > xp0 || h.level > 4);
assert.equal(Q.claimLocal(save, 0, 3, false, T0), null, 'no double claim'); assert.equal(Q.claimable(save, T0), 0);
assert.equal(Q.questsToday(save, T0 + 864e5), null, 'yesterday’s quests are gone after 00:00 UTC');
Q.localQuest(save, 'dmg', 5, 3, { now: T0 + 864e5 }); assert.equal(save.dq.d, '2026-10-20'); assert.equal(save.dq.c, 0);
// level cap: banked XP never pushes past floor + 10
const capped = { heroes: [Object.assign(newHero('Cap', 'Vanguard'), { level: 13 })], gold: 0 }; for (let i = 0; i < 50; i++) Q.bankXp(capped, 0.3, 3); assert(capped.heroes[0].level <= levelCap(3));
// server payloads: first tick of the day carries the defs, later ticks only progress
const s2 = { heroes: [newHero('Pia', 'Arcanist')], gold: 10 };
assert.equal(Q.adoptQuests(s2, { p: [1, 2, 3], c: 0 }, T0), false, 'no defs yet: ignored (panel asks quest_state)');
Q.adoptQuests(s2, { d: '2026-10-19', k: ['dmg', 'online', 'clear'], t: [5000, 2700, 1], p: [0, 0, 0], c: 0, g: [150, 120, 180], x: [0.25, 0.2, 0.3] }, T0);
assert.equal(Q.adoptQuests(s2, { p: [5000, 10, 0], c: 0 }, T0), true, 'newly claimable'); assert.equal(Q.adoptQuests(s2, { p: [5000, 20, 0], c: 0 }, T0), false);
const html = Q.questsHtml(s2.dq, String); assert.match(html, /data-dq="0"(?![^>]*disabled)/); assert.match(html, /data-dq="1"[^>]*disabled/);
// Supabase wiring (mock): tick's q is surfaced; claim pushes the save first and adopts the server's gold
const calls = []; const sb = { rpc: async (fn, args) => { calls.push(fn); if (fn === 'tick') return { data: { f: 2, hp: 10, mx: 20, a: 5, q: { p: [5, 0, 0], c: 0 } } }; if (fn === 'quest_claim') return { data: { gold: 999, add: 150, xp: 0.25, c: 1 } }; if (fn === 'player_card') return { error: { message: 'Could not find the function public.player_card' } }; return { data: null }; },
  from: () => ({ upsert: async () => ({}), select: () => ({ eq: () => ({ single: async () => ({ data: { floor: 2, hp: 10, max_hp: 20 } }) }) }) }), auth: { getSession: async () => ({ data: {} }) } };
const be = new SupabaseBackend(sb, { store: mem() }); be.user = { id: 'u1' }; be.meta = { name: 'Pia' };
const t = await be.flush(); assert.deepEqual(t.quests, { p: [5, 0, 0], c: 0 });
const cs = { heroes: [newHero('Pia', 'Blade')], gold: 1 }; const cr = await be.questClaim(0, cs); assert.equal(cs.gold, 999); assert.equal(cr.add, 150);
assert(calls.indexOf('quest_claim') > -1);
assert.equal(await be.playerCard({ name: 'X' }), null); assert.equal(be.noCard, true, 'before the SQL runs: cards degrade to null, no retries'); const n = calls.length; await be.playerCard({ name: 'Y' }); assert.equal(calls.length, n);
// guild weeks: Monday 00:00 UTC
assert.equal(R.weekOf(Date.parse('2026-10-19T00:00:00Z')) - R.weekOf(Date.parse('2026-10-18T23:59:59Z')), 1); assert.equal(R.weekOf(Date.parse('2026-10-19T00:00:00Z')), R.weekOf(Date.parse('2026-10-25T23:59:59Z')));
assert.equal(R.eligible('damage', 100000, 999), false); assert.equal(R.eligible('damage', 100000, 1000), true); assert.equal(R.eligible('active', 3, 1), true); assert.equal(R.eligible('floors', 1, 0), false);
// local guild member share
const lb = new LocalBackend(); const me = { name: 'Tess' }; await lb.createGuild('Lantern Watch', 'LW', me);
const w = R.weekOf(Date.now()), dq = R.weekQuests(w).find(q => q.kind === 'damage') || R.weekQuests(w).find(q => q.kind === 'active');
await lb.submitDamage('Tess', dq.kind === 'damage' ? dq.target : 10, {}); let I = await lb.guildInfo(); const mine = I.quests.find(q => q.idx === dq.idx); assert(mine.mine > 0);
const gs = { heroes: [newHero('Tess', 'Blade')], gold: 0 };
if (!mine.done) { const g = lb._g(); g.guilds.find(x => x.tag === 'LW').quests[w][dq.idx].done = true; lb._sg(g); }
const share = await lb.guildQuestClaim(w, dq.idx, gs); assert(share.add > 0 && gs.gold === share.add);
await assert.rejects(lb.guildQuestClaim(w, dq.idx, gs), /already claimed/); await assert.rejects(lb.guildQuestClaim(w - 3, dq.idx, gs), /closed/);
I = await lb.guildInfo(); assert.equal(I.quests.find(q => q.idx === dq.idx).claimed, true);
console.log('quests tests passed');

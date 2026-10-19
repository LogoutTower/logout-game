// Guilds v2: shared rules, LocalBackend flow, Supabase wiring (mock), bonus maths, banner/hall art, flag off by default.
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem();
const R = await import('../js/guildsv2.js');
const { newHero, guildMul } = await import('../js/game.js');
const { LocalBackend } = await import('../js/storage.js');
const { bannerIcon, hallArt } = await import('../js/banner.js');
const { FEATURES } = await import('../config.js');
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
assert.equal(FEATURES.guildsV2, 'all', 'guildsV2 live since the v2 addendum ran'); assert.equal(FEATURES.guilds, 'all');
// ---- rules
assert.equal(R.levelOf(0), 1); assert.equal(R.levelOf(20000), 2); assert.equal(R.levelOf(1e12), R.LEVEL_CAP); assert.equal(R.slotsOf(1), 30); assert.equal(R.slotsOf(R.LEVEL_CAP), 50); assert.equal(R.slotsOf(99), 50);
assert.equal(R.bonusPctOf(0), 2); assert.equal(R.bonusPctOf(3), 5); assert.equal(R.bonusPctOf(9), 5, 'bonus capped at 5%');
for (let w = 2900; w < 3100; w++) { const q = R.weekQuests(w); assert.equal(q.length, 3); assert.equal(new Set(q.map(x => x.kind)).size, 3); assert(!q.some(x => x.kind === R.QUEST_KINDS[w % 4])); assert.deepEqual(R.weekQuests(w), q, 'deterministic'); }
assert(R.canKick('leader', 'officer') && R.canKick('officer', 'member') && !R.canKick('officer', 'officer') && !R.canKick('member', 'member') && !R.canKick('leader', 'leader'));
assert.equal(R.checkBanner({ sigil: 'rune', c1: '#ffd76a', c2: '#2a1450' }, 1, 0).ok, false, 'locked sigil'); assert.equal(R.checkBanner({ sigil: 'crown', c1: '#ffd76a', c2: '#ffd76a' }, 1, 0).ok, false);
assert.equal(R.checkBanner({ sigil: 'rune', c1: '#ffd76a', c2: '#2a1450' }, 21, 3).ok, true);
// ---- bonus: XP/gold only, capped, never for staff
const s = { heroes: [newHero('A', 'Blade')], ctx: { guild: true, guildPct: 4 } }; assert.equal(guildMul(s), 1.04); s.ctx.guildPct = 9; assert.equal(guildMul(s), 1.05); s.ctx.gm = true; assert.equal(guildMul(s), 1); s.ctx = { guild: true }; assert.equal(guildMul(s), 1.02, 'basic guilds keep +2%');
// ---- art
assert.equal(bannerIcon({ sigil: 'crown', c1: '#ff3355', c2: '#2a1450' }), bannerIcon({ sigil: 'crown', c1: '#ff3355', c2: '#2a1450' }), 'cached'); assert.notEqual(hallArt(1, 0), hallArt(1, 5)); assert.notEqual(hallArt(1, 2), hallArt(12, 2), 'level shows');
// ---- LocalBackend flow
const be = new LocalBackend(); const me = { name: 'Tess', staff: false };
await be.createGuild('Lantern Watch', 'LW', me); let I = await be.guildInfo(); assert.equal(I.me.role, 'leader'); assert.equal(I.guild.slots, 30); assert.equal(I.guild.bonus_pct, 2);
const g = be._g(); g.members.push({ name: 'Wren', guild_id: I.guild.id }, { name: 'Holt', guild_id: I.guild.id }); be._sg(g);
await be.guildSetRole('Wren', 'officer'); I = await be.guildInfo(); assert.equal(I.members.find(m => m.name === 'Wren').role, 'officer');
await be.guildSetOpen(false); assert.equal((await be.guildInfo()).guild.open, false);
const save = { gold: 30000 }; await be.guildDonate(20000, save); assert.equal(save.gold, 10000, 'gold leaves the save'); assert.equal((await be.guildInfo()).guild.bank, 20000);
assert.match(await err(be.guildDonate(10, save)), /30 seconds/); const gg = be._g(); gg.guilds.find(x => x.tag === 'LW').ledger[0].at = new Date(Date.now() - 60e3).toISOString(); be._sg(gg);
assert.match(await err(be.guildDonate(6000, save)), /daily donation cap/); assert.match(await err(be.guildDonate(50000, { gold: 10 })), /cap|not enough/);
assert.match(await err(be.guildUpgrade('bonus')), /level 5/); await be.guildUpgrade('banner'); await be.guildUpgrade('hall').catch(() => {}); I = await be.guildInfo(); assert.equal(I.guild.banner_unlocks, 1); assert.equal(I.ledger[0].kind, 'spend');
assert.match(await err(be.guildSetBanner('skull', '#ffd76a', '#2a1450')), /locked/); await be.guildSetBanner('moon', '#7ff6ff', '#2a1450'); assert.equal((await be.guildInfo()).guild.banner.sigil, 'moon');
// server-side-style XP from damage, staff adds nothing, quests progress
const x0 = (await be.guildInfo()).guild.xp; await be.submitDamage('Tess', 4000, {}); await be.submitDamage('Tess', 9999, { staff: true }); I = await be.guildInfo();
assert.equal(I.guild.xp - x0 - I.quests.filter(q => q.done).reduce((a, q) => a + q.xp, 0), 4000); const dq = I.quests.find(q => q.kind === 'damage'); if (dq) assert.equal(dq.progress, 4000);
// chat: filter + slow mode
assert.match(await err(be.guildChatPost('Tess', 'see evil.com')), /links/); const m1 = await be.guildChatPost('Tess', 'what the fuck'); assert.equal(m1.body, 'what the ****'); assert.match(await err(be.guildChatPost('Tess', 'again')), /slow mode/);
assert((await be.guildChatFetch(0)).some(m => m.id === m1.id));
// kick rules + transfer
await be.guildKick('Holt'); assert(!(await be.guildInfo()).members.some(m => m.name === 'Holt'));
await be.guildSetRole('Wren', 'leader'); I = await be.guildInfo(); assert.equal(I.me.role, 'officer'); assert.match(await err(be.guildSetRole('Wren', 'member')), /leader only/);
// invite-only join → request; staff cannot create
const be2 = new LocalBackend(); const gs = be2._g(); gs.me = null; gs.members = gs.members.filter(m => m.name !== 'Tess'); be2._sg(gs);
const r = await be2.joinGuild('LW', { name: 'Tess', staff: false }); assert.equal(r.requested, true, 'invite-only: request');
assert.match(await err(be2.createGuild('Staff Hall', 'SH', { name: 'Architect', staff: true })), /staff cannot own/);
// ---- Supabase wiring (mock): donate pushes the save first, then the RPC; the gold is mirrored locally
{ const { SupabaseBackend } = await import('../js/supabase.js'); const calls = []; const b = Object.create(SupabaseBackend.prototype);
  b.sb = { rpc: async (fn, args) => { calls.push([fn, args]); return { data: fn === 'guild_info' ? { guild: null, invites: [], requests: [] } : fn === 'guild_tags' ? { Tess: { tag: 'LW', banner: R.DEFAULT_BANNER } } : { ok: true }, error: null }; } };
  b._push = async sv => calls.push(['push', sv.gold]); b.now = () => 1; const sv = { gold: 500 };
  await b.guildDonate(200, sv); assert.deepEqual(calls.map(c => c[0]), ['push', 'guild_donate', 'push']); assert.equal(calls[0][1], 500); assert.equal(sv.gold, 300); assert.deepEqual(calls[1][1], { p_amount: 200 });
  await b.guildSetRole('u1', 'officer'); await b.guildUpgrade('hall'); await b.guildSetBanner('moon', '#7ff6ff', '#2a1450'); await b.guildInvite(' abc '); await b.guildAnswer('u2', true); await b.guildKick('u3'); await b.guildSetOpen(false);
  assert.deepEqual(calls.slice(3).map(c => c[0]), ['guild_set_role', 'guild_upgrade', 'guild_set_banner', 'guild_invite', 'guild_answer', 'guild_kick', 'guild_set_open']); assert.equal(calls.find(c => c[0] === 'guild_invite')[1].p_user, 'abc');
  assert.equal((await b.guildTags(1)).Tess.tag, 'LW'); b.holdUploads = true; assert.match(await err(b.guildDonate(1, sv)), /local staff/); assert.match(await err(b.guildUpgrade('hall')), /local staff/); }
console.log('guilds v2 tests passed');

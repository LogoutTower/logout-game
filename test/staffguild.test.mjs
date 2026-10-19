// Staff guild (local backend + client rules): one private, invite-only staff guild; no bonus, XP, quests or bank; off the board; reserved name.
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem();
const { checkGuild, isReservedGuild, STAFF_GUILD, guildError } = await import('../js/guilds.js');
const { LocalBackend } = await import('../js/storage.js');
const { guildMul } = await import('../js/game.js');
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
// ---- reserved name/tag (case-insensitive, near-variants), staff-only
for (const [n, t] of [['Floor Zero', 'FZ'], ['FLOOR ZERO', 'FZ'], ['FloorZero', 'FZ'], ['Floor 0', 'FZ'], ['Fl00r Zer0', 'FZ'], ['Floor-Zero', 'FZ'], ['Night Bell', 'ZERO'], ['Night Bell', 'zer0']]) {
  assert.equal(checkGuild(n, t).reason, 'That name is reserved.', `${n}/${t}`); assert(isReservedGuild(n, t)); }
assert.equal(checkGuild('Floor Ten', 'FT').ok, true); assert.equal(checkGuild('Zero Hour', 'ZH').ok, true, 'only the floor-zero phrase'); assert.equal(checkGuild(STAFF_GUILD.name, STAFF_GUILD.tag, true).ok, true);
// ---- graceful until the SQL runs: the old server refusal reads as "Staff guilds open soon."
assert.equal(guildError('staff cannot own a guild'), 'Staff guilds open soon.'); assert.equal(guildError('name or tag taken'), 'name or tag taken');
// ---- staff founding
const be = new LocalBackend(); const gm = { name: 'Warden', staff: true };
assert.equal(await err(be.createGuild('Floor Zero', 'ZERO', { name: 'Tess', staff: false })), 'That name is reserved.');
const sg = await be.createGuild('Floor Zero', 'ZERO', gm); assert.equal(sg.is_staff, true); assert.equal(sg.open, false);
let I = await be.guildInfo(); assert.equal(I.me.role, 'leader'); assert.equal(I.guild.bonus_pct, 0, 'no bonus'); assert.deepEqual(I.quests, []);
assert.equal((await be.myGuild()).is_staff, true);
// no bonus in play: the client sets ctx.guild false for a staff guild, so the multiplier is 1
assert.equal(guildMul({ ctx: { guild: false, guildPct: 0 } }), 1);
// ---- a second staff guild is refused
{ const g = be._g(); g.me = null; be._sg(g); assert.equal(await err(be.createGuild('Staff Two', 'ST2', { name: 'Keeper', staff: true })), 'a staff guild already exists'); g.me = 'Warden'; be._sg(g); }
// ---- private: off the board, no join or request without an invite, can't be opened
assert(!(await be.guildBoard(true)).some(b => b.tag === 'ZERO'), 'hidden from the board');
assert.match(await err(be.guildSetOpen(true)), /always invite-only/);
{ const g = be._g(); g.me = null; be._sg(g); assert.equal(await err(be.joinGuild('ZERO', { name: 'Ash', staff: false })), 'no such guild');
  assert.equal(be._g().guilds.find(x => x.is_staff).requests.length, 0, 'no request left'); g.me = 'Warden'; be._sg(g); }
// ---- invite by Tower ID; invitee sees the staff note; accepts
await be.guildInvite('Ash'); { const g = be._g(); g.me = 'Ash'; be._sg(g); }
const inv = (await be.guildInfo()).invites; assert.equal(inv[0].tag, 'ZERO'); assert.equal(inv[0].is_staff, true);
await be.guildAcceptInvite(sg.id); I = await be.guildInfo(); assert.equal(I.me.role, 'member'); assert.equal(I.guild.bonus_pct, 0);
// ---- no XP from damage, no bank, tags still show [ZERO] with a staff flag
be._gv2Damage('Ash', 5000, false); I = await be.guildInfo(); assert.equal(I.guild.xp, 0); assert.equal(I.members.find(m => m.name === 'Ash').contrib, 0);
assert.match(await err(be.guildDonate(10, { gold: 100 })), /no bank/);
const t = await be.guildTags(); assert.equal(t.Ash.tag, 'ZERO'); assert.equal(t.Ash.staff, true);
// ---- leadership stays with staff; the leader leaving disbands it
{ const g = be._g(); g.me = 'Warden'; be._sg(g); } assert.match(await err(be.guildSetRole('Ash', 'leader')), /cannot be transferred/);
await be.leaveGuild(); assert(!be._g().guilds.some(x => x.is_staff), 'disbanded'); assert(!be._g().members.some(m => m.name === 'Ash' && m.guild_id === sg.id));
console.log('staff guild tests passed');

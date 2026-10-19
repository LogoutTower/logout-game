// Runs schema.sql + guilds/chat + guilds v2 + staff-guild addendum (staff addendum twice: idempotent) in PGlite.
import assert from 'node:assert'; import fs from 'node:fs';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, staff guild test skipped'); process.exit(0); }
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const f of ['schema.sql', 'schema-addendum-guilds-chat.sql', 'schema-addendum-guilds-v2.sql', 'schema-addendum-staff-guild.sql', 'schema-addendum-staff-guild.sql']) await db.exec(rd(f));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated; grant select on all tables in schema public to anon; grant usage on all sequences in schema public to authenticated;`);
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, GM = U(99), GM2 = U(97), ids = Array.from({ length: 6 }, (_, i) => U(i + 1));
await db.exec(`insert into auth.users (id, is_anonymous) values ${ids.map(id => `('${id}', false)`).join(',')}, ('${GM}', false), ('${GM2}', false); update public.profiles set role = 'gm' where id in ('${GM}', '${GM2}');`);
const as = async (uid, q, p) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await db.query(q, p); } finally { await db.exec('reset role'); } };
const one = async (uid, q, p) => (await as(uid, q, p)).rows[0]?.r;
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const info = uid => one(uid, `select public.guild_info() r`);
// ---- reserved name/tag: players refused (case and near-variants), staff allowed
for (const [n, t] of [['Floor Zero', 'FZ'], ['floor zero', 'FZ'], ['FloorZero', 'FZ'], ['Floor 0', 'FZ'], ['FL00R ZER0', 'FZ'], ['The Floor Zero', 'FZ'], ['Night Bell', 'ZERO'], ['Night Bell', 'zero'], ['Night Bell', 'ZER0']])
  assert.equal(await err(as(ids[0], `select public.guild_create($1, $2)`, [n, t])), 'That name is reserved.', `${n}/${t}`);
// ---- staff founding
const sg = await one(GM, `select public.guild_create('Floor Zero', 'ZERO') r`);
assert.equal(sg.is_staff, true); assert.equal(sg.open, false, 'staff guild starts invite-only');
let I = await info(GM); assert.equal(I.me.role, 'leader'); assert.equal(I.me.is_staff, true); assert.equal(I.guild.bonus_pct, 0, 'no bonus'); assert.deepEqual(I.quests, []);
// ---- a second staff guild is refused (by another staff account, and by the same one after leaving the first is impossible while a member)
assert.match(await err(as(GM2, `select public.guild_create('Staff Two', 'ST2')`)), /a staff guild already exists/);
assert.match(await err(as(GM, `select public.guild_create('Staff Three', 'ST3')`)), /already in a guild/);
// ---- private: not joinable without an invite (no request left), not on the board, not readable directly
assert.equal(await err(as(ids[0], `select public.guild_join('ZERO')`)), 'no such guild');
assert.equal((await db.query(`select count(*)::int c from public.guild_requests`)).rows[0].c, 0, 'no join request');
assert.match(await err(as(GM, `select public.guild_set_open(true)`)), /always invite-only/);
const pg = await one(ids[1], `select public.guild_create('Night Bell', 'NB') r`);
const board = await one(ids[0], `select public.guild_board(null) r`); assert.deepEqual(board.map(b => b.tag), ['NB'], 'staff guild hidden from board');
assert.equal((await as(ids[0], `select * from public.guilds where is_staff`)).rows.length, 0, 'outsiders cannot read the staff guild row');
assert.equal((await as(ids[0], `select * from public.guild_members where guild_id = ${sg.id}`)).rows.length, 0, 'outsiders cannot list its members');
// ---- leader invites by Tower ID; invitee sees it (flagged staff), accepts
await as(GM, `select public.guild_invite('${ids[0]}')`);
const inv = (await info(ids[0])).invites; assert.equal(inv[0].tag, 'ZERO'); assert.equal(inv[0].is_staff, true);
assert.equal((await as(ids[0], `select * from public.guilds where is_staff`)).rows.length, 1, 'invitee can see it');
await as(ids[0], `select public.guild_accept_invite(${sg.id})`); I = await info(ids[0]); assert.equal(I.me.role, 'member'); assert.equal(I.guild.bonus_pct, 0);
// ---- no bank, no XP/quests from damage, no leaderboard entry; [ZERO] still tags the member
assert.match(await err(as(ids[0], `select public.guild_donate(10)`)), /no bank/); assert.match(await err(as(GM, `select public.guild_upgrade('bonus')`)), /no bank/);
await db.exec(`update public.profiles set last_submit = now() - interval '1 hour'`);
await as(ids[0], `select public.submit_damage(5000, 'Ash', 50, 5)`); await as(ids[1], `select public.submit_damage(4000, 'Bell', 50, 5)`);
I = await info(GM); assert.equal(Number(I.guild.xp), 0, 'no guild xp'); assert.equal(Number(I.guild.bank), 0); assert.equal(Number(I.members.find(m => m.user_id === ids[0]).contrib), 0);
assert.equal((await db.query(`select count(*)::int c from public.guild_quests where guild_id = ${sg.id}`)).rows[0].c, 0, 'no quest progress');
const ng = await info(ids[1]); assert.equal(Number(ng.guild.xp) >= 4000, true, 'player guild still earns');
const fl = (await db.query(`select floor from public.damage where user_id = '${ids[0]}'`)).rows[0].floor;
const lb = await one(ids[2], `select public.guild_board($1) r`, [fl]); assert.deepEqual(lb.map(b => b.tag), ['NB'], 'excluded from guild damage leaderboard');
const tags = await one(ids[2], `select public.guild_tags($1) r`, [fl]); assert.equal(tags.Ash.tag, 'ZERO'); assert.equal(tags.Ash.staff, true); assert.equal(tags.Bell.staff, false);
// ---- leadership can't be transferred; a player can't be made leader
assert.match(await err(as(GM, `select public.guild_set_role('${ids[0]}', 'leader')`)), /cannot be transferred/);
// ---- leader leaves: the staff guild disbands, so it can be founded again
await as(GM, `select public.guild_leave()`); assert.equal((await info(ids[0])).guild, null, 'disbanded');
assert.equal((await one(GM2, `select public.guild_create('Floor Zero', 'ZERO') r`)).is_staff, true, 'refound after disband');
// ---- anon cannot call write RPCs
assert(await err((async () => { await db.exec('set role anon'); try { return await db.query(`select public.guild_create('X Y Z', 'XYZ')`); } finally { await db.exec('reset role'); } })()));
console.log('staff guild pglite ok');

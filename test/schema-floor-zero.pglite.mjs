// Floor Zero addendum (exclusive sigil + prestige XP), run twice on top of the staff-guild addendum, in PGlite.
import assert from 'node:assert'; import fs from 'node:fs';
import { ZERO_BANNER, levelOf, slotsOf, staffHall } from '../js/guildsv2.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, floor zero test skipped'); process.exit(0); }
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const f of ['schema.sql', 'schema-addendum-guilds-chat.sql', 'schema-addendum-guilds-v2.sql', 'schema-addendum-staff-guild.sql', 'schema-addendum-floor-zero.sql', 'schema-addendum-floor-zero.sql']) await db.exec(rd(f));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated; grant select on all tables in schema public to anon; grant usage on all sequences in schema public to authenticated;`);
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, GM = U(99), GM2 = U(97), ids = Array.from({ length: 6 }, (_, i) => U(i + 1));
await db.exec(`insert into auth.users (id, is_anonymous) values ${ids.map(id => `('${id}', false)`).join(',')}, ('${GM}', false), ('${GM2}', false); update public.profiles set role = 'gm' where id in ('${GM}', '${GM2}');`);
const as = async (uid, q, p) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await db.query(q, p); } finally { await db.exec('reset role'); } };
const one = async (uid, q, p) => (await as(uid, q, p)).rows[0]?.r;
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const info = uid => one(uid, `select public.guild_info() r`);

// ---- staff guild gets the zero banner by default
const sg = await one(GM, `select public.guild_create('Floor Zero', 'ZERO') r`); assert.deepEqual(sg.banner, ZERO_BANNER, 'default banner');
assert.deepEqual((await db.query(`select public.gv2_zero_banner() b`)).rows[0].b, ZERO_BANNER, 'JS/SQL parity');
const pg = await one(ids[1], `select public.guild_create('Night Bell', 'NB') r`); assert.equal(pg.banner.sigil, 'tower');
// ---- sigil exclusivity: RPC, direct writes, and the black/gold pair
assert.match(await err(as(ids[1], `select public.guild_set_banner('zero', '#e8b923', '#050505')`)), /belongs to Floor Zero/);
assert.match(await err(as(ids[1], `select public.guild_set_banner('tower', '#e8b923', '#050505')`)), /palette/, 'pair is outside the palette');
assert.match(await err(db.query(`update public.guilds set banner = '{"sigil":"zero","c1":"#e8b923","c2":"#050505"}' where id = ${pg.id}`)), /belongs to Floor Zero/, 'guard even for direct writes');
assert.match(await err(db.query(`update public.guilds set banner = '{"sigil":"crown","c1":"#050505","c2":"#e8b923"}' where id = ${pg.id}`)), /belongs to Floor Zero/, 'exact pair locked');
await as(GM, `select public.guild_set_banner('moon', '#ffd76a', '#2a1450')`); await as(GM, `select public.guild_set_banner('zero', 'x', 'y')`);
assert.deepEqual((await info(GM)).guild.banner, ZERO_BANNER, 'staff can fly it; palette forced');
// ---- prestige XP: members' damage (GM included) counts for the staff guild only
await as(GM, `select public.guild_invite('${ids[0]}')`); await as(ids[0], `select public.guild_accept_invite(${sg.id})`);
await db.exec(`update public.profiles set last_submit = now() - interval '1 hour'`);
await as(ids[0], `select public.submit_damage(5000, 'Ash', 50, 5)`); await as(GM, `select public.submit_damage(30000, 'Warden', 50, 5)`); await as(ids[1], `select public.submit_damage(4000, 'Bell', 50, 5)`);
let I = await info(GM); const xp = Number(I.guild.xp); assert(xp > 5000, 'GM damage counted for the staff guild'); assert.equal(xp, I.members.reduce((a, m) => a + Number(m.contrib), 0), 'xp = members contrib');
assert.equal(I.guild.level, levelOf(xp)); assert.equal(I.guild.slots, slotsOf(levelOf(xp))); assert.equal(I.guild.prestige, true); assert.equal(I.guild.hall_display, staffHall(I.guild.level));
assert.equal(I.guild.bonus_pct, 0, 'still zero bonus'); assert.deepEqual(I.quests, []); assert.equal(Number(I.guild.bank), 0, 'no bank');
assert.equal((await db.query(`select count(*)::int c from public.guild_quests where guild_id = ${sg.id}`)).rows[0].c, 0, 'no quest progress');
assert.equal((await db.query(`select count(*)::int c from public.guild_ledger where guild_id = ${sg.id}`)).rows[0].c, 0, 'no payouts');
const nb = await info(ids[1]); assert.equal(Number(nb.guild.xp) - nb.quests.filter(q => q.done).reduce((a, q) => a + Number(q.xp), 0), 4000, 'normal guild unchanged');
// ---- still off the leaderboard / board, set even on a high level
await db.exec(`update public.guilds set xp = 5000000 where is_staff`);
assert(!(await one(ids[2], `select public.guild_board(null) r`)).some(b => b.tag === 'ZERO'), 'excluded from leaderboard');
assert.match(await err(as(ids[0], `select public.guild_upgrade('bonus')`)), /no bank/);
// a GM in a normal guild still adds nothing to it
await db.exec(`update public.profiles set last_submit = now() - interval '1 hour'`); await as(GM, `select public.guild_leave()`); await as(GM2, `select public.guild_join('NB')`);
await as(GM2, `select public.submit_damage(90000, 'Keeper', 50, 5)`); { const n2 = await info(ids[1]); assert.equal(Number(n2.guild.xp) - n2.quests.filter(q => q.done).reduce((a, q) => a + Number(q.xp), 0), 4000, 'staff damage never counts for a normal guild'); assert.equal(Number(n2.members.find(m => m.user_id === GM2).contrib), 0); }
console.log('floor zero pglite ok');

// Runs schema.sql + schema-addendum-guilds-chat.sql (twice: idempotent) in PGlite and checks guilds, chat and RLS,
// plus that the SQL chat filter agrees with js/chatfilter.js on a shared case list.
import assert from 'node:assert'; import fs from 'node:fs';
import { cleanChat } from '../js/chatfilter.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, addendum test skipped'); process.exit(0); }
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const base = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'), add = fs.readFileSync(new URL('../supabase/schema-addendum-guilds-chat.sql', import.meta.url), 'utf8');
await db.exec(base); await db.exec(add); await db.exec(add); // idempotent
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated; grant select on all tables in schema public to anon; grant usage on all sequences in schema public to authenticated;`); // Supabase default grants: RLS must still stop direct writes
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, GM = U(99), ANON = U(98);
const ids = Array.from({ length: 32 }, (_, i) => U(i + 1));
await db.exec(`insert into auth.users (id, is_anonymous) values ${ids.map(id => `('${id}', false)`).join(',')}, ('${GM}', false), ('${ANON}', true); update public.profiles set role = 'gm' where id = '${GM}';`);
const as = async (uid, q, p) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await db.query(q, p); } finally { await db.exec('reset role'); } };
const err = async (p) => { try { await p; } catch (e) { return e.message; } return null; };
// ---- filter parity (JS vs SQL)
const cases = ['Floor 10. Nice hit', 'visit evil.com', 'evil (dot) com', 'polka dot dress', 'my site dot com', 'https://x', 'www.x', 'discord.gg/abc', 'join t.me now',
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', '0x12345678901234567890abcd', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'what the fuck', 'Sh1t happens', 'assassin build', 'hello   there', '', 'x'.repeat(201), 'gg wp everyone', 'ABCDEFGHIJ1234567890XYZ'];
for (const c of cases) { const js = cleanChat(c), sql = (await db.query('select public.chat_clean($1, 200) r', [c])).rows[0].r;
  assert.equal(sql.ok, js.ok, `ok parity: ${c}`); if (js.ok) assert.equal(sql.text, js.text, `text parity: ${c}`); else assert.equal(sql.reason, js.reason, `reason parity: ${c}`); }
// ---- RLS: no direct writes, chat_banned_words and chat_reports unreadable
assert(await err(as(ids[0], `insert into public.guilds (name, tag, owner) values ('Hack', 'HK', '${ids[0]}')`)), 'no direct guild insert');
assert(await err(as(ids[0], `insert into public.chat_messages (floor, author, name, body) values (1, 'a', 'b', 'c')`)), 'no direct chat insert');
assert.equal((await as(ids[0], `select * from public.chat_banned_words`)).rows.length, 0, 'word list not readable');
// ---- guilds
const g = (await as(ids[0], `select public.guild_create('Night Bell', 'nb') r`)).rows[0].r; assert.equal(g.tag, 'NB');
assert.match(await err(as(ids[1], `select public.guild_create('night bell', 'XX')`)), /taken/);
assert.match(await err(as(ids[1], `select public.guild_create('Visit evil.com', 'EV')`)), /name/);
assert.match(await err(as(ids[1], `select public.guild_create('Shitlords', 'SL')`)), /not allowed/);
assert.match(await err(as(GM, `select public.guild_create('Staff Hall', 'GM')`)), /staff cannot own/);
for (let i = 1; i < 30; i++) await as(ids[i], `select public.guild_join('nb')`);
assert.match(await err(as(ids[30], `select public.guild_join('NB')`)), /full/, 'cap 30');
assert.match(await err(as(ids[1], `select public.guild_join('NB')`)), /already/);
await as(ids[29], `select public.guild_leave()`); await as(GM, `select public.guild_join('NB')`); // staff may sit in a guild (31st seat taken from the freed one)
assert.equal((await db.query(`select is_staff from public.guild_members where user_id = '${GM}'`)).rows[0].is_staff, true);
await as(ids[30], `select public.guild_create('Ash Court', 'ASH')`);
// damage: staff damage must never count for a guild
await db.exec(`update public.profiles set last_submit = now() - interval '1 hour'`);
await as(ids[0], `select public.submit_damage(3000, 'A0', 50, 5)`); await as(GM, `select public.submit_damage(900000, 'Staff', 500, 50)`); await as(ids[30], `select public.submit_damage(5000, 'A30', 50, 5)`);
const board = (await as(ids[5], `select public.guild_board(null) r`)).rows[0].r;
assert.deepEqual(board.map(x => [x.tag, Number(x.damage)]), [['ASH', 5000], ['NB', 3000]], 'staff damage adds nothing to its guild');
// owner leaves: guild passes on; last member leaves: guild is deleted
await as(ids[0], `select public.guild_leave()`); assert.equal((await db.query(`select owner from public.guilds where tag = 'NB'`)).rows[0].owner, ids[1], 'heir = longest-serving non-staff');
await as(ids[30], `select public.guild_leave()`); assert.equal((await db.query(`select count(*)::int n from public.guilds where tag = 'ASH'`)).rows[0].n, 0);
// ---- chat
assert.match(await err(as(ANON, `select public.chat_post('Guest', 'hello')`)), /bind your identity/, 'guests cannot post');
const m1 = (await as(ids[2], `select public.chat_post('Tess', 'what the fuck, nice hit') r`)).rows[0].r; assert.equal(m1.body, 'what the ***** nice hit'); assert.equal(m1.guild_tag, 'NB'); assert.equal(m1.author.length, 12); assert(!JSON.stringify(m1).includes(ids[2]), 'no user id exposed');
assert.match(await err(as(ids[2], `select public.chat_post('Tess', 'again')`)), /slow mode/);
for (const bad of ['go to evil.com', 'send to 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'x'.repeat(201)]) { await db.exec(`update public.profiles set last_chat = null`); assert(await err(as(ids[3], `select public.chat_post('Bo', $1)`, [bad])), 'refused: ' + bad.slice(0, 20)); }
assert.equal((await db.query(`select floor from public.chat_messages where id = ${m1.id}`)).rows[0].floor, (await db.query(`select floor from public.floor_state`)).rows[0].floor, 'channel = current shared floor');
for (let i = 0; i < 105; i++) { await db.exec(`update public.profiles set last_chat = null`); await as(ids[4], `select public.chat_post('Spam', $1)`, ['line ' + i]); }
const f = (await db.query(`select floor from public.floor_state`)).rows[0].floor;
assert.equal((await db.query(`select count(*)::int n from public.chat_messages where floor = ${f}`)).rows[0].n, 100, 'keeps last 100 per floor');
// reports: 3 distinct reporters hide a message; duplicates do not count
const last = (await db.query(`select max(id) id from public.chat_messages`)).rows[0].id;
await as(ids[5], `select public.chat_report(${last}, 'spam')`); await as(ids[5], `select public.chat_report(${last}, 'spam')`); await as(ids[6], `select public.chat_report(${last})`);
assert.equal((await as(ids[7], `select * from public.chat_messages where id = ${last}`)).rows.length, 1, 'two reporters: still visible');
await as(ids[7], `select public.chat_report(${last})`); assert.equal((await as(ids[8], `select * from public.chat_messages where id = ${last}`)).rows.length, 0, 'hidden after 3');
assert.equal((await as(ids[8], `select * from public.chat_reports`)).rows.length, 0, 'reports unreadable');
// ---- staff Codex marks: role = gm only, herald filtered, rate-limited per floor
assert.match(await err(as(ids[2], `select public.gm_mark('shaped', 1)`)), /forbidden/, 'players cannot spoof marks');
assert.equal((await as(GM, `select public.gm_mark('shaped', 3) r`)).rows[0].r, true); assert.equal((await as(GM, `select public.gm_mark('shaped', 3) r`)).rows[0].r, false, 'rate-limited');
assert.match(await err(as(GM, `select public.gm_mark('herald', 3, 'visit evil.com')`)), /links/);
await as(GM, `select public.gm_mark('herald', 3, 'The shit has arrived')`); await as(GM, `select public.gm_mark('decree6', 3, 'final')`);
const mk = (await db.query(`select gm_marks from public.floor_state`)).rows[0].gm_marks; assert.equal(mk.herald.text, 'The **** has arrived'); assert(Date.parse(mk.decree6.until) > Date.now() + 100e3);
assert.match(await err(as(GM, `select public.gm_mark('bogus', 3)`)), /unknown/);
console.log('schema addendum (guilds + chat + staff marks) tests passed, idempotent');

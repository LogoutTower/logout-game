// Turnout scaling addendum in PGlite (run twice: idempotent). Never touches the live DB.
import assert from 'node:assert'; import fs from 'node:fs'; import { floorBossHp } from '../js/floors.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, turnout test skipped'); process.exit(0); }
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ['schema.sql', 'schema-addendum-guilds-chat.sql', 'schema-addendum-floors-11-20.sql', 'schema-addendum-arc1-pacing.sql', 'schema-addendum-turnout-scaling.sql', 'schema-addendum-turnout-scaling.sql']) await db.exec(rd(n));
const cols = (await db.query(`select column_name c from information_schema.columns where table_name='profiles' and is_nullable='NO' and column_default is null`)).rows.map(r => r.c);
const setActive = async n => { await db.exec(`delete from public.profiles; delete from auth.users;`); for (let i = 0; i < n; i++) { const u = `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`; await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing; insert into public.profiles (id, last_submit) values ('${u}', now() - interval '1 hour') on conflict (id) do update set last_submit = excluded.last_submit;`); } };
const adv = async (f, over = 0) => { await db.exec(`update public.floor_state set floor = ${f - 1}, max_hp = public.floor_hp(${f - 1}), hp = 0`); await db.exec(`update public.floor_state set floor = ${f}, hp = public.floor_hp(${f}) - ${over}`); return (await db.query(`select hp::bigint hp, max_hp::bigint m from public.floor_state`)).rows[0]; };
for (const [n, mul] of [[0, 0.5], [50, 0.5], [100, 1], [300, 3], [900, 9], [5000, 50], [9000, 50]]) { await setActive(n); const r = await adv(5, 1000); assert.equal(Number(r.m), Math.round(floorBossHp(5) * mul), `max_hp at ${n} active`); assert.equal(Number(r.hp), Number(r.m) - 1000, 'overflow kept'); }
// mid-floor: start at 100 active, surge to 400 an hour later -> grows x4 keeping the fraction; a dip never shrinks it
await setActive(100); let r = await adv(6); const m0 = Number(r.m); await db.exec(`update public.floor_state set hp = ${m0 / 2}`);
assert.equal(Number((await db.query(`select max_hp from public.floor_state`)).rows[0].max_hp), m0, 'no re-check within the hour');
await setActive(400); await db.exec(`update public.floor_state set turnout_checked_at = now() - interval '2 hours'`); await db.exec(`update public.floor_state set hp = hp - 0`);
r = (await db.query(`select hp::bigint hp, max_hp::bigint m from public.floor_state`)).rows[0]; assert.equal(Number(r.m), m0 * 4, 'surge grows max_hp'); assert.equal(Number(r.hp), m0 * 2, 'fraction kept');
await setActive(60); await db.exec(`update public.floor_state set turnout_checked_at = now() - interval '2 hours'`); await db.exec(`update public.floor_state set hp = hp - 0`);
assert.equal(Number((await db.query(`select max_hp from public.floor_state`)).rows[0].max_hp), m0 * 4, 'never shrinks mid-floor');
console.log('turnout pglite ok');

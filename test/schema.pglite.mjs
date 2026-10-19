// Runs supabase/schema.sql against an in-process Postgres (PGlite) with a stubbed auth schema, and checks the RLS + RPC logic.
// Needs @electric-sql/pglite (npm i @electric-sql/pglite); skipped otherwise. Run twice to prove the schema is idempotent.
import assert from 'node:assert';
import fs from 'node:fs';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, schema test skipped'); process.exit(0); }
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const sql = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
await db.exec(sql); await db.exec(sql); // idempotent
await db.exec(`grant select, insert, update on all tables in schema public to authenticated; grant select on all tables in schema public to anon; grant usage on all sequences in schema public to authenticated;
  revoke update on public.profiles from authenticated; grant update (display_name) on public.profiles to authenticated;`); // Supabase's default grants, then the schema's column rule again
const A = '00000000-0000-0000-0000-00000000000a', G = '00000000-0000-0000-0000-00000000000b';
await db.exec(`insert into auth.users (id) values ('${A}'), ('${G}'); update public.profiles set role = 'gm' where id = '${G}';`);
const as = async (uid, q, params) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await db.query(q, params); } finally { await db.exec('reset role'); } };
const fails = async (p, msg) => { let ok = false; try { await p; } catch { ok = true; } assert(ok, msg); };
// profiles created by trigger, role can't be self-assigned
assert.equal((await db.query(`select count(*)::int n from public.profiles`)).rows[0].n, 2);
await fails(as(A, `update public.profiles set role = 'gm' where id = '${A}'`), 'player cannot self-assign gm');
await as(A, `update public.profiles set display_name = 'Tess' where id = '${A}'`);
assert.equal((await db.query(`select role from public.profiles where id = '${A}'`)).rows[0].role, 'player');
// saves: own only
await as(A, `insert into public.saves (user_id, data) values ('${A}', '{"gold":1}')`);
await fails(as(A, `insert into public.saves (user_id, data) values ('${G}', '{}')`), 'cannot write another user save');
assert.equal((await as(G, `select * from public.saves`)).rows.length, 0, 'cannot read another user save');
// floor/damage: public read, no direct writes
await fails(as(A, `update public.floor_state set hp = 0`).then(r => { if (!r.affectedRows) throw 0; }), 'no direct floor writes');
await fails(as(A, `insert into public.damage (user_id, floor, name, damage) values ('${A}', 1, 'x', 999999999)`), 'no direct damage writes');
// submit_damage clamps (first submit: 30s × max plausible DPS for level 1, gear 0)
const r1 = (await as(A, `select public.submit_damage(999999999, 'Tess', 1, 0) r`)).rows[0].r;
const cap = Math.floor((6.5 * 1 * 1 * 4 + 50) * 30); assert(Math.abs(r1.accepted - cap) <= 2 * (6.5 * 4 + 50), `clamped first submit ${r1.accepted} ~ ${cap}`);
const r2 = (await as(A, `select public.submit_damage(999999999, 'Tess', 1, 0) r`)).rows[0].r; assert(r2.accepted < 200, `no elapsed time → tiny allowance (${r2.accepted})`);
assert.equal(r1.gm_present_until, null, 'players do not set GM presence');
// floor advance with overflow: give the GM a big elapsed window and a huge level, then submit past floor 1
await db.exec(`update public.profiles set last_submit = now() - interval '12 hours' where id = '${G}'; update public.floor_state set hp = 1000`);
const g = (await as(G, `select public.submit_damage(1500, 'Staff', 100, 10) r`)).rows[0].r;
assert.equal(g.floor, 2); assert.equal(Number(g.hp), Number(g.max_hp) - 500, 'overflow carries'); assert(g.gm_present_until, 'GM refreshes presence');
const clr = (await db.query(`select * from public.floor_clears`)).rows[0]; assert.deepEqual(clr.ranking, ['Tess'], 'staff excluded from ranking'); assert(clr.dmg.Staff, 'staff damage still counted');
assert.equal((await db.query(`select is_staff from public.damage where user_id = '${G}'`)).rows[0].is_staff, true);
// GM-only RPCs + announce rate limit
await fails(as(A, `select public.gm_presence()`), 'player cannot set presence'); await fails(as(A, `select public.gm_announce(2)`), 'player cannot announce');
assert.equal((await as(G, `select public.gm_announce(2) r`)).rows[0].r, true); assert.equal((await as(G, `select public.gm_announce(2) r`)).rows[0].r, false, 'once per floor per 10 min');
assert.equal((await as(G, `select public.gm_announce(3) r`)).rows[0].r, true, 'new floor allowed');
// floor_hp mirrors js/floors.js
const { floorBossHp } = await import('../js/floors.js');
// Floors 11+ use the arc multiplier from schema-addendum-floors-11-20.sql; parity for those is checked in schema-floors-11-20.pglite.mjs.
const LEGACY = { 1: 20000, 2: 31300, 9: 316800, 10: 1021250 }; // base schema.sql curve; schema-addendum-arc1-pacing.sql replaces it (parity: schema-arc1-pacing.pglite.mjs)
for (const f of [1, 2, 9, 10]) assert.equal(Number((await db.query(`select public.floor_hp(${f}) h`)).rows[0].h), LEGACY[f], `floor_hp(${f})`);
console.log('schema (pglite) tests passed');

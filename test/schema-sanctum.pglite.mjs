// Staff Sanctum (schema-addendum-sanctum.sql), offline in PGlite with every addendum applied twice.
import assert from 'node:assert'; import fs from 'node:fs';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, sanctum test skipped'); process.exit(0); }
const { ADDENDA } = await import('./addenda.mjs'); assert(ADDENDA.includes('schema-addendum-sanctum.sql'));
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ADDENDA) await db.exec(rd(n)); for (const n of ADDENDA) await db.exec(rd(n));
await db.exec(`grant all on all tables in schema public to anon, authenticated; grant usage, select on all sequences in schema public to anon, authenticated;`);
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, P = U(1), GM = U(9);
await db.exec(`insert into auth.users (id, is_anonymous) values ('${P}', false), ('${GM}', false); update public.profiles set role = 'gm' where id = '${GM}'`);
const as = async (uid, q, p) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return (await db.query(q, p)).rows[0]?.r; } finally { await db.exec('reset role'); } };
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const st = async () => (await db.query(`select floor, hp::float8 hp, max_hp::float8 mx, gm_present_until from public.floor_state`)).rows[0];
const back = (u, s) => db.exec(`update public.profiles set last_submit = now() - interval '${s} seconds' where id = '${u}'`);
assert.match(await err(as(P, `select public.staff_sanctum(true)`)), /staff only/, 'players cannot enter');
// in the tower: staff damage hits the boss
await back(GM, 60); await as(GM, `select public.tick(1000, 'Staff', 50, 10, 0) r`); const s1 = await st(); assert(s1.hp < s1.mx, 'tower: staff damage lands');
// enter the Sanctum: ticks change nothing shared, even a floor-killing amount
await as(GM, `select public.staff_sanctum(true) r`); const before = await st(), dmg0 = (await db.query(`select coalesce(sum(damage), 0)::float8 d from public.damage where user_id = $1`, [GM])).rows[0].d, cl0 = (await db.query(`select count(*)::int c from public.floor_clears`)).rows[0].c;
await back(GM, 12 * 3600); await as(GM, `select public.tick(1e15::bigint, 'Staff', 500, 100, 0) r`);
const after = await st(); assert.deepEqual([after.floor, after.hp, after.mx], [before.floor, before.hp, before.mx], 'sanctum: boss untouched');
assert.equal((await db.query(`select coalesce(sum(damage), 0)::float8 d from public.damage where user_id = $1`, [GM])).rows[0].d, dmg0, 'no damage row change');
assert.equal((await db.query(`select count(*)::int c from public.floor_clears`)).rows[0].c, cl0, 'no clears → no rankings, no clear/pet drops');
// turnout: the Sanctum profile is not an active hero
const tm = async () => Number((await db.query(`select public.turnout_mul() m`)).rows[0].m);
await db.exec(`update public.profiles set last_submit = now()`); await db.exec(`insert into auth.users (id) select ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(100, 199) g; update public.profiles set last_submit = now()`);
const inS = await tm(); await db.exec(`update public.profiles set sanctum = false where id = '${GM}'`); const out = await tm(); assert(out > inS, `sanctum hero not counted (${inS} < ${out})`); await db.exec(`update public.profiles set sanctum = true where id = '${GM}'`);
// players are unaffected while staff is in the Sanctum
await back(P, 60); const p0 = await st(); await as(P, `select public.tick(500, 'Player', 5, 1, 0) r`); assert((await st()).hp < p0.hp, 'players still hit the boss');
// leaving resets last_submit: the Sanctum time can't be claimed as tower damage
await db.exec(`update public.profiles set last_submit = now() - interval '6 hours' where id = '${GM}'`); await as(GM, `select public.staff_sanctum(false)`);
const r = await as(GM, `select public.tick(1e15::bigint, 'Staff', 50, 10, 0) r`); assert(Number(r.a) < 1e6, `back in the tower: only seconds of damage accepted (${r.a})`);
assert.match(await err(as(P, `select public.in_sanctum()`)), /permission denied/);
console.log('sanctum pglite tests passed');

// Team staff accounts (schema-addendum-team-staff.sql + admin-mark-staff.sql + admin-reset-tower.sql), offline in PGlite with every
// addendum applied twice. Never the live DB.
import assert from 'node:assert'; import fs from 'node:fs';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, team staff test skipped'); process.exit(0); }
const { ADDENDA } = await import('./addenda.mjs'); assert.equal(ADDENDA.at(-1) === 'schema-addendum-team-staff.sql' || ADDENDA.indexOf('schema-addendum-team-staff.sql') > ADDENDA.indexOf('schema-addendum-reset-epoch.sql'), true);
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ADDENDA) await db.exec(rd(n)); for (const n of ADDENDA) await db.exec(rd(n));
// only an admin can flag: clients may update display_name only (checked before this test's blanket grant)
assert.equal((await db.query(`select has_column_privilege('authenticated', 'public.profiles', 'team', 'UPDATE') p`)).rows[0].p, false);
await db.exec(`grant all on all tables in schema public to anon, authenticated; grant usage, select on all sequences in schema public to anon, authenticated;`);
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, P = U(1), T = U(2), GM = U(9);
await db.exec(`insert into auth.users (id, is_anonymous) values ('${P}', false), ('${T}', false), ('${GM}', false); update public.profiles set role = 'gm', holder = true where id = '${GM}';
  update public.profiles set holder = true where id in ('${P}', '${T}')`);
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const as = async (uid, q) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return (await db.query(q)).rows[0]?.r; } finally { await db.exec('reset role'); } };
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const mark = id => db.exec(rd('admin-mark-staff.sql').replaceAll('00000000-0000-0000-0000-000000000000', id));
await mark(T); await mark(T); await mark(GM); // idempotent; the GM is never flagged
assert.equal((await q1(`select team from public.profiles where id = $1`, [T])).team, true); assert.equal((await q1(`select team from public.profiles where id = $1`, [GM])).team, false);
assert.equal((await q1(`select role from public.profiles where id = $1`, [T])).role, 'player', 'no GM role');
// boss damage counts normally, but the row is unranked and hidden from the board
const back = u => db.exec(`update public.profiles set last_submit = now() - interval '60 seconds' where id = '${u}'`);
const hp0 = Number((await q1(`select hp::float8 h from public.floor_state`)).h);
await back(P); await as(P, `select public.submit_damage(50::bigint, 'Pilgrim', 5, 1) r`);
await back(T); const tr = await as(T, `select public.submit_damage(50::bigint, 'Helper', 5, 1) r`);
assert.equal(Number(tr.accepted), 50, 'team damage accepted normally');
assert.equal(Number((await q1(`select hp::float8 h from public.floor_state`)).h), hp0 - 100, 'team damage hits the shared boss');
const row = await q1(`select is_staff, is_team from public.damage where user_id = $1`, [T]); assert.deepEqual(row, { is_staff: true, is_team: true });
const sn = await as(P, `select public.snapshot() r`); assert.deepEqual(sn.lb.map(r => r[0]), ['Pilgrim'], 'snapshot board: no team rows');
await db.exec(`set role anon`); const pub = (await db.query(`select name from public.damage`)).rows.map(r => r.name); await db.exec('reset role');
assert.deepEqual(pub, ['Pilgrim'], 'public damage reads hide team rows');
// rewards: never team, never GM
assert.deepEqual((await db.query(`select public.fee_eligible_holders() u`)).rows.map(r => r.u), [P]);
assert.equal((await q1(`select public.reward_eligible($1) e`, [T])).e, false); assert.equal((await q1(`select public.reward_eligible($1) e`, [P])).e, true);
assert.match(await err(as(P, `select public.fee_eligible_holders() r`)), /permission denied/);
// public roster: the team hero only
const ro = await as(P, `select public.team_roster() r`); assert.equal(ro.length, 1); assert.equal(ro[0].n, 'Helper'); assert.match(ro[0].a, /^[0-9a-f]{12}$/);
// no GM perks: GM checks stay false
assert.equal((await q1(`select public.casino_is_gm($1) g`, [T])).g, false);
// pre-release reset keeps team + GM saves, wipes the tester; team never gets an epoch
for (const u of [P, T, GM]) await db.exec(`insert into public.saves (user_id, data) values ('${u}', '{"gold": 7}')`);
await db.exec(rd('admin-reset-tower.sql'));
assert.deepEqual((await db.query(`select user_id from public.saves order by user_id`)).rows.map(r => r.user_id), [T, GM]);
const epOf = async u => { await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`); return (await q1(`select public.reset_info() r`)).r; }; // what tick() returns as 'ep'
assert.equal(await epOf(T), null, 'team client sees no reset epoch'); assert.ok(await epOf(P)); await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
await db.exec(`update public.saves set data = '{"gold": 9}' where user_id = '${T}'`); assert.equal((await q1(`select data->>'gold' g from public.saves where user_id = $1`, [T])).g, '9', 'team save uploads not dropped');
console.log('team staff schema ok');

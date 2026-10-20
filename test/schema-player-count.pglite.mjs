// Player counter (schema-addendum-player-count.sql), offline in PGlite with every addendum applied twice. Never the live DB.
import assert from 'node:assert'; import fs from 'node:fs';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, player count test skipped'); process.exit(0); }
const { ADDENDA } = await import('./addenda.mjs'); assert.equal(ADDENDA.at(-1), 'schema-addendum-player-count.sql');
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ADDENDA) await db.exec(rd(n)); for (const n of ADDENDA) await db.exec(rd(n));
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
// 1,2 synced now; 3 synced 20 min ago; 4 save only; 5 nothing; 6 team; 7 gm
await db.exec(`insert into auth.users (id) select ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 7) i;
  update public.profiles set last_submit = now() where id in ('${U(1)}', '${U(2)}', '${U(6)}', '${U(7)}');
  update public.profiles set last_submit = now() - interval '20 minutes' where id = '${U(3)}';
  update public.profiles set team = true where id = '${U(6)}'; update public.profiles set role = 'gm' where id = '${U(7)}';
  insert into public.saves (user_id, data) values ('${U(4)}', '{"createdAt": 9e15}'), ('${U(6)}', '{}'), ('${U(7)}', '{}');`);
const counts = async (role = 'anon') => { await db.exec(`set role ${role}`); try { return (await q1(`select public.tower_counts() r`)).r; } finally { await db.exec('reset role'); } };
let c = await counts(); assert.equal(c.t, 4, 'trapped: real players with a save or sync'); assert.equal(c.o, 2, 'online: synced in 10 min, no staff/gm'); assert.deepEqual(c.f, []);
// cached: a new player within the minute does not change the answer
await db.exec(`insert into auth.users (id) values ('${U(8)}'); update public.profiles set last_submit = now() where id = '${U(8)}'`);
assert.equal((await counts('authenticated')).t, 4, 'cached for a minute');
await db.exec(`update public.tower_counts_cache set at = now() - interval '2 minutes'`); c = await counts(); assert.deepEqual([c.t, c.o], [5, 3], 'refreshes once stale');
// reset epoch: only activity since reset_at counts
await db.exec(`update public.tower_config set reset_at = now() - interval '5 minutes' where id = 1; update public.tower_counts_cache set at = 'epoch'`);
c = await counts(); assert.equal(c.t, 4, 'player 3 synced before the reset: not trapped'); // 1,2,8 sync + 4 save (updated_at = now)
// floor clears stamp the trapped count
await db.exec(`insert into public.floor_clears (floor, max_hp, ranking, dmg) values (1, 100, '{}', '{}')`);
assert.equal((await q1(`select players from public.floor_clears where floor = 1`)).players, 4);
await db.exec(`set role anon`); c = (await q1(`select public.tower_counts() r`)).r; await db.exec('reset role'); assert.deepEqual(c.f, [[1, 4]]);
// the server's real advance path stamps it too
await db.exec(`update public.floor_state set hp = 1; update public.profiles set last_submit = now() - interval '60 seconds' where id = '${U(1)}'; set role authenticated; select set_config('request.jwt.claim.sub', '${U(1)}', false); select public.submit_damage(1000000::bigint, 'Pilgrim', 5, 1); reset role;`);
const fl = (await q1(`select floor, players from public.floor_clears order by id desc limit 1`)); if (fl.floor !== 1) assert.equal(fl.players, 4, 'submit_damage clear stamped');
// lockdown
await db.exec(`set role anon`); assert.match(await err(db.query(`select * from public.tower_counts_cache`)), /permission denied/);
assert.match(await err(db.query(`select public.tower_counts_refresh(true)`)), /permission denied/); await db.exec('reset role');
console.log('player count schema ok');

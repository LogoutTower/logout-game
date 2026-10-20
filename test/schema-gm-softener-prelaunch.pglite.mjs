// GM raid softener + pre-launch HP factor (schema-addendum-gm-softener-prelaunch.sql) and admin-reset-tower.sql, offline in PGlite.
// Every addendum applied twice; the reset is run twice. Never the live DB.
import assert from 'node:assert'; import fs from 'node:fs';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, softener test skipped'); process.exit(0); }
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { ADDENDA } = await import('./addenda.mjs'); assert(ADDENDA.includes('schema-addendum-gm-softener-prelaunch.sql'));
const L = await import('../js/loot.js'); const F = await import('../js/floors.js');
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8'), ADD = 'schema-addendum-gm-softener-prelaunch.sql';
for (const n of ADDENDA) await db.exec(rd(n)); for (const n of ADDENDA) await db.exec(rd(n));
await db.exec(`grant all on all tables in schema public to anon, authenticated; grant usage, select on all sequences in schema public to anon, authenticated; revoke all on public.tower_config from anon, authenticated;`);
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, P = U(1), GM = U(9);
await db.exec(`insert into auth.users (id, is_anonymous) values ('${P}', false), ('${GM}', false); update public.profiles set role = 'gm' where id = '${GM}'`);
const q1 = async (s, p) => (await db.query(s, p)).rows[0];
const as = async (uid, q) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return (await db.query(q)).rows[0]?.r; } finally { await db.exec('reset role'); } };
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const st = () => q1(`select floor, hp::float8 hp, max_hp::float8 mx from public.floor_state`);
const back = (u, s) => db.exec(`update public.profiles set last_submit = now() - interval '${s} seconds' where id = '${u}'`);
const hp = async f => Number((await q1(`select public.floor_hp($1)::float8 h`, [f])).h);
// ref_dps mirrors the client
for (const f of [1, 11, 15, 20]) assert(Math.abs(Number((await q1(`select public.ref_dps($1) d`, [f])).d) - L.refPlayerDps(f)) < 0.005 * L.refPlayerDps(f), `ref_dps(${f})`);
assert.equal(await hp(11), F.floorBossHp(11), 'floor_hp mirrors the client');
// pre-launch: floors 11-20 start at floor_hp × turnout(0.5) × 0.04
await db.exec(`update public.floor_state set floor = 11, hp = public.floor_hp(11), max_hp = public.floor_hp(11) where id = 1`);
let s = await st(); assert.equal(s.mx, Math.round(await hp(11) * 0.5 * 0.04), `reduced floor 11 (${s.mx})`);
assert.equal(Number((await q1(`select public.prelaunch_hp_mul(5) m`)).m), 1, 'arc 1 untouched'); assert.equal(Number((await q1(`select public.prelaunch_hp_mul(21) m`)).m), 1);
await db.exec(rd(ADD)); assert.deepEqual(await st(), s, 'idempotent re-run');
// softener: GM accepted ≤ 1.5 × ref × elapsed; a player with the same claim is not softened
await back(GM, 60); const g = await as(GM, `select public.submit_damage(1e12::bigint, 'Staff', 400, 60) r`); const cap = 1.5 * L.refPlayerDps(11) * 61;
assert(Number(g.accepted) > 0 && Number(g.accepted) <= cap, `GM softened (${g.accepted} ≤ ${cap})`);
await back(P, 60); const pl = await as(P, `select public.submit_damage(1e12::bigint, 'Player', 21, 19) r`); assert(Number(pl.accepted) > Number(g.accepted) * 2, `players not softened (${pl.accepted})`);
// softener config value is read live
await db.exec(`update public.tower_config set gm_soft_mult = 3 where id = 1`); await back(GM, 60); const g3 = await as(GM, `select public.submit_damage(1e12::bigint, 'Staff', 400, 60) r`);
assert(Number(g3.accepted) > Number(g.accepted) * 1.8, 'mult is configurable'); await db.exec(`update public.tower_config set gm_soft_mult = 1.5 where id = 1`);
// a GM clear of a reduced floor works and the next floor is reduced too
await db.exec(`update public.floor_state set hp = 10 where id = 1`); await back(GM, 60); await as(GM, `select public.submit_damage(1e9::bigint, 'Staff', 400, 60) r`);
s = await st(); assert.equal(s.floor, 12); assert(s.mx <= Math.round(await hp(12) * 0.5 * 0.04) + 1, 'floor 12 reduced');
// clients can't read or change the config
assert.match(await err(as(P, `select gm_soft_mult r from public.tower_config`)), /permission denied/); assert.match(await err(as(P, `select public.prelaunch_suggest() r`)), /permission denied/);
// suggestion helper
await db.exec(`insert into public.saves (user_id, data) values ('${GM}', '{"heroes":[{"level":40,"gear":25}]}'), ('${P}', '{"heroes":[{"level":9}]}')`);
const sg = (await q1(`select public.prelaunch_suggest(40) r`)).r; assert(sg.suggested_factor > 0 && sg.suggested_factor <= 1 && sg.gm_level === 40, JSON.stringify(sg));
// after launch: inert (no reduction on new floors; the surge check may raise HP back, never lower it)
await db.exec(`update public.tower_config set prelaunch_until = now() - interval '1 second' where id = 1`);
assert.equal(Number((await q1(`select public.prelaunch_hp_mul(13) m`)).m), 1, 'inert after launch');
await db.exec(`update public.floor_state set floor = 13, hp = public.floor_hp(13), max_hp = public.floor_hp(13) where id = 1`); assert.equal((await st()).mx, Math.round(await hp(13) * 0.5), 'full HP after launch');
await db.exec(rd(ADD)); assert.equal((await st()).mx, Math.round(await hp(13) * 0.5), 're-run after launch changes nothing');
// softener still on after launch
await back(GM, 60); const ga = await as(GM, `select public.submit_damage(1e12::bigint, 'Staff', 400, 60) r`); assert(Number(ga.accepted) <= 1.5 * L.refPlayerDps(13) * 61, 'softener after launch');
// the addendum scales a floor already in progress (pre-launch), once
await db.exec(`update public.tower_config set prelaunch_until = now() + interval '1 day' where id = 1`); await db.exec(rd(ADD)); const s14 = await st();
assert.equal(s14.mx, Math.round(await hp(13) * 0.5 * 0.04), 'current floor scaled'); await db.exec(rd(ADD)); assert.deepEqual(await st(), s14, 'once');
// ---- admin reset
await db.exec(`insert into public.waitlist (email) values ('a@example.invalid'); insert into public.memorials (floor, user_id, name, price) values (11, '${P}', 'Rest', 1);
  insert into public.pets (user_id, sp, rarity, perk_k, perk_v, src) values ('${P}', 'fox', 'rare', 'goldPct', 2, 'egg'); insert into public.shop_global (item, sold) values ('pt-x', 4) on conflict do nothing;`);
const before = await q1(`select (select count(*) from public.profiles)::int a, (select count(*) from auth.users)::int u, (select count(*) from public.waitlist)::int w`);
for (let i = 0; i < 2; i++) await db.exec(rd('admin-reset-tower.sql'));
s = await st(); assert.equal(s.floor, 1); assert.equal(s.hp, s.mx); assert.equal(s.mx, Math.round(await hp(1) * 0.5));
const after = await q1(`select (select count(*) from public.profiles)::int a, (select count(*) from auth.users)::int u, (select count(*) from public.waitlist)::int w`); assert.deepEqual(after, before, 'accounts + waitlist kept');
assert.equal((await q1(`select role from public.profiles where id = $1`, [GM])).role, 'gm', 'GM binding kept');
for (const t of ['damage', 'floor_clears', 'memorials', 'guild_quests', 'guild_quest_contrib']) assert.equal((await q1(`select count(*)::int c from public.${t}`)).c, 0, t);
assert.equal((await q1(`select count(*)::int c from public.saves where user_id = $1`, [P])).c, 0, 'tester save wiped'); assert.equal((await q1(`select count(*)::int c from public.saves where user_id = $1`, [GM])).c, 1, 'staff save kept');
assert.equal((await q1(`select count(*)::int c from public.pets`)).c, 0); assert.equal((await q1(`select coalesce(sum(sold),0)::int c from public.shop_global`)).c, 0);
assert.equal((await q1(`select prelaunch_enabled e from public.tower_config`)).e, false, 'factor disabled'); assert.equal(Number((await q1(`select public.prelaunch_hp_mul(11) m`)).m), 1);
assert.equal((await q1(`select count(*)::int c from public.profiles where last_submit is not null`)).c, 0, 'turnout reset');
console.log('gm softener + prelaunch + reset pglite tests passed');
// ---- reset epoch (schema-addendum-reset-epoch.sql): bumped by the reset, returned by tick, pre-reset uploads dropped, staff exempt
{ const ep = (await q1(`select reset_epoch e, floor(extract(epoch from reset_at) * 1000)::float8 at from public.tower_config`)); assert(ep.e >= 2, 'bumped per run');
  await db.exec(`update public.profiles set last_submit = now() - interval '30 seconds'`);
  const t = await as(P, `select public.tick(1, 'Player', 1, 0, 0) r`); assert.deepEqual(t.ep.map(Number), [ep.e, ep.at], 'tick returns ep');
  await as(P, `insert into public.saves (user_id, data) values ('${P}', '{"heroes":[{"level":30}]}') on conflict (user_id) do update set data = excluded.data returning 1 r`);
  assert.equal((await q1(`select count(*)::int c from public.saves where user_id = $1`, [P])).c, 0, 'pre-reset save upload dropped');
  await as(P, `insert into public.saves (user_id, data) values ('${P}', jsonb_build_object('heroes', '[{"level":1}]'::jsonb, 'createdAt', ${ep.at + 1000})) returning 1 r`);
  assert.equal((await q1(`select count(*)::int c from public.saves where user_id = $1`, [P])).c, 1, 'post-reset hero saved');
  await as(GM, `update public.saves set data = '{"heroes":[{"level":99}]}' where user_id = '${GM}' returning 1 r`);
  assert.equal((await q1(`select data->'heroes'->0->>'level' l from public.saves where user_id = $1`, [GM])).l, '99', 'staff save never dropped');
  assert.match(await err(as(P, `select public.reset_info() r`)), /permission denied/); }
console.log('reset epoch pglite tests passed');

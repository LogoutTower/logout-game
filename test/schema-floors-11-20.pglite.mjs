// Floors 11-20 addendum in PGlite (run twice: idempotent): HP parity with js/floors.js, the cap lift, the pending advance, the clamp.
import assert from 'node:assert'; import fs from 'node:fs';
import { floorBossHp } from '../js/floors.js'; import { gearScale } from '../js/loot.js'; import { heroDps, newHero } from '../js/game.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, floors 11-20 test skipped'); process.exit(0); }
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
await db.exec(rd('schema.sql')); await db.exec(rd('schema-addendum-guilds-chat.sql'));
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`; await db.exec(`insert into auth.users (id, is_anonymous) values ('${U(1)}', false), ('${U(2)}', false)`);
const as = async (uid, q, p) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await db.query(q, p); } finally { await db.exec('reset role'); } };
const st = async () => (await db.query(`select floor, hp::bigint hp, max_hp::bigint max_hp, max_floor from public.floor_state`)).rows[0];
// ---- before the addendum: the live server is capped at 10 (the client shows "opening soon")
await db.exec(`update public.floor_state set floor = 10, max_hp = public.floor_hp(10), hp = 5000`);
await db.exec(`update public.profiles set last_submit = now() - interval '12 hours'`);
await as(U(1), `select public.submit_damage(900000, 'Ash', 60, 20)`); let s = await st(); assert.equal(s.floor, 10); assert.equal(Number(s.hp), 0, 'cleared but capped'); assert.equal(s.max_floor, 10);
// ---- addendum (twice)
await db.exec(rd('schema-addendum-floors-11-20.sql')); await db.exec(rd('schema-addendum-floors-11-20.sql'));
for (let f = 1; f <= 30; f++) assert.equal(Number((await db.query(`select public.floor_hp($1) h`, [f])).rows[0].h), floorBossHp(f), `floor_hp(${f}) parity`);
s = await st(); assert.equal(s.max_floor, 20); assert.equal(s.floor, 11, 'pending clear advanced to floor 11'); assert.equal(Number(s.max_hp), floorBossHp(11));
assert.equal((await db.query(`select count(*)::int c from public.floor_clears where floor = 10`)).rows[0].c, 1, 'floor 10 clear recorded once');
// ---- clamp: an honest Clockspire build is not clipped (gear_scale parity with js/loot.js scale too)
for (const f of [11, 15, 20]) assert(Math.abs((await db.query(`select public.gear_scale($1) g`, [f])).rows[0].g - gearScale(f)) / gearScale(f) < 0.02, `gear_scale ${f}`);
const h = newHero('Ash', 'Blade'); h.level = 30; h.gear = 12; h.equip = { weapon: { slot: 'weapon', stats: { dps: +(1.5 * gearScale(16) * 3.6).toFixed(1), dpsPct: 14 } }, armor: { slot: 'armor', stats: { dpsPct: 30 } } };
const dps = heroDps(h) * 1.25 * 1.3; // + Elixir and last-layer style bonuses
await db.exec(`update public.profiles set last_submit = now() - interval '1 hour'`); const amt = Math.floor(dps * 3600 * 0.99);
const r = (await as(U(2), `select public.submit_damage($1, 'Bell', 30, 12) r`, [amt])).rows[0].r; assert.equal(Number(r.accepted), amt, 'not clipped');
await db.exec(`update public.profiles set last_submit = now() - interval '1 hour'`); const r2 = (await as(U(2), `select public.submit_damage($1, 'Bell', 30, 12) r`, [amt * 100])).rows[0].r; assert(Number(r2.accepted) < amt * 100, 'cheats still clipped');
// ---- the top: floor 20 cleared → stays on 20 with hp 0 (end of content)
await db.exec(`update public.floor_state set floor = 20, max_hp = public.floor_hp(20), hp = 10`); await db.exec(`update public.profiles set last_submit = now() - interval '1 hour'`);
await as(U(1), `select public.submit_damage(100000, 'Ash', 60, 20)`); s = await st(); assert.equal(s.floor, 20); assert.equal(Number(s.hp), 0);
console.log('floors 11-20 pglite ok');

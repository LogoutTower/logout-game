// Arc 1 pacing addendum in PGlite (run twice: idempotent): floor_hp parity with js/floors.js and the live floor keeps its HP %.
import assert from 'node:assert'; import fs from 'node:fs'; import { floorBossHp } from '../js/floors.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, arc 1 pacing test skipped'); process.exit(0); }
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ['schema.sql', 'schema-addendum-guilds-chat.sql', 'schema-addendum-floors-11-20.sql']) await db.exec(rd(n));
await db.exec(`update public.floor_state set floor = 3, max_hp = public.floor_hp(3), hp = public.floor_hp(3) / 2`);
await db.exec(rd('schema-addendum-arc1-pacing.sql')); await db.exec(rd('schema-addendum-arc1-pacing.sql'));
for (let f = 1; f <= 30; f++) assert.equal(Number((await db.query(`select public.floor_hp($1) h`, [f])).rows[0].h), floorBossHp(f), `floor_hp(${f}) parity`);
const s = (await db.query(`select floor, hp::bigint hp, max_hp::bigint max_hp from public.floor_state`)).rows[0];
assert.equal(s.floor, 3); assert.equal(Number(s.max_hp), floorBossHp(3)); assert.equal(Number(s.hp), floorBossHp(3) / 2, 'HP % kept');
console.log('arc 1 pacing pglite ok');

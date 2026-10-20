// Staff GM luck in the Glitch Den (schema-addendum-gm-luck.sql), offline in PGlite with every addendum applied twice. Never the live DB.
import assert from 'node:assert'; import fs from 'node:fs';
import { resolve, denLimits, diceMult } from '../js/casino.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, gm luck test skipped'); process.exit(0); }
const { ADDENDA } = await import('./addenda.mjs'); assert(ADDENDA.indexOf('schema-addendum-gm-luck.sql') > ADDENDA.indexOf('schema-addendum-casino.sql'));
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ADDENDA) await db.exec(rd(n)); for (const n of ADDENDA) await db.exec(rd(n));
await db.exec(`grant all on all tables in schema public to anon, authenticated; grant usage, select on all sequences in schema public to anon, authenticated;`);
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, P = U(1), GM = U(9);
await db.exec(`insert into auth.users (id, is_anonymous) values ('${P}', false), ('${GM}', false); update public.profiles set role = 'gm' where id = '${GM}'`);
const setGold = (u, g) => db.exec(`insert into public.saves (user_id, data) values ('${u}', '{"gold": ${g}}') on conflict (user_id) do update set data = jsonb_set(saves.data, '{gold}', '${g}')`);
const goldOf = async u => Number((await db.query(`select data->>'gold' g from public.saves where user_id = $1`, [u])).rows[0].g);
const as = async (uid, q, p) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return (await db.query(q, p)).rows[0]?.r; } finally { await db.exec('reset role'); } };
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const noCd = u => db.exec(`update public.casino_days set last_at = null where user_id = '${u}'`);
const play = (u, g, bet, pick = 0) => as(u, `select public.casino_play($1, $2, $3) r`, [g, bet, pick]);
assert.match(await err(as(P, `select public.casino_is_gm('${GM}') r`)), /permission denied/, 'helpers are internal');
// ---- limits: GM 10x max, no daily limit; player exactly as before
await setGold(P, 1e9); await setGold(GM, 1e12);
const sp = await as(P, `select public.casino_state() r`), sg = await as(GM, `select public.casino_state() r`);
assert.deepEqual({ min: +sp.min, max: +sp.max, lim: +sp.lim, cd: +sp.cd }, denLimits(1)); assert(!('gm' in sp));
assert.equal(+sg.max, 20000); assert(!('lim' in sg)); assert.equal(sg.gm, true);
await db.exec(`insert into public.casino_days (user_id, day, wagered) values ('${GM}', (now() at time zone 'utc')::date, 1e9), ('${P}', (now() at time zone 'utc')::date, 99950)`);
assert.ok(await play(GM, 'flip', 20000, 0), 'GM: no daily wager limit'); await noCd(GM);
assert.match(await err(play(GM, 'flip', 20001, 0)), /max bet/); assert.match(await err(play(GM, 'flip', 5, 0)), /minimum bet/);
await play(GM, 'flip', 10, 0); assert.match(await err(play(GM, 'flip', 10, 0)), /still spinning/, 'GM cooldown kept');
assert.match(await err(play(P, 'flip', 100, 0)), /daily wager limit/, 'player limit unchanged'); assert.match(await err(play(P, 'flip', 2001, 0)), /max bet/);
// ---- odds: GM ~+5% player edge; player exact current maths (payouts match the player rules)
await db.exec(`update public.casino_days set wagered = 0`);
const run = async (u, g, pick, n, gm) => { let bet = 0, back = 0, wins = 0; for (let i = 0; i < n; i++) { await noCd(u); if (!gm) await db.exec(`update public.casino_days set wagered = 0 where user_id = '${u}'`);
  const r = await play(u, g, 100, pick); bet += 100; back += +r.p; wins += r.w ? 1 : 0; assert.equal(resolve(g, 100, pick, r.r, gm).p, +r.p, `${g} gm=${gm} payout parity`); } return { rtp: back / bet, wr: wins / n }; };
let o = await run(GM, 'flip', 1, 3000, true); assert(Math.abs(o.wr - 0.525) < 0.03, `gm flip ${o.wr}`); assert(o.rtp > 1, `gm flip rtp ${o.rtp}`);
o = await run(GM, 'dice', 50, 2000, true); assert(Math.abs(o.wr - 0.5) < 0.035); assert(Math.abs(o.rtp - 1.05) < 0.08, `gm dice rtp ${o.rtp}`);
o = await run(GM, 'wheel', 0, 5000, true); assert(Math.abs(o.rtp - 1.047) < 0.12, `gm wheel rtp ${o.rtp}`);
o = await run(P, 'flip', 1, 2000, false); assert(Math.abs(o.wr - 0.5) < 0.035, `player flip ${o.wr}`);
o = await run(P, 'dice', 50, 1000, false); o = await run(P, 'wheel', 0, 2000, false);
assert.equal(diceMult(50), 1.92); assert.equal(diceMult(50, true), 2.1);
// ---- GM gold still can't go negative
await setGold(GM, 100); await noCd(GM); assert.match(await err(play(GM, 'flip', 200, 0)), /not enough gold/);
for (let i = 0; i < 200; i++) { await noCd(GM); const g = await goldOf(GM); if (g < 10) break; const r = await play(GM, 'wheel', g, 0); assert(+r.gold >= 0 && +r.gold === await goldOf(GM)); }
console.log('gm luck pglite: GM edge, no daily limit, 10x max; players unchanged: ok');

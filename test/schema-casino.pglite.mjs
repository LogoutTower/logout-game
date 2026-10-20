// The Glitch Den (schema-addendum-casino.sql), offline in PGlite with every addendum applied twice. Never the live DB.
import assert from 'node:assert'; import fs from 'node:fs';
import { FLIP_MULT, WHEEL, denLimits, diceMult, resolve } from '../js/casino.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, casino test skipped'); process.exit(0); }
const { ADDENDA } = await import('./addenda.mjs'); assert(ADDENDA.includes('schema-addendum-casino.sql'));
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ADDENDA) await db.exec(rd(n)); for (const n of ADDENDA) await db.exec(rd(n));
await db.exec(`grant all on all tables in schema public to anon, authenticated; grant usage, select on all sequences in schema public to anon, authenticated;`);
const sql = rd('schema-addendum-casino.sql').replace(/--.*$/gm, '');
assert(!/token|wallet|mint|solana|creator|submit_damage|floor_clears|ranking/i.test(sql), 'gold only: no token, wallet or damage/ranking writes');
assert(!/tick\s*\(/i.test(sql), 'nothing rides in tick()');
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, A = U(1), B = U(2), GM = U(9);
await db.exec(`insert into auth.users (id, is_anonymous) values ('${A}', false), ('${B}', false), ('${GM}', false); update public.profiles set role = 'gm' where id = '${GM}'`);
const setGold = (u, g) => db.exec(`insert into public.saves (user_id, data) values ('${u}', '{"gold": ${g}, "heroes": [{"name": "Old"}]}') on conflict (user_id) do update set data = jsonb_set(saves.data, '{gold}', '${g}')`);
const goldOf = async u => Number((await db.query(`select data->>'gold' g from public.saves where user_id = $1`, [u])).rows[0].g);
const as = async (uid, q, p) => { await db.exec(`set role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`); try { return (await db.query(q, p)).rows[0]?.r; } finally { await db.exec('reset role'); } };
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const noCd = u => db.exec(`update public.casino_days set last_at = null where user_id = '${u}'`);
const play = (u, g, bet, pick = 0) => as(u, `select public.casino_play($1, $2, $3) r`, [g, bet, pick]);
// ---- parity with js/casino.js
for (const f of [1, 5, 11, 20]) { const l = (await db.query(`select public.casino_limits($1) r`, [f])).rows[0].r; const j = denLimits(f); assert.deepEqual({ min: +l.min, max: +l.max, lim: +l.lim, cd: +l.cd }, j, `limits floor ${f}`); }
assert.deepEqual((await db.query(`select w, m::float8 m from public.casino_wheel() order by i`)).rows, WHEEL.map(s => ({ w: s.w, m: s.m })));
for (const c of [5, 33, 50, 95]) assert.equal(Number((await db.query(`select public.casino_dice_mult($1) m`, [c])).rows[0].m), diceMult(c));
// ---- access: anon can't call; state before play
assert.match(await err(as(null, `select public.casino_play('flip', 10, 0) r`)), /permission denied/);
await setGold(A, 1e9); let st = await as(A, `select public.casino_state() r`); assert.equal(+st.max, 2000); assert.equal(+st.used, 0);
// ---- odds over many rolls (cooldown cleared between spins in the test only)
await db.exec(`update public.casino_days set wagered = 0`);
const rtp = async (g, pick, n) => { let bet = 0, back = 0, wins = 0; for (let i = 0; i < n; i++) { await noCd(A); await db.exec(`update public.casino_days set wagered = 0 where user_id = '${A}'`);
  const r = await play(A, g, 100, pick); bet += 100; back += +r.p; wins += r.w ? 1 : 0; const j = resolve(g, 100, pick, r.r); assert.equal(j.p, +r.p, `${g} payout matches the client maths`); } return { rtp: back / bet, wr: wins / n }; };
const g0 = await goldOf(A);
let o = await rtp('flip', 1, 3000); assert(Math.abs(o.wr - 0.5) < 0.035, `flip win rate ${o.wr}`); assert(Math.abs(o.rtp - 0.97) < 0.07, `flip rtp ${o.rtp}`);
o = await rtp('dice', 75, 3000); assert(Math.abs(o.wr - 0.25) < 0.03, `dice over 75 win rate ${o.wr}`); assert(Math.abs(o.rtp - 0.96) < 0.12, `dice rtp ${o.rtp}`);
o = await rtp('dice', -21, 1500); assert(Math.abs(o.wr - 0.20) < 0.035, `dice under 21 win rate ${o.wr}`);
o = await rtp('wheel', 0, 6000); assert(Math.abs(o.wr - 0.764) < 0.03, `wheel hit rate ${o.wr}`); assert(Math.abs(o.rtp - 0.95) < 0.12, `wheel rtp ${o.rtp}`);
const after = await goldOf(A); console.log('gold drained by 13.5k test spins:', g0 - after);
// ---- limits
await noCd(A); assert.match(await err(play(A, 'flip', 5, 0)), /minimum bet/);
assert.match(await err(play(A, 'flip', 2001, 0)), /max bet/);
assert.match(await err(play(A, 'flip', 100, 2)), /heads or tails/);
assert.match(await err(play(A, 'dice', 100, 97)), /5-95/); assert.match(await err(play(A, 'dice', 100, -3)), /5-95/); assert.match(await err(play(A, 'dice', 100, 0)), /5-95/);
assert.match(await err(play(A, 'roulette', 100, 0)), /unknown game/);
await play(A, 'flip', 100, 0); assert.match(await err(play(A, 'flip', 100, 0)), /still spinning/, 'cooldown');
await db.exec(`update public.casino_days set wagered = 99000, last_at = null where user_id = '${A}'`);
await play(A, 'flip', 1000, 0); await noCd(A); assert.match(await err(play(A, 'flip', 10, 0)), /daily wager limit/);
st = await as(A, `select public.casino_state() r`); assert.equal(+st.used, 100000);
await db.exec(`update public.casino_days set day = day - 1 where user_id = '${A}'`); await play(A, 'flip', 10, 0); // a new UTC day resets the wager
await db.exec(`update public.floor_state set floor = 11 where id = 1`); st = await as(A, `select public.casino_state() r`); assert(+st.max > 2000, 'max bet scales with floor'); await db.exec(`update public.floor_state set floor = 1 where id = 1`);
// ---- gold never negative
await setGold(B, 150); let n = 0;
while (n++ < 400) { await noCd(B); const g = await goldOf(B); if (g < 10) break; const r = await play(B, 'wheel', Math.min(g, 2000), 0).catch(e => { throw e; }); assert(+r.gold >= 0 && +r.gold === await goldOf(B)); }
await noCd(B); const gb = await goldOf(B); assert(gb >= 0); assert.match(await err(play(B, 'flip', gb + 10, 0)), /not enough gold|minimum/);
await db.exec(`delete from public.saves where user_id = '${B}'`); await noCd(B); assert.match(await err(play(B, 'flip', 10, 0)), /not enough gold/, 'no save, no bet');
// ---- winnings touch nothing public; GM plays privately
const dmg0 = (await db.query(`select floor, hp from public.floor_state where id = 1`)).rows[0];
await setGold(GM, 1e6); await play(GM, 'wheel', 500, 0);
assert.deepEqual((await db.query(`select floor, hp from public.floor_state where id = 1`)).rows[0], dmg0, 'boss HP untouched');
const snap = JSON.stringify((await db.query(`select public.snapshot() r`)).rows[0].r); assert(!/casino|den/i.test(snap), 'nothing in the snapshot');
assert.equal((await as(B, `select count(*)::int r from public.casino_days`)), 0, 'RLS hides everyone else\'s den stats');
console.log('casino pglite: odds, limits, no negative gold, nothing public: ok', { edge: { flip: 1 - FLIP_MULT / 2 } });

// Launch-day rehearsal, entirely local: PGlite stands in for Supabase with every addendum applied in order. Time is mocked by
// back-dating server timestamps (last_submit, created_at, turnout_checked_at) by one step before each round, so the real
// RPCs (submit_damage clamp, turnout trigger, chat gate) see the elapsed time. Never touches the live DB.
// Usage: node test/rehearsal.pglite.mjs [heroes=100] [hours=20]   (REHEARSAL_JSON=path writes the results)
import assert from 'node:assert'; import fs from 'node:fs';
import { floorBossHp } from '../js/floors.js'; import { clearedArcs } from '../js/cutscenes.js';
import { newHero, heroDps, xpToNext, levelCost, gearCost, computeProgress } from '../js/game.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, rehearsal skipped'); process.exit(0); }
const N = +(process.argv[2] || 100), HOURS = +(process.argv[3] || 20), STEP = 1800; // 30-minute rounds
export const ADDENDA = ['schema.sql', 'schema-addendum-guilds-chat.sql', 'schema-addendum-guilds-v2.sql', 'schema-addendum-staff-guild.sql', 'schema-addendum-floor-zero.sql',
  'schema-addendum-floors-11-20.sql', 'schema-addendum-arc1-pacing.sql', 'schema-addendum-turnout-scaling.sql', 'waitlist.sql', 'waitlist-count.sql', 'schema-addendum-open-chat.sql', 'schema-addendum-egress.sql'];
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ADDENDA) await db.exec(rd(n)); for (const n of ADDENDA) await db.exec(rd(n)); // twice: every addendum is idempotent
await db.exec(`grant all on all tables in schema public to anon, authenticated; grant usage, select on all sequences in schema public to anon, authenticated;`); // Supabase's default grants; RLS decides
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const stats = { calls: 0, errors: 0, byFn: {}, errByMsg: {}, bytes: {} };
const as = async (uid, q, p, fn) => { stats.calls++; stats.byFn[fn] = (stats.byFn[fn] || 0) + 1;
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { const r = await db.query(q, p); stats.bytes[fn] = JSON.stringify(r.rows).length; return r.rows; }
  catch (e) { stats.errors++; const k = `${fn}: ${e.message.slice(0, 60)}`; stats.errByMsg[k] = (stats.errByMsg[k] || 0) + 1; return null; } finally { await db.exec('reset role'); } };
const shift = s => db.exec(`update public.profiles set last_submit = last_submit - interval '${s} seconds', created_at = created_at - interval '${s} seconds',
  last_chat = last_chat - interval '${s} seconds', last_gchat = last_gchat - interval '${s} seconds', chat_win_start = chat_win_start - interval '${s} seconds';
  update public.floor_state set turnout_checked_at = turnout_checked_at - interval '${s} seconds';
  update public.chat_messages set at = at - interval '${s} seconds'; update public.floor_clears set at = at - interval '${s} seconds'`);
const st = async () => (await db.query(`select floor, hp::bigint hp, max_hp::bigint max_hp from public.floor_state`)).rows[0];
// Hero model (same as docs/BALANCE-FLOORS-11-20.md): fresh Lv 1, spends gold greedily, loot ×1.25, efficiency 0.7, realism 0.6.
const heroes = []; const EFF = 0.7 * 1.25 * 0.6;
const grow = h => { const d = heroDps(h.h) * EFF * STEP; h.gold += d * 0.1 / 0.6; h.xp += d * 0.05 / 0.6;
  while (h.xp >= xpToNext(h.h.level)) { h.xp -= xpToNext(h.h.level); h.h.level++; }
  for (;;) { const lc = levelCost(h.h), gc = gearCost(h.h); if (Math.min(lc, gc) > h.gold) break; if (lc <= gc) { h.gold -= lc; h.h.level++; } else { h.gold -= gc; h.h.gear++; } } return Math.floor(d); };
// waitlist signups before launch (the landing page counter)
for (let i = 0; i < 40; i++) await as(null, `select public.join_waitlist($1)`, [`p${i}@example.test`], 'join_waitlist');
const wl = await as(null, `select public.waitlist_count() c`, [], 'waitlist_count');
// ---- launch: the gate opened at LAUNCH_AT (t = 0). Heroes arrive over the first 3 h.
const clears = [], turnout = [], arcEvents = []; let lastFloor = 1, t = 0, surge = null;
for (let step = 0; t < HOURS * 3600; step++, t += STEP) {
  const arrive = Math.min(N, Math.round(N * Math.min(1, (t + STEP) / (3 * 3600))));
  while (heroes.length < arrive) { const i = heroes.length + 1, uid = U(i); await db.exec(`insert into auth.users (id, is_anonymous) values ('${uid}', ${i % 4 !== 0})`); // 1 in 4 binds an identity
    heroes.push({ uid, name: `Hero${i}`, h: newHero(`Hero${i}`, ['Blade', 'Vanguard', 'Arcanist'][i % 3]), gold: 0, xp: 0, joined: t }); }
  await shift(STEP);
  for (const h of heroes) { const dmg = grow(h); const r = await as(h.uid, `select public.tick($1, $2, $3, $4, $5) r`, [dmg, h.name, h.h.level, h.h.gear, h.seen || 0], 'tick'); // the client's one call per flush
    if (r) { const s = r[0].r; for (const c of s.cl || []) h.seen = Math.max(h.seen || 0, c[0]); const row = await st(); assert.equal(Number(s.mx), Number(row.max_hp), 'tick returns the stored (scaled) max_hp'); } }
  // social: guilds early, chat each round, reads
  if (step === 1 || step === 4) for (const h of heroes) { if (h.g) continue; const k = +h.name.slice(4);
    if (k % 25 === 1) { h.g = await as(h.uid, `select public.guild_create($1, $2) r`, [`Guild ${k}`, `G${k}`], 'guild_create'); h.tag = `G${k}`; }
    else { const tag = `G${Math.floor((k - 1) / 25) * 25 + 1}`; h.g = await as(h.uid, `select public.guild_join($1) r`, [tag], 'guild_join'); } }
  let posted = 0; for (const h of heroes.slice(0, Math.ceil(heroes.length / 5))) { if (++posted % 5 === 0) await db.exec(`update public.chat_messages set at = at - interval '${Math.floor(5 * STEP / Math.ceil(heroes.length / 5))} seconds'`); // spread the round's posts over its 30 minutes
    await as(h.uid, `select public.chat_post($1, $2)`, [h.name, `round ${step} go go`], 'chat_post');
    if (h.g) await as(h.uid, `select public.guild_chat_post($1, $2)`, [h.name, `guild round ${step}`], 'guild_chat_post'); }
  for (const h of heroes.slice(0, 10)) { await as(h.uid, `select name, damage, is_staff from public.damage where floor = $1 order by damage desc limit 25`, [(await st()).floor], 'leaderboard');
    await as(h.uid, `select public.my_clears(0, $1) r`, [h.name], 'my_clears'); await as(h.uid, `select public.guild_tags($1) r`, [(await st()).floor], 'guild_tags');
    await as(h.uid, `select id, floor, author, name, guild_tag, is_staff, body, at from public.chat_messages where floor = $1 order by id desc limit 50`, [(await st()).floor], 'chat_fetch'); }
  const s = await st(); if (s.floor !== lastFloor) { for (let f = lastFloor; f < s.floor; f++) clears.push({ floor: f, h: +((t + STEP) / 3600).toFixed(1) });
    turnout.push({ floor: s.floor, active: heroes.length, maxHp: Number(s.max_hp), mul: +(Number(s.max_hp) / floorBossHp(s.floor)).toFixed(2) });
    const arcs = clearedArcs(s, 20); if (arcs.length) arcEvents.push({ h: +((t + STEP) / 3600).toFixed(1), arcs }); lastFloor = s.floor; }
  if (s.floor >= 11) break;
}
// ---- hourly surge check: double the active heroes mid-floor and pass an hour
{ const before = await st(); for (let i = 0; i < N; i++) { const uid = U(50000 + i); await db.exec(`insert into auth.users (id) values ('${uid}'); update public.profiles set last_submit = now() where id = '${uid}'`); }
  await db.exec(`update public.floor_state set turnout_checked_at = now() - interval '61 minutes'`); await as(heroes[0].uid, `select public.submit_damage(1, 'Hero1', 1, 0)`, [], 'submit_damage');
  const after = await st(); surge = { activeBefore: N, activeAfter: 2 * N + 0, maxBefore: Number(before.max_hp), maxAfter: Number(after.max_hp), fracBefore: +(before.hp / before.max_hp).toFixed(4), fracAfter: +(after.hp / after.max_hp).toFixed(4) };
  assert(surge.maxAfter > surge.maxBefore, 'surge raises max_hp'); assert(Math.abs(surge.fracAfter - surge.fracBefore) < 0.01, 'surge keeps the HP fraction'); }
// ---- offline progress: a 15 h absence is capped at 12 h and the server accepts a 12 h batch from that hero
{ const h = heroes[1]; const p = computeProgress([h.h], 0, 15 * 3600e3, 12); assert.equal(p.secs, 12 * 3600); assert(p.capped);
  await db.exec(`update public.profiles set last_submit = now() - interval '15 hours' where id = '${h.uid}'`);
  const r = await as(h.uid, `select public.submit_damage($1, $2, $3, $4) r`, [p.damage, h.name, h.h.level, h.h.gear], 'submit_damage'); assert.equal(Number(r[0].r.accepted), p.damage, 'offline batch accepted in full'); }
// ---- chat gate checks
{ const g = U(90001); await db.exec(`insert into auth.users (id) values ('${g}')`);
  assert.equal(await as(g, `select public.chat_post('Newbie', 'hello')`, [], 'chat_gate_probe'), null, 'brand-new guest cannot post yet');
  await db.exec(`update public.profiles set created_at = now() - interval '10 minutes', last_submit = now() where id = '${g}'`);
  for (let i = 0; i < 45; i++) await db.exec(`insert into public.chat_messages (floor, author, name, body) select floor, 'x', 'Spam', 'flood' from public.floor_state`);
  assert.equal(await as(g, `select public.chat_post('Newbie', 'hello')`, [], 'chat_gate_probe'), null, 'flood guard: guests wait while the floor is flooding');
  await db.exec(`update public.chat_messages set at = at - interval '5 minutes'`); // quiet floor
  await db.exec(`update public.profiles set created_at = now() - interval '10 minutes', last_submit = now() where id = '${g}'`);
  assert(await as(g, `select public.chat_post('Newbie', 'hello')`, [], 'chat_gate_probe'), 'guest who played may post');
  await db.exec(`update public.profiles set last_chat = now() - interval '11 seconds' where id = '${g}'`); assert.equal(await as(g, `select public.chat_post('Newbie', 'hello')`, [], 'chat_gate_probe'), null, 'duplicate refused');
  assert.equal(await as(g, `select public.chat_post('Newbie', 'see https://evil.example')`, [], 'chat_gate_probe'), null, 'links refused');
  const x = await as(g, `select public.chat_post('Newbie', '<img src=x onerror=alert(1)> hi') r`, [], 'chat_gate_probe'); assert(x, 'markup is stored as text (the client escapes it)');
  await db.exec(`update public.profiles set last_chat = null, chat_win_n = 30 where id = '${g}'`); assert.equal(await as(g, `select public.chat_post('Newbie', 'again')`, [], 'chat_gate_probe'), null, 'hourly cap');
  assert.equal(await as(g, `select public.guild_chat_post('Newbie', 'x')`, [], 'chat_gate_probe'), null, 'guild chat: members only');
  const leak = (await db.query(`select to_jsonb(m)::text j from public.chat_messages m`)).rows.map(r => r.j).join('');
  assert(!/00000000-0000|@example/.test(leak), 'no user ids or emails in chat rows'); }
// ---- egress addendum: snapshot (public, anon) and the pace estimate
{ const sn = (await as(null, `select public.snapshot() r`, [], 'snapshot'))[0].r; assert.equal(sn.f, (await st()).floor); assert(sn.lb.length <= 25 && sn.h.length >= 10);
  assert(!/00000000-0000|@example/.test(JSON.stringify(sn)), 'snapshot carries no ids or emails');
  await db.exec(`insert into public.egress_stats (day, calls, bytes) values (current_date - 1, 1000, 160000000) on conflict (day) do update set bytes = 160000000`);
  const eg = (await as(null, `select public.egress_estimate() r`, [], 'egress_estimate'))[0].r; assert.equal(eg.warn, true, '160 MB/day of tick → pace over 80% of 5 GB');
  assert.equal((await as(null, `select public.tick(1, 'x', 1, 0, 0)`, [], 'tick_anon_probe')), null, 'anon cannot tick'); stats.errors--; }
const fin = await st(); const probe = Object.entries(stats.errByMsg).filter(([k]) => k.startsWith('chat_gate_probe')).reduce((s, [, v]) => s + v, 0);
const out = { heroes: N, clears, turnout, arcEvents, surge, waitlist: wl?.[0]?.c, final: fin, calls: stats.calls, errors: stats.errors - probe, expectedProbeErrors: probe,
  errorRate: +((stats.errors - probe) / stats.calls * 100).toFixed(2), errByMsg: stats.errByMsg, bytes: stats.bytes };
if (process.env.REHEARSAL_JSON) fs.writeFileSync(process.env.REHEARSAL_JSON, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ heroes: N, floor10At: clears.find(c => c.floor === 10)?.h, clears: clears.map(c => `${c.floor}@${c.h}h`).join(' '), errorRate: out.errorRate, errByMsg: out.errByMsg, arcEvents, surge }));
assert(fin.floor >= 11 || HOURS < 18, 'reached floor 11'); assert(out.errorRate < 1, 'RPC error rate under 1%');
console.log('rehearsal ok');

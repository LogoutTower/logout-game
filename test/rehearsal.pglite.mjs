// Launch-day rehearsal, entirely local: PGlite stands in for Supabase with every addendum applied in order. Time is mocked by
// back-dating server timestamps (last_submit, created_at, turnout_checked_at) by one step before each round, so the real
// RPCs (submit_damage clamp, turnout trigger, chat gate) see the elapsed time. Never touches the live DB.
// Usage: node test/rehearsal.pglite.mjs [heroes=100] [hours=20]   (REHEARSAL_JSON=path writes the results)
import assert from 'node:assert'; import fs from 'node:fs';
import { floorBossHp } from '../js/floors.js'; import { clearedArcs } from '../js/cutscenes.js';
import { newHero, heroDps, xpToNext, levelCost, gearCost, computeProgress, levelCap, forgeCap, applyXp } from '../js/game.js';
import { TONICS, tonicPrice } from '../js/sinks.js'; import { SHOP, memorialPrice } from '../js/prestige.js'; import { dailyGold } from '../js/daily.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, rehearsal skipped'); process.exit(0); }
const N = +(process.argv[2] || 100), HOURS = +(process.argv[3] || 20), STEP = 1800; // 30-minute rounds
import { ADDENDA } from './addenda.mjs'; export { ADDENDA };
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
let shifted = 0; const shift = async s => { shifted += s; if (Math.floor(shifted / 86400) > Math.floor((shifted - s) / 86400)) await db.exec(`update public.daily_claims set last_day = last_day - 1`); /* a UTC day passed */ return db.exec(`update public.profiles set last_submit = last_submit - interval '${s} seconds', created_at = created_at - interval '${s} seconds',
  last_chat = last_chat - interval '${s} seconds', last_gchat = last_gchat - interval '${s} seconds', chat_win_start = chat_win_start - interval '${s} seconds';
  update public.floor_state set turnout_checked_at = turnout_checked_at - interval '${s} seconds';
  update public.chat_messages set at = at - interval '${s} seconds'; update public.floor_clears set at = at - interval '${s} seconds'`); };
const st = async () => (await db.query(`select floor, hp::bigint hp, max_hp::bigint max_hp from public.floor_state`)).rows[0];
// Hero model (same as docs/BALANCE-FLOORS-11-20.md): fresh Lv 1, spends gold greedily, loot ×1.25, efficiency 0.7, realism 0.6.
const heroes = []; const EFF = 0.7 * 1.25 * 0.6;
const sinks = { tonic: 0, spent: 0 }, daily = { claims: 0, maxDay: 0, gold: 0 };
const grow = (h, cap, f) => { const ins = h.ins > 0 ? 1.1 : 1, pk = h.perk || {}; h.ins = Math.max(0, (h.ins || 0) - STEP); const d = heroDps(h.h) * EFF * STEP * (1 + (pk.dpsPct || 0) / 100); h.gold += d * 0.1 / 0.6 * (1 + (pk.goldPct || 0) / 100); applyXp([h.h], Math.floor(d * 0.05 / 0.6 * ins * (1 + (pk.xpPct || 0) / 100)), cap); // pet perks (best owned pet) // level cap: floor + 10
  const fc = forgeCap(f); // forge cap: floor + 8. Spare gold at both caps buys a Tonic of Insight (a gold sink with no combat power)
  for (;;) { const lc = h.h.level < cap ? levelCost(h.h) : Infinity, gc = h.h.gear < fc ? gearCost(h.h) : Infinity; const tp = tonicPrice(TONICS[0], f);
    if (lc === Infinity && gc === Infinity && h.gold >= tp && !(h.ins > 0)) { h.gold -= tp; h.ins = 1800; sinks.tonic++; sinks.spent += tp; continue; } if (Math.min(lc, gc) > h.gold) { h.next = Math.min(lc, gc); break; } if (lc <= gc) { h.gold -= lc; h.h.level++; } else { h.gold -= gc; h.h.gear++; } } h.atCaps = h.h.level >= cap && h.h.gear >= fc; if (h.atCaps) h.next = 0; return Math.floor(d); };
// Late-game shop (server RPCs, gold from the saved game): one purchase per hero per round. Collectors (COLLECTORS share, default 25%) spend
// anything above two tonics; everyone else only gold beyond twice their next level/forge step.
const shop = { spent: 0, n: 0, byKind: {}, pets: 0, refused: 0 }; const WANT = ['tok-reroll', 'mem', 'egg-arc1', 'tr-arc1', 'egg-arc2', 'pt-patron', 'sk-stonekeep', 'tr-arc2', 'tok-rename', 'pt-benefactor', 'sk-clockfrost', 'pt-lantern'];
const COLLECT = +(process.env.COLLECTORS ?? 0.25); // share of heroes who buy cosmetics before their next forge step (the rest only buy from true surplus)
const shopRound = async (h, f) => { const collector = (+h.name.slice(4) % 100) < COLLECT * 100, keep = Math.max(2 * tonicPrice(TONICS[0], f), collector ? 0 : 2 * (h.next === Infinity ? 0 : h.next || 0)); h.bought ||= {}; h.carved ||= {};
  for (const w of WANT) { const it = SHOP.find(i => i.id === w), mf = f - 1, price = w === 'mem' ? memorialPrice(mf) : it.price; if (w === 'mem' ? (mf < 1 || h.carved[mf]) : (it.kind === 'egg' ? (h.bought[w] || 0) >= 3 : it.kind !== 'token' && h.bought[w]) || (it.kind === 'token' && h.bought[w] >= 1)) continue;
    if (w !== 'mem' && (it.kind === 'trophy' ? f <= it.arc * 10 : f < (it.arc - 1) * 10 + 1)) continue; if (h.gold - keep < price * (it?.step ? 1.6 : 1)) return; // a prestige price may have climbed
    await db.exec(`insert into public.saves (user_id, data) values ('${h.uid}', jsonb_build_object('gold', ${Math.floor(h.gold)})) on conflict (user_id) do update set data = jsonb_set(saves.data, '{gold}', to_jsonb(${Math.floor(h.gold)}::bigint))`);
    const r = w === 'mem' ? await as(h.uid, `select public.memorial_carve($1, $2) r`, [mf, h.name], 'memorial_carve') : await as(h.uid, `select public.shop_buy($1) r`, [w], 'shop_buy'); if (!r) { shop.refused++; return; }
    const g = Number(r[0].r.gold), paid = Math.floor(h.gold) - g; h.gold = g; shop.spent += paid; shop.n++; const k = w === 'mem' ? 'memorial' : it.kind; shop.byKind[k] = (shop.byKind[k] || 0) + paid; if (w === 'mem') h.carved[mf] = 1; else h.bought[w] = (h.bought[w] || 0) + 1; if (r[0].r.pet) shop.pets++; return; } };
const perkRound = async () => { const rows = (await db.query(`select user_id, perk_k, max(perk_v)::float8 v from public.pets group by 1, 2`)).rows, best = {}; // one active pet: the hero follows its best gold/XP/DPS pet
  for (const r of rows) { const sc = r.perk_k === 'goldPct' || r.perk_k === 'xpPct' ? r.v : r.perk_k === 'dpsPct' ? r.v * 2 : 0; if (sc > (best[r.user_id]?.sc || 0)) best[r.user_id] = { sc, [r.perk_k]: r.v }; }
  for (const h of heroes) h.perk = best[h.uid] || null; };
// waitlist signups before launch (the landing page counter)
for (let i = 0; i < 40; i++) await as(null, `select public.join_waitlist($1)`, [`p${i}@example.test`], 'join_waitlist');
const wl = await as(null, `select public.waitlist_count() c`, [], 'waitlist_count');
// ---- launch: the gate opened at LAUNCH_AT (t = 0). Heroes arrive over the first 3 h.
const clears = [], turnout = [], arcEvents = []; let lastFloor = 1, t = 0, surge = null;
for (let step = 0; t < HOURS * 3600; step++, t += STEP) {
  const arrive = Math.min(N, Math.round(N * Math.min(1, (t + STEP) / (3 * 3600))));
  while (heroes.length < arrive) { const i = heroes.length + 1, uid = U(i); await db.exec(`insert into auth.users (id, is_anonymous) values ('${uid}', ${i % 4 !== 0})`); // 1 in 4 binds an identity
    heroes.push({ uid, name: `Hero${i}`, h: newHero(`Hero${i}`, ['Blade', 'Vanguard', 'Arcanist'][i % 3]), gold: 0, joined: t }); }
  await shift(STEP);
  const fNow = (await st()).floor, cap = levelCap(fNow); for (const h of heroes) { const dmg = grow(h, cap, fNow); const r = await as(h.uid, `select public.tick($1, $2, $3, $4, $5) r`, [dmg, h.name, h.h.level, h.h.gear, h.seen || 0], 'tick'); // the client's one call per flush
    if (r) { const s = r[0].r; if (s.dl) { daily.claims++; daily.maxDay = Math.max(daily.maxDay, s.dl.d); const g = dailyGold(s.dl.d, fNow); h.gold += g; daily.gold += g; } for (const c of s.cl || []) h.seen = Math.max(h.seen || 0, c[0]); const row = await st(); assert.equal(Number(s.mx), Number(row.max_hp), 'tick returns the stored (scaled) max_hp'); } }
  for (const h of heroes) await shopRound(h, fNow); await perkRound();
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
  if (s.floor >= (+process.env.UNTIL_FLOOR || 11) || (s.floor === 20 && Number(s.hp) === 0)) { if (s.floor === 20) clears.push({ floor: 20, h: +((t + STEP) / 3600).toFixed(1) }); break; }
}
// ---- hourly surge check: double the active heroes mid-floor and pass an hour
if (Number((await st()).hp) === 0) await db.exec(`update public.floor_state set hp = max_hp / 2`); // top floor already cleared: reopen half for the surge probe
console.error('clears', JSON.stringify(clears));
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
// ---- level cap: a client claiming Lv 500 on a low floor gets the floor + 5 clamp; staff is exempt
{ const fl = (await st()).floor, lim = async (uid, lv) => { await db.exec(`update public.profiles set last_submit = now() - interval '60 seconds' where id = '${uid}'`); return Number((await as(uid, `select public.submit_damage(1e15::bigint, 'Cap', $1, 0) r`, [lv], 'cap_probe'))[0].r.accepted); };
  const p = heroes[2].uid, capped = await lim(p, levelCap(fl)), cheat = await lim(p, 500); const near = (a, b) => Math.abs(a - b) <= 0.01 * b; assert(near(cheat, capped), `claimed level above the cap adds nothing (${cheat} vs ${capped} at floor ${fl})`); // ±1%: sub-second clock jitter
  const limG = async (uid, g) => { await db.exec(`update public.profiles set last_submit = now() - interval '60 seconds' where id = '${uid}'`); return Number((await as(uid, `select public.submit_damage(1e15::bigint, 'Cap', 1, $1) r`, [g], 'cap_probe'))[0].r.accepted); };
  assert(near(await limG(p, 200), await limG(p, forgeCap(fl))), 'claimed forge tier above the cap adds nothing');
  await db.exec(`update public.profiles set role = 'gm' where id = '${p}'`); assert(await lim(p, 500) > 1.5 * capped, 'staff is never capped');
  assert.equal((await db.query(`select is_staff from public.damage where user_id = $1 and floor = $2`, [p, fl])).rows[0].is_staff, true, 'staff damage counts toward the boss, flagged staff');
  const sn = (await db.query(`select public.snapshot() r`)).rows[0].r; assert(sn.lb.some(r => r[0] === 'Cap' && r[2] === true), 'staff shown on the board with the staff flag');
  const rk = (await db.query(`select bool_or(name = 'Cap') x from public.floor_clears, unnest(ranking) name`)).rows[0].x; assert(!rk, 'staff never in a clear ranking'); await db.exec(`update public.profiles set role = 'player' where id = '${p}'`); }
// ---- daily streak rules (server clock): once a day, one streak save per month, second miss resets
{ const u = heroes[3].uid, set = (last, st, sm) => db.exec(`update public.daily_claims set last_day = ${last}, streak = ${st}, save_month = ${sm} where user_id = '${u}'`);
  const claim = async () => (await db.query(`select public.daily_claim($1) r`, [u])).rows[0].r; const today = `(now() at time zone 'utc')::date`, month = `date_trunc('month', (now() at time zone 'utc'))::date`;
  await set(`${today} - 1`, 3, 'null'); assert.equal((await claim()).d, 4); assert.equal(await claim(), null, 'once per UTC day');
  await set(`${today} - 2`, 4, 'null'); let c = await claim(); assert.equal(c.d, 5); assert.equal(c.sv, true, 'first miss this month: streak save');
  await set(`${today} - 2`, 5, month); assert.equal((await claim()).d, 1, 'second miss this month resets');
  await set(`${today} - 3`, 5, 'null'); assert.equal((await claim()).d, 1, 'two missed days in a row reset');
  await set(`${today} - 1`, 7, 'null'); assert.equal((await claim()).d, 1, 'day 7 wraps to day 1');
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${u}', false)`); const ds = (await db.query(`select public.daily_status() r`)).rows[0].r; await db.exec('reset role');
  assert.equal(ds.open, false); assert.equal(ds.saves, 1);
  assert.equal(await as(u, `select public.daily_claim($1)`, [u], 'daily_probe'), null, 'clients cannot call daily_claim directly'); stats.errors--; }
const fin = await st(); const probe = Object.entries(stats.errByMsg).filter(([k]) => k.startsWith('chat_gate_probe')).reduce((s, [, v]) => s + v, 0);
const spare = heroes.reduce((a, h) => a + h.gold, 0) / heroes.length; shop.spareAvg = Math.round(spare); shop.nextStepAvg = Math.round(heroes.reduce((a, h) => a + (h.next || 0), 0) / heroes.length); shop.petsOwned = (await db.query(`select count(*)::int c from public.pets`)).rows[0].c;
const out = { daily, sinks, shop, gear: heroes.slice(0, 3).map(h => [h.h.level, h.h.gear]), heroes: N, clears, turnout, arcEvents, surge, waitlist: wl?.[0]?.c, final: fin, calls: stats.calls, errors: stats.errors - probe, expectedProbeErrors: probe,
  errorRate: +((stats.errors - probe) / stats.calls * 100).toFixed(2), errByMsg: stats.errByMsg, bytes: stats.bytes };
if (process.env.REHEARSAL_JSON) fs.writeFileSync(process.env.REHEARSAL_JSON, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ daily, sinks, shop, gear: out.gear, heroes: N, floor10At: clears.find(c => c.floor === 10)?.h, clears: clears.map(c => `${c.floor}@${c.h}h`).join(' '), errorRate: out.errorRate, errByMsg: out.errByMsg, arcEvents, surge }));
assert(fin.floor >= 11 || HOURS < 18, 'reached floor 11'); assert(out.errorRate < 1, 'RPC error rate under 1%');
console.log('rehearsal ok');

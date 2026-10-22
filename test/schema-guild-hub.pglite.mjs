// Guild Hub (schema-addendum-guild-hub.sql), offline in PGlite, every addendum applied twice (+ the tower reset twice). Never the live DB.
import assert from 'node:assert'; import fs from 'node:fs';
import { BUFFS, MAX_DMG_PCT, racePayout } from '../js/guildhub.js'; import { FRIEND_CAP, REQ_PER_HOUR } from '../js/friends.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, skipped'); process.exit(0); }
const { ADDENDA } = await import('./addenda.mjs'); const ALL = [...ADDENDA, 'schema-addendum-floors-21-30.sql', 'schema-addendum-guild-hub.sql'];
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ALL) await db.exec(rd(n)); for (const n of ALL) await db.exec(rd(n));
await db.exec(`grant all on all tables in schema public to anon, authenticated;`);
assert(!/token|wallet|mint|solana|creator|usd|sol\b/i.test(rd('schema-addendum-guild-hub.sql').replace(/--.*$/gm, '')), 'gold only, in-game only');
const U = i => `00000000-0000-0000-0000-00000000000${i}`, [A, B, C, S, G] = [1, 2, 3, 4, 5].map(U);
for (const u of [A, B, C, S, G]) await db.exec(`insert into auth.users (id, is_anonymous) values ('${u}', false); insert into public.profiles (id, display_name) values ('${u}', 'p${u.at(-1)}') on conflict do nothing;`);
await db.exec(`update public.profiles set team = true where id = '${S}'; update public.profiles set role = 'gm' where id = '${G}';`);
const g1 = (await db.query(`insert into public.guilds (name, tag, owner, bank) values ('Iron Wake', 'IRON', $1, 0) returning id`, [A])).rows[0].id;
const g2 = (await db.query(`insert into public.guilds (name, tag, owner, bank) values ('Salt Choir', 'SALT', $1, 50000) returning id`, [C])).rows[0].id;
await db.query(`insert into public.guild_members (user_id, guild_id, role) values ($1, $3, 'leader'), ($2, $3, 'member'), ($4, $5, 'leader'), ($6, $5, 'member')`, [A, B, g1, C, g2, S]);
const as = async (u, q, p) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${u}', false);`); try { return (await db.query(q, p)).rows[0]?.r; } finally { await db.exec('reset role'); } };
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
// ---- presence: self + guildmates only
await db.exec(`insert into public.damage (user_id, floor, name, damage) values ('${A}', 1, 'Ash', 100), ('${B}', 1, 'Wren', 50), ('${C}', 1, 'Tess', 120), ('${S}', 1, 'Dev', 100000);
  update public.profiles set last_submit = now() - interval '1 minute' where id = '${B}';`);
let p = await as(A, `select public.guild_presence(array['Ash','Wren','Tess','Dev','Nobody']) r`);
assert.deepEqual(Object.keys(p).sort(), ['Ash', 'Wren'], 'strangers hidden'); assert.equal(p.Wren.floor, 1); assert.ok(p.Wren.seen);
assert.deepEqual(Object.keys(await as(C, `select public.guild_presence(array['Ash','Wren','Tess','Dev']) r`)).sort(), ['Dev', 'Tess']);
await db.exec(`insert into public.guild_race_wins (floor, tag) values (999, 'X')`); await db.exec(`set role authenticated`); assert.equal((await db.query(`select * from public.guild_race_wins`)).rows.length, 0, 'RLS: no direct reads'); await db.exec('reset role'); await db.exec(`delete from public.guild_race_wins`);
// ---- race: team row (in SALT) never counts; champion recorded when the floor falls
let h = await as(A, `select public.guild_hub() r`);
assert.deepEqual(h.live.map(x => [x.tag, +x.damage]), [['IRON', 150], ['SALT', 120]]); assert.equal(h.champion, null);
await db.exec(`insert into public.floor_clears (floor, max_hp, ranking, dmg) values (1, 1000, '{}', '{}'); update public.floor_state set floor = 2 where id = 1;`);
h = await as(C, `select public.guild_hub() r`); assert.equal(h.champion.tag, 'IRON'); assert.equal(+h.champion.payout, racePayout(1));
const race = (await db.query(`select amount, item from public.guild_ledger where guild_id = $1 and kind = 'race'`, [g1])).rows; assert.equal(race.length, 1); assert.equal(+race[0].amount, racePayout(1), 'champion bank paid'); assert.match(race[0].item, /Race Champion · Floor 1/);
const bankAfter = +(await db.query(`select bank from public.guilds where id = $1`, [g1])).rows[0].bank; assert.ok(bankAfter >= racePayout(1));
await db.exec(`insert into public.floor_clears (floor, max_hp, ranking, dmg) values (1, 1000, '{}', '{}')`); assert.equal((await db.query(`select count(*)::int n from public.guild_ledger where guild_id = $1 and kind = 'race'`, [g1])).rows[0].n, 1, 'paid once per floor'); assert.equal((await db.query(`select count(*)::int n from public.guild_ledger where kind = 'race'`)).rows[0].n, 1, 'only the champion');
for (const f of [1, 10, 20, 30, 100, 200]) assert.equal(+(await db.query(`select public.gh_race_payout($1) p`, [f])).rows[0].p, racePayout(f), `payout parity F${f}`); assert.equal(h.champion.floor, 1); assert.equal(h.history.length, 1); assert.deepEqual(h.live, []);
// ---- buffs: officers/leader only, server price, one at a time, capped multiplier
assert.match(await err(as(B, `select public.guild_buy_buff('dmg5') r`)), /officers and the leader only/);
assert.match(await err(as(A, `select public.guild_buy_buff('dmg5') r`)), /not enough gold in the bank/);
assert.match(await err(as(C, `select public.guild_buy_buff('dmg99') r`)), /no such buff/);
const bf = (await db.query(`select public.gh_buff('dmg5') b`)).rows[0].b; assert.deepEqual({ ...bf, kind: bf.kind }, { kind: BUFFS.dmg5.kind, pct: BUFFS.dmg5.pct, hours: BUFFS.dmg5.hours, price: BUFFS.dmg5.price, label: BUFFS.dmg5.label }, 'parity with js');
const bank0 = +(await db.query(`select bank from public.guilds where id = $1`, [g2])).rows[0].bank; const r = await as(C, `select public.guild_buy_buff('dmg5') r`); assert.equal(+r.bank, bank0 - BUFFS.dmg5.price); assert.equal(+(await db.query(`select bank from public.guilds where id = $1`, [g2])).rows[0].bank, bank0 - BUFFS.dmg5.price);
assert.match(await err(as(C, `select public.guild_buy_buff('dmg5') r`)), /already active/);
assert.equal((await db.query(`select kind from public.guild_ledger where guild_id = $1 order by id desc`, [g2])).rows[0].kind, 'spend');
const mul = async u => (await db.query(`select public.gh_dmg_mul($1) m`, [u])).rows[0].m;
assert.equal(await mul(C), 1 + MAX_DMG_PCT / 100); assert.equal(await mul(A), 1); assert.equal(await mul(S), 1, 'team never buffed'); assert.equal(await mul(G), 1);
assert.match(await err(db.exec(`insert into public.guild_buffs (guild_id, kind, pct, until) values (${g2}, 'dmg', 50, now() + interval '1 day')`)), /check/, 'pct cap in the table');
h = await as(C, `select public.guild_hub() r`); assert.equal(h.buffs.length, 1); assert.equal(+h.buffs[0].pct, 5);
// ---- submit_damage: the ceiling rises by exactly the buff %
const sub = async u => { await db.exec(`update public.floor_state set floor = 2, hp = 9e15, max_hp = 9e15 where id = 1`); await db.exec(`update public.profiles set last_submit = now() - interval '10 seconds' where id = '${u}'`); return +(await as(u, `select public.submit_damage(1000000000000, 'x', 5, 0) r`)).accepted; };
const a = await sub(A), c = await sub(C); assert.ok(a > 0); assert.ok(Math.abs(c / a - 1.05) < 0.01, `buffed ceiling ${c / a}`);
// ---- friends: request / accept / presence / remove / block / caps / rate limit / RLS / no leaks
{ const fl = u => as(u, `select public.friends_list() r`);
  await db.exec(`update public.damage d set name = (select d1.name from public.damage d1 where d1.user_id = d.user_id and d1.floor = 1) where d.floor = 2`); // heroes keep their names
  assert.match(await err(as(A, `select public.friend_request('Nobody') r`)), /no hero with that name/); assert.match(await err(as(A, `select public.friend_request('Ash') r`)), /that is you/);
  assert.ok(!('Tess' in await as(A, `select public.guild_presence(array['Tess']) r`)), 'stranger before friending');
  await as(A, `select public.friend_request('Tess') r`); assert.match(await err(as(A, `select public.friend_request('Tess') r`)), /already sent/);
  let lc = await fl(C); assert.equal(lc.incoming.length, 1); assert.equal(lc.incoming[0].name, 'Ash'); assert.ok(!JSON.stringify(lc).includes(A), 'no user ids'); assert.equal(lc.incoming[0].h.length, 16);
  assert.match(await err(as(B, `select public.friend_respond(${lc.incoming[0].id}, true) r`)), /request not found/, 'only the addressee answers');
  await as(C, `select public.friend_respond(${lc.incoming[0].id}, true) r`); lc = await fl(C); assert.deepEqual(lc.friends.map(f => f.name), ['Ash']); assert.equal(lc.friends[0].floor, 2, "their highest floor"); assert.ok(lc.friends[0].seen);
  assert.deepEqual(Object.keys(lc.friends[0]).sort(), ['floor', 'h', 'name', 'seen', 'since'], 'only name, floor, seen');
  assert.ok('Tess' in await as(A, `select public.guild_presence(array['Tess']) r`), 'friend sees presence (gh_can_see)'); assert.ok('Ash' in await as(C, `select public.guild_presence(array['Ash']) r`));
  assert.match(await err(as(A, `select public.friend_request('Tess') r`)), /already friends/);
  // mutual request = accept
  await as(B, `select public.friend_request('Tess') r`); await as(C, `select public.friend_request('Wren') r`); assert.deepEqual((await fl(B)).friends.map(f => f.name), ['Tess']);
  // remove
  await as(A, `select public.friend_remove($1) r`, [(await fl(A)).friends[0].h]); assert.equal((await fl(C)).friends.length, 1, 'both sides removed (Wren stays)'); assert.ok(!('Tess' in await as(A, `select public.guild_presence(array['Tess']) r`)));
  // block: removes, hides their requests, request to a blocker looks sent but is never delivered
  await as(C, `select public.friend_block(null, 'Ash') r`); assert.match(await err(as(C, `select public.friend_request('Ash') r`)), /unblock them first/);
  assert.equal((await as(A, `select public.friend_request('Tess') r`)).sent, true); assert.equal((await fl(C)).incoming.length, 0, 'block not revealed, nothing delivered');
  const bh = (await fl(C)).blocked[0].h; await as(C, `select public.friend_unblock($1) r`, [bh]); assert.equal((await fl(C)).blocked.length, 0);
  // the GM can friend like anyone; nothing staff-related is exposed
  await db.exec(`insert into public.damage (user_id, floor, name, damage, is_staff) values ('${G}', 1, 'Vesper', 5, true)`);
  await as(A, `select public.friend_request('Vesper') r`); const lg = await fl(G); await as(G, `select public.friend_respond(${lg.incoming[0].id}, true) r`);
  const la = JSON.stringify(await fl(A)); assert.ok(!/staff|gm|role|cls|gear|items|is_/i.test(la.replace(/"name":"[^"]*"/g, '')), 'no GM identity or items in friends_list');
  // caps + rate limit
  await db.exec(`delete from public.friend_req_log; insert into public.friend_req_log (user_id) select '${B}' from generate_series(1, ${REQ_PER_HOUR})`);
  assert.match(await err(as(B, `select public.friend_request('Ash') r`)), /too many requests/); await db.exec(`delete from public.friend_req_log`);
  await db.exec(`insert into auth.users (id) select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, ${FRIEND_CAP}) i;
    insert into public.friends (user_id, friend_id) select '${S}', ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, ${FRIEND_CAP}) i`);
  assert.match(await err(as(B, `select public.friend_request('Dev') r`)), /their friend list is full/); assert.match(await err(as(S, `select public.friend_request('Wren') r`)), /friend list full \(100\)/);
  // RLS: no direct access to any friend table
  for (const t of ['friends', 'friend_requests', 'friend_blocks', 'friend_req_log']) { await db.exec(`set role authenticated`); try { assert.equal((await db.query(`select * from public.${t}`)).rows.length, 0, `RLS ${t}`); } finally { await db.exec('reset role'); } }
  await db.exec(`set role anon`); assert.ok(await err(db.query(`select public.friends_list()`)), 'anon cannot call'); await db.exec('reset role');
  assert.ok(await err(as(A, `select public.fr_uid('Tess') r`)), 'helpers not callable'); }
// ---- the pre-launch reset clears race wins and buffs, and can run twice
if (fs.existsSync(new URL('../supabase/admin-reset-tower.sql', import.meta.url))) { await db.exec(rd('admin-reset-tower.sql')); await db.exec(rd('admin-reset-tower.sql'));
  assert.equal((await db.query(`select count(*)::int n from public.guild_race_wins`)).rows[0].n, 0); assert.equal((await db.query(`select count(*)::int n from public.guild_buffs`)).rows[0].n, 0); }
console.log('guild hub schema ok');

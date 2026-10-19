// Runs schema.sql + guilds/chat addendum + guilds v2 addendum (v2 twice: idempotent) in PGlite.
import assert from 'node:assert'; import fs from 'node:fs';
import { weekQuests, levelOf, slotsOf, bonusPctOf, sigilsAvailable, SIGILS, PALETTE } from '../js/guildsv2.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, guilds v2 test skipped'); process.exit(0); }
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
await db.exec(rd('schema.sql')); await db.exec(rd('schema-addendum-guilds-chat.sql'));
// a basic (pre-v2) guild survives the upgrade
await db.exec(`insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000aa', false)`);
await db.exec(`insert into public.guilds (name, tag, owner) values ('Old Guard', 'OLD', '00000000-0000-0000-0000-0000000000aa'); insert into public.guild_members (user_id, guild_id) select '00000000-0000-0000-0000-0000000000aa', id from public.guilds where tag = 'OLD'`);
await db.exec(rd('schema-addendum-guilds-v2.sql')); await db.exec(rd('schema-addendum-guilds-v2.sql'));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated; grant select on all tables in schema public to anon; grant usage on all sequences in schema public to authenticated;`);
assert.equal((await db.query(`select role from public.guild_members where user_id = '00000000-0000-0000-0000-0000000000aa'`)).rows[0].role, 'leader', 'old owner backfilled as leader');
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, GM = U(99), ANON = U(98), ids = Array.from({ length: 12 }, (_, i) => U(i + 1));
await db.exec(`insert into auth.users (id, is_anonymous) values ${ids.map(id => `('${id}', false)`).join(',')}, ('${GM}', false), ('${ANON}', true); update public.profiles set role = 'gm' where id = '${GM}';`);
const as = async (uid, q, p) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await db.query(q, p); } finally { await db.exec('reset role'); } };
const one = async (uid, q, p) => (await as(uid, q, p)).rows[0]?.r;
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const info = uid => one(uid, `select public.guild_info() r`);
// ---- rules parity JS <-> SQL
for (const w of [0, 1, 2, 3, 2963, 2964, 3001, 5000]) { const js = weekQuests(w), sql = (await db.query(`select * from public.gv2_quests($1)`, [w])).rows;
  assert.deepEqual(sql.map(r => [r.idx, r.kind, Number(r.target), Number(r.xp), Number(r.gold)]), js.map(q => [q.idx, q.kind, q.target, q.xp, q.gold]), `quests week ${w}`); }
for (const xp of [0, 19999, 20000, 80000, 500000, 1e7, 1e9]) assert.equal((await db.query(`select public.gv2_level($1::bigint) l`, [xp])).rows[0].l, levelOf(xp), `level ${xp}`);
for (const l of [1, 5, 21]) { assert.equal((await db.query(`select public.gv2_slots($1) s`, [l])).rows[0].s, slotsOf(l)); for (const b of [0, 3]) assert.equal((await db.query(`select public.gv2_sigils($1, $2) s`, [l, b])).rows[0].s, sigilsAvailable(l, b)); }
for (const t of [0, 3]) assert.equal((await db.query(`select public.gv2_bonus($1) b`, [t])).rows[0].b, bonusPctOf(t));
assert.deepEqual((await db.query(`select public.gv2_sigil_list() s, public.gv2_palette() p`)).rows[0], { s: SIGILS, p: PALETTE });
// ---- RLS: no direct writes; ledger/quests/requests not readable directly
assert(await err(as(ids[0], `insert into public.guild_ledger (guild_id, kind, amount) values (1, 'donate', 5)`)), 'no direct ledger insert');
assert(await err(as(ids[0], `update public.guilds set bank = 999999`)) || (await db.query(`select max(bank)::int b from public.guilds`)).rows[0].b === 0, 'no direct bank edit');
assert.equal((await as(ids[0], `select * from public.guild_ledger`)).rows.length, 0);
// ---- ranks: create, invite-only, requests, invites, roles, kick, transfer
const g = await one(ids[0], `select public.guild_create('Night Bell', 'NB') r`); const gid = g.id;
assert.equal((await info(ids[0])).me.role, 'leader');
assert.match(await err(as(GM, `select public.guild_create('Staff Hall', 'GMH')`)), /staff cannot own/);
await as(ids[1], `select public.guild_join('NB')`); assert.equal((await info(ids[1])).me.role, 'member', 'open guild: joined');
assert.match(await err(as(ids[1], `select public.guild_set_open(false)`)), /officers/);
await as(ids[0], `select public.guild_set_open(false)`);
const rq = await one(ids[2], `select public.guild_join('NB') r`); assert.equal(rq.requested, true); assert.equal((await info(ids[2])).requests[0].tag, 'NB');
assert.equal((await info(ids[1])).requests.length, 0, 'members do not see requests');
assert.match(await err(as(ids[1], `select public.guild_answer('${ids[2]}', true)`)), /officers/);
await as(ids[0], `select public.guild_set_role('${ids[1]}', 'officer')`); assert.match(await err(as(ids[1], `select public.guild_set_role('${ids[0]}', 'member')`)), /leader only/);
assert.equal((await info(ids[1])).requests.length, 1); await as(ids[1], `select public.guild_answer('${ids[2]}', true)`); assert.equal((await info(ids[2])).me.role, 'member', 'officer accepted');
await as(ids[3], `select public.guild_join('NB')`); await as(ids[1], `select public.guild_answer('${ids[3]}', false)`); assert.equal((await info(ids[3])).guild, null, 'denied');
await as(ids[1], `select public.guild_invite('${ids[4]}')`); assert.equal((await info(ids[4])).invites[0].tag, 'NB'); await as(ids[4], `select public.guild_accept_invite(${gid})`); assert.equal((await info(ids[4])).me.role, 'member', 'invite accepted');
assert.match(await err(as(ids[1], `select public.guild_invite('${GM}')`)), /staff/);
assert.match(await err(as(ids[4], `select public.guild_kick('${ids[2]}')`)), /officers/, 'members cannot kick');
await as(ids[1], `select public.guild_kick('${ids[4]}')`); assert.equal((await info(ids[4])).guild, null, 'officer kicked a member');
await as(ids[0], `select public.guild_set_role('${ids[2]}', 'officer')`); assert.match(await err(as(ids[1], `select public.guild_kick('${ids[2]}')`)), /cannot kick/, 'officer cannot kick officer');
await as(ids[0], `select public.guild_set_open(true)`); await as(GM, `select public.guild_join('NB')`);
assert.match(await err(as(ids[0], `select public.guild_set_role('${GM}', 'officer')`)), /staff cannot lead/);
// ---- XP from damage (server side), staff adds nothing, quests progress
await db.exec(`update public.profiles set last_submit = now() - interval '1 hour'`);
await as(ids[0], `select public.submit_damage(3000, 'Lead', 50, 5)`); await as(ids[1], `select public.submit_damage(2000, 'Offi', 50, 5)`); await as(GM, `select public.submit_damage(900000, 'Staff', 500, 50)`);
let I = await info(ids[0]); assert.equal(Number(I.guild.xp) - I.quests.filter(q => q.done).reduce((a, q) => a + Number(q.xp), 0), 5000, 'guild xp = member damage (+ completed quest rewards), staff excluded');
assert.equal(Number(I.members.find(m => m.user_id === ids[0]).contrib), 3000); assert.equal(Number(I.members.find(m => m.user_id === GM).contrib), 0);
const dq = I.quests.find(q => q.kind === 'damage'); if (dq) assert.equal(Number(dq.progress), 5000, 'damage quest progress');
const aq = I.quests.find(q => q.kind === 'active'); if (aq) assert.equal(Number(aq.progress), 2, 'active members (staff not counted)');
// ---- bank: donate validated against the cloud save, cooldown, daily cap, staff can't
assert.match(await err(as(ids[0], `select public.guild_donate(50)`)), /not enough gold/, 'no save: refused');
await db.exec(`insert into public.saves (user_id, data) values ('${ids[0]}', '{"gold": 30000, "heroes": []}'), ('${ids[2]}', '{"gold": 100}')`);
const d1 = await one(ids[0], `select public.guild_donate(20000) r`); assert.equal(d1.gold, 10000); assert.equal(Number(d1.bank) >= 20000, true);
assert.equal(Number((await db.query(`select data->>'gold' g from public.saves where user_id = '${ids[0]}'`)).rows[0].g), 10000, 'gold deducted from the save');
assert.match(await err(as(ids[0], `select public.guild_donate(10)`)), /30 seconds/);
await db.exec(`update public.guild_ledger set at = now() - interval '1 minute'`); assert.match(await err(as(ids[0], `select public.guild_donate(6000)`)), /daily donation cap/);
assert.match(await err(as(ids[2], `select public.guild_donate(500)`)), /not enough gold/); assert.match(await err(as(GM, `select public.guild_donate(1)`)), /staff cannot donate/);
assert.match(await err(as(ids[0], `select public.guild_donate(-5)`)), /at least 1/);
// ---- upgrades: officer spends, level gates, ledger
assert.match(await err(as(ids[2], `select public.guild_upgrade('bonus')`)), /level 5/); I = await info(ids[0]); const bank0 = Number(I.guild.bank);
await as(ids[2], `select public.guild_upgrade('banner')`); I = await info(ids[0]); assert.equal(I.guild.banner_unlocks, 1); assert.equal(Number(I.guild.bank), bank0 - 3000);
assert.match(await err(as(ids[5], `select public.guild_upgrade('hall')`)), /not in a guild/);
await db.exec(`update public.guilds set xp = 400000, bank = bank + 30000 where id = ${gid}`); await as(ids[0], `select public.guild_upgrade('bonus')`); await as(ids[0], `select public.guild_upgrade('hall')`);
I = await info(ids[0]); assert.equal(I.guild.bonus_pct, 3); assert.equal(I.guild.hall, 1); assert.equal(I.guild.level, levelOf(400000)); assert.equal(I.guild.slots, slotsOf(levelOf(400000)));
assert.deepEqual(I.ledger.slice(0, 4).map(l => l.kind), ['spend', 'spend', 'spend', 'donate']);
for (let t = 1; t < 3; t++) await db.exec(`update public.guilds set bonus_tier = 3 where id = ${gid}`); assert.match(await err(as(ids[0], `select public.guild_upgrade('bonus')`)), /max/);
// ---- banner
assert.match(await err(as(ids[0], `select public.guild_set_banner('rune', '#ffd76a', '#2a1450')`)), /locked/);
assert.match(await err(as(ids[0], `select public.guild_set_banner('crown', '#ffd76a', '#ffd76a')`)), /two different/);
assert.match(await err(as(ids[0], `select public.guild_set_banner('crown', '#123456', '#2a1450')`)), /palette/);
await as(ids[1], `select public.guild_set_banner('crown', '#ff3355', '#2a1450')`); assert.equal((await info(ids[0])).guild.banner.sigil, 'crown');
const tags = await one(ANON, `select public.guild_tags(1) r`); assert.equal(tags.Lead.tag, 'NB'); assert.equal(tags.Lead.banner.sigil, 'crown'); assert(!tags.Staff, 'staff carries no guild badge');
const board = await one(ANON, `select public.guild_board(null) r`); assert.equal(board.find(b => b.tag === 'NB').banner.sigil, 'crown');
// ---- guild chat: members only, bind rule, filter, slow mode
assert.match(await err(as(ids[5], `select public.guild_chat_post('Out', 'hi')`)), /not in a guild/);
await db.exec(`insert into public.guild_members (user_id, guild_id) values ('${ANON}', ${gid})`); assert.match(await err(as(ANON, `select public.guild_chat_post('Guest', 'hi')`)), /bind your identity/);
const gm1 = await one(ids[1], `select public.guild_chat_post('Offi', 'what the fuck, regroup') r`); assert.equal(gm1.body, 'what the ***** regroup');
assert.match(await err(as(ids[1], `select public.guild_chat_post('Offi', 'again')`)), /slow mode/);
await db.exec(`update public.profiles set last_gchat = null`); assert.match(await err(as(ids[2], `select public.guild_chat_post('Two', 'visit evil.com')`)), /links/);
assert.equal((await as(ids[2], `select * from public.guild_messages`)).rows.length, 1, 'member reads guild chat'); assert.equal((await as(ids[5], `select * from public.guild_messages`)).rows.length, 0, 'outsider cannot read');
// ---- floors quest: a floor falls with a member present
const fq = (await info(ids[0])).quests.find(q => q.kind === 'floors');
await db.exec(`update public.floor_state set hp = 10 where id = 1; update public.profiles set last_submit = now() - interval '1 hour' where id = '${ids[0]}'`); await as(ids[0], `select public.submit_damage(5000, 'Lead', 50, 5)`);
if (fq) assert(Number((await info(ids[0])).quests.find(q => q.kind === 'floors').progress) >= 1, 'floor fell with a member present');
// quest completion pays once (force the damage quest over its target)
if (dq) { const x0 = Number((await info(ids[0])).guild.xp); await db.exec(`update public.profiles set last_submit = now() - interval '12 hours' where id = '${ids[1]}'`); await as(ids[1], `select public.submit_damage(${dq.target}, 'Offi', 500, 50)`);
  const I2 = await info(ids[0]); assert.equal(I2.quests.find(q => q.kind === 'damage').done, true); assert(I2.ledger.some(l => l.kind === 'quest'), 'quest reward in the ledger'); assert(Number(I2.guild.xp) >= x0 + dq.target + dq.xp); }
// ---- inactive leader: after 14 days the most active officer leads
await db.exec(`update public.guild_members set last_active = now() - interval '15 days' where user_id = '${ids[0]}'; update public.profiles set last_submit = now() - interval '15 days' where id = '${ids[0]}';
  update public.guild_members set last_active = now() - interval '3 days' where user_id = '${ids[2]}'; update public.guild_members set last_active = now() where user_id = '${ids[1]}'`);
I = await info(ids[2]); assert.equal(I.members.find(m => m.user_id === ids[1]).role, 'leader', 'most active officer leads'); assert.equal(I.members.find(m => m.user_id === ids[0]).role, 'officer');
assert.equal((await db.query(`select owner from public.guilds where id = ${gid}`)).rows[0].owner, ids[1]);
// transfer + leave
await as(ids[1], `select public.guild_set_role('${ids[2]}', 'leader')`); I = await info(ids[2]); assert.equal(I.me.role, 'leader'); assert.equal(I.members.find(m => m.user_id === ids[1]).role, 'officer');
await as(ids[2], `select public.guild_leave()`); assert.equal((await info(ids[1])).me.role, 'leader', 'leader leaves: an officer takes over');
// slots grow with level: a level-1 guild is full at 30
const s = await one(ids[6], `select public.guild_create('Tiny Hall', 'TH') r`); await db.exec(`insert into auth.users (id, is_anonymous) select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, false from generate_series(1, 30) i`);
await db.exec(`insert into public.guild_members (user_id, guild_id) select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, ${s.id} from generate_series(1, 29) i`);
assert.match(await err(as(ids[7], `select public.guild_join('TH')`)), /full/); await db.exec(`update public.guilds set xp = ${20000 * 4} where id = ${s.id}`); await as(ids[7], `select public.guild_join('TH')`);
console.log('guilds v2 schema (pglite) tests passed, idempotent');

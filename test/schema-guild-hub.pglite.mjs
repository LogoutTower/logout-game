// Guild Hub (schema-addendum-guild-hub.sql), offline in PGlite, every addendum applied twice (+ the tower reset twice). Never the live DB.
import assert from 'node:assert'; import fs from 'node:fs';
import { BUFFS, MAX_DMG_PCT } from '../js/guildhub.js';
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
h = await as(C, `select public.guild_hub() r`); assert.equal(h.champion.tag, 'IRON'); assert.equal(h.champion.floor, 1); assert.equal(h.history.length, 1); assert.deepEqual(h.live, []);
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
// ---- the pre-launch reset clears race wins and buffs, and can run twice
if (fs.existsSync(new URL('../supabase/admin-reset-tower.sql', import.meta.url))) { await db.exec(rd('admin-reset-tower.sql')); await db.exec(rd('admin-reset-tower.sql'));
  assert.equal((await db.query(`select count(*)::int n from public.guild_race_wins`)).rows[0].n, 0); assert.equal((await db.query(`select count(*)::int n from public.guild_buffs`)).rows[0].n, 0); }
console.log('guild hub schema ok');

// Daily quests, guild weekly member rewards and player ID cards (schema-addendum-quests-profile.sql), offline in PGlite with every addendum applied twice.
import assert from 'node:assert'; import fs from 'node:fs';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, quests/profile test skipped'); process.exit(0); }
const { ADDENDA } = await import('./addenda.mjs'); assert(ADDENDA.at(-1) === 'schema-addendum-quests-profile.sql');
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ADDENDA) await db.exec(rd(n)); for (const n of ADDENDA) await db.exec(rd(n));
await db.exec(`grant all on all tables in schema public to anon, authenticated; grant usage, select on all sequences in schema public to anon, authenticated;`);
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, P = U(1), Q = U(2), GM = U(9);
await db.exec(`insert into auth.users (id, is_anonymous, email) values ('${P}', false, 'p@example.test'), ('${Q}', false, null), ('${GM}', false, null); update public.profiles set role = 'gm' where id = '${GM}'`);
const as = async (uid, q, p) => { await db.exec(`set role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`); try { return (await db.query(q, p)).rows[0]?.r; } finally { await db.exec('reset role'); } };
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const back = (u, s) => db.exec(`update public.profiles set last_submit = now() - interval '${s} seconds' where id = '${u}'`);
const row = async u => (await db.query(`select kinds, targets::float8[] t, prog::float8[] p, claimed from public.quest_days where user_id = $1`, [u])).rows[0];
const save = (u, data) => db.query(`insert into public.saves (user_id, data) values ($1, $2) on conflict (user_id) do update set data = excluded.data`, [u, JSON.stringify(data)]);
const gold = async u => Number((await db.query(`select data->>'gold' g from public.saves where user_id = $1`, [u])).rows[0].g);

// ---- daily quests
await back(P, 30); const t1 = await as(P, `select public.tick(100, 'Pia', 3, 1, 0) r`);
assert(t1.q && t1.q.k.length === 3 && t1.q.k[0] === 'dmg' && t1.q.k[1] === 'online', 'first tick of the day sends the full quest defs');
assert.equal(t1.q.g.length, 3); assert(t1.q.g.every(g => g > 0));
let r = await row(P); assert.equal(r.p[0], Number(t1.a), 'accepted damage counts (not the claimed amount)');
await back(P, 60); const t2 = await as(P, `select public.tick(100, 'Pia', 3, 1, 0) r`); assert(!t2.q.k && t2.q.p, 'later ticks: progress only');
r = await row(P); assert(r.p[1] >= 55 && r.p[1] <= 70, `online counts short gaps (${r.p[1]})`);
await back(P, 3 * 3600);
const big = await as(P, `select public.tick(1e9::bigint, 'Pia', 3, 1, 0) r`); r = await row(P);
assert(r.p[1] < 200, 'a 3 h gap (offline) is not time online'); assert(r.p[0] <= r.t[0], 'progress never exceeds the target');
assert(Number(big.a) < 1e9, 'offline damage clamped by submit_damage');
// fake claims are refused
assert.match(await err(as(P, `select public.quest_claim(1) r`)), /not finished/);
assert.match(await err(as(P, `select public.quest_claim(5) r`)), /no such quest/);
assert.match(await err(as(null, `select public.quest_claim(0) r`)), /permission denied/);
await db.exec(`update public.quest_days set prog[1] = targets[1] where user_id = '${P}'`);
assert.match(await err(as(P, `select public.quest_claim(0) r`)), /no saved game/);
await save(P, { gold: 50, heroes: [{ name: 'Pia', cls: 'Blade', level: 3, gear: 1 }] });
const c = await as(P, `select public.quest_claim(0) r`); assert(c.add > 0 && c.gold === 50 + c.add && c.xp > 0, 'claim pays into the saved game');
assert.equal(await gold(P), 50 + c.add); assert.match(await err(as(P, `select public.quest_claim(0) r`)), /already claimed/);
await as(P, `update public.quest_days set prog = '{999999999,99999,9999}', claimed = 0 returning 1 r`); assert.equal((await row(P)).claimed, 1, 'RLS: clients cannot write quest rows');
// chat counts on chat days; clears count for everyone who hit the floor
const k3 = r.kinds[2]; assert(['chat', 'clear', 'donate'].includes(k3));
await db.exec(`update public.quest_days set kinds[3] = 'chat' where user_id = '${P}'`);
await db.exec(`update public.profiles set created_at = now() - interval '1 day', last_submit = now() - interval '1 hour' where id = '${P}'`);
await as(P, `select public.chat_post('Pia', 'hello tower') r`).catch(e => console.log('chat_post note:', e.message));
r = await row(P); assert.equal(r.p[2], 1, 'floor chat post counts');
// ---- guild weeklies: Monday 00:00 UTC weeks
const wk = Number((await db.query(`select public.gv2_week('2026-10-19T00:00:00Z') a, public.gv2_week('2026-10-18T23:59:59Z') b`)).rows.map(x => x.a - x.b)[0]); assert.equal(wk, 1, 'week turns over at Monday 00:00 UTC');
assert.equal((await db.query(`select public.gv2_week('2026-10-19T00:00:00Z') = public.gv2_week('2026-10-25T23:59:59Z') s`)).rows[0].s, true);
await save(Q, { gold: 10, heroes: [{ name: 'Quill', cls: 'Arcanist', level: 2 }] });
await as(P, `select public.guild_create('Night Owls', 'OWL') r`); await as(Q, `select public.guild_join('OWL') r`);
const w = Number((await db.query(`select public.gv2_week() w`)).rows[0].w);
const quests = (await db.query(`select * from public.gv2_quests($1)`, [w])).rows, dq = quests.find(x => x.kind === 'damage') || quests.find(x => x.kind === 'active');
await back(Q, 60); await as(Q, `select public.tick(400, 'Quill', 2, 0, 0) r`);
let gi = await as(Q, `select public.guild_info() r`); const mineQ = gi.quests.find(x => x.idx === dq.idx);
assert(mineQ.mine > 0, 'member contribution recorded'); assert(gi.mreward.g > 0);
assert.match(await err(as(Q, `select public.guild_quest_claim(${w}, ${dq.idx}) r`)), /not finished/);
const gid = (await db.query(`select id from public.guilds where tag = 'OWL'`)).rows[0].id;
await db.exec(`update public.guild_quests set done = true where guild_id = ${gid} and week = ${w} and idx = ${dq.idx}`);
if (dq.kind === 'damage') { await db.exec(`update public.guild_quest_contrib set amount = 1 where user_id = '${Q}'`); assert.match(await err(as(Q, `select public.guild_quest_claim(${w}, ${dq.idx}) r`)), /1%/); await db.exec(`update public.guild_quest_contrib set amount = ${dq.target} where user_id = '${Q}'`); }
const g0 = await gold(Q), gc = await as(Q, `select public.guild_quest_claim(${w}, ${dq.idx}) r`); assert.equal(await gold(Q), g0 + gc.add); assert(gc.add > 0);
assert.match(await err(as(Q, `select public.guild_quest_claim(${w}, ${dq.idx}) r`)), /already claimed/);
assert.match(await err(as(P, `select public.guild_quest_claim(${w}, ${dq.idx}) r`)), /did not help/, 'non-contributors get nothing');
assert.match(await err(as(Q, `select public.guild_quest_claim(${w - 5}, ${dq.idx}) r`)), /closed/);
gi = await as(Q, `select public.guild_info() r`); assert.equal(gi.quests.find(x => x.idx === dq.idx).claimed, true);
// staff never contributes to a normal guild's quests
assert.equal((await db.query(`select count(*)::int n from public.guild_quest_contrib where user_id = '${GM}'`)).rows[0].n, 0);
// ---- player card
await save(P, { gold: 99, email: 'p@example.test', wallet: 'So1anaWa11et', heroes: [{ name: 'Pia', cls: 'Blade', level: 7, gear: 2, look: { title: 't-novice', skin: 'sk-stonekeep', aura: 'gm-aura', secret: 'x' }, talents: { 'bl-1': 2, 'cx-shape': 1 },
  equip: { weapon: { id: 'gm-eventide', gm: true, name: 'Eventide', slot: 'weapon', rarity: 'unique', stats: { dps: 999 } }, armor: { id: 'i1-1-3a', name: 'Frost Mail', slot: 'armor', rarity: 'epic', element: 'frost', stats: { dpsPct: 9, evil: 'x' }, secret: 1 } } }], spirit: true });
const card = await as(Q, `select public.player_card('Pia') r`);
assert.equal(card.name, 'Pia'); assert.equal(card.level, 7); assert.equal(card.cls, 'Blade'); assert.equal(card.equip.armor.rarity, 'epic'); assert.deepEqual(card.equip.armor.stats, { dpsPct: 9 });
assert(!card.equip.weapon, 'staff weapon stripped from a player card'); assert(!card.look.aura && !card.look.secret, 'staff/unknown look keys stripped'); assert(!card.talents['cx-shape']);
assert.equal(card.guild.tag, 'OWL'); assert(!card.st && !card.spirit, 'players are not staff and have no spirit');
const txt = JSON.stringify(card); for (const bad of ['example.test', 'So1ana', P, 'user_id', 'role', 'email', 'wallet', 'gold']) assert(!txt.includes(bad), `card leaks ${bad}`);
const au = (await db.query(`select left(md5('logout-chat:' || $1), 12) a`, [P])).rows[0].a;
assert.equal((await as(Q, `select public.player_card(null, '${au}') r`)).name, 'Pia', 'chat author hash resolves');
assert.equal(await as(Q, `select public.player_card('Nobody') r`), null);
assert.match(await err(as(null, `select public.player_card('Pia') r`)), /permission denied/, 'anon cannot scrape cards');
// staff card: Solumbra + staff badge, staff gear shown, no role internals
await save(GM, { heroes: [{ name: 'Staff', cls: 'GameMaster', level: 120, equip: { weapon: { id: 'gm-eventide', gm: true, name: 'Eventide', slot: 'weapon', rarity: 'unique', stats: { dps: 50 } } }, look: { title: 'gm-title' } }], spirit: true });
await back(GM, 30); await as(GM, `select public.tick(10, 'Staff', 120, 10, 0) r`);
const gc2 = await as(P, `select public.player_card('Staff') r`); assert(gc2.st && gc2.spirit && gc2.equip.weapon.name === 'Eventide' && gc2.look.title === 'gm-title' && gc2.cls === 'GameMaster');
assert(!/"role"|"gm"|user_id|passphrase|hash/i.test(JSON.stringify(gc2)), 'no role internals on the staff card');
console.log('quests/profile pglite tests passed');

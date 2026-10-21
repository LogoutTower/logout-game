// The Forge (schema-addendum-forge.sql), offline in PGlite with every addendum applied twice. Never the live DB.
import assert from 'node:assert'; import fs from 'node:fs';
import { upCost, upGold, EVOS, UP_RATE } from '../js/forge.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, forge test skipped'); process.exit(0); }
const { ADDENDA } = await import('./addenda.mjs'); assert(ADDENDA.includes('schema-addendum-forge.sql'));
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ADDENDA) await db.exec(rd(n)); for (const n of ADDENDA) await db.exec(rd(n));
await db.exec(`grant all on all tables in schema public to anon, authenticated;`);
const sql = rd('schema-addendum-forge.sql').replace(/--.*$/gm, '');
assert(!/token|wallet|mint|solana|creator|submit_damage|floor_clears|public\.damage|floor_state/i.test(sql), 'in-game only: no token, wallet or damage writes');
// ---- parity with js/forge.js
for (let f = 1; f <= 100; f += 3) for (let t = 1; t <= 11; t++) { const c = upCost({ floor: f }, t), r = (await db.query(`select public.forge_gold($1,$2)::float8 g, public.forge_mats($1,$2) m, public.forge_rate($2) r`, [f, t])).rows[0];
  assert.equal(r.g, c.gold, `gold f${f} t${t}`); assert.deepEqual(r.m, c.mats, `mats f${f} t${t}`); assert.equal(r.r, c.rate, `rate t${t}`); }
for (let s = 1; s <= 10; s++) { const e = (await db.query(`select public.forge_evo($1) e`, [s])).rows[0].e, j = EVOS[s - 1]; assert.deepEqual(e, { pre: j.pre, hue: j.hue, k: j.k, v: j.v, text: j.text }); }
const A = '00000000-0000-0000-0000-000000000001';
await db.exec(`insert into auth.users (id, is_anonymous) values ('${A}', false)`);
const put = (data) => db.query(`insert into public.saves (user_id, data) values ($1, $2) on conflict (user_id) do update set data = excluded.data`, [A, data]);
const get = async () => (await db.query(`select data from public.saves where user_id = $1`, [A])).rows[0].data;
const as = async (q, p, uid = A) => { await db.exec(`set role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`); try { return (await db.query(q, p)).rows[0]?.r; } finally { await db.exec('reset role'); } };
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const up = (ev = false) => as(`select public.forge_upgrade($1) r`, [ev]);
const W = (o = {}) => ({ id: 'w1', slot: 'weapon', rarity: 'rare', floor: 3, name: 'Runed Blade', stats: { dps: 10 }, ...o });
assert.match(await err(as(`select public.forge_upgrade(false) r`, [], null)), /permission denied/);
// +1..+5: gold only, never fail
await put({ gold: 1e6, heroes: [{ equip: { weapon: W() } }] });
for (let t = 1; t <= 5; t++) { const r = await up(); assert(r.ok, `+${t} never fails`); assert.equal(r.weapon.up, t); }
let d = await get(); assert.equal(d.gold, 1e6 - [1, 2, 3, 4, 5].reduce((s, t) => s + upGold({ floor: 3 }, t), 0));
// +6 needs materials
assert.match(await err(up()), /not enough materials/);
// fail burns materials only: many attempts at +6 with enough mats, compare rate and invariants
let ok = 0, n = 0; while (n < 400) { await put({ gold: 1e9, mats: { shard: 10, ess1: 3 }, heroes: [{ equip: { weapon: W({ up: 5 }) } }] }); const r = await up(); n++; d = await get();
  assert.equal(d.mats.shard, 0); assert.equal(d.mats.ess1, 0);
  if (r.ok) { ok++; assert.equal(d.heroes[0].equip.weapon.up, 6); assert.equal(d.gold, 1e9 - upGold({ floor: 3 }, 6)); } else { assert.equal(d.heroes[0].equip.weapon.up, 5, 'fail keeps level'); assert.equal(d.gold, 1e9, 'fail keeps gold'); assert.equal(d.heroes[0].equip.weapon.name, 'Runed Blade'); } }
assert(Math.abs(ok / n - UP_RATE[6] / 100) < 0.06, `+6 rate ${ok / n}`);
// evolve
await put({ gold: 1e9, mats: { sigil10: 1 }, heroes: [{ equip: { weapon: W({ up: 9 }) } }] }); assert.match(await err(up(true)), /reach \+10/);
await put({ gold: 1e9, mats: { sigil10: 1 }, heroes: [{ equip: { weapon: W({ up: 10 }) } }] }); assert.match(await err(up()), /evolve/);
let r = await up(true); assert(r.ok); d = await get(); const w = d.heroes[0].equip.weapon;
assert.equal(w.name, 'Cinderborn Runed Blade'); assert.equal(w.stats.dpsPct, 8); assert.equal(w.evo.base, 'Runed Blade'); assert.equal(d.mats.sigil10, 0);
assert.equal(w.up, 0, 'prestige addendum: evolving resets to +0'); assert.equal(w.evo.tier, 1);
// staff gear refused; no weapon refused
await put({ gold: 1e9, heroes: [{ equip: { weapon: W({ id: 'gm-katana', gm: true }) } }] }); assert.match(await err(up()), /staff gear/);
await put({ gold: 1e9, heroes: [{ equip: { weapon: W({ id: 'x', gm: true }) } }] }); assert.match(await err(up()), /staff gear/);
await put({ gold: 1e9, heroes: [{ equip: {} }] }); assert.match(await err(up()), /equip a weapon/);
await put({ gold: 10, heroes: [{ equip: { weapon: W() } }] }); assert.match(await err(up()), /not enough gold/);
console.log('forge schema ok');

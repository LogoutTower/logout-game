// Forge prestige + transfer (schema-addendum-forge-prestige.sql), offline in PGlite, every addendum applied twice. Never the live DB.
import assert from 'node:assert'; import fs from 'node:fs';
import { upCost, transferCost, applyTransfer, evoTier } from '../js/forge.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, skipped'); process.exit(0); }
const { ADDENDA } = await import('./addenda.mjs'); assert.equal(ADDENDA.at(-1), 'schema-addendum-forge-prestige.sql');
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ADDENDA) await db.exec(rd(n)); for (const n of ADDENDA) await db.exec(rd(n));
await db.exec(`grant all on all tables in schema public to anon, authenticated;`);
assert(!/token|wallet|mint|solana|creator/i.test(rd('schema-addendum-forge-prestige.sql').replace(/--.*$/gm, '')), 'in-game only');
// parity
for (const f of [1, 7, 10, 23, 99]) for (let e = 0; e <= 4; e++) for (let t = 1; t <= 11; t++) { const c = upCost({ floor: f }, t, e), r = (await db.query(`select public.forge_gold3($1,$2,$3)::float8 g, public.forge_mats3($1,$2,$3) m`, [f, t, e])).rows[0];
  assert.equal(r.g, c.gold, `gold f${f} t${t} e${e}`); assert.deepEqual(r.m, c.mats, `mats f${f} t${t} e${e}`); }
const A = '00000000-0000-0000-0000-000000000001'; await db.exec(`insert into auth.users (id, is_anonymous) values ('${A}', false)`);
const put = d => db.query(`insert into public.saves (user_id, data) values ($1, $2) on conflict (user_id) do update set data = excluded.data`, [A, d]);
const get = async () => (await db.query(`select data from public.saves where user_id = $1`, [A])).rows[0].data;
const as = async (q, p) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${A}', false);`); try { return (await db.query(q, p)).rows[0]?.r; } finally { await db.exec('reset role'); } };
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const W = (o = {}) => ({ id: 'w1', slot: 'weapon', rarity: 'rare', floor: 3, name: 'Runed Blade', stats: { dps: 10 }, ...o });
const evo = () => as(`select public.forge_upgrade(true) r`), M = { sigil10: 99 };
// migration: old evolved (no tier) at +10 reads as Evo I and prestiges to Evo II (2nd sigil cost = 1)
await put({ gold: 1e12, mats: { ...M }, heroes: [{ equip: { weapon: W({ up: 10, name: 'Cinderborn Runed Blade', evo: { base: 'Runed Blade', pre: 'Cinderborn', hue: 18, text: 'x' }, stats: { dps: 10, dpsPct: 8 } }) } }] });
let r = await evo(); let w = (await get()).heroes[0].equip.weapon; assert.equal(w.evo.tier, 2); assert.equal(w.up, 0); assert.equal(w.name, 'Cinderborn Runed Blade II'); assert.equal(w.stats.dpsPct, 8, 'effect not stacked');
assert.match(await err(evo()), /reach \+10/);
for (const n of [3, 4, 5]) { const d = await get(); d.heroes[0].equip.weapon.up = 10; await put(d); await evo(); }
w = (await get()).heroes[0].equip.weapon; assert.equal(w.evo.tier, 5); assert.equal(w.name, 'Cinderborn Runed Blade V');
{ const d = await get(); d.heroes[0].equip.weapon.up = 10; await put(d); } assert.match(await err(evo()), /Evo V/);
assert.equal((await db.query(`select public.forge_dmg_mul($1) m`, [A])).rows[0].m, 1.9656, 'max multiplier');
// rarity gate
await put({ gold: 1e12, mats: { ...M }, heroes: [{ equip: { weapon: W({ up: 10, rarity: 'uncommon' }) } }] }); assert.match(await err(evo()), /Rare or better/);
// transfer: a move; target gets the higher tier; fee x1.5 per rarity step; parity with js
const src = W({ up: 7, rarity: 'rare', name: 'Cinderborn Runed Blade V', evo: { base: 'Runed Blade', pre: 'Cinderborn', hue: 18, text: 'x', tier: 5 }, stats: { dps: 10, dpsPct: 8 } });
const dst = { id: 'u1', slot: 'weapon', rarity: 'unique', floor: 14, name: 'Glass Fang', stats: { dps: 40 }, up: 6, evo: { base: 'Glass Fang', pre: 'Frostwoken', hue: 190, text: 'y', tier: 1 } };
const save0 = { gold: 1e12, mats: { shard: 9999, ess2: 9999 }, inv: [{ id: 'z', slot: 'armor' }, dst], heroes: [{ equip: { weapon: src } }] };
await put(save0); assert.match(await err(as(`select public.forge_transfer(1, 'nope') r`)), /pick a weapon/);
r = await as(`select public.forge_transfer(1, 'u1') r`); const d = await get(), js = structuredClone(save0); const c = transferCost(js.heroes[0].equip.weapon, js.inv[1]); applyTransfer(js, 1);
assert.equal(+r.price, c.gold); assert.deepEqual(r.cost, c.mats); assert.equal(c.gap, 3); assert.equal(c.mul, 3.375);
assert.equal(d.heroes[0].equip.weapon.evo.tier, 5); assert.equal(d.heroes[0].equip.weapon.name, 'Frostwoken Glass Fang V'); assert.equal(d.heroes[0].equip.weapon.up, 0);
assert(!d.inv[1].evo); assert.equal(d.inv[1].up, 0); assert.equal(d.inv[1].name, 'Runed Blade'); assert(!('dpsPct' in d.inv[1].stats), 'source effect removed');
assert.deepEqual(d.heroes[0].equip.weapon, js.heroes[0].equip.weapon); assert.deepEqual(d.inv[1], js.inv[1]); assert.equal(d.gold, js.gold);
const tiers = [d.heroes[0].equip.weapon, ...d.inv].map(x => evoTier(x)); assert.deepEqual(tiers.filter(Boolean), [5], 'no duplicated tier');
// lower rarity target refused; staff gear refused
await put({ ...save0, inv: [{ ...dst, rarity: 'uncommon', evo: undefined }] }); assert.match(await err(as(`select public.forge_transfer(0, 'u1') r`)), /Rare or better/);
await put({ ...save0, inv: [{ ...dst, id: 'gm-katana', gm: true }] }); assert.match(await err(as(`select public.forge_transfer(0, 'gm-katana') r`)), /pick a weapon/);
// damage ceiling: an upgraded weapon raises only its owner's ceiling
await put({ gold: 0, heroes: [{ equip: { weapon: W() } }] }); assert.equal((await db.query(`select public.forge_dmg_mul($1) m`, [A])).rows[0].m, 1);
console.log('forge prestige schema ok');

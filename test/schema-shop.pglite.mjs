// Late-game gold sinks + pets (schema-addendum-shop.sql), offline in PGlite with every addendum applied twice (idempotent).
import assert from 'node:assert'; import fs from 'node:fs';
import { SHOP, DECOR, memorialPrice, prestigePrice, petPerk, PETS, PET_RARITY } from '../js/prestige.js';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, shop test skipped'); process.exit(0); }
const { ADDENDA } = await import('./addenda.mjs');
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ADDENDA) await db.exec(rd(n)); for (const n of ADDENDA) await db.exec(rd(n));
await db.exec(`grant all on all tables in schema public to anon, authenticated; grant usage, select on all sequences in schema public to anon, authenticated;`);
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, A = U(1), B = U(2), C = U(3), GM = U(9);
await db.exec(`insert into auth.users (id, is_anonymous) values ('${A}', false), ('${B}', false), ('${C}', false), ('${GM}', false); update public.profiles set role = 'gm' where id = '${GM}'`);
const gold = (u, g) => db.exec(`insert into public.saves (user_id, data) values ('${u}', '{"gold": ${g}, "heroes": [{"name": "Old"}]}') on conflict (user_id) do update set data = jsonb_set(saves.data, '{gold}', '${g}')`);
const goldOf = async u => Number((await db.query(`select data->>'gold' g from public.saves where user_id = $1`, [u])).rows[0].g);
const as = async (uid, q, p) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return (await db.query(q, p)).rows[0]?.r; } finally { await db.exec('reset role'); } };
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const floor = (f, hp = 1000) => db.exec(`update public.floor_state set floor = ${f}, hp = ${hp}, max_floor = 20`);
// ---- catalog parity with js/prestige.js
const cat = (await db.query(`select id, kind, arc, price::float8 price, step::float8 step from public.shop_items() order by id`)).rows;
assert.deepEqual(cat, SHOP.map(i => ({ id: i.id, kind: i.kind, arc: i.arc, price: i.price, step: i.step || 1 })).sort((a, b) => a.id < b.id ? -1 : 1), 'shop catalog matches the client');
assert.deepEqual((await db.query(`select id, price::float8 price from public.decor_items() order by id`)).rows, DECOR.map(d => ({ id: d.id, price: d.price })).sort((a, b) => a.id < b.id ? -1 : 1));
for (const f of [1, 10, 11, 20]) assert.equal(Number((await db.query(`select public.memorial_price($1) p`, [f])).rows[0].p), memorialPrice(f));
for (const p of PETS) for (const r of PET_RARITY) assert.equal(Number((await db.query(`select public.pet_perk_v($1, $2) v`, [p.perk, r])).rows[0].v), petPerk(p.sp, r).v, `${p.sp} ${r}`);
assert(!/equinox/i.test(rd('schema-addendum-shop.sql').replace(/--.*$/gm, '')), 'the staff pet is never granted or sold by the server');
// ---- gold is the saved game's; gating by arc
await floor(5); await gold(A, 1e8);
assert.match(await err(as(A, `select public.shop_buy('tr-arc1')`)), /not fallen/);
assert.match(await err(as(A, `select public.shop_buy('sk-clockfrost')`)), /reach this arc/);
let r = await as(A, `select public.shop_buy('sk-stonekeep') r`); assert.equal(r.price, 5e6); assert.equal(await goldOf(A), 95e6);
assert.match(await err(as(A, `select public.shop_buy('sk-stonekeep')`)), /already owned/);
await floor(10, 0); await as(A, `select public.shop_buy('tr-arc1') r`);
await gold(B, 1000); assert.match(await err(as(B, `select public.shop_buy('tok-rename')`)), /not enough gold/); assert.equal(await goldOf(B), 1000, 'nothing taken on a refusal');
// ---- prestige: global climbing price
await gold(B, 1e9); const p0 = (await as(A, `select public.shop_state() r`)).prices['pt-patron']; assert.equal(Number(p0), 2e6);
await as(A, `select public.shop_buy('pt-patron') r`); r = await as(B, `select public.shop_buy('pt-patron') r`); assert.equal(Number(r.price), prestigePrice(SHOP.find(i => i.id === 'pt-patron'), 1));
assert.equal(Number((await as(C, `select public.shop_state() r`)).prices['pt-patron']), prestigePrice(SHOP.find(i => i.id === 'pt-patron'), 2), 'everyone sees the next price');
// ---- tokens
await as(A, `select public.shop_buy('tok-rename')`); await as(A, `select public.shop_buy('tok-reroll')`);
for (const bad of ['x', 'see www.evil.io', 'Tower Staff', 'Umbra Fan', 'shithead']) assert.match(await err(as(A, `select public.token_use('tok-rename', $1)`, [bad])), /not allowed/, bad);
await as(A, `select public.token_use('tok-rename', 'Brave Kit')`); assert.equal((await db.query(`select data->'heroes'->0->>'name' n from public.saves where user_id = $1`, [A])).rows[0].n, 'Brave Kit');
assert.match(await err(as(A, `select public.token_use('tok-rename', 'Again')`)), /no token/);
assert.equal((await as(A, `select public.token_use('tok-reroll') r`)).kind, 'tok-reroll');
// ---- memorials
await floor(12);
assert.match(await err(as(A, `select public.memorial_carve(13, 'Brave Kit')`)), /not been reached/);
assert.match(await err(as(A, `select public.memorial_carve(3, 'fuck')`)), /not allowed/);
r = await as(A, `select public.memorial_carve(3, 'Brave Kit') r`); assert.equal(r.name, 'Brave Kit');
assert.match(await err(as(A, `select public.memorial_carve(3, 'Other')`)), /already on this wall/);
for (let i = 0; i < 14; i++) { const u = U(100 + i); await db.exec(`insert into auth.users (id) values ('${u}')`); await gold(u, 1e6); await as(u, `select public.memorial_carve(3, $1)`, [`Carver ${i}`]); await db.exec(`update public.memorials set at = at - interval '1 minute'`); }
const wall = await as(A, `select public.memorial_wall(3) r`); assert.equal(wall.length, 12, 'capped list'); assert.equal(wall[0], 'Carver 13', 'newest first');
const sn = (await db.query(`select public.snapshot() r`)).rows[0].r; assert.equal(sn.mw['3'].length, 12, 'walls ride in the snapshot');
// ---- pets: eggs, equip, unique fallback, no staff pet, clear drops skip staff
r = await as(A, `select public.shop_buy('egg-arc2') r`); assert(PET_RARITY.includes(r.pet.rarity) && PETS.some(p => p.sp === r.pet.sp)); assert.equal(Number(r.pet.perk.v), petPerk(r.pet.sp, r.pet.rarity).v);
await as(A, `select public.pet_equip($1)`, [r.pet.id]); assert.equal(Number((await as(A, `select public.shop_state() r`)).active), Number(r.pet.id));
const bp = await as(B, `select public.shop_buy('egg-arc1') r`); assert.match(await err(as(A, `select public.pet_equip($1)`, [bp.pet.id])), /not your pet/);
const counts = {}; for (let i = 0; i < 400; i++) { const p = (await db.query(`select public.pet_grant($1, 2, 'test') r`, [C])).rows[0].r; counts[p.rarity] = (counts[p.rarity] || 0) + 1; }
assert((await db.query(`select count(*)::int c from public.pets where uname is not null`)).rows[0].c <= 8, 'uniques are one of a kind'); assert(counts.common > counts.epic);
assert.equal((await db.query(`select count(*)::int c from public.pets where sp = 'equinox'`)).rows[0].c, 0);
assert.match(await err(as(A, `select public.pet_grant($1, 2, 'x')`, [A])), /permission denied/, 'clients cannot grant pets');
// ---- guild decor: officers/leader, bank-funded; staff guild pays from own gold
await as(A, `select public.guild_create('Decor Guild', 'DG')`); await as(C, `select public.guild_join('DG')`);
assert.match(await err(as(C, `select public.guild_decor_buy('dc-trophy')`)), /leader or officers/);
assert.match(await err(as(A, `select public.guild_decor_buy('dc-throne')`)), /bank needs/);
await db.exec(`update public.guilds set bank = 2000000 where tag = 'DG'`); r = await as(A, `select public.guild_decor_buy('dc-throne') r`); assert.equal(Number(r.bank), 500000);
assert.deepEqual(await as(C, `select public.guild_decor_list() r`), ['dc-throne']); assert.match(await err(as(A, `select public.guild_decor_buy('dc-throne')`)), /already has/);
await gold(GM, 1e6); await as(GM, `select public.guild_create('Floor Zero', 'ZERO')`); const g0 = await goldOf(GM);
await as(GM, `select public.guild_decor_buy('dc-banners')`); assert.equal(await goldOf(GM), g0 - 400000, 'staff guild decor is paid by the buyer');
console.log('shop + pets pglite tests passed');

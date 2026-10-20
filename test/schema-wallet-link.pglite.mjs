// Wallet link (schema-addendum-wallet-link.sql), offline in PGlite with every addendum applied twice. Never the live DB.
import assert from 'node:assert'; import fs from 'node:fs';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, wallet link test skipped'); process.exit(0); }
const { ADDENDA } = await import('./addenda.mjs'); assert(ADDENDA.includes('schema-addendum-wallet-link.sql'));
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, is_anonymous boolean default true, email text);
  create table auth.identities (id bigserial primary key, user_id uuid references auth.users on delete cascade, provider text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const rd = n => fs.readFileSync(new URL('../supabase/' + n, import.meta.url), 'utf8');
for (const n of ADDENDA) await db.exec(rd(n)); for (const n of ADDENDA) await db.exec(rd(n));
await db.exec(`grant all on all tables in schema public to anon, authenticated; grant usage, select on all sequences in schema public to anon, authenticated;`);
const U = i => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, OLD = U(1), W = U(2), W2 = U(3), OTHER = U(4);
await db.exec(`insert into auth.users (id) values ('${OLD}'), ('${W}'), ('${W2}'), ('${OTHER}');
  insert into auth.identities (user_id, provider) values ('${W}', 'web3'), ('${W2}', 'web3');
  update public.profiles set role = 'gm', display_name = 'Hero' where id = '${OLD}';
  insert into public.saves (user_id, data) values ('${OLD}', '{"gold": 24900000}');
  insert into public.damage (user_id, floor, name, damage) values ('${OLD}', 3, 'Hero', 500), ('${W}', 3, 'fresh', 1);
  insert into public.shop_owned (user_id, item) values ('${OLD}', 'x');`);
const as = async (uid, q, p) => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return (await db.query(q, p)).rows[0]?.r; } finally { await db.exec('reset role'); } };
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
const one = async (q, p) => (await db.query(q, p)).rows[0];
assert.match(await err(as(OLD, `select public.wallet_is_web3('${W}') r`)), /permission denied/);
assert.equal((await db.query(`select 1 from public.wallet_link_codes`)).rows.length, 0);
const code = await as(OLD, `select public.wallet_link_issue() r`); assert.match(code, /^[0-9a-f]{64}$/);
assert.equal((await one(`select count(*)::int n from public.wallet_link_codes where code_hash = $1`, [code])).n, 0, 'only the hash is stored');
assert.match(await err(as(OTHER, `select public.wallet_link_claim($1) r`, [code])), /wallet session/, 'non-wallet sessions cannot claim');
assert.match(await err(as(W, `select public.wallet_link_claim($1) r`, ['nope'])), /invalid or expired/);
const r = await as(W, `select public.wallet_link_claim($1) r`, [code]); assert.equal(r.moved, true);
assert.equal((await one(`select role, display_name from public.profiles where id = $1`, [W])).role, 'gm', 'role moves');
assert.equal((await one(`select data->>'gold' g from public.saves where user_id = $1`, [W])).g, '24900000', 'save moves');
assert.equal((await one(`select damage::int d from public.damage where user_id = $1 and floor = 3`, [W])).d, 500, 'old rows replace the fresh wallet rows');
assert.equal((await one(`select count(*)::int n from public.shop_owned where user_id = $1`, [W])).n, 1);
for (const t of ['profiles where id', 'saves where user_id', 'damage where user_id']) assert.equal((await one(`select count(*)::int n from public.${t} = $1`, [OLD])).n, 0, `old ${t} emptied`);
assert.match(await err(as(W, `select public.wallet_link_claim($1) r`, [code])), /invalid or expired/, 'one-time');
assert.match(await err(as(W, `select public.wallet_link_issue() r`)), /already signs in with a wallet/);
// a wallet that already owns an account is never overwritten (device 2 just signs in)
await db.exec(`insert into public.profiles (id) values ('${OTHER}') on conflict do nothing; insert into public.saves (user_id, data) values ('${OTHER}', '{"gold": 5}')`);
const c2 = await as(OTHER, `select public.wallet_link_issue() r`); assert.equal((await as(W, `select public.wallet_link_claim($1) r`, [c2])).reason, 'existing');
assert.equal((await one(`select data->>'gold' g from public.saves where user_id = $1`, [W])).g, '24900000');
assert.equal((await one(`select data->>'gold' g from public.saves where user_id = $1`, [OTHER])).g, '5');
// expiry
const c3 = await as(OTHER, `select public.wallet_link_issue() r`); await db.exec(`update public.wallet_link_codes set expires_at = now() - interval '1 second'`);
assert.match(await err(as(W2, `select public.wallet_link_claim($1) r`, [c3])), /invalid or expired/);
console.log('wallet link pglite: code issue/claim, save+role move, existing wallet untouched, one-time + expiry: ok');

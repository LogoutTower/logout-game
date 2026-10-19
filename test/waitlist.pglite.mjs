// Runs supabase/waitlist.sql against an in-process Postgres (PGlite) and checks the RPC + lockdown. Run: node test/waitlist.pglite.mjs
import assert from 'node:assert';
import fs from 'node:fs';
let PGlite; try { ({ PGlite } = await import('@electric-sql/pglite')); } catch { console.log('pglite not installed, waitlist test skipped'); process.exit(0); }
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;`);
const sql = fs.readFileSync(new URL('../supabase/waitlist.sql', import.meta.url), 'utf8');
await db.exec(`alter default privileges in schema public grant all on tables to anon, authenticated; alter default privileges in schema public grant all on sequences to anon, authenticated;`); // mimic Supabase's default grants
await db.exec(sql); await db.exec(sql); // idempotent
const as = async (role, q, params) => { await db.exec(`set role ${role}`); try { return await db.query(q, params); } finally { await db.exec('reset role'); } };
const fails = async (p, re, msg) => { let err; try { await p; } catch (e) { err = e; } assert(err, msg); if (re) assert.match(err.message, re, msg); };
const count = async () => (await db.query(`select count(*)::int n from public.waitlist`)).rows[0].n;
// insert works, lowercased + trimmed
assert.equal((await as('anon', `select public.join_waitlist($1, '') r`, ['  Player.One@Example.COM '])).rows[0].r, 'ok');
assert.equal((await db.query(`select email from public.waitlist`)).rows[0].email, 'player.one@example.com');
// duplicate (any case) ignored silently
assert.equal((await as('anon', `select public.join_waitlist($1, '') r`, ['PLAYER.ONE@example.com'])).rows[0].r, 'ok');
assert.equal(await count(), 1, 'duplicate ignored');
// honeypot ignored silently
assert.equal((await as('anon', `select public.join_waitlist($1, $2) r`, ['bot@spam.io', 'http://x'])).rows[0].r, 'ok');
assert.equal(await count(), 1, 'honeypot stored nothing');
// default honeypot arg + authenticated role
assert.equal((await as('authenticated', `select public.join_waitlist($1) r`, ['b@site.org'])).rows[0].r, 'ok');
assert.equal(await count(), 2);
// invalid formats + length
for (const bad of ['', 'nope', 'a@b', 'a@b.c', 'two@@x.com', 'sp ace@x.com', 'x@-bad.com', 'a'.repeat(250) + '@x.com', "x@y.com'; drop table public.waitlist;--"])
  await fails(as('anon', `select public.join_waitlist($1, '')`, [bad]), /invalid_email/, `rejects ${bad.slice(0, 30)}`);
assert.equal(await count(), 2);
// anon/authenticated can't read, insert, update or delete directly
for (const role of ['anon', 'authenticated']) {
  await fails(as(role, `select * from public.waitlist`), /permission denied/, `${role} cannot select`);
  await fails(as(role, `insert into public.waitlist (email) values ('direct@x.com')`), /permission denied/, `${role} cannot insert directly`);
  await fails(as(role, `delete from public.waitlist`), /permission denied/, `${role} cannot delete`);
}
// global throttle: >30 in the last minute
for (let i = 0; i < 28; i++) await as('anon', `select public.join_waitlist($1, '')`, [`p${i}@flood.net`]);
assert.equal(await count(), 30);
await fails(as('anon', `select public.join_waitlist($1, '')`, ['late@flood.net']), /slow_down/, 'throttled');
await db.exec(`update public.waitlist set created_at = now() - interval '2 minutes'`);
assert.equal((await as('anon', `select public.join_waitlist($1, '') r`, ['late@flood.net'])).rows[0].r, 'ok', 'throttle clears after a minute');
// public count: anon/authenticated get a bare bigint, no emails; also runs on its own (waitlist-count.sql)
await db.exec(fs.readFileSync(new URL('../supabase/waitlist-count.sql', import.meta.url), 'utf8'));
for (const role of ['anon', 'authenticated']) { const r = await as(role, `select public.waitlist_count() n`); assert.equal(Number(r.rows[0].n), await count(), `${role} sees the count`); assert.deepEqual(r.fields.map(f => f.name), ['n']); assert.ok(!/@/.test(JSON.stringify(r.rows)), 'no email leaks'); }
assert.equal((await as('anon', `select pg_typeof(public.waitlist_count())::text t`)).rows[0].t, 'bigint');
await as('anon', `select public.join_waitlist($1, '')`, ['count.me@example.org']); assert.equal(Number((await as('anon', `select public.waitlist_count() n`)).rows[0].n), await count(), 'count follows signups');
await db.exec(`truncate public.waitlist`); assert.equal(Number((await as('anon', `select public.waitlist_count() n`)).rows[0].n), 0, 'empty list counts 0');
// welcome bookkeeping (supabase/waitlist-welcome.sql): claim once, release on failure, mark on success; service role only
await db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if; end $$; grant usage on schema public to service_role;`);
{ const w = fs.readFileSync(new URL('../supabase/waitlist-welcome.sql', import.meta.url), 'utf8'); await db.exec(w); await db.exec(w); }
await as('anon', `select public.join_waitlist($1, '')`, ['welcome.me@example.org']); const wid = (await db.query(`select id from public.waitlist where email = 'welcome.me@example.org'`)).rows[0].id;
const claim = async () => (await as('service_role', `select public.waitlist_claim_welcome($1) e`, [wid])).rows[0].e;
assert.equal(await claim(), 'welcome.me@example.org'); assert.equal(await claim(), null, 'in flight: no second claim');
await as('service_role', `select public.waitlist_mark_welcome($1, false)`, [wid]); assert.equal(await claim(), 'welcome.me@example.org', 'released after a failed send');
await as('service_role', `select public.waitlist_mark_welcome($1, true)`, [wid]); assert.ok((await db.query(`select welcomed_at from public.waitlist where id = $1`, [wid])).rows[0].welcomed_at, 'welcomed_at set');
await db.exec(`update public.waitlist set welcome_claimed_at = now() - interval '1 hour' where id = ${Number(wid)}`); assert.equal(await claim(), null, 'never again once welcomed');
for (const role of ['anon', 'authenticated']) await fails(as(role, `select public.waitlist_claim_welcome($1)`, [wid]), /permission denied/, `${role} cannot claim`);
console.log('waitlist (pglite) tests passed');

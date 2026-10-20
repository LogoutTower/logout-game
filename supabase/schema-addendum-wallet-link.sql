-- Wallet link: attach a Phantom (Solana, message signature only) sign-in to an EXISTING account. Idempotent.
-- supabase-js has no linkIdentity for web3, so signInWithWeb3 always lands on the wallet's own auth user. Flow:
--   1. old session (guest/email, holds the save + role) calls wallet_link_issue() -> one-time code (10 min, only its sha256 stored)
--   2. the client signs in with the wallet (signInWithWeb3) and, as the wallet user, calls wallet_link_claim(code)
--   3. if the wallet user is fresh (no save, not staff, never linked) every public row of the old account moves onto it
--      (save, profile/role, guild, damage, quests, shop, pets...). The wallet is now the durable sign-in; any device signs in with it.
--      If the wallet already has an account, nothing moves and the client just loads that account (device 2).
-- Never transactions, keys or funds. Free tier.
create table if not exists public.wallet_link_codes (code_hash text primary key, user_id uuid not null references auth.users on delete cascade,
  expires_at timestamptz not null, used_at timestamptz);
create table if not exists public.wallet_links (wallet_user uuid primary key, from_user uuid not null, at timestamptz not null default now());
alter table public.wallet_link_codes enable row level security; alter table public.wallet_links enable row level security; -- no policies: RPC only

create or replace function public.wallet_is_web3(u uuid) returns boolean language plpgsql stable security definer set search_path = public, auth as $$
begin return exists (select 1 from auth.identities i where i.user_id = u and i.provider = 'web3'); end $$;
revoke all on function public.wallet_is_web3(uuid) from public, anon, authenticated;

create or replace function public.wallet_link_issue() returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text;
begin
  if me is null then raise exception 'sign in first'; end if;
  if public.wallet_is_web3(me) then raise exception 'this account already signs in with a wallet'; end if;
  delete from public.wallet_link_codes where user_id = me or expires_at < now() - interval '1 day';
  c := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.wallet_link_codes (code_hash, user_id, expires_at) values (encode(sha256(convert_to(c, 'UTF8')), 'hex'), me, now() + interval '10 minutes');
  return c;
end $$;

create or replace function public.wallet_link_claim(p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); src uuid; r record; dt "char";
begin
  if me is null then raise exception 'sign in first'; end if;
  if not public.wallet_is_web3(me) then raise exception 'claim from a wallet session'; end if;
  update public.wallet_link_codes set used_at = now() where code_hash = encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex') and used_at is null and expires_at > now()
    returning user_id into src;
  if src is null then raise exception 'link code invalid or expired'; end if;
  if src = me then return jsonb_build_object('moved', false, 'reason', 'same'); end if;
  -- the wallet already owns an account (device 2, or linked before): never overwrite it, just sign in
  if exists (select 1 from public.wallet_links where wallet_user = me) or exists (select 1 from public.saves where user_id = me)
     or exists (select 1 from public.profiles where id = me and role <> 'player') then
    return jsonb_build_object('moved', false, 'reason', 'existing');
  end if;
  perform pg_advisory_xact_lock(hashtext('wallet_link:' || src::text));
  -- every public column with a foreign key to auth.users: clear the fresh wallet user's rows, then move the old account's onto it
  for r in select c.conrelid::regclass t, a.attname col, c.confdeltype d from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and array_length(c.conkey, 1) = 1 and c.connamespace = 'public'::regnamespace loop
    if r.d = 'c' then execute format('delete from %s where %I = $1', r.t, r.col) using me;
    else execute format('update %s set %I = null where %I = $1', r.t, r.col, r.col) using me; end if;
  end loop;
  for r in select c.conrelid::regclass t, a.attname col from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and array_length(c.conkey, 1) = 1 and c.connamespace = 'public'::regnamespace
        and c.conrelid <> 'public.wallet_link_codes'::regclass loop
    execute format('update %s set %I = $1 where %I = $2', r.t, r.col, r.col) using me, src;
  end loop;
  delete from public.wallet_link_codes where user_id = src;
  insert into public.wallet_links (wallet_user, from_user) values (me, src);
  return jsonb_build_object('moved', true);
end $$;
revoke all on function public.wallet_link_issue() from public, anon; revoke all on function public.wallet_link_claim(text) from public, anon;
grant execute on function public.wallet_link_issue() to authenticated; grant execute on function public.wallet_link_claim(text) to authenticated;

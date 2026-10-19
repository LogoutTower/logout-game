-- $LOGOUT landing page waitlist. Idempotent: safe to run more than once.
-- Signups go only through public.join_waitlist(email, honeypot); nobody (anon or authenticated) can read or write the table directly.
create table if not exists public.waitlist (
  id bigserial primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists waitlist_created_at_idx on public.waitlist (created_at);
alter table public.waitlist enable row level security;   -- no policies: RLS denies everything that isn't the security-definer RPC
revoke all on table public.waitlist from public, anon, authenticated;
revoke all on sequence public.waitlist_id_seq from public, anon, authenticated;

-- Returns 'ok' for a new email, a duplicate, or a honeypot hit (so callers learn nothing about who signed up).
-- Raises 'invalid_email' for a bad address and 'slow_down' when more than 30 signups landed in the last minute (global throttle).
create or replace function public.join_waitlist(p_email text, p_hp text default '')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
begin
  if coalesce(p_hp, '') <> '' then
    return 'ok';                                         -- bot filled the hidden field: pretend success, store nothing
  end if;
  if length(e) < 6 or length(e) > 254
     or e !~ '^[a-z0-9._%+''-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,24}$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if (select count(*) from public.waitlist where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'slow_down' using errcode = 'P0001';
  end if;
  insert into public.waitlist (email) values (e) on conflict (email) do nothing;
  return 'ok';
end;
$$;

revoke all on function public.join_waitlist(text, text) from public;
grant execute on function public.join_waitlist(text, text) to anon, authenticated;

-- Staff read-back (SQL editor / service role only):  select email, created_at from public.waitlist order by created_at desc;

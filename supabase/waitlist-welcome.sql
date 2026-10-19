-- $LOGOUT waitlist welcome email bookkeeping. Idempotent: safe to run more than once (after supabase/waitlist.sql).
-- The Edge Function supabase/functions/waitlist-welcome claims a row before sending and marks it after Brevo accepts the mail,
-- so a retried or duplicated Database Webhook never sends twice. Only the service role (the function) can call these.
alter table public.waitlist add column if not exists welcomed_at timestamptz;
alter table public.waitlist add column if not exists welcome_claimed_at timestamptz;

-- Claim: returns the email only if no welcome was sent yet and no other send is in flight (a stale claim, >10 min, can be retaken).
create or replace function public.waitlist_claim_welcome(p_id bigint)
returns text
language sql
security definer
set search_path = public
as $$
  update public.waitlist set welcome_claimed_at = now()
   where id = p_id and welcomed_at is null
     and (welcome_claimed_at is null or welcome_claimed_at < now() - interval '10 minutes')
  returning email
$$;

-- Mark sent (after Brevo returned 2xx) or release the claim (send failed, so a later retry may try again).
create or replace function public.waitlist_mark_welcome(p_id bigint, p_sent boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.waitlist
     set welcomed_at = case when p_sent then now() else welcomed_at end,
         welcome_claimed_at = case when p_sent then welcome_claimed_at else null end
   where id = p_id
$$;

revoke all on function public.waitlist_claim_welcome(bigint) from public, anon, authenticated;
revoke all on function public.waitlist_mark_welcome(bigint, boolean) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.waitlist_claim_welcome(bigint) to service_role;
    grant execute on function public.waitlist_mark_welcome(bigint, boolean) to service_role;
  end if;
end $$;

-- Public waitlist count for /landing/ ("N registered."). Count only: no emails, ids or timestamps leave the table.
-- Idempotent; safe to run on its own after supabase/waitlist.sql (it is also included at the end of that file).
create or replace function public.waitlist_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$ select count(*) from public.waitlist $$;

revoke all on function public.waitlist_count() from public;
grant execute on function public.waitlist_count() to anon, authenticated;

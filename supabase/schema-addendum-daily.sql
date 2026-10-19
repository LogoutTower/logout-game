-- $LOGOUT addendum: DAILY LOGIN STREAK. Idempotent: safe to run more than once. Run after schema-addendum-caps.sql.
-- One claim per account per UTC day (00:00 UTC = 7 PM CDT / 6 PM CST). The server's clock decides; the client never sends a date.
-- Streak: 1..7 then back to 1. ONE streak save per calendar month (UTC): the first single missed day in a month is forgiven
-- automatically; another miss that month, or two+ days missed in a row, restarts at day 1.
-- Claimed inside tick() (the call the client already makes every flush), so it costs no extra request. Staff claims like anyone.
-- The reward contents per day live in js/daily.js (gold, tonics, banked XP that respects the caps, a day-7 chest; never staff items or tokens).
create table if not exists public.daily_claims (user_id uuid primary key references auth.users on delete cascade, streak int not null default 0,
  last_day date, total int not null default 0);
alter table public.daily_claims add column if not exists save_month date; -- month (1st) whose streak save was used
alter table public.daily_claims enable row level security; -- no policies: definer functions only

create or replace function public.daily_claim(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'utc')::date; m date := date_trunc('month', (now() at time zone 'utc'))::date; c public.daily_claims; st int; saved boolean := false;
begin
  insert into public.daily_claims (user_id) values (p_uid) on conflict do nothing;
  select * into c from public.daily_claims where user_id = p_uid for update;
  if c.last_day is not null and c.last_day >= today then return null; end if;            -- already claimed today
  if c.last_day = today - 1 then st := c.streak % 7 + 1;
  elsif c.last_day = today - 2 and c.save_month is distinct from m then st := c.streak % 7 + 1; saved := true; -- monthly streak save
  else st := 1; end if;
  update public.daily_claims set streak = st, last_day = today, total = total + 1, save_month = case when saved then m else save_month end where user_id = p_uid;
  return jsonb_build_object('d', st, 'n', c.total + 1, 'day', today, 'sv', saved);
end $$;
revoke all on function public.daily_claim(uuid) from public, anon, authenticated;
-- Read-only status for the calendar (no claim): streak, last claimed day, and whether today is still open.
create or replace function public.daily_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('streak', coalesce(c.streak, 0), 'last', c.last_day, 'open', c.last_day is null or c.last_day < (now() at time zone 'utc')::date,
    'saves', case when c.save_month is not distinct from date_trunc('month', (now() at time zone 'utc'))::date then 0 else 1 end)
  from (select 1) x left join public.daily_claims c on c.user_id = auth.uid() $$;
grant execute on function public.daily_status() to authenticated;

create or replace function public.tick(p_amount bigint, p_name text, p_level int, p_gear int, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s jsonb; r jsonb; gid bigint; dl jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  s := public.submit_damage(p_amount, p_name, p_level, p_gear);
  select guild_id into gid from public.guild_members where user_id = uid;
  dl := public.daily_claim(uid); -- first tick of the UTC day claims the login reward (null otherwise)
  r := jsonb_strip_nulls(jsonb_build_object('f', s->'floor', 'hp', s->'hp', 'mx', s->'max_hp', 'a', s->'accepted',
    'gm', s->'gm_present_until', 'an', nullif(s->'gm_announce', 'null'::jsonb), 'mk', nullif(s->'gm_marks', '{}'::jsonb),
    'cl', nullif((select coalesce(jsonb_agg(jsonb_build_array(c.id, c.floor, c.max_hp, coalesce(array_position(c.ranking, left(p_name, 20)), 0), coalesce((c.dmg->>left(p_name, 20))::bigint, 0)) order by c.id), '[]')
                  from (select * from public.floor_clears where id > coalesce(p_after, 0) order by id limit 20) c), '[]'::jsonb),
    'cv', (select max(id) from public.chat_messages where floor = (s->>'floor')::int),
    'dl', dl, 'gv', case when gid is null then null else (select max(id) from public.guild_messages where guild_id = gid) end));
  insert into public.egress_stats as e (day, calls, bytes) values (current_date, 1, octet_length(r::text) + 600)
    on conflict (day) do update set calls = e.calls + 1, bytes = e.bytes + excluded.bytes;
  return r;
end $$;
revoke all on function public.tick(bigint, text, int, int, bigint) from public, anon;
grant execute on function public.tick(bigint, text, int, int, bigint) to authenticated;

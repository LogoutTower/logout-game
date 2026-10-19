-- $LOGOUT addendum: EGRESS DIET + early warning. Idempotent: safe to run more than once. Run after schema-addendum-open-chat.sql.
-- 1) tick(): ONE compact call per flush = submit_damage + floor state + my new clears + latest chat ids (badge dots), short keys.
-- 2) snapshot(): the public board (top 25 + guild tags + recent clears + waitlist count + egress pace) for the GitHub Action
--    that publishes it as a static JSON (served by GitHub, not billed to Supabase). Anon may call it: public data only.
-- 3) egress_stats + egress_estimate(): a cheap counter of tick calls/bytes per day, and the monthly pace vs the 5 GB free quota.
create table if not exists public.egress_stats (day date primary key, calls bigint not null default 0, bytes bigint not null default 0);
alter table public.egress_stats enable row level security; -- no policies: only the definer functions below touch it

create or replace function public.tick(p_amount bigint, p_name text, p_level int, p_gear int, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s jsonb; r jsonb; gid bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  s := public.submit_damage(p_amount, p_name, p_level, p_gear);
  select guild_id into gid from public.guild_members where user_id = uid;
  r := jsonb_strip_nulls(jsonb_build_object('f', s->'floor', 'hp', s->'hp', 'mx', s->'max_hp', 'a', s->'accepted',
    'gm', s->'gm_present_until', 'an', nullif(s->'gm_announce', 'null'::jsonb), 'mk', nullif(s->'gm_marks', '{}'::jsonb),
    'cl', nullif((select coalesce(jsonb_agg(jsonb_build_array(c.id, c.floor, c.max_hp, coalesce(array_position(c.ranking, left(p_name, 20)), 0), coalesce((c.dmg->>left(p_name, 20))::bigint, 0)) order by c.id), '[]')
                  from (select * from public.floor_clears where id > coalesce(p_after, 0) order by id limit 20) c), '[]'::jsonb),
    'cv', (select max(id) from public.chat_messages where floor = (s->>'floor')::int),
    'gv', case when gid is null then null else (select max(id) from public.guild_messages where guild_id = gid) end));
  insert into public.egress_stats as e (day, calls, bytes) values (current_date, 1, octet_length(r::text) + 600)
    on conflict (day) do update set calls = e.calls + 1, bytes = e.bytes + excluded.bytes;
  return r;
end $$;
revoke all on function public.tick(bigint, text, int, int, bigint) from public, anon;
grant execute on function public.tick(bigint, text, int, int, bigint) to authenticated;

-- Monthly pace. tick() is ~33% of a player's bytes in the egress model (the rest: page loads, save pushes, guild panel, open chat), hence /0.33.
create or replace function public.egress_estimate() returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (select coalesce(sum(bytes), 0)::double precision b, greatest(count(*), 1) n from public.egress_stats where day > current_date - 7 and day < current_date),
       t as (select coalesce((select bytes from public.egress_stats where day = current_date), 0)::double precision b)
  select jsonb_build_object('day_gb', round(((select b / n from d) / 0.33 / 1e9)::numeric, 3), 'today_gb', round(((select b from t) / 0.33 / 1e9)::numeric, 3),
    'month_pace_gb', round(((select b / n from d) / 0.33 * 30 / 1e9)::numeric, 2), 'quota_gb', 5,
    'warn', (select b / n from d) / 0.33 * 30 > 0.8 * 5e9) $$;

create or replace function public.snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  with fs as (select floor from public.floor_state where id = 1),
       top as (select d.name, d.damage, d.is_staff, d.user_id from public.damage d, fs where d.floor = fs.floor order by d.damage desc limit 25)
  select jsonb_build_object('v', 1, 'at', now(), 'f', (select floor from fs),
    'lb', (select coalesce(jsonb_agg(jsonb_build_array(t.name, t.damage, t.is_staff) order by t.damage desc), '[]') from top t),
    'tg', (select coalesce(jsonb_object_agg(t.name, jsonb_build_array(g.tag, g.banner, g.is_staff)), '{}') from top t join public.guild_members m on m.user_id = t.user_id join public.guilds g on g.id = m.guild_id where not t.is_staff),
    'h', (select coalesce(jsonb_agg(jsonb_build_array(x.floor, x.at, x.ranking[1]) order by x.id desc), '[]') from (select id, floor, at, ranking from public.floor_clears order by id desc limit 120) x),
    'wl', (select public.waitlist_count()), 'eg', public.egress_estimate()) $$;
grant execute on function public.snapshot(), public.egress_estimate() to anon, authenticated;

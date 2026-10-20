-- $LOGOUT addendum: RESET EPOCH. Idempotent: safe to run more than once. Run after schema-addendum-gm-softener-prelaunch.sql.
-- admin-reset-tower.sql bumps tower_config.reset_epoch and sets reset_at. Every tick() returns 'ep': [reset_epoch, reset_at ms] (null before
-- any reset), so clients learn about a reset with no extra polling. A player client whose stored epoch is older, and whose save was created
-- before reset_at, discards its local save and starts fresh (js/supabase.js resetCheck). The staff save is always kept.
-- Server side, a non-staff save upload whose data.createdAt is older than reset_at (or missing) is silently dropped, so a stale browser can't
-- push old progress back up before it has seen the new epoch.
alter table public.tower_config add column if not exists reset_epoch int not null default 0;
alter table public.tower_config add column if not exists reset_at timestamptz;
create or replace function public.reset_info() returns jsonb language sql stable security definer set search_path = public as $$
  select case when c.reset_at is null then null else jsonb_build_array(c.reset_epoch, floor(extract(epoch from c.reset_at) * 1000)::bigint) end
  from public.tower_config c where c.id = 1 $$;
create or replace function public.saves_epoch_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare ra timestamptz := (select reset_at from public.tower_config where id = 1);
begin
  if ra is null or exists (select 1 from public.profiles where id = new.user_id and role = 'gm') then return new; end if;
  if coalesce(case when jsonb_typeof(new.data->'createdAt') = 'number' then (new.data->>'createdAt')::float8 end, 0) < extract(epoch from ra) * 1000 then
    return null; end if; -- a save from before the reset: dropped
  return new;
end $$;
drop trigger if exists saves_epoch_guard on public.saves;
create trigger saves_epoch_guard before insert or update on public.saves for each row execute function public.saves_epoch_guard();
revoke all on function public.reset_info(), public.saves_epoch_guard() from public, anon, authenticated;

-- tick(): same as schema-addendum-quests-profile.sql plus 'ep'.
create or replace function public.tick(p_amount bigint, p_name text, p_level int, p_gear int, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s jsonb; r jsonb; gid bigint; dl jsonb; q public.quest_days; prev timestamptz; fresh boolean; gap double precision;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select last_submit into prev from public.profiles where id = uid;
  s := public.submit_damage(p_amount, p_name, p_level, p_gear);
  select guild_id into gid from public.guild_members where user_id = uid;
  dl := public.daily_claim(uid); -- first tick of the UTC day claims the login reward (null otherwise)
  fresh := not exists (select 1 from public.quest_days where user_id = uid and day = (now() at time zone 'utc')::date);
  q := public.dq_row(uid, p_level, p_gear);
  if not public.in_sanctum() then
    perform public.dq_bump(uid, 'dmg', coalesce((s->>'accepted')::bigint, 0));
    gap := extract(epoch from now() - coalesce(prev, now())); -- time since this player's previous tick
    if not fresh and gap > 0 and gap <= 1200 then perform public.dq_bump(uid, 'online', floor(gap)::bigint); end if;
  end if;
  update public.quest_days set last_at = now() where user_id = uid and day = q.day returning * into q;
  r := jsonb_strip_nulls(jsonb_build_object('f', s->'floor', 'hp', s->'hp', 'mx', s->'max_hp', 'a', s->'accepted',
    'gm', s->'gm_present_until', 'an', nullif(s->'gm_announce', 'null'::jsonb), 'mk', nullif(s->'gm_marks', '{}'::jsonb),
    'cl', nullif((select coalesce(jsonb_agg(jsonb_build_array(c.id, c.floor, c.max_hp, coalesce(array_position(c.ranking, left(p_name, 20)), 0), coalesce((c.dmg->>left(p_name, 20))::bigint, 0)) order by c.id), '[]')
                  from (select * from public.floor_clears where id > coalesce(p_after, 0) order by id limit 20) c), '[]'::jsonb),
    'cv', (select max(id) from public.chat_messages where floor = (s->>'floor')::int),
    'dl', dl, 'q', public.dq_json(q, fresh), 'ep', public.reset_info(), 'gv', case when gid is null then null else (select max(id) from public.guild_messages where guild_id = gid) end));
  insert into public.egress_stats as e (day, calls, bytes) values (current_date, 1, octet_length(r::text) + 600)
    on conflict (day) do update set calls = e.calls + 1, bytes = e.bytes + excluded.bytes;
  return r;
end $$;
revoke all on function public.tick(bigint, text, int, int, bigint) from public, anon;
grant execute on function public.tick(bigint, text, int, int, bigint) to authenticated;

-- $LOGOUT addendum: TEAM STAFF ACCOUNTS. Idempotent: safe to run more than once. Run after schema-addendum-gm-luck.sql (and after
-- schema-addendum-reset-epoch.sql, whose save guard it replaces).
-- profiles.team marks a dev-team account (not the GM). Only an admin can set it (supabase/admin-mark-staff.sql): clients may update
-- display_name only (schema.sql column grant). A team account is a NORMAL hero: no GM role, perks, gear, luck or Glitch Den exemptions
-- (all of those check role = 'gm', never this flag). Its boss damage counts against the shared boss as usual. It is excluded from:
--   * the leaderboard and top-damage rankings: its damage rows carry is_staff (every ranking already skips is_staff) and is_team, which
--     the public damage policy and snapshot() hide, so it never shows on the board at all;
--   * any creator-fee / holder reward eligibility: public.reward_eligible(uid) and public.fee_eligible_holders() return no team or GM rows.
-- Its save survives the pre-release reset like the GM's (admin-reset-tower.sql, saves_epoch_guard below).
alter table public.profiles add column if not exists team boolean not null default false;
alter table public.damage add column if not exists is_team boolean not null default false;

create or replace function public.is_team(u uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = u and team and role is distinct from 'gm') $$;

-- Every damage write (submit_damage and friends): a team row is unranked staff, without touching how much damage it deals.
create or replace function public.team_damage_row() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_team(new.user_id) then new.is_staff := true; new.is_team := true; end if;
  return new;
end $$;
drop trigger if exists team_damage_row on public.damage;
create trigger team_damage_row before insert or update on public.damage for each row execute function public.team_damage_row();

drop policy if exists "public leaderboard" on public.damage;
create policy "public leaderboard" on public.damage for select using (not is_team);

-- snapshot(): same as schema-addendum-shop.sql (latest), minus team rows.
create or replace function public.snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  with fs as (select floor from public.floor_state where id = 1),
       top as (select d.name, d.damage, d.is_staff, d.user_id from public.damage d, fs where d.floor = fs.floor and not d.is_team order by d.damage desc limit 25)
  select jsonb_build_object('v', 1, 'at', now(), 'f', (select floor from fs),
    'lb', (select coalesce(jsonb_agg(jsonb_build_array(t.name, t.damage, t.is_staff) order by t.damage desc), '[]') from top t),
    'tg', (select coalesce(jsonb_object_agg(t.name, jsonb_build_array(g.tag, g.banner, g.is_staff)), '{}') from top t join public.guild_members m on m.user_id = t.user_id join public.guilds g on g.id = m.guild_id where not t.is_staff),
    'h', (select coalesce(jsonb_agg(jsonb_build_array(x.floor, x.at, x.ranking[1]) order by x.id desc), '[]') from (select id, floor, at, ranking from public.floor_clears order by id desc limit 120) x),
    'mw', (select coalesce(jsonb_object_agg(m.floor, m.names), '{}') from (select floor, jsonb_agg(name order by at desc) names from (select floor, name, at, row_number() over (partition by floor order by at desc) rn from public.memorials) z where rn <= 12 group by floor) m),
    'wl', (select public.waitlist_count()), 'eg', public.egress_estimate()) $$;
grant execute on function public.snapshot() to anon, authenticated;

-- Reward eligibility (creator fees, holder rewards, any future payout list): never the GM, never a team account.
create or replace function public.reward_eligible(u uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = u and role is distinct from 'gm' and not team) $$;
create or replace function public.fee_eligible_holders() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where holder and role is distinct from 'gm' and not team $$;

-- Public STAFF tags: [{ n: board name, a: chat author hash }] for team accounts only (the GM is never listed). No ids, no stats.
create or replace function public.team_roster() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('a', left(md5('logout-chat:' || p.id::text), 12),
    'n', coalesce((select d.name from public.damage d where d.user_id = p.id order by d.floor desc limit 1), left(s.data->'heroes'->0->>'name', 20)))), '[]'::jsonb)
  from public.profiles p left join public.saves s on s.user_id = p.id where p.team and p.role is distinct from 'gm' $$;

-- reset_info() (tick 'ep'): a team client never sees the reset epoch, so it never discards its local save (js/supabase.js resetCheck).
create or replace function public.reset_info() returns jsonb language sql stable security definer set search_path = public as $$
  select case when c.reset_at is null or public.is_team(auth.uid()) then null else jsonb_build_array(c.reset_epoch, floor(extract(epoch from c.reset_at) * 1000)::bigint) end
  from public.tower_config c where c.id = 1 $$;
revoke all on function public.reset_info() from public, anon, authenticated;

-- Pre-reset save guard (schema-addendum-reset-epoch.sql): team saves are kept like the GM's.
create or replace function public.saves_epoch_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare ra timestamptz := (select reset_at from public.tower_config where id = 1);
begin
  if ra is null or exists (select 1 from public.profiles where id = new.user_id and (role = 'gm' or team)) then return new; end if;
  if coalesce(case when jsonb_typeof(new.data->'createdAt') = 'number' then (new.data->>'createdAt')::float8 end, 0) < extract(epoch from ra) * 1000 then
    return null; end if; -- a save from before the reset: dropped
  return new;
end $$;

revoke all on function public.is_team(uuid), public.team_damage_row(), public.reward_eligible(uuid), public.fee_eligible_holders(), public.saves_epoch_guard() from public, anon, authenticated;
revoke all on function public.team_roster() from public;
grant execute on function public.team_roster() to anon, authenticated;

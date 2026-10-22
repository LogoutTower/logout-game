-- $LOGOUT addendum: GM RAID SOFTENER + PRE-LAUNCH HP FACTOR. Idempotent: safe to run more than once. Run after schema-addendum-quests-profile.sql.
-- 1) Raid softener (always on, before and after launch): for profiles.role = 'gm', submit_damage accepts at most
--    gm_soft_mult (default 1.5) × ref_dps(floor) × elapsed seconds against the SHARED boss. ref_dps = a strong normal player on that floor
--    (class-average base, level cap floor+10, forge cap floor+8, Legendary weapon + armor of the floor). Mirrors refPlayerDps() in js/loot.js
--    and GM_SOFTEN_MULT in config.js. Players are unaffected. The Sanctum guard (schema-addendum-sanctum.sql) still drops Sanctum ticks.
-- 2) Pre-launch HP factor: while enabled AND now() < prelaunch_until (2026-10-27 01:30 UTC = Mon Oct 26 8:30 PM CT; see update-launch-time-2026-10-27.sql), tower floors 11-20 start with
--    floor_hp × turnout × prelaunch_hp_factor (default 0.04). At or after that instant, or once disabled, the factor is 1 (inert).
--    The current floor (if 11-20) is scaled down once, keeping its remaining fraction. The two are compatible: the factor was chosen
--    for the softened GM damage (see docs/PRE-RELEASE-RESET.md). public.prelaunch_suggest() prints a factor for a target run length.
-- Settings live in public.tower_config (one row, no client access). Change with e.g.:
--   update public.tower_config set prelaunch_hp_factor = 0.03 where id = 1;
create table if not exists public.tower_config (
  id int primary key default 1 check (id = 1),
  gm_soft_mult numeric not null default 1.5 check (gm_soft_mult > 0),
  prelaunch_hp_factor numeric not null default 0.04 check (prelaunch_hp_factor > 0 and prelaunch_hp_factor <= 1),
  prelaunch_until timestamptz not null default '2026-10-27 01:30:00+00',
  prelaunch_enabled boolean not null default true);
insert into public.tower_config (id) values (1) on conflict (id) do nothing;
alter table public.tower_config enable row level security; -- no policies: definer functions and the SQL editor only
revoke all on public.tower_config from public, anon, authenticated;

create or replace function public.ref_dps(f int) returns double precision language sql immutable as $$
  select (5.866666666666667 * (1 + 0.25 * (greatest(f, 1) + 9)) + 4.5 * public.gear_scale(greatest(f, 1)))
       * (1 + 0.15 * (greatest(f, 1) + 8)) * (1 + round((3 + greatest(f, 1) / 8.0) * 3) / 100.0) $$;
create or replace function public.prelaunch_hp_mul(f int) returns double precision language sql stable security definer set search_path = public as $$
  select coalesce((select case when c.prelaunch_enabled and now() < c.prelaunch_until and f between 11 and 20 then c.prelaunch_hp_factor::float8 else 1 end
    from public.tower_config c where c.id = 1), 1) $$;

-- turnout trigger: same as schema-addendum-turnout-scaling.sql, times prelaunch_hp_mul() (1 after launch, so the surge check only ever raises HP).
create or replace function public.floor_state_turnout() returns trigger language plpgsql security definer set search_path = public as $$
declare base bigint; scaled bigint;
begin
  if new.floor is distinct from old.floor then
    base := public.floor_hp(new.floor); scaled := greatest(1, round(base * public.turnout_mul() * public.prelaunch_hp_mul(new.floor)))::bigint;
    new.hp := greatest(scaled - (base - new.hp), 0); new.max_hp := scaled;
    new.turnout_checked_at := now();
  elsif new.hp > 0 and (old.turnout_checked_at is null or old.turnout_checked_at < now() - interval '1 hour') then
    new.turnout_checked_at := now(); scaled := greatest(1, round(public.floor_hp(new.floor) * public.turnout_mul() * public.prelaunch_hp_mul(new.floor)))::bigint;
    if scaled > new.max_hp then new.hp := round(new.hp::numeric * scaled / new.max_hp)::bigint; new.max_hp := scaled; end if;
  end if; return new;
end $$;

-- submit_damage: same as schema-addendum-caps.sql plus the staff softener line.
create or replace function public.submit_damage(p_amount bigint, p_name text, p_level int, p_gear int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); prof public.profiles; fs public.floor_state;
  elapsed double precision; max_dps double precision; allowed bigint; accepted bigint; staff boolean; over bigint; ranking text[]; dm jsonb;
  lv double precision := greatest(least(p_level, 500), 1); forge double precision := power(1.15, greatest(least(p_gear, 200), 0));
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into prof from public.profiles where id = uid for update;
  staff := coalesce(prof.role = 'gm', false);
  elapsed := least(extract(epoch from now() - coalesce(prof.last_submit, now() - interval '30 seconds')), 12 * 3600);
  update public.profiles set last_submit = now() where id = uid;
  select * into fs from public.floor_state where id = 1 for update;
  if not staff then lv := least(lv, public.level_cap(fs.floor)); forge := power(1.15, greatest(least(p_gear, public.forge_cap(fs.floor)), 0)); end if;
  max_dps := greatest(
    6.5 * (1 + 0.25 * lv - 0.25) * forge * 4 + 50,
    (6.5 * (1 + 0.25 * lv - 0.25) + 1.5 * public.gear_scale(least(fs.floor + 5, fs.max_floor)) * 3.6) * forge * 8 + 50);
  if staff then max_dps := least(max_dps, coalesce((select gm_soft_mult from public.tower_config where id = 1), 1.5) * public.ref_dps(fs.floor)); end if; -- raid softener
  allowed := floor(max_dps * greatest(elapsed, 0));
  accepted := greatest(0, least(p_amount, allowed));
  insert into public.damage (user_id, floor, name, damage, is_staff) values (uid, fs.floor, left(p_name, 20), accepted, staff)
    on conflict (user_id, floor) do update set damage = public.damage.damage + excluded.damage, name = excluded.name, is_staff = excluded.is_staff;
  if staff then fs.gm_present_until := now() + interval '90 seconds'; end if;
  fs.hp := fs.hp - accepted;
  while fs.hp <= 0 and fs.floor < fs.max_floor loop
    over := -fs.hp;
    select coalesce(array_agg(name order by damage desc), '{}') into ranking from public.damage where floor = fs.floor and not is_staff;
    select coalesce(jsonb_object_agg(name, damage), '{}') into dm from public.damage where floor = fs.floor;
    insert into public.floor_clears (floor, max_hp, ranking, dmg) values (fs.floor, fs.max_hp, ranking, dm);
    fs.floor := fs.floor + 1; fs.max_hp := public.floor_hp(fs.floor); fs.hp := fs.max_hp - over;
  end loop;
  if fs.hp < 0 then fs.hp := 0; end if;
  update public.floor_state set floor = fs.floor, hp = fs.hp, max_hp = fs.max_hp, gm_present_until = fs.gm_present_until, updated_at = now() where id = 1
    returning floor, hp, max_hp into fs.floor, fs.hp, fs.max_hp;
  return jsonb_build_object('floor', fs.floor, 'hp', fs.hp, 'max_hp', fs.max_hp, 'accepted', accepted, 'gm_present_until', fs.gm_present_until, 'gm_announce', fs.gm_announce,
    'gm_marks', fs.gm_marks);
end $$;

-- Scale the floor in progress once (idempotent: a second run finds max_hp already at or below the target).
do $$ declare fs public.floor_state; tgt bigint; begin
  select * into fs from public.floor_state where id = 1;
  if fs.id is not null and public.prelaunch_hp_mul(fs.floor) < 1 then
    tgt := greatest(1, round(public.floor_hp(fs.floor) * public.turnout_mul() * public.prelaunch_hp_mul(fs.floor)))::bigint;
    if fs.max_hp > tgt then update public.floor_state set hp = greatest(1, round(fs.hp::numeric * tgt / fs.max_hp))::bigint, max_hp = tgt, turnout_checked_at = now() where id = 1; end if;
  end if; end $$;

-- Admin helper (SQL editor only): suggest prelaunch_hp_factor so the staff hero clears from the current floor through 20 in p_hours of
-- online play, from the staff save's level and forge (Eventide + Vesperveil at floor parity, softener applied, no talents).
create or replace function public.prelaunch_suggest(p_hours double precision default 40) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare h jsonb; lv double precision; gr double precision; fs public.floor_state; secs double precision := 0; d double precision; f int; soft numeric;
begin
  select s.data->'heroes'->0 into h from public.saves s join public.profiles p on p.id = s.user_id where p.role = 'gm' limit 1;
  lv := greatest(1, coalesce((h->>'level')::float8, 1)); gr := greatest(0, coalesce((h->>'gear')::float8, 0));
  select * into fs from public.floor_state where id = 1; select gm_soft_mult into soft from public.tower_config where id = 1;
  for f in greatest(fs.floor, 11) .. 20 loop
    d := (5.866666666666667 * (1 + 0.25 * (lv - 1)) + 4.5 * public.gear_scale(f)) * (1 + 0.15 * gr) * (1 + round((3 + f / 8.0) * 3) / 100.0);
    d := least(d, coalesce(soft, 1.5) * public.ref_dps(f));
    secs := secs + public.floor_hp(f) * public.turnout_mul() / d;
  end loop;
  return jsonb_build_object('gm_level', lv, 'gm_forge', gr, 'from_floor', greatest(fs.floor, 11), 'hours_at_factor_1', round((secs / 3600)::numeric, 1),
    'suggested_factor', round(least(1, p_hours * 3600 / nullif(secs, 0))::numeric, 4),
    'hours_at_current_factor', round((secs / 3600 * (select prelaunch_hp_factor from public.tower_config where id = 1))::numeric, 1));
end $$;
revoke all on function public.ref_dps(int), public.prelaunch_hp_mul(int), public.prelaunch_suggest(double precision), public.floor_state_turnout() from public, anon, authenticated;

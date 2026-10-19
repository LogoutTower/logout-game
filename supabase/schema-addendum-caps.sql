-- $LOGOUT addendum: LEVEL + FORGE CAPS. Idempotent: safe to run more than once. Run after schema-addendum-egress.sql.
-- A hero's level counts for at most (current shared floor + 10) in the damage clamp, so a client claiming a higher level gains nothing.
-- Forge tier counts for at most (floor + 8). Mirrors forgeCap() / FORGE_CAP_OVER in js/game.js.
-- Staff (profiles.role = 'gm', set only via SQL / service role) is never capped. Mirrors levelCap() in js/game.js.
-- Staff 2x XP is applied by the client only under the same staff check; XP is not server-tracked, and the level clamp means a
-- non-staff client that fakes extra XP still deals no more damage than a hero at the cap.
-- Same body as schema-addendum-open-chat.sql (returns the stored row after the turnout trigger), plus the cap line.
create or replace function public.level_cap(f int) returns int language sql immutable as $$ select f + 10 $$;
create or replace function public.forge_cap(f int) returns int language sql immutable as $$ select f + 8 $$;
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
  if not staff then lv := least(lv, public.level_cap(fs.floor)); forge := power(1.15, greatest(least(p_gear, public.forge_cap(fs.floor)), 0)); end if; -- level cap: floor + 10 (staff role is never capped)
  max_dps := greatest(
    6.5 * (1 + 0.25 * lv - 0.25) * forge * 4 + 50,
    (6.5 * (1 + 0.25 * lv - 0.25) + 1.5 * public.gear_scale(least(fs.floor + 5, fs.max_floor)) * 3.6) * forge * 8 + 50);
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
    returning floor, hp, max_hp into fs.floor, fs.hp, fs.max_hp; -- values after the turnout trigger (scaled max_hp on a new floor)
  return jsonb_build_object('floor', fs.floor, 'hp', fs.hp, 'max_hp', fs.max_hp, 'accepted', accepted, 'gm_present_until', fs.gm_present_until, 'gm_announce', fs.gm_announce,
    'gm_marks', fs.gm_marks);
end $$;

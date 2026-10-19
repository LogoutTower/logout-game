-- $LOGOUT addendum: FLOORS 11-20 (arc 2, The Frozen Clockspire). Idempotent: safe to run more than once. Run after schema.sql.
-- 1) floor_hp(): arc 2+ multiplies the guardian's HP (×60 on floor 11, ×1.33 per floor, flat after floor 20). Mirrors js/floors.js
--    (ARC_HP / floorBossHp). Floors 1-10 are unchanged, so the live floor's max_hp does not move.
-- 2) floor_state.max_floor 10 → 20, and a floor already cleared at the old cap (hp 0 on floor 10) advances to floor 11 right away.
-- 3) submit_damage() is NOT changed: the live clamp (schema-addendum-guilds-chat.sql) already allows the best Unique weapon of
--    floor min(current + 5, max_floor) with 8x headroom, via gear_scale(), so raising max_floor is enough for Clockspire gear.
-- Until this runs, the live server simply stays capped at floor 10; the client shows "the stair to Floor 11 is opening soon".
create or replace function public.floor_base_hp(f int) returns bigint language sql immutable as $$
  select (round(20000 * exp(ln(1.6) * 10 * ln(1 + (f - 1) / 10.0)) / 100) * 100)::bigint $$;
create or replace function public.floor_arc_mul(f int) returns double precision language sql immutable as $$
  select case when f < 11 then 1 else 60 * power(1.33, least(f, 20) - 11) end $$;
create or replace function public.floor_hp(f int) returns bigint language sql immutable as $$
  select case when f < 11 then (public.floor_base_hp(f) * (case when f % 10 = 0 then 2.5 else 1 end))::bigint
    else (round(public.floor_base_hp(f) * (case when f % 10 = 0 then 2.5 else 1 end) * public.floor_arc_mul(f) / 1000) * 1000)::bigint end $$;
alter table public.floor_state alter column max_floor set default 20;
update public.floor_state set max_floor = greatest(max_floor, 20) where id = 1;

-- Advance a floor that was cleared while the cap was lower (same bookkeeping as submit_damage). Internal only.
create or replace function public.floor_advance_pending() returns void
language plpgsql security definer set search_path = public as $$
declare fs public.floor_state; over bigint; ranking text[]; dm jsonb;
begin
  select * into fs from public.floor_state where id = 1 for update; if fs.id is null then return; end if;
  while fs.hp <= 0 and fs.floor < fs.max_floor loop
    over := -fs.hp;
    if not exists (select 1 from public.floor_clears where floor = fs.floor) then
      select coalesce(array_agg(name order by damage desc), '{}') into ranking from public.damage where floor = fs.floor and not is_staff;
      select coalesce(jsonb_object_agg(name, damage), '{}') into dm from public.damage where floor = fs.floor;
      insert into public.floor_clears (floor, max_hp, ranking, dmg) values (fs.floor, fs.max_hp, ranking, dm);
    end if;
    fs.floor := fs.floor + 1; fs.max_hp := public.floor_hp(fs.floor); fs.hp := fs.max_hp - over;
  end loop;
  update public.floor_state set floor = fs.floor, hp = greatest(fs.hp, 0), max_hp = fs.max_hp, updated_at = now() where id = 1;
end $$;
select public.floor_advance_pending();

revoke all on function public.floor_advance_pending() from public, anon, authenticated;

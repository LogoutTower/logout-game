-- $LOGOUT addendum: ARC 1 LAUNCH PACING. Idempotent: safe to run more than once. Run after schema-addendum-floors-11-20.sql.
-- floor_hp(): floors 1-10 use an explicit table (≈18 h for ~100 fresh heroes to clear Floor 10); arc 2 starts at ×332, ×0.988 per floor (the base curve still climbs ~1.2x per floor)
-- (arc 2 ≈ 6.0B HP, ~1 week at 100 DAU, no cliff from Floor 10). Mirrors js/floors.js (ARC1_HP / ARC_HP / floorBossHp).
-- The live floor keeps its remaining-HP percentage: max_hp is recomputed and hp rescaled by the same ratio (a no-op on re-run).
create or replace function public.floor_arc_mul(f int) returns double precision language sql immutable as $$
  select case when f < 11 then 1 else 332 * power(0.988, least(f, 20) - 11) end $$;
create or replace function public.floor_hp(f int) returns bigint language sql immutable as $$
  select case when f < 11 then (array[86000, 630000, 2400000, 7300000, 19000000, 29000000, 37000000, 46000000, 62000000, 128000000]::bigint[])[greatest(f, 1)]
    else (round(public.floor_base_hp(f) * (case when f % 10 = 0 then 2.5 else 1 end) * public.floor_arc_mul(f) / 1000) * 1000)::bigint end $$;
update public.floor_state set hp = round(hp::numeric * public.floor_hp(floor) / nullif(max_hp, 0))::bigint, max_hp = public.floor_hp(floor)
  where id = 1 and max_hp is distinct from public.floor_hp(floor);

-- DRAFT, NOT RUN. Arc 3 (Floors 21-30, Tidewire Depths) going live for everyone. Run only when FEATURES.arc3 flips to 'all'.
-- floor_hp() needs no change: it already covers any floor (arc multiplier flat after 20, Floor 30 milestone x2.5; mirrors js/floors.js).
-- Arc 3 mechanics (tide, undertow) are client-side like the arc 2 ones; peaks equal existing ones, so submit_damage max_dps is unchanged.
-- 1) open the cap 20 -> 30 (gear_scale() follows max_floor). Pair with MAX_FLOOR = 30 in config.js.
alter table public.floor_state alter column max_floor set default 30;
update public.floor_state set max_floor = greatest(max_floor, 30) where id = 1;
-- 2) a floor already cleared at the old cap (hp 0 on Floor 20) should advance to Floor 21: same loop as schema-addendum-floors-11-20.sql step 2
--    (re-run that block, or call the advance function once after step 1).

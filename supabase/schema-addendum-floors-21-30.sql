-- $LOGOUT: open Floors 21-30 (arc 3, Tidewire Depths) on the server. NOT RUN by the dev; Umbra runs it once in the SQL editor. Idempotent.
-- What it changes: ONLY floor_state.max_floor 20 -> 30 (and the column default). Nothing else: no HP, no RPC, no rows, no player data.
-- Why it is safe for regular players:
--   * The shared tower still has to clear Floor 20 first; the server advance loop (while hp <= 0 and floor < max_floor) only moves past 20 after Floor 20's HP hits 0.
--   * The client (config.js ARC3_UNLOCK_AFTER = 20) shows Floors 21-30, the arc 3 scene/art and the 30 cap only when floor_state.floor > 20, so until the
--     tower is actually on Floor 21 regular players see exactly the same game. The unlock notice fires once per device at that moment.
--   * floor_hp() already covers floors 21-30 (no change). submit_damage's max_dps clamp reads gear_scale(least(floor + 5, max_floor)): on Floors 16-20 its
--     ceiling rises a little (it is an anti-cheat headroom of 8x, not a damage boost), so real damage is unchanged.
-- Tower reset: admin-reset-tower.sql does not touch max_floor; it puts the tower back on Floor 1, which re-locks arc 3 for everyone until Floor 20 falls again.
-- Timing: the live tower is on Floor 20 with HP 0 (pre-launch). Running this BEFORE the reset makes the next damage tick advance the shared tower to Floor 21,
--   so the team (and the staff hero) can play Floors 21-30 now behind the pre-launch passcode gate; the reset before launch then locks it again.
--   Running it AFTER the reset also works; then arc 3 first opens when the launch tower clears Floor 20.
begin;
alter table public.floor_state alter column max_floor set default 30;
update public.floor_state set max_floor = greatest(max_floor, 30) where id = 1;
commit;
select floor, hp, max_hp, max_floor from public.floor_state;

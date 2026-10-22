-- $LOGOUT admin: PRE-RELEASE TOWER RESET. Run ONCE in the SQL editor after the staff run and before release (see docs/PRE-RELEASE-RESET.md).
-- Idempotent: running it again changes nothing further (besides bumping the reset epoch again). Keeps: auth accounts, profiles (incl. role = 'gm'), the waitlist, guilds and
-- memberships, chat, egress stats, and the staff save plus every team staff save (profiles.team, needs schema-addendum-team-staff.sql). Wipes all shared tower progress and every non-staff hero's progress.
begin;
-- 1) the pre-launch HP factor is switched off for good
update public.tower_config set prelaunch_enabled = false where id = 1;
-- 1b) new reset epoch: every player client discards its pre-reset local save on its next tick (schema-addendum-reset-epoch.sql);
--     uploads of pre-reset saves are dropped. Each run is a new epoch (a re-run just wipes again, which is harmless).
update public.tower_config set reset_epoch = reset_epoch + 1, reset_at = now() where id = 1;
-- 2) leaderboard, damage records and clear history (rankings) for everyone
delete from public.damage;
delete from public.floor_clears;
-- 3) floor memorials, guild weeklies and the guild ledger/decor/progress
delete from public.memorials;
delete from public.guild_quest_contrib;
delete from public.guild_quests;
delete from public.guild_ledger;
delete from public.guild_decor;
do $$ begin if to_regclass('public.guild_race_wins') is not null then delete from public.guild_race_wins; delete from public.guild_buffs; end if; end $$; -- Guild Hub addendum (if run)
update public.guilds set xp = 0, bank = 0, bonus_tier = 0, hall = 0, banner_unlocks = 0 where not is_staff and (xp <> 0 or bank <> 0 or bonus_tier <> 0 or hall <> 0 or banner_unlocks <> 0); -- the staff guild keeps its prestige
-- 4) tester heroes' progress (every account that is neither the GM nor team staff): saves, pets, shop purchases/tokens, login streaks, daily quests
delete from public.saves where user_id not in (select id from public.profiles where role = 'gm' or team);
delete from public.pets where user_id not in (select id from public.profiles where role = 'gm' or team);
delete from public.shop_owned where user_id not in (select id from public.profiles where role = 'gm' or team);
delete from public.shop_tokens where user_id not in (select id from public.profiles where role = 'gm' or team);
delete from public.daily_claims where user_id not in (select id from public.profiles where role = 'gm' or team);
delete from public.quest_days where user_id not in (select id from public.profiles where role = 'gm' or team);
do $$ begin if to_regclass('public.casino_days') is not null then delete from public.casino_days where user_id not in (select id from public.profiles where role = 'gm' or team); end if; end $$; -- Glitch Den daily limits
update public.shop_global set sold = 0 where sold <> 0; -- climbing prestige prices start over
-- 5) turnout: nobody counts as recently active, active pets cleared for testers, staff leaves the Sanctum
update public.profiles set last_submit = null, sanctum = false, active_pet = case when role = 'gm' or team then active_pet end
  where last_submit is not null or sanctum or (active_pet is not null and role is distinct from 'gm' and not team);
-- 6) the tower: back to Floor 1 at full HP (turnout trigger rescales it; with no recent players that is the 0.5x floor)
update public.floor_state set floor = 1, hp = public.floor_hp(1), max_hp = public.floor_hp(1) where id = 1 and floor <> 1; -- trigger scales by turnout
update public.floor_state set hp = max_hp, gm_present_until = null, gm_announce = null, gm_marks = '{}'::jsonb, updated_at = now() where id = 1; -- full HP (a re-run is a no-op)
commit;
select floor, hp, max_hp, (select count(*) from public.damage) damage_rows, (select count(*) from public.profiles) accounts,
  (select count(*) from public.profiles where role = 'gm') staff, (select count(*) from public.profiles where team) team_staff, (select count(*) from public.waitlist) waitlist from public.floor_state;

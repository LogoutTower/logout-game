-- $LOGOUT addendum: TURNOUT SCALING. Idempotent: safe to run more than once. Run after schema-addendum-arc1-pacing.sql.
-- When a new floor starts (floor_state.floor changes), its guardian's max HP is scaled by recent turnout:
--   mul = clamp(active / 100, 0.5, 50), active = distinct heroes (profiles) that submitted damage in the last 24 h.
-- Overflow damage from the previous floor is kept. Clear times then hold roughly steady between ~50 and ~500 players.
-- Mid-floor surge: at most once an hour (on the next damage write), if turnout now asks for MORE HP than the floor has,
-- max_hp grows and hp keeps its remaining fraction. It never shrinks mid-floor. Cost: one indexed count per hour.
-- Works for every path that advances the floor (submit_damage, floor_advance_pending) via a trigger; clients show server max_hp.
alter table public.floor_state add column if not exists turnout_checked_at timestamptz;
create index if not exists profiles_last_submit_idx on public.profiles (last_submit);
create or replace function public.turnout_mul() returns double precision language sql stable security definer set search_path = public as $$
  select least(50.0, greatest(0.5, (select count(*) from public.profiles where last_submit > now() - interval '24 hours') / 100.0)) $$;
create or replace function public.floor_state_turnout() returns trigger language plpgsql security definer set search_path = public as $$
declare base bigint; scaled bigint;
begin
  if new.floor is distinct from old.floor then
    base := public.floor_hp(new.floor); scaled := greatest(1, round(base * public.turnout_mul()))::bigint;
    new.hp := greatest(scaled - (base - new.hp), 0); new.max_hp := scaled;  -- base - hp = overflow already dealt
    new.turnout_checked_at := now();
  elsif new.hp > 0 and (old.turnout_checked_at is null or old.turnout_checked_at < now() - interval '1 hour') then
    new.turnout_checked_at := now(); scaled := greatest(1, round(public.floor_hp(new.floor) * public.turnout_mul()))::bigint;
    if scaled > new.max_hp then new.hp := round(new.hp::numeric * scaled / new.max_hp)::bigint; new.max_hp := scaled; end if;
  end if; return new;
end $$;
drop trigger if exists floor_state_turnout on public.floor_state;
create trigger floor_state_turnout before update on public.floor_state for each row execute function public.floor_state_turnout();
revoke all on function public.turnout_mul(), public.floor_state_turnout() from public, anon, authenticated;

-- $LOGOUT addendum: STAFF SANCTUM (private training room outside the tower). Idempotent: safe to run more than once. Run after schema-addendum-shop.sql.
-- While a staff account is in the Sanctum the client sends no damage ticks at all (save pushes only). The server side makes that airtight:
--   * staff_sanctum(true/false) is gm-role only; players get 'staff only'.
--   * a profile in the Sanctum is not counted by turnout_mul() (turnout scaling's active-hero count).
--   * any submit_damage / tick that still arrives while the flag is on is dropped before it touches the boss, damage rows, clears or pet drops
--     (the damage row change is cancelled and the floor HP restored); leaving resets last_submit, so Sanctum time can never be claimed as tower damage.
-- XP and gold are computed client-side (saves) and are not validated anywhere server-side, so no extra RPC is needed for them.
alter table public.profiles add column if not exists sanctum boolean not null default false;

create or replace function public.staff_sanctum(p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid and role = 'gm') then raise exception 'staff only'; end if;
  update public.profiles set sanctum = coalesce(p_on, false), last_submit = now() where id = uid;
  return jsonb_build_object('sanctum', coalesce(p_on, false));
end $$;
revoke all on function public.staff_sanctum(boolean) from public, anon; grant execute on function public.staff_sanctum(boolean) to authenticated;

create or replace function public.turnout_mul() returns double precision language sql stable security definer set search_path = public as $$
  select least(50.0, greatest(0.5, (select count(*) from public.profiles where last_submit > now() - interval '24 hours' and not sanctum) / 100.0)) $$;
revoke all on function public.turnout_mul() from public, anon, authenticated;

-- Guards (keyed on the caller, auth.uid()): while the caller is in the Sanctum, a submit_damage/tick that still arrives changes nothing shared:
-- no damage row, no floor HP/floor change, no Decree presence, no floor_clears row (so no rankings and no clear/pet drops).
create or replace function public.in_sanctum() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select sanctum from public.profiles where id = auth.uid()), false) $$;
create or replace function public.sanctum_guard_row() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.in_sanctum() then return case when tg_op = 'UPDATE' then old else null end; end if; -- UPDATE: keep the old row; INSERT: skip
  return new;
end $$;
drop trigger if exists sanctum_damage_guard on public.damage;
create trigger sanctum_damage_guard before insert or update on public.damage for each row execute function public.sanctum_guard_row();
drop trigger if exists sanctum_clear_guard on public.floor_clears;
create trigger sanctum_clear_guard before insert on public.floor_clears for each row execute function public.sanctum_guard_row();
drop trigger if exists zz_sanctum_floor_guard on public.floor_state; -- zz_: fires after floor_state_turnout, so the old row wins
create trigger zz_sanctum_floor_guard before update on public.floor_state for each row execute function public.sanctum_guard_row();
revoke all on function public.in_sanctum(), public.sanctum_guard_row() from public, anon, authenticated;

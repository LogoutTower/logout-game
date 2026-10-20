-- $LOGOUT addendum: PLAYER COUNTER. Idempotent: safe to run more than once. Run after schema-addendum-team-staff.sql.
-- tower_counts() (public, anon ok) returns { t: trapped, o: online, f: [[floor, players at clear], ...] }.
--   trapped = real players (not team staff, not role gm) with a save or a damage sync since the current reset (tower_config.reset_at).
--   online  = real players whose last sync (profiles.last_submit) is within the last 10 minutes.
-- Cost: the two counts live in a one-row cache (tower_counts_cache) recomputed at most once a minute, by whichever call
-- arrives first after it goes stale. Every other call is a single-row read. Free-tier friendly.
-- Floor clears: a before-insert trigger on floor_clears stamps players = trapped (cached) when the server advances a floor,
-- so every path that writes a clear (submit_damage, floor_advance_pending) is covered. Older clears stay null (map shows nothing).
create table if not exists public.tower_counts_cache (
  id int primary key default 1 check (id = 1),
  trapped int not null default 0,
  online int not null default 0,
  at timestamptz not null default 'epoch'
);
insert into public.tower_counts_cache (id) values (1) on conflict do nothing;
alter table public.tower_counts_cache enable row level security; -- no policies: only the functions below read or write it
alter table public.floor_clears add column if not exists players int;

create or replace function public.tower_counts_refresh(force boolean default false) returns public.tower_counts_cache
language plpgsql security definer set search_path = public as $$
declare c public.tower_counts_cache; ra timestamptz := coalesce((select reset_at from public.tower_config where id = 1), 'epoch'::timestamptz);
begin
  select * into c from public.tower_counts_cache where id = 1;
  if not force and c.at > now() - interval '1 minute' then return c; end if;
  update public.tower_counts_cache set
    trapped = (select count(*) from public.profiles p where not p.team and p.role is distinct from 'gm'
               and (p.last_submit >= ra or exists (select 1 from public.saves s where s.user_id = p.id and s.updated_at >= ra))),
    online = (select count(*) from public.profiles p where not p.team and p.role is distinct from 'gm' and p.last_submit > now() - interval '10 minutes'),
    at = now()
  where id = 1 and (force or at <= now() - interval '1 minute') returning * into c; -- concurrent callers: only one recomputes
  if c.id is null then select * into c from public.tower_counts_cache where id = 1; end if;
  return c;
end $$;

create or replace function public.tower_counts() returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.tower_counts_cache := public.tower_counts_refresh(false);
begin
  return jsonb_build_object('t', c.trapped, 'o', c.online,
    'f', (select coalesce(jsonb_agg(jsonb_build_array(x.floor, x.players) order by x.floor), '[]')
          from (select distinct on (floor) floor, players from public.floor_clears where players is not null order by floor, id desc) x));
end $$;

create or replace function public.floor_clears_players() returns trigger language plpgsql security definer set search_path = public as $$
begin if new.players is null then new.players := (public.tower_counts_refresh(false)).trapped; end if; return new; end $$;
drop trigger if exists floor_clears_players on public.floor_clears;
create trigger floor_clears_players before insert on public.floor_clears for each row execute function public.floor_clears_players();

revoke all on function public.tower_counts_refresh(boolean), public.floor_clears_players() from public, anon, authenticated;
revoke all on function public.tower_counts() from public;
grant execute on function public.tower_counts() to anon, authenticated;

-- $LOGOUT Supabase schema. Idempotent: safe to run again after edits (SQL Editor, free tier is enough).
-- Writes to floor_state / damage / floor_clears only happen through SECURITY DEFINER functions below.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text check (char_length(display_name) <= 20),
  role text not null default 'player' check (role in ('player', 'gm')),  -- set only via SQL / service role
  holder boolean not null default false,
  last_submit timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.saves (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.floor_state (
  id int primary key default 1 check (id = 1),
  floor int not null default 1,
  hp bigint not null,
  max_hp bigint not null,
  max_floor int not null default 10,
  gm_present_until timestamptz,                -- Shaper's Decree: +5% XP/gold for the floor while in the future
  gm_announce jsonb,                           -- { floor, at } entrance notice, polled with the floor
  updated_at timestamptz not null default now()
);
create table if not exists public.damage (
  user_id uuid not null references auth.users on delete cascade,
  floor int not null,
  name text not null,
  damage bigint not null default 0,
  is_staff boolean not null default false,     -- GM rows: shown as "Tower Staff", never ranked or rewarded
  primary key (user_id, floor)
);
create table if not exists public.floor_clears (
  id bigserial primary key,
  floor int not null,
  max_hp bigint not null,
  ranking text[] not null,                     -- non-staff names by damage, best first
  dmg jsonb not null,                          -- { name: damage } for loot share
  at timestamptz not null default now()
);

-- Columns added after the first version (no-ops on a fresh project).
alter table public.profiles add column if not exists role text not null default 'player';
alter table public.profiles add column if not exists holder boolean not null default false;
alter table public.profiles add column if not exists last_submit timestamptz;
alter table public.floor_state add column if not exists gm_present_until timestamptz;
alter table public.floor_state add column if not exists gm_announce jsonb;
alter table public.damage add column if not exists is_staff boolean not null default false;

-- HP curve: mirrors js/floors.js (soft-exponential, milestones x2.5).
create or replace function public.floor_hp(f int) returns bigint language sql immutable as $$
  select (round(20000 * exp(ln(1.6) * 10 * ln(1 + (f - 1) / 10.0)) / 100) * 100 * (case when f % 10 = 0 then 2.5 else 1 end))::bigint
$$;
insert into public.floor_state (id, floor, hp, max_hp) values (1, 1, public.floor_hp(1), public.floor_hp(1)) on conflict do nothing;

-- New auth user (anonymous, wallet or email) → profile with role 'player'.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id) values (new.id) on conflict do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---- Row level security
alter table public.profiles enable row level security;
alter table public.saves enable row level security;
alter table public.floor_state enable row level security;
alter table public.damage enable row level security;
alter table public.floor_clears enable row level security;
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
-- Only display_name is client-writable: role / holder / last_submit can't be self-assigned.
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
drop policy if exists "own profile name" on public.profiles;
create policy "own profile name" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "own save read" on public.saves;
create policy "own save read" on public.saves for select using (auth.uid() = user_id);
drop policy if exists "own save insert" on public.saves;
create policy "own save insert" on public.saves for insert with check (auth.uid() = user_id);
drop policy if exists "own save update" on public.saves;
create policy "own save update" on public.saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "public floor" on public.floor_state;
create policy "public floor" on public.floor_state for select using (true);
drop policy if exists "public leaderboard" on public.damage;
create policy "public leaderboard" on public.damage for select using (true);
drop policy if exists "public clears" on public.floor_clears;
create policy "public clears" on public.floor_clears for select using (true);
-- (no insert/update policies on floor_state, damage, floor_clears: only the functions below write them)

-- ---- submit_damage: clamps damage to elapsed time × max plausible DPS, advances floors atomically with overflow.
create or replace function public.submit_damage(p_amount bigint, p_name text, p_level int, p_gear int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); prof public.profiles; fs public.floor_state;
  elapsed double precision; max_dps double precision; allowed bigint; accepted bigint; staff boolean; over bigint; ranking text[]; dm jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into prof from public.profiles where id = uid for update;
  staff := coalesce(prof.role = 'gm', false);
  elapsed := least(extract(epoch from now() - coalesce(prof.last_submit, now() - interval '30 seconds')), 12 * 3600);
  -- Highest class base (Arcanist 9*0.7≈6.3, Blade 6.5) × level × forge, ×4 headroom for gear, talents, buffs and Uniques.
  max_dps := 6.5 * (1 + 0.25 * greatest(least(p_level, 500), 1) - 0.25) * power(1.15, greatest(least(p_gear, 200), 0)) * 4 + 50;
  allowed := floor(max_dps * greatest(elapsed, 0));
  accepted := greatest(0, least(p_amount, allowed));
  update public.profiles set last_submit = now() where id = uid;
  select * into fs from public.floor_state where id = 1 for update;
  insert into public.damage (user_id, floor, name, damage, is_staff) values (uid, fs.floor, left(p_name, 20), accepted, staff)
    on conflict (user_id, floor) do update set damage = public.damage.damage + excluded.damage, name = excluded.name, is_staff = excluded.is_staff;
  if staff then fs.gm_present_until := now() + interval '90 seconds'; end if; -- the GM is actively fighting here
  fs.hp := fs.hp - accepted;
  while fs.hp <= 0 and fs.floor < fs.max_floor loop
    over := -fs.hp;
    select coalesce(array_agg(name order by damage desc), '{}') into ranking from public.damage where floor = fs.floor and not is_staff;
    select coalesce(jsonb_object_agg(name, damage), '{}') into dm from public.damage where floor = fs.floor;
    insert into public.floor_clears (floor, max_hp, ranking, dmg) values (fs.floor, fs.max_hp, ranking, dm);
    fs.floor := fs.floor + 1; fs.max_hp := public.floor_hp(fs.floor); fs.hp := fs.max_hp - over;
  end loop;
  if fs.hp < 0 then fs.hp := 0; end if;
  update public.floor_state set floor = fs.floor, hp = fs.hp, max_hp = fs.max_hp, gm_present_until = fs.gm_present_until, updated_at = now() where id = 1;
  return jsonb_build_object('floor', fs.floor, 'hp', fs.hp, 'max_hp', fs.max_hp, 'accepted', accepted, 'gm_present_until', fs.gm_present_until, 'gm_announce', fs.gm_announce);
end $$;

-- ---- GM-only helpers (role checked server-side, so non-GMs can't spoof presence or announcements)
create or replace function public.gm_presence() returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'gm') then raise exception 'forbidden'; end if;
  update public.floor_state set gm_present_until = now() + interval '90 seconds' where id = 1;
end $$;
create or replace function public.gm_announce(p_floor int) returns boolean language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'gm') then raise exception 'forbidden'; end if;
  select gm_announce into a from public.floor_state where id = 1 for update;
  if a is not null and (a->>'floor')::int = p_floor and (a->>'at')::timestamptz > now() - interval '10 minutes' then return false; end if; -- once per floor per 10 min
  update public.floor_state set gm_announce = jsonb_build_object('floor', p_floor, 'at', now()) where id = 1;
  return true;
end $$;
revoke all on function public.submit_damage(bigint, text, int, int), public.gm_presence(), public.gm_announce(int) from public;
grant execute on function public.submit_damage(bigint, text, int, int), public.gm_presence(), public.gm_announce(int) to authenticated;

-- Grant GM (run as the project owner):  update public.profiles set role = 'gm' where id = '<auth user uuid>';

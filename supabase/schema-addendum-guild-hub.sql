-- $LOGOUT addendum: GUILD HUB (presence, guild boss races, bank buffs). Idempotent: safe to run twice. Run AFTER
-- schema-addendum-forge-prestige.sql (it re-creates submit_damage from that file with one extra line) and the floors 21-30 addendum.
-- Safe before the pre-launch tower reset: it only adds tables/functions; admin-reset-tower.sql clears the two new tables.
-- Client flag: FEATURES.guildHub ('gm' = staff preview, 'all' = everyone). Free tier: no realtime, every read is one RPC on view open.
-- Gold only: buffs are bought with guild bank gold; nothing is ever paid out to players.

-- ============================== tables ==============================
create table if not exists public.guild_race_wins (          -- one row per cleared floor: the top guild by member damage
  floor int primary key,
  guild_id bigint references public.guilds on delete set null,
  tag text, name text, banner jsonb,
  damage bigint not null default 0,
  at timestamptz not null default now()
);
create table if not exists public.guild_buffs (
  id bigserial primary key,
  guild_id bigint not null references public.guilds on delete cascade,
  kind text not null check (kind in ('dmg')),
  pct numeric not null check (pct > 0 and pct <= 5),          -- hard cap, mirrors MAX_DMG_PCT in js/guildhub.js
  until timestamptz not null,
  by_user uuid references auth.users on delete set null,
  by_name text,
  at timestamptz not null default now()
);
create index if not exists guild_buffs_g on public.guild_buffs (guild_id, kind, until desc);
alter table public.guild_race_wins enable row level security;     -- no policies: read only through guild_hub()
alter table public.guild_buffs enable row level security;         -- no policies: read/write only through the RPCs below
revoke all on public.guild_race_wins, public.guild_buffs from anon, authenticated;

-- ============================== helpers ==============================
-- Who may see whose presence: yourself or a guildmate. There is no friends list yet; add it here when one exists.
create or replace function public.gh_can_see(viewer uuid, target uuid) returns boolean language sql stable security definer set search_path = public as $$
  select viewer is not null and target is not null and (viewer = target or exists (
    select 1 from public.guild_members a join public.guild_members b on b.guild_id = a.guild_id where a.user_id = viewer and b.user_id = target)) $$;
-- Buff catalogue (server-priced; the client list in js/guildhub.js BUFFS mirrors it).
create or replace function public.gh_buff(p_key text) returns jsonb language sql immutable as $$
  select case p_key when 'dmg5' then jsonb_build_object('kind', 'dmg', 'pct', 5, 'hours', 24, 'price', 40000, 'label', '+5% damage for 24h') end $$;
-- Damage cap multiplier from the caller's active guild buff (staff, team and staff-guild members never get one). Max 1.05.
create or replace function public.gh_dmg_mul(u uuid) returns double precision language sql stable security definer set search_path = public as $$
  select 1 + least(5, coalesce((select max(b.pct) from public.guild_members m join public.guilds g on g.id = m.guild_id
    join public.guild_buffs b on b.guild_id = m.guild_id and b.kind = 'dmg' and b.until > now()
    where m.user_id = u and not m.is_staff and not coalesce(g.is_staff, false) and not public.is_team(u)), 0))::double precision / 100 $$;
-- Race standings for a floor: guild member damage, staff/team rows and the staff guild excluded (same rule as guild_board).
create or replace function public.gh_race(p_floor int) returns table (guild_id bigint, tag text, name text, banner jsonb, damage bigint)
language sql stable security definer set search_path = public as $$
  select g.id, g.tag, g.name, g.banner, sum(d.damage)::bigint from public.damage d join public.guild_members m on m.user_id = d.user_id
    join public.guilds g on g.id = m.guild_id
  where d.floor = p_floor and not d.is_staff and not coalesce(d.is_team, false) and not m.is_staff and not coalesce(g.is_staff, false)
  group by g.id having sum(d.damage) > 0 order by 5 desc, g.name limit 10 $$;
-- When a floor falls, record its champion (the title holds until the next floor falls).
create or replace function public.gh_on_clear() returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.gh_race(new.floor) limit 1;
  if r.guild_id is not null then
    insert into public.guild_race_wins (floor, guild_id, tag, name, banner, damage) values (new.floor, r.guild_id, r.tag, r.name, r.banner, r.damage)
      on conflict (floor) do update set guild_id = excluded.guild_id, tag = excluded.tag, name = excluded.name, banner = excluded.banner, damage = excluded.damage, at = now();
  end if;
  return new;
end $$;
drop trigger if exists gh_clear on public.floor_clears;
create trigger gh_clear after insert on public.floor_clears for each row execute function public.gh_on_clear();

-- ============================== RPCs ==============================
-- Guild Hub read: current floor race (top 10), the champion of the last cleared floor, recent champions, and the caller's active buffs.
create or replace function public.guild_hub() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); f int; gid bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select floor into f from public.floor_state where id = 1;
  select guild_id into gid from public.guild_members where user_id = uid;
  return jsonb_build_object('floor', f,
    'live', coalesce((select jsonb_agg(jsonb_build_object('guild_id', r.guild_id, 'tag', r.tag, 'name', r.name, 'banner', r.banner, 'damage', r.damage)) from public.gh_race(f) r), '[]'),
    'champion', (select jsonb_build_object('floor', w.floor, 'guild_id', w.guild_id, 'tag', w.tag, 'name', w.name, 'banner', w.banner, 'damage', w.damage)
                 from public.guild_race_wins w where w.floor = f - 1),   -- only the floor that just fell: stale rows never show (e.g. after a reset)
    'history', coalesce((select jsonb_agg(jsonb_build_object('floor', w.floor, 'tag', w.tag, 'name', w.name, 'banner', w.banner, 'damage', w.damage) order by w.floor desc)
                 from (select * from public.guild_race_wins where floor < f order by floor desc limit 5) w), '[]'),
    'buffs', coalesce((select jsonb_agg(jsonb_build_object('kind', b.kind, 'pct', b.pct, 'until', b.until, 'by', b.by_name) order by b.until desc)
                 from public.guild_buffs b where b.guild_id = gid and b.until > now()), '[]'));
end $$;
-- Buy a guild buff with bank gold: officers/leader only, server price, one active buff per kind, not for the staff guild.
create or replace function public.guild_buy_buff(p_key text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.guild_members; g public.guilds; b jsonb := public.gh_buff(p_key); u timestamptz;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if b is null then raise exception 'no such buff'; end if;
  select * into me from public.guild_members where user_id = uid; if me.user_id is null then raise exception 'not in a guild'; end if;
  if me.role not in ('leader', 'officer') then raise exception 'officers and the leader only'; end if;
  select * into g from public.guilds where id = me.guild_id for update;
  if coalesce(g.is_staff, false) then raise exception 'a staff guild has no bank'; end if;
  if exists (select 1 from public.guild_buffs where guild_id = g.id and kind = b->>'kind' and until > now()) then raise exception 'that buff is already active'; end if;
  if g.bank < (b->>'price')::bigint then raise exception 'not enough gold in the bank'; end if;
  u := now() + make_interval(hours => (b->>'hours')::int);
  update public.guilds set bank = bank - (b->>'price')::bigint where id = g.id;
  insert into public.guild_buffs (guild_id, kind, pct, until, by_user, by_name) values (g.id, b->>'kind', (b->>'pct')::numeric, u, uid, left(public.gv2_name(uid), 20));
  insert into public.guild_ledger (guild_id, user_id, name, kind, amount, item) values (g.id, uid, left(public.gv2_name(uid), 20), 'spend', (b->>'price')::bigint, b->>'label');
  delete from public.guild_buffs where guild_id = g.id and until < now() - interval '7 days';
  return jsonb_build_object('until', u, 'bank', g.bank - (b->>'price')::bigint);
end $$;
-- Presence for up to 50 names: current floor (their latest damage row) and last seen (latest damage submit or cloud save).
-- Only names the caller may see (self or guildmate) are returned; everyone else is silently left out.
create or replace function public.guild_presence(p_names text[]) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); out jsonb := '{}'; r record;
begin
  if uid is null then raise exception 'not signed in'; end if;
  for r in select distinct on (n.nm) n.nm, d.user_id, d.floor from unnest(p_names[1:50]) n(nm)
      join public.damage d on d.name = left(btrim(n.nm), 20) where public.gh_can_see(uid, d.user_id)
      order by n.nm, d.floor desc loop
    out := out || jsonb_build_object(r.nm, jsonb_build_object('floor', r.floor,
      'seen', (select greatest(p.last_submit, s.updated_at) from public.profiles p left join public.saves s on s.user_id = p.id where p.id = r.user_id)));
  end loop;
  return out;
end $$;

-- ============================== submit_damage ==============================
-- schema-addendum-forge-prestige.sql body + the Guild Hub buff line (the anti-cheat ceiling rises by at most +5%, only while a buff is active).
create or replace function public.submit_damage(p_amount bigint, p_name text, p_level int, p_gear int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); prof public.profiles; fs public.floor_state;
  elapsed double precision; max_dps double precision; allowed bigint; accepted bigint; staff boolean; over bigint; ranking text[]; dm jsonb;
  wm double precision := 1; lv double precision := greatest(least(p_level, 500), 1); forge double precision := power(1.15, greatest(least(p_gear, 200), 0));
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into prof from public.profiles where id = uid for update;
  staff := coalesce(prof.role = 'gm', false);
  elapsed := least(extract(epoch from now() - coalesce(prof.last_submit, now() - interval '30 seconds')), 12 * 3600);
  update public.profiles set last_submit = now() where id = uid;
  select * into fs from public.floor_state where id = 1 for update;
  if not staff then lv := least(lv, public.level_cap(fs.floor)); forge := power(1.15, greatest(least(p_gear, public.forge_cap(fs.floor)), 0)); end if;
  max_dps := greatest(
    6.5 * (1 + 0.25 * lv - 0.25) * forge * 4 + 50,
    (6.5 * (1 + 0.25 * lv - 0.25) + 1.5 * public.gear_scale(least(fs.floor + 5, fs.max_floor)) * 3.6) * forge * 8 + 50);
  if not staff then wm := public.forge_dmg_mul(uid); max_dps := max_dps * wm; end if;
  if not staff then max_dps := max_dps * public.gh_dmg_mul(uid); end if; -- Guild Hub bank buff: the cap rises by the buff % (max +5%), never more -- forge prestige: the saved weapon's upgrade x evo multiplier (max 1.966)
  if staff then max_dps := least(max_dps, coalesce((select gm_soft_mult from public.tower_config where id = 1), 1.5) * public.ref_dps(fs.floor)); end if; -- raid softener
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
    returning floor, hp, max_hp into fs.floor, fs.hp, fs.max_hp;
  return jsonb_build_object('floor', fs.floor, 'hp', fs.hp, 'max_hp', fs.max_hp, 'accepted', accepted, 'gm_present_until', fs.gm_present_until, 'gm_announce', fs.gm_announce,
    'gm_marks', fs.gm_marks);
end $$;

-- ============================== grants ==============================
revoke all on function public.gh_can_see(uuid, uuid), public.gh_dmg_mul(uuid), public.gh_race(int), public.gh_on_clear() from public, anon, authenticated;
revoke all on function public.guild_hub(), public.guild_buy_buff(text), public.guild_presence(text[]) from public, anon;
grant execute on function public.guild_hub(), public.guild_buy_buff(text), public.guild_presence(text[]) to authenticated;
revoke all on function public.submit_damage(bigint, text, int, int) from public, anon;
grant execute on function public.submit_damage(bigint, text, int, int) to authenticated;

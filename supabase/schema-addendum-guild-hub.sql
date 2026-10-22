-- $LOGOUT addendum: GUILD HUB (presence, friends list, guild boss races + champion bank payout, bank buffs). Idempotent: safe to run twice. Run AFTER
-- schema-addendum-forge-prestige.sql (it re-creates submit_damage from that file with one extra line) and the floors 21-30 addendum.
-- Safe before the pre-launch tower reset: it only adds tables/functions; admin-reset-tower.sql clears the two new tables.
-- Client flag: FEATURES.guildHub ('gm' = staff preview, 'all' = everyone). Free tier: no realtime, every read is one RPC on view open.
-- Gold only: buffs are bought with guild bank gold; the race payout goes to the champion guild's bank; nothing is ever paid out to players.

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
-- Friends: one row per direction once accepted (a<->b = two rows), pending requests, blocks, and a send log for the rate limit.
create table if not exists public.friends (
  user_id uuid not null references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  since timestamptz not null default now(),
  primary key (user_id, friend_id), check (user_id <> friend_id)
);
create table if not exists public.friend_requests (
  id bigserial primary key,
  from_user uuid not null references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  at timestamptz not null default now(),
  unique (from_user, to_user), check (from_user <> to_user)
);
create index if not exists friend_requests_to on public.friend_requests (to_user, at desc);
create table if not exists public.friend_blocks (
  user_id uuid not null references auth.users on delete cascade,
  blocked_id uuid not null references auth.users on delete cascade,
  at timestamptz not null default now(),
  primary key (user_id, blocked_id), check (user_id <> blocked_id)
);
create table if not exists public.friend_req_log (user_id uuid not null references auth.users on delete cascade, at timestamptz not null default now());
create index if not exists friend_req_log_u on public.friend_req_log (user_id, at desc);
alter table public.friends enable row level security;            -- no policies on any friend table: read/write only through the RPCs below
alter table public.friend_requests enable row level security;
alter table public.friend_blocks enable row level security;
alter table public.friend_req_log enable row level security;
revoke all on public.friends, public.friend_requests, public.friend_blocks, public.friend_req_log from anon, authenticated;
-- Race payouts are logged in the guild ledger as kind 'race'.
do $$ begin
  alter table public.guild_ledger drop constraint if exists guild_ledger_kind_check;
  alter table public.guild_ledger add constraint guild_ledger_kind_check check (kind in ('donate', 'spend', 'quest', 'race'));
end $$;
alter table public.guild_race_wins add column if not exists payout bigint not null default 0;
alter table public.guild_race_wins enable row level security;     -- no policies: read only through guild_hub()
alter table public.guild_buffs enable row level security;         -- no policies: read/write only through the RPCs below
revoke all on public.guild_race_wins, public.guild_buffs from anon, authenticated;

-- ============================== helpers ==============================
-- Who may see whose presence: yourself, a guildmate, or an accepted friend. Mirrors canSeePresence() in js/guildhub.js.
create or replace function public.gh_can_see(viewer uuid, target uuid) returns boolean language sql stable security definer set search_path = public as $$
  select viewer is not null and target is not null and (viewer = target
    or exists (select 1 from public.friends f where f.user_id = viewer and f.friend_id = target)
    or exists (select 1 from public.guild_members a join public.guild_members b on b.guild_id = a.guild_id where a.user_id = viewer and b.user_id = target)) $$;
-- Race champion payout to the guild bank: base + perFloor x floor, capped. Mirrors GUILD_RACE_PAYOUT in config.js.
create or replace function public.gh_race_payout(p_floor int) returns bigint language sql immutable as $$
  select least(50000, 2500 + 500 * greatest(p_floor, 1))::bigint $$;
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
    -- paid once per floor (a re-insert of the same floor's clear updates the title but never pays twice); gh_race already excludes the staff guild
    if not exists (select 1 from public.guild_race_wins where floor = new.floor) then
      update public.guilds set bank = bank + public.gh_race_payout(new.floor) where id = r.guild_id and not coalesce(is_staff, false);
      insert into public.guild_ledger (guild_id, user_id, name, kind, amount, item) values (r.guild_id, null, 'Guild race', 'race', public.gh_race_payout(new.floor), 'Race Champion · Floor ' || new.floor);
    end if;
    insert into public.guild_race_wins (floor, guild_id, tag, name, banner, damage, payout) values (new.floor, r.guild_id, r.tag, r.name, r.banner, r.damage, public.gh_race_payout(new.floor))
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
    'champion', (select jsonb_build_object('floor', w.floor, 'guild_id', w.guild_id, 'tag', w.tag, 'name', w.name, 'banner', w.banner, 'damage', w.damage, 'payout', w.payout)
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
-- Only names the caller may see (self, guildmate or friend) are returned; everyone else is silently left out.
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

-- ============================== friends ==============================
-- Handles are opaque (never user ids). Names resolve like everywhere else: the hero name on the player's highest damage row.
-- Nothing about the other player leaks beyond name, floor and online / last seen: no class, gear, items, role or staff flag, and a
-- block is never revealed (a request to someone who blocked you looks sent and is never delivered).
create or replace function public.fr_handle(u uuid) returns text language sql immutable as $$ select left(md5('logout-friend:' || u::text), 16) $$;
create or replace function public.fr_uid(p_name text) returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select d.user_id from public.damage d where d.name = left(btrim(p_name), 20) order by d.floor desc, d.damage desc limit 1),
                  (select p.id from public.profiles p where p.display_name = left(btrim(p_name), 20) limit 1)) $$;
-- Resolve a handle, but only among people already linked to the caller (friends, requests either way, blocks).
create or replace function public.fr_from_handle(viewer uuid, h text) returns uuid language sql stable security definer set search_path = public as $$
  select u from (select friend_id u from public.friends where user_id = viewer union select from_user from public.friend_requests where to_user = viewer
    union select to_user from public.friend_requests where from_user = viewer union select blocked_id from public.friend_blocks where user_id = viewer) x
  where public.fr_handle(u) = h limit 1 $$;
-- Floor and last seen for a friend (same source as guild_presence).
create or replace function public.fr_presence(u uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('floor', (select max(floor) from public.damage where user_id = u),
    'seen', (select greatest(p.last_submit, s.updated_at) from public.profiles p left join public.saves s on s.user_id = p.id where p.id = u)) $$;
create or replace function public.friends_list() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  return jsonb_build_object('cap', 100,
    'friends', coalesce((select jsonb_agg(jsonb_build_object('h', public.fr_handle(f.friend_id), 'name', public.gv2_name(f.friend_id), 'since', f.since) || public.fr_presence(f.friend_id) order by public.gv2_name(f.friend_id))
                 from public.friends f where f.user_id = uid), '[]'),
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'h', public.fr_handle(r.from_user), 'name', public.gv2_name(r.from_user), 'at', r.at) order by r.at desc)
                 from public.friend_requests r where r.to_user = uid
                 and not exists (select 1 from public.friend_blocks b where b.user_id = uid and b.blocked_id = r.from_user)), '[]'),
    'outgoing', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'h', public.fr_handle(r.to_user), 'name', public.gv2_name(r.to_user), 'at', r.at) order by r.at desc)
                 from public.friend_requests r where r.from_user = uid), '[]'),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('h', public.fr_handle(b.blocked_id), 'name', public.gv2_name(b.blocked_id)) order by b.at desc)
                 from public.friend_blocks b where b.user_id = uid), '[]'));
end $$;
create or replace function public.friend_request(p_name text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t uuid; rq public.friend_requests;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'enter a hero name'; end if;
  perform pg_advisory_xact_lock(hashtext('friend:' || uid::text));
  t := public.fr_uid(p_name);
  if t is null then raise exception 'no hero with that name'; end if;
  if t = uid then raise exception 'that is you'; end if;
  if exists (select 1 from public.friend_blocks where user_id = uid and blocked_id = t) then raise exception 'unblock them first'; end if;
  if exists (select 1 from public.friends where user_id = uid and friend_id = t) then raise exception 'already friends'; end if;
  if exists (select 1 from public.friend_requests where from_user = uid and to_user = t) then raise exception 'request already sent'; end if;
  if (select count(*) from public.friends where user_id = uid) >= 100 then raise exception 'friend list full (100)'; end if;
  -- they already asked you (and have not blocked you): accept instead
  select * into rq from public.friend_requests where from_user = t and to_user = uid;
  if rq.id is not null and not exists (select 1 from public.friend_blocks where user_id = t and blocked_id = uid) then return public.friend_respond(rq.id, true); end if;
  if (select count(*) from public.friend_req_log where user_id = uid and at > now() - interval '1 hour') >= 20 then raise exception 'too many requests, try again later'; end if;
  if (select count(*) from public.friend_requests where from_user = uid) >= 50 then raise exception 'too many pending requests'; end if;
  if (select count(*) from public.friends where user_id = t) >= 100 then raise exception 'their friend list is full'; end if;
  insert into public.friend_req_log (user_id) values (uid);
  delete from public.friend_req_log where user_id = uid and at < now() - interval '1 day';
  if not exists (select 1 from public.friend_blocks where user_id = t and blocked_id = uid) then -- blocked by them: looks sent, never delivered
    insert into public.friend_requests (from_user, to_user) values (uid, t) on conflict do nothing;
  end if;
  return jsonb_build_object('sent', true);
end $$;
create or replace function public.friend_respond(p_id bigint, p_accept boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rq public.friend_requests;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into rq from public.friend_requests where id = p_id and to_user = uid for update;
  if rq.id is null then raise exception 'request not found'; end if;
  delete from public.friend_requests where id = rq.id;
  if coalesce(p_accept, false) then
    if (select count(*) from public.friends where user_id = uid) >= 100 then raise exception 'friend list full (100)'; end if;
    if (select count(*) from public.friends where user_id = rq.from_user) >= 100 then raise exception 'their friend list is full'; end if;
    insert into public.friends (user_id, friend_id) values (uid, rq.from_user), (rq.from_user, uid) on conflict do nothing;
    delete from public.friend_requests where from_user = uid and to_user = rq.from_user;
  end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.friend_remove(p_handle text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  t := public.fr_from_handle(uid, p_handle);
  if t is not null then
    delete from public.friends where (user_id = uid and friend_id = t) or (user_id = t and friend_id = uid);
    delete from public.friend_requests where from_user = uid and to_user = t; -- also cancels your own pending request
  end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.friend_block(p_handle text, p_name text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  t := coalesce(public.fr_from_handle(uid, p_handle), case when p_name is not null then public.fr_uid(p_name) end);
  if t is null or t = uid then raise exception 'cannot block that hero'; end if;
  if (select count(*) from public.friend_blocks where user_id = uid) >= 500 then raise exception 'block list full'; end if;
  delete from public.friends where (user_id = uid and friend_id = t) or (user_id = t and friend_id = uid);
  delete from public.friend_requests where (from_user = uid and to_user = t) or (from_user = t and to_user = uid);
  insert into public.friend_blocks (user_id, blocked_id) values (uid, t) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.friend_unblock(p_handle text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.friend_blocks where user_id = uid and public.fr_handle(blocked_id) = p_handle;
  return jsonb_build_object('ok', true);
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
revoke all on function public.gh_can_see(uuid, uuid), public.gh_dmg_mul(uuid), public.gh_race(int), public.gh_on_clear(), public.gh_race_payout(int),
  public.fr_handle(uuid), public.fr_uid(text), public.fr_from_handle(uuid, text), public.fr_presence(uuid) from public, anon, authenticated;
revoke all on function public.guild_hub(), public.guild_buy_buff(text), public.guild_presence(text[]), public.friends_list(), public.friend_request(text),
  public.friend_respond(bigint, boolean), public.friend_remove(text), public.friend_block(text, text), public.friend_unblock(text) from public, anon;
grant execute on function public.guild_hub(), public.guild_buy_buff(text), public.guild_presence(text[]), public.friends_list(), public.friend_request(text),
  public.friend_respond(bigint, boolean), public.friend_remove(text), public.friend_block(text, text), public.friend_unblock(text) to authenticated;
revoke all on function public.submit_damage(bigint, text, int, int) from public, anon;
grant execute on function public.submit_damage(bigint, text, int, int) to authenticated;

-- $LOGOUT schema addendum: GUILDS V2 (ranks, levels, bank, weekly quests, banners, guild chat, hall).
-- Run AFTER schema.sql and schema-addendum-guilds-chat.sql, in the SQL Editor. Idempotent: safe to run again.
-- RLS on every table; clients only READ (guild chat: members only). Every write goes through SECURITY DEFINER RPCs.
-- Rules mirrored in js/guildsv2.js. The client keeps all of this behind FEATURES.guildsV2 ('off' until this has run);
-- the basic guild RPCs keep their signatures, so the current client keeps working before and after.
-- Staff (profiles.role = 'gm'): never owns, leads or officers a guild, earns it no XP/quest progress, can't donate.
-- Guild bonus is XP/gold only (2% → max 5%), never damage, ranks or rewards. Token / creator-fee rewards stay per player.

-- ============================== tables / columns ==============================
alter table public.guilds add column if not exists open boolean not null default true;
alter table public.guilds add column if not exists xp bigint not null default 0;
alter table public.guilds add column if not exists bank bigint not null default 0 check (bank >= 0);
alter table public.guilds add column if not exists bonus_tier int not null default 0 check (bonus_tier between 0 and 3);
alter table public.guilds add column if not exists hall int not null default 0 check (hall between 0 and 5);
alter table public.guilds add column if not exists banner_unlocks int not null default 0 check (banner_unlocks between 0 and 3);
alter table public.guilds add column if not exists banner jsonb not null default '{"sigil":"tower","c1":"#ffd76a","c2":"#2a1450"}'::jsonb;
alter table public.guild_members add column if not exists role text not null default 'member';
alter table public.guild_members add column if not exists contrib bigint not null default 0;
alter table public.guild_members add column if not exists last_active timestamptz not null default now();
alter table public.guild_members add column if not exists active_week int; -- last week this member dealt damage or donated (for the 'active' quest)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'guild_members_role_chk') then
    alter table public.guild_members add constraint guild_members_role_chk check (role in ('leader', 'officer', 'member'));
  end if;
end $$;
update public.guild_members m set role = 'leader' from public.guilds g where g.id = m.guild_id and g.owner = m.user_id and m.role <> 'leader';
create table if not exists public.guild_requests (
  user_id uuid not null references auth.users on delete cascade,
  guild_id bigint not null references public.guilds on delete cascade,
  name text not null default 'Nameless',
  at timestamptz not null default now(),
  primary key (user_id, guild_id)
);
create table if not exists public.guild_invites (
  user_id uuid not null references auth.users on delete cascade,
  guild_id bigint not null references public.guilds on delete cascade,
  by_user uuid references auth.users on delete set null,
  at timestamptz not null default now(),
  primary key (user_id, guild_id)
);
create table if not exists public.guild_ledger (
  id bigserial primary key,
  guild_id bigint not null references public.guilds on delete cascade,
  user_id uuid references auth.users on delete set null,
  name text,
  kind text not null check (kind in ('donate', 'spend', 'quest')),
  amount bigint not null,
  item text,
  at timestamptz not null default now()
);
create index if not exists guild_ledger_g on public.guild_ledger (guild_id, id desc);
create index if not exists guild_ledger_u on public.guild_ledger (user_id, kind, at);
create table if not exists public.guild_quests (
  guild_id bigint not null references public.guilds on delete cascade,
  week int not null,
  idx int not null,
  progress bigint not null default 0,
  done boolean not null default false,
  primary key (guild_id, week, idx)
);
create table if not exists public.guild_messages (
  id bigserial primary key,
  guild_id bigint not null references public.guilds on delete cascade,
  author text not null,
  name text not null,
  is_staff boolean not null default false,
  body text not null check (char_length(body) <= 200),
  at timestamptz not null default now()
);
create index if not exists guild_messages_g on public.guild_messages (guild_id, id);
alter table public.profiles add column if not exists last_gchat timestamptz;

alter table public.guild_requests enable row level security;
alter table public.guild_invites enable row level security;
alter table public.guild_ledger enable row level security;
alter table public.guild_quests enable row level security;
alter table public.guild_messages enable row level security;
-- requests / invites / ledger / quests are read through guild_info(); guild chat is readable by that guild's members only.
drop policy if exists "guild members read guild chat" on public.guild_messages;
create policy "guild members read guild chat" on public.guild_messages for select
  using (exists (select 1 from public.guild_members m where m.user_id = auth.uid() and m.guild_id = guild_messages.guild_id));

-- ============================== rules (mirror js/guildsv2.js) ==============================
create or replace function public.gv2_level(p_xp bigint) returns int language sql immutable as $$
  select least(21, 1 + floor(sqrt(greatest(p_xp, 0) / 20000.0))::int) $$;
create or replace function public.gv2_slots(p_level int) returns int language sql immutable as $$ select least(50, 30 + (p_level - 1)) $$;
create or replace function public.gv2_bonus(p_tier int) returns int language sql immutable as $$ select least(5, 2 + p_tier) $$;
create or replace function public.gv2_sigils(p_level int, p_banner int) returns int language sql immutable as $$ select least(12, 4 + (p_level - 1) / 4 + 2 * p_banner) $$;
create or replace function public.gv2_week(p_at timestamptz default now()) returns int language sql stable as $$ select floor(extract(epoch from p_at) / 604800)::int $$;
-- 3 of 4 kinds (damage, floors, active, donate), the skipped kind = week % 4; targets/rewards from a per-week hash.
create or replace function public.gv2_quests(p_week int) returns table (idx int, kind text, target bigint, xp bigint, gold bigint)
language sql immutable as $$
  select (row_number() over (order by k) - 1)::int, kd,
    case kd when 'damage' then 50000 * (1 + h % 4) when 'floors' then 1 + h % 3 when 'active' then 2 + h % 3 else 2000 * (1 + h % 3) end,
    8000 * (1 + h % 3), 1000 * (1 + h % 3)
  from (select k, (array['damage', 'floors', 'active', 'donate'])[k + 1] kd, (p_week::bigint * 2654435761 + k * 40503) % 2147483647 h
        from generate_series(0, 3) k where k <> p_week % 4) q order by k $$;
create or replace function public.gv2_sigil_list() returns text[] language sql immutable as $$
  select array['tower','crown','star','moon','sword','shield','flame','eye','key','skull','wing','rune'] $$;
create or replace function public.gv2_palette() returns text[] language sql immutable as $$
  select array['#ffd76a','#7ff6ff','#ff3355','#5cff8a','#b98cff','#ff9b3d','#f4f1ff','#2a1450'] $$;
create or replace function public.gv2_is_staff(p_uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_uid and role = 'gm') $$;
create or replace function public.gv2_me() returns public.guild_members language sql stable security definer set search_path = public as $$
  select * from public.guild_members where user_id = auth.uid() $$;
create or replace function public.gv2_name(p_uid uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.damage where user_id = p_uid order by floor desc limit 1), (select display_name from public.profiles where id = p_uid), 'Nameless') $$;

-- Quest progress: add (or set, for 'active') for this week's quest of that kind; pays guild XP + bank gold once on completion.
create or replace function public.gv2_quest_bump(p_gid bigint, p_kind text, p_amount bigint, p_set boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare q record; w int := public.gv2_week(); cur public.guild_quests;
begin
  select * into q from public.gv2_quests(w) where kind = p_kind; if q.idx is null then return; end if;
  insert into public.guild_quests (guild_id, week, idx) values (p_gid, w, q.idx) on conflict do nothing;
  select * into cur from public.guild_quests where guild_id = p_gid and week = w and idx = q.idx for update;
  if cur.done then return; end if;
  cur.progress := case when p_set then greatest(cur.progress, p_amount) else cur.progress + p_amount end;
  if cur.progress >= q.target then
    cur.done := true;
    update public.guilds set xp = xp + q.xp, bank = bank + q.gold where id = p_gid;
    insert into public.guild_ledger (guild_id, kind, amount, item) values (p_gid, 'quest', q.gold, 'Weekly quest: ' || p_kind || ' (+' || q.xp || ' guild XP)');
  end if;
  update public.guild_quests set progress = cur.progress, done = cur.done where guild_id = p_gid and week = w and idx = q.idx;
end $$;

-- Leader inactive 14 days → the most active officer (latest activity, then contribution) leads.
create or replace function public.gv2_check_leader(p_gid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare ld public.guild_members; heir public.guild_members;
begin
  select * into ld from public.guild_members where guild_id = p_gid and role = 'leader';
  if ld.user_id is not null and greatest(ld.last_active, coalesce((select last_submit from public.profiles where id = ld.user_id), ld.last_active)) > now() - interval '14 days' then return; end if;
  select * into heir from public.guild_members where guild_id = p_gid and role = 'officer' and not is_staff and last_active > now() - interval '14 days'
    order by last_active desc, contrib desc limit 1;
  if heir.user_id is null then return; end if;
  update public.guild_members set role = 'officer' where guild_id = p_gid and role = 'leader';
  update public.guild_members set role = 'leader' where user_id = heir.user_id;
  update public.guilds set owner = heir.user_id where id = p_gid;
end $$;

-- ============================== server-side XP from damage ==============================
-- Fires on every damage insert/update made by submit_damage (clients can't write public.damage), so guild XP is never a client claim.
create or replace function public.gv2_on_damage() returns trigger
language plpgsql security definer set search_path = public as $$
declare d bigint := new.damage - coalesce(case when tg_op = 'UPDATE' then old.damage end, 0); m public.guild_members; act int;
begin
  if d <= 0 or new.is_staff then return new; end if;
  select * into m from public.guild_members where user_id = new.user_id; if m.user_id is null or m.is_staff then return new; end if;
  update public.guild_members set contrib = contrib + d, last_active = now(), active_week = public.gv2_week() where user_id = new.user_id;
  update public.guilds set xp = xp + d where id = m.guild_id;
  perform public.gv2_quest_bump(m.guild_id, 'damage', d);
  select count(*) into act from public.guild_members where guild_id = m.guild_id and not is_staff and active_week = public.gv2_week();
  perform public.gv2_quest_bump(m.guild_id, 'active', act, true);
  perform public.gv2_check_leader(m.guild_id);
  return new;
end $$;
drop trigger if exists gv2_damage_xp on public.damage;
create trigger gv2_damage_xp after insert or update of damage on public.damage for each row execute function public.gv2_on_damage();
-- A floor falls: every guild with at least one non-staff member who hit that floor counts it as "present".
create or replace function public.gv2_on_clear() returns trigger
language plpgsql security definer set search_path = public as $$
declare g bigint;
begin
  for g in select distinct m.guild_id from public.damage d join public.guild_members m on m.user_id = d.user_id
           where d.floor = new.floor and d.damage > 0 and not d.is_staff and not m.is_staff loop
    perform public.gv2_quest_bump(g, 'floors', 1);
  end loop;
  return new;
end $$;
drop trigger if exists gv2_clear_quest on public.floor_clears;
create trigger gv2_clear_quest after insert on public.floor_clears for each row execute function public.gv2_on_clear();

-- ============================== membership (replaces the basic RPCs, same signatures) ==============================
create or replace function public.guild_create(p_name text, p_tag text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); t text := upper(btrim(coalesce(p_tag, ''))); g public.guilds; c jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if public.gv2_is_staff(uid) then raise exception 'staff cannot own a guild'; end if;
  if exists (select 1 from public.guild_members where user_id = uid) then raise exception 'already in a guild'; end if;
  if n !~ '^[A-Za-z0-9'' -]{3,24}$' then raise exception 'name: 3-24 letters, digits, spaces'; end if;
  if t !~ '^[A-Z0-9]{2,4}$' then raise exception 'tag: 2-4 letters or digits'; end if;
  c := public.chat_clean(n, 24); if not (c->>'ok')::boolean or c->>'text' <> n then raise exception 'that name is not allowed'; end if;
  c := public.chat_clean(t, 24); if not (c->>'ok')::boolean or c->>'text' <> t then raise exception 'that name is not allowed'; end if;
  if exists (select 1 from public.guilds where lower(name) = lower(n) or tag = t) then raise exception 'name or tag taken'; end if;
  insert into public.guilds (name, tag, owner) values (n, t, uid) returning * into g;
  insert into public.guild_members (user_id, guild_id, role) values (uid, g.id, 'leader');
  delete from public.guild_requests where user_id = uid; delete from public.guild_invites where user_id = uid;
  return to_jsonb(g);
end $$;
-- Internal: add a member if there is a free slot.
create or replace function public.gv2_add(p_uid uuid, p_gid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare g public.guilds;
begin
  select * into g from public.guilds where id = p_gid for update; if g.id is null then raise exception 'no such guild'; end if;
  if exists (select 1 from public.guild_members where user_id = p_uid) then raise exception 'already in a guild'; end if;
  if (select count(*) from public.guild_members where guild_id = g.id) >= public.gv2_slots(public.gv2_level(g.xp)) then raise exception 'guild is full'; end if;
  insert into public.guild_members (user_id, guild_id, is_staff) values (p_uid, g.id, public.gv2_is_staff(p_uid));
  delete from public.guild_requests where user_id = p_uid; delete from public.guild_invites where user_id = p_uid;
end $$;
-- Open guild: join now. Invite-only: join if invited, else leave a request for an officer.
create or replace function public.guild_join(p_tag text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.guilds;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.guild_members where user_id = uid) then raise exception 'already in a guild'; end if;
  select * into g from public.guilds where tag = upper(btrim(p_tag)); if g.id is null then raise exception 'no such guild'; end if;
  if g.open or exists (select 1 from public.guild_invites where user_id = uid and guild_id = g.id) then
    perform public.gv2_add(uid, g.id); return to_jsonb(g) || jsonb_build_object('joined', true);
  end if;
  if (select count(*) from public.guild_requests where user_id = uid) >= 3 then raise exception 'too many pending requests'; end if;
  insert into public.guild_requests (user_id, guild_id, name) values (uid, g.id, left(public.gv2_name(uid), 20)) on conflict do nothing;
  return to_jsonb(g) || jsonb_build_object('joined', false, 'requested', true);
end $$;
create or replace function public.guild_leave() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.guild_members; heir uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.guild_members where user_id = uid returning * into me;
  if me.guild_id is null then return; end if;
  if me.role = 'leader' then   -- an officer first, else the longest-serving non-staff member
    select user_id into heir from public.guild_members where guild_id = me.guild_id and not is_staff
      order by (role = 'officer') desc, last_active desc, joined_at limit 1;
    if heir is not null then update public.guild_members set role = 'leader' where user_id = heir; update public.guilds set owner = heir where id = me.guild_id; end if;
  end if;
  if not exists (select 1 from public.guild_members where guild_id = me.guild_id and not is_staff) then delete from public.guilds where id = me.guild_id; end if;
end $$;

-- ============================== officer / leader actions ==============================
create or replace function public.gv2_need(p_officer boolean) returns public.guild_members
language plpgsql stable security definer set search_path = public as $$
declare me public.guild_members;
begin
  select * into me from public.guild_members where user_id = auth.uid();
  if me.user_id is null then raise exception 'not in a guild'; end if;
  if p_officer and me.role not in ('leader', 'officer') then raise exception 'officers and the leader only'; end if;
  if not p_officer and me.role <> 'leader' then raise exception 'the leader only'; end if;
  return me;
end $$;
create or replace function public.guild_set_open(p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me public.guild_members := public.gv2_need(true);
begin update public.guilds set open = p_open where id = me.guild_id; end $$;
-- Invite by Tower ID (shown in System).
create or replace function public.guild_invite(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me public.guild_members := public.gv2_need(true);
begin
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then raise exception 'no such player'; end if;
  if public.gv2_is_staff(p_user) then raise exception 'staff cannot be invited'; end if;
  if exists (select 1 from public.guild_members where user_id = p_user) then raise exception 'already in a guild'; end if;
  if (select count(*) from public.guild_invites where guild_id = me.guild_id) >= 20 then raise exception 'too many open invites'; end if;
  insert into public.guild_invites (user_id, guild_id, by_user) values (p_user, me.guild_id, me.user_id) on conflict do nothing;
end $$;
create or replace function public.guild_accept_invite(p_gid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.guild_invites where user_id = auth.uid() and guild_id = p_gid) then raise exception 'no such invite'; end if;
  perform public.gv2_add(auth.uid(), p_gid);
end $$;
create or replace function public.guild_decline_invite(p_gid bigint) returns void
language sql security definer set search_path = public as $$ delete from public.guild_invites where user_id = auth.uid() and guild_id = p_gid $$;
create or replace function public.guild_answer(p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me public.guild_members := public.gv2_need(true);
begin
  if not exists (select 1 from public.guild_requests where user_id = p_user and guild_id = me.guild_id) then raise exception 'no such request'; end if;
  if p_accept then perform public.gv2_add(p_user, me.guild_id); else delete from public.guild_requests where user_id = p_user and guild_id = me.guild_id; end if;
end $$;
create or replace function public.guild_kick(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me public.guild_members := public.gv2_need(true); t public.guild_members;
begin
  select * into t from public.guild_members where user_id = p_user and guild_id = me.guild_id;
  if t.user_id is null then raise exception 'not in your guild'; end if;
  if not (me.role = 'leader' and t.role <> 'leader') and not (me.role = 'officer' and t.role = 'member') then raise exception 'you cannot kick that member'; end if;
  delete from public.guild_members where user_id = p_user;
end $$;
create or replace function public.guild_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare me public.guild_members := public.gv2_need(false); t public.guild_members;
begin
  select * into t from public.guild_members where user_id = p_user and guild_id = me.guild_id;
  if t.user_id is null or t.user_id = me.user_id then raise exception 'not a member you can change'; end if;
  if p_role not in ('officer', 'member', 'leader') then raise exception 'bad role'; end if;
  if p_role <> 'member' and t.is_staff then raise exception 'staff cannot lead or officer a guild'; end if;
  if p_role = 'leader' then  -- transfer
    update public.guild_members set role = 'officer' where user_id = me.user_id;
    update public.guilds set owner = p_user where id = me.guild_id;
  end if;
  update public.guild_members set role = p_role where user_id = p_user;
end $$;

-- ============================== bank (gold only: donate in, spend on upgrades; never withdrawn) ==============================
-- Checked against the donor's cloud save (gold must be there and is deducted from it), 1 per 30 s, at most 25,000 per day.
create or replace function public.guild_donate(p_amount bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.guild_members; sv public.saves; gold bigint; today bigint; last timestamptz;
begin
  select * into me from public.guild_members where user_id = uid; if me.user_id is null then raise exception 'not in a guild'; end if;
  if me.is_staff then raise exception 'staff cannot donate'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'amount must be at least 1'; end if;
  select max(at), coalesce(sum(amount) filter (where at > now() - interval '1 day'), 0) into last, today from public.guild_ledger where user_id = uid and kind = 'donate' and at > now() - interval '1 day';
  if last is not null and last > now() - interval '30 seconds' then raise exception 'slow down: one donation every 30 seconds'; end if;
  if today + p_amount > 25000 then raise exception 'daily donation cap is 25,000 gold (% left today)', 25000 - today; end if;
  select * into sv from public.saves where user_id = uid for update;
  gold := floor(coalesce((sv.data->>'gold')::numeric, 0));
  if sv.user_id is null or gold < p_amount then raise exception 'not enough gold in your saved game'; end if;
  update public.saves set data = jsonb_set(data, '{gold}', to_jsonb(gold - p_amount)), updated_at = now() where user_id = uid;
  update public.guilds set bank = bank + p_amount where id = me.guild_id;
  update public.guild_members set last_active = now(), active_week = public.gv2_week() where user_id = uid;
  insert into public.guild_ledger (guild_id, user_id, name, kind, amount, item) values (me.guild_id, uid, left(public.gv2_name(uid), 20), 'donate', p_amount, null);
  perform public.gv2_quest_bump(me.guild_id, 'donate', p_amount);
  return jsonb_build_object('gold', gold - p_amount, 'bank', (select bank from public.guilds where id = me.guild_id));
end $$;
create or replace function public.guild_upgrade(p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.guild_members := public.gv2_need(true); g public.guilds; cur int; mx int; costs int[]; lvls int[]; cost bigint;
begin
  select * into g from public.guilds where id = me.guild_id for update;
  if p_kind = 'bonus' then cur := g.bonus_tier; mx := 3; costs := array[20000, 60000, 150000]; lvls := array[5, 10, 15];
  elsif p_kind = 'hall' then cur := g.hall; mx := 5; costs := array[5000, 15000, 40000, 100000, 250000]; lvls := array[2, 4, 7, 10, 14];
  elsif p_kind = 'banner' then cur := g.banner_unlocks; mx := 3; costs := array[3000, 10000, 30000]; lvls := array[1, 1, 1];
  else raise exception 'unknown upgrade'; end if;
  if cur >= mx then raise exception 'already at max'; end if;
  if public.gv2_level(g.xp) < lvls[cur + 1] then raise exception 'needs guild level %', lvls[cur + 1]; end if;
  cost := costs[cur + 1]; if g.bank < cost then raise exception 'the bank needs % gold', cost; end if;
  update public.guilds set bank = bank - cost,
    bonus_tier = bonus_tier + (p_kind = 'bonus')::int, hall = hall + (p_kind = 'hall')::int, banner_unlocks = banner_unlocks + (p_kind = 'banner')::int where id = g.id;
  insert into public.guild_ledger (guild_id, user_id, name, kind, amount, item) values (g.id, me.user_id, left(public.gv2_name(me.user_id), 20), 'spend', cost, p_kind || ' ' || (cur + 1));
  return to_jsonb((select x from public.guilds x where x.id = g.id));
end $$;
create or replace function public.guild_set_banner(p_sigil text, p_c1 text, p_c2 text) returns void
language plpgsql security definer set search_path = public as $$
declare me public.guild_members := public.gv2_need(true); g public.guilds; i int;
begin
  select * into g from public.guilds where id = me.guild_id;
  i := array_position(public.gv2_sigil_list(), p_sigil);
  if i is null or i > public.gv2_sigils(public.gv2_level(g.xp), g.banner_unlocks) then raise exception 'that sigil is locked'; end if;
  if not (p_c1 = any (public.gv2_palette())) or not (p_c2 = any (public.gv2_palette())) or p_c1 = p_c2 then raise exception 'pick two different palette colours'; end if;
  update public.guilds set banner = jsonb_build_object('sigil', p_sigil, 'c1', p_c1, 'c2', p_c2) where id = g.id;
end $$;

-- ============================== guild chat (members only; same filter, slow mode and bind rule as floor chat) ==============================
create or replace function public.guild_chat_post(p_name text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); prof public.profiles; anon boolean; c jsonb; nm jsonb; me public.guild_members; m public.guild_messages;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into me from public.guild_members where user_id = uid; if me.user_id is null then raise exception 'not in a guild'; end if;
  select coalesce(u.is_anonymous, true) into anon from auth.users u where u.id = uid;
  if anon is distinct from false then raise exception 'bind your identity to post'; end if;
  select * into prof from public.profiles where id = uid for update;
  if prof.last_gchat is not null and prof.last_gchat > now() - interval '10 seconds' then raise exception 'slow mode: 1 message every 10 seconds'; end if;
  c := public.chat_clean(p_body, 200); if not (c->>'ok')::boolean then raise exception '%', c->>'reason'; end if;
  nm := public.chat_clean(left(p_name, 20), 20); if not (nm->>'ok')::boolean or nm->>'text' <> btrim(left(p_name, 20)) then raise exception 'name not allowed in chat'; end if;
  update public.profiles set last_gchat = now() where id = uid;
  insert into public.guild_messages (guild_id, author, name, is_staff, body) values (me.guild_id, left(md5('logout-chat:' || uid::text), 12), nm->>'text', me.is_staff, c->>'text') returning * into m;
  delete from public.guild_messages where guild_id = me.guild_id and id <= (select id from public.guild_messages where guild_id = me.guild_id order by id desc offset 100 limit 1);
  return to_jsonb(m) - 'guild_id';
end $$;

-- ============================== reads ==============================
-- Everything the guild panel needs in one poll. Officers also see requests; non-members see their invites/requests.
create or replace function public.guild_info() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.guild_members; g public.guilds; lv int; w int := public.gv2_week();
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into me from public.guild_members where user_id = uid;
  if me.user_id is null then
    return jsonb_build_object('guild', null,
      'invites', (select coalesce(jsonb_agg(jsonb_build_object('guild_id', g2.id, 'name', g2.name, 'tag', g2.tag, 'banner', g2.banner)), '[]') from public.guild_invites i join public.guilds g2 on g2.id = i.guild_id where i.user_id = uid),
      'requests', (select coalesce(jsonb_agg(jsonb_build_object('guild_id', g2.id, 'tag', g2.tag)), '[]') from public.guild_requests r join public.guilds g2 on g2.id = r.guild_id where r.user_id = uid));
  end if;
  perform public.gv2_check_leader(me.guild_id);
  select * into me from public.guild_members where user_id = uid;
  select * into g from public.guilds where id = me.guild_id; lv := public.gv2_level(g.xp);
  return jsonb_build_object(
    'guild', to_jsonb(g) || jsonb_build_object('level', lv, 'slots', public.gv2_slots(lv), 'bonus_pct', public.gv2_bonus(g.bonus_tier), 'sigils', public.gv2_sigils(lv, g.banner_unlocks)),
    'me', jsonb_build_object('role', me.role, 'is_staff', me.is_staff, 'user_id', uid),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', public.gv2_name(m.user_id), 'role', m.role, 'contrib', m.contrib, 'last_active', m.last_active, 'is_staff', m.is_staff)
                  order by array_position(array['leader','officer','member'], m.role), m.contrib desc), '[]') from public.guild_members m where m.guild_id = g.id),
    'requests', case when me.role in ('leader', 'officer') then (select coalesce(jsonb_agg(jsonb_build_object('user_id', r.user_id, 'name', r.name, 'at', r.at) order by r.at), '[]') from public.guild_requests r where r.guild_id = g.id) else '[]'::jsonb end,
    'ledger', (select coalesce(jsonb_agg(x order by x.id desc), '[]') from (select id, name, kind, amount, item, at from public.guild_ledger where guild_id = g.id order by id desc limit 30) x),
    'quests', (select coalesce(jsonb_agg(jsonb_build_object('idx', q.idx, 'kind', q.kind, 'target', q.target, 'xp', q.xp, 'gold', q.gold, 'progress', coalesce(p.progress, 0), 'done', coalesce(p.done, false)) order by q.idx), '[]')
                from public.gv2_quests(w) q left join public.guild_quests p on p.guild_id = g.id and p.week = w and p.idx = q.idx),
    'week', w);
end $$;
-- Banner + tag per name on a floor's damage board (for the leaderboard / chat badges). Public.
create or replace function public.guild_tags(p_floor int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(d.name, jsonb_build_object('tag', g.tag, 'banner', g.banner)), '{}'::jsonb)
  from public.damage d join public.guild_members m on m.user_id = d.user_id join public.guilds g on g.id = m.guild_id where d.floor = p_floor and not d.is_staff $$;
-- Guild board now also carries level and banner.
create or replace function public.guild_board(p_floor int default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.damage desc, x.name), '[]'::jsonb) from (
    select g.id, g.name, g.tag, g.banner, public.gv2_level(g.xp) as level, g.open, (select count(*) from public.guild_members m2 where m2.guild_id = g.id) as members,
           coalesce(sum(d.damage) filter (where not d.is_staff and not m.is_staff), 0) as damage
    from public.guilds g join public.guild_members m on m.guild_id = g.id
    left join public.damage d on d.user_id = m.user_id and (p_floor is null or d.floor = p_floor)
    group by g.id order by damage desc, g.name limit 25) x;
$$;

-- ============================== grants ==============================
do $$ declare f text; begin
  for f in select unnest(array['gv2_quest_bump(bigint, text, bigint, boolean)', 'gv2_check_leader(bigint)', 'gv2_add(uuid, bigint)', 'gv2_need(boolean)', 'gv2_me()', 'gv2_name(uuid)', 'gv2_is_staff(uuid)',
      'gv2_on_damage()', 'gv2_on_clear()', 'guild_create(text, text)', 'guild_join(text)', 'guild_leave()', 'guild_set_open(boolean)', 'guild_invite(uuid)', 'guild_accept_invite(bigint)', 'guild_decline_invite(bigint)',
      'guild_answer(uuid, boolean)', 'guild_kick(uuid)', 'guild_set_role(uuid, text)', 'guild_donate(bigint)', 'guild_upgrade(text)', 'guild_set_banner(text, text, text)', 'guild_chat_post(text, text)',
      'guild_info()', 'guild_tags(int)', 'guild_board(int)']) loop
    execute 'revoke all on function public.' || f || ' from public';
  end loop;
end $$;
grant execute on function public.guild_create(text, text), public.guild_join(text), public.guild_leave(), public.guild_set_open(boolean), public.guild_invite(uuid),
  public.guild_accept_invite(bigint), public.guild_decline_invite(bigint), public.guild_answer(uuid, boolean), public.guild_kick(uuid), public.guild_set_role(uuid, text),
  public.guild_donate(bigint), public.guild_upgrade(text), public.guild_set_banner(text, text, text), public.guild_chat_post(text, text), public.guild_info(),
  public.guild_tags(int), public.guild_board(int) to authenticated;
grant execute on function public.guild_board(int), public.guild_tags(int) to anon;
-- gv2_* helpers stay internal (called only by the functions/triggers above).

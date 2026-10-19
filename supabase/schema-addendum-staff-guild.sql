-- $LOGOUT staff guild addendum (run after schema-addendum-guilds-v2.sql). Idempotent: safe to run more than once.
-- One staff account may found and lead exactly ONE staff guild (guilds.is_staff). A staff guild is a hangout only:
-- no guild bonus, no guild XP or levels from damage, no weekly quest progress or rewards, no bank (donations/upgrades refused),
-- never on the guild board (it is private), always invite-only, joinable by invite only (no join requests).
-- The name "Floor Zero" / tag "ZERO" (and near-variants) are reserved for it. The GM's own damage never counts for guilds (unchanged).
alter table public.guilds add column if not exists is_staff boolean not null default false;
create unique index if not exists guilds_one_staff on public.guilds ((true)) where is_staff;

-- Privacy: a staff guild row (and its member list) is readable only by its members and invitees; other guilds stay public.
create or replace function public.gv2_can_see(p_gid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select is_staff from public.guilds where id = p_gid), false)
      or exists (select 1 from public.guild_members where guild_id = p_gid and user_id = auth.uid())
      or exists (select 1 from public.guild_invites where guild_id = p_gid and user_id = auth.uid()) $$;
grant execute on function public.gv2_can_see(bigint) to anon, authenticated;
drop policy if exists "public guilds" on public.guilds;
create policy "public guilds" on public.guilds for select using (not is_staff or public.gv2_can_see(id));
drop policy if exists "public guild members" on public.guild_members;
create policy "public guild members" on public.guild_members for select using (public.gv2_can_see(guild_id));

-- Reserved names: letters/digits only, lowercased, 0->o and 1->i, so "Floor 0", "FloorZero", "FL00R ZER0" all match.
create or replace function public.gv2_reserved(p_name text, p_tag text) returns boolean
language sql immutable set search_path = public as $$
  select (translate(lower(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9]', '', 'g')), '01', 'oi') like any (array['%floorzero%', 'flooro']))
      or translate(lower(regexp_replace(coalesce(p_tag, ''), '[^A-Za-z0-9]', '', 'g')), '01', 'oi') = 'zero' $$;
create or replace function public.gv2_staff_guild(p_gid bigint) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce((select is_staff from public.guilds where id = p_gid), false) $$;

-- Quests: a staff guild never progresses or earns rewards (covers damage, floors, active and donate).
create or replace function public.gv2_quest_bump(p_gid bigint, p_kind text, p_amount bigint, p_set boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare w int := public.gv2_week(); q record; cur public.guild_quests;
begin
  if public.gv2_staff_guild(p_gid) then return; end if;
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

-- Leadership in a staff guild never passes on by inactivity.
create or replace function public.gv2_check_leader(p_gid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare ld public.guild_members; heir public.guild_members;
begin
  if public.gv2_staff_guild(p_gid) then return; end if;
  select * into ld from public.guild_members where guild_id = p_gid and role = 'leader';
  if ld.user_id is not null and greatest(ld.last_active, coalesce((select last_submit from public.profiles where id = ld.user_id), ld.last_active)) > now() - interval '14 days' then return; end if;
  select * into heir from public.guild_members where guild_id = p_gid and role = 'officer' and not is_staff and last_active > now() - interval '14 days'
    order by last_active desc, contrib desc limit 1;
  if heir.user_id is null then return; end if;
  update public.guild_members set role = 'officer' where guild_id = p_gid and role = 'leader';
  update public.guild_members set role = 'leader' where user_id = heir.user_id;
  update public.guilds set owner = heir.user_id where id = p_gid;
end $$;

-- Damage: no guild XP, contribution-driven levels or quests for a staff guild (members' last_active still updates).
create or replace function public.gv2_on_damage() returns trigger
language plpgsql security definer set search_path = public as $$
declare d bigint := new.damage - coalesce(case when tg_op = 'UPDATE' then old.damage end, 0); m public.guild_members; act int;
begin
  if d <= 0 or new.is_staff then return new; end if;
  select * into m from public.guild_members where user_id = new.user_id; if m.user_id is null or m.is_staff then return new; end if;
  if public.gv2_staff_guild(m.guild_id) then update public.guild_members set last_active = now() where user_id = new.user_id; return new; end if;
  update public.guild_members set contrib = contrib + d, last_active = now(), active_week = public.gv2_week() where user_id = new.user_id;
  update public.guilds set xp = xp + d where id = m.guild_id;
  perform public.gv2_quest_bump(m.guild_id, 'damage', d);
  select count(*) into act from public.guild_members where guild_id = m.guild_id and not is_staff and active_week = public.gv2_week();
  perform public.gv2_quest_bump(m.guild_id, 'active', act, true);
  perform public.gv2_check_leader(m.guild_id);
  return new;
end $$;

-- Founding: staff may found the (single) staff guild; reserved names are staff-only; staff guilds start private.
create or replace function public.guild_create(p_name text, p_tag text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); t text := upper(btrim(coalesce(p_tag, ''))); g public.guilds; c jsonb; st boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  st := public.gv2_is_staff(uid);
  if exists (select 1 from public.guild_members where user_id = uid) then raise exception 'already in a guild'; end if;
  if n !~ '^[A-Za-z0-9'' -]{3,24}$' then raise exception 'name: 3-24 letters, digits, spaces'; end if;
  if t !~ '^[A-Z0-9]{2,4}$' then raise exception 'tag: 2-4 letters or digits'; end if;
  if not st and public.gv2_reserved(n, t) then raise exception 'That name is reserved.'; end if;
  c := public.chat_clean(n, 24); if not (c->>'ok')::boolean or c->>'text' <> n then raise exception 'that name is not allowed'; end if;
  c := public.chat_clean(t, 24); if not (c->>'ok')::boolean or c->>'text' <> t then raise exception 'that name is not allowed'; end if;
  if st and exists (select 1 from public.guilds where is_staff) then raise exception 'a staff guild already exists'; end if;
  if exists (select 1 from public.guilds where lower(name) = lower(n) or tag = t) then raise exception 'name or tag taken'; end if;
  insert into public.guilds (name, tag, owner, is_staff, open) values (n, t, uid, st, not st) returning * into g;
  insert into public.guild_members (user_id, guild_id, role, is_staff) values (uid, g.id, 'leader', st);
  delete from public.guild_requests where user_id = uid; delete from public.guild_invites where user_id = uid;
  return to_jsonb(g);
end $$;

-- Joining: a staff guild only by invite. Without one it looks like it doesn't exist (no request is left).
create or replace function public.guild_join(p_tag text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.guilds; inv boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.guild_members where user_id = uid) then raise exception 'already in a guild'; end if;
  select * into g from public.guilds where tag = upper(btrim(p_tag)); if g.id is null then raise exception 'no such guild'; end if;
  inv := exists (select 1 from public.guild_invites where user_id = uid and guild_id = g.id);
  if g.is_staff and not inv then raise exception 'no such guild'; end if;
  if (g.open and not g.is_staff) or inv then
    perform public.gv2_add(uid, g.id); return to_jsonb(g) || jsonb_build_object('joined', true);
  end if;
  if (select count(*) from public.guild_requests where user_id = uid) >= 3 then raise exception 'too many pending requests'; end if;
  insert into public.guild_requests (user_id, guild_id, name) values (uid, g.id, left(public.gv2_name(uid), 20)) on conflict do nothing;
  return to_jsonb(g) || jsonb_build_object('joined', false, 'requested', true);
end $$;

-- Leaving: when the staff leader leaves, the staff guild is disbanded (it is never handed to a player).
create or replace function public.guild_leave() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.guild_members; heir uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.guild_members where user_id = uid returning * into me;
  if me.guild_id is null then return; end if;
  if public.gv2_staff_guild(me.guild_id) then
    if me.role = 'leader' then
      delete from public.guild_members where guild_id = me.guild_id; delete from public.guild_invites where guild_id = me.guild_id;
      delete from public.guild_requests where guild_id = me.guild_id; delete from public.guilds where id = me.guild_id;
    end if;
    return;
  end if;
  if me.role = 'leader' then
    select user_id into heir from public.guild_members where guild_id = me.guild_id and not is_staff
      order by (role = 'officer') desc, last_active desc, joined_at limit 1;
    if heir is not null then update public.guild_members set role = 'leader' where user_id = heir; update public.guilds set owner = heir where id = me.guild_id; end if;
  end if;
  if not exists (select 1 from public.guild_members where guild_id = me.guild_id and not is_staff) then delete from public.guilds where id = me.guild_id; end if;
end $$;

create or replace function public.guild_set_open(p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me public.guild_members := public.gv2_need(true);
begin
  if public.gv2_staff_guild(me.guild_id) then raise exception 'a staff guild is always invite-only'; end if;
  update public.guilds set open = coalesce(p_open, true) where id = me.guild_id;
end $$;

-- Ranks: players may be officers in a staff guild, but its leadership can't be transferred.
create or replace function public.guild_set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare me public.guild_members := public.gv2_need(false); t public.guild_members;
begin
  select * into t from public.guild_members where user_id = p_user and guild_id = me.guild_id;
  if t.user_id is null or t.user_id = me.user_id then raise exception 'not a member you can change'; end if;
  if p_role not in ('officer', 'member', 'leader') then raise exception 'bad role'; end if;
  if p_role <> 'member' and t.is_staff then raise exception 'staff cannot lead or officer a guild'; end if;
  if p_role = 'leader' and public.gv2_staff_guild(me.guild_id) then raise exception 'staff guild leadership cannot be transferred'; end if;
  if p_role = 'leader' then
    update public.guild_members set role = 'officer' where user_id = me.user_id;
    update public.guilds set owner = p_user where id = me.guild_id;
  end if;
  update public.guild_members set role = p_role where user_id = p_user;
end $$;

-- Bank: a staff guild has none. These wrappers refuse first, then run the v2 logic.
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'gv2_donate_inner') then
    alter function public.guild_donate(bigint) rename to gv2_donate_inner;
    alter function public.guild_upgrade(text) rename to gv2_upgrade_inner;
  end if;
end $$;
create or replace function public.guild_donate(p_amount bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.gv2_staff_guild((select guild_id from public.guild_members where user_id = auth.uid())) then raise exception 'a staff guild has no bank'; end if;
  return public.gv2_donate_inner(p_amount);
end $$;
create or replace function public.guild_upgrade(p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.gv2_staff_guild((select guild_id from public.guild_members where user_id = auth.uid())) then raise exception 'a staff guild has no bank'; end if;
  return public.gv2_upgrade_inner(p_kind);
end $$;

-- Info: staff guilds report bonus 0 and flag invites so the client can say "Staff guild: no bonus".
create or replace function public.guild_info() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.guild_members; g public.guilds; lv int; w int := public.gv2_week();
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into me from public.guild_members where user_id = uid;
  if me.user_id is null then
    return jsonb_build_object('guild', null,
      'invites', (select coalesce(jsonb_agg(jsonb_build_object('guild_id', g2.id, 'name', g2.name, 'tag', g2.tag, 'banner', g2.banner, 'is_staff', g2.is_staff)), '[]') from public.guild_invites i join public.guilds g2 on g2.id = i.guild_id where i.user_id = uid),
      'requests', (select coalesce(jsonb_agg(jsonb_build_object('guild_id', g2.id, 'tag', g2.tag)), '[]') from public.guild_requests r join public.guilds g2 on g2.id = r.guild_id where r.user_id = uid));
  end if;
  perform public.gv2_check_leader(me.guild_id);
  select * into me from public.guild_members where user_id = uid;
  select * into g from public.guilds where id = me.guild_id; lv := case when g.is_staff then 1 else public.gv2_level(g.xp) end;
  return jsonb_build_object(
    'guild', to_jsonb(g) || jsonb_build_object('level', lv, 'slots', public.gv2_slots(lv), 'bonus_pct', case when g.is_staff then 0 else public.gv2_bonus(g.bonus_tier) end, 'sigils', public.gv2_sigils(lv, g.banner_unlocks)),
    'me', jsonb_build_object('role', me.role, 'is_staff', me.is_staff, 'user_id', uid),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', public.gv2_name(m.user_id), 'role', m.role, 'contrib', m.contrib, 'last_active', m.last_active, 'is_staff', m.is_staff)
                  order by array_position(array['leader','officer','member'], m.role), m.contrib desc), '[]') from public.guild_members m where m.guild_id = g.id),
    'requests', case when me.role in ('leader', 'officer') and not g.is_staff then (select coalesce(jsonb_agg(jsonb_build_object('user_id', r.user_id, 'name', r.name, 'at', r.at) order by r.at), '[]') from public.guild_requests r where r.guild_id = g.id) else '[]'::jsonb end,
    'ledger', (select coalesce(jsonb_agg(x order by x.id desc), '[]') from (select id, name, kind, amount, item, at from public.guild_ledger where guild_id = g.id order by id desc limit 30) x),
    'quests', case when g.is_staff then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('idx', q.idx, 'kind', q.kind, 'target', q.target, 'xp', q.xp, 'gold', q.gold, 'progress', coalesce(p.progress, 0), 'done', coalesce(p.done, false)) order by q.idx), '[]')
                from public.gv2_quests(w) q left join public.guild_quests p on p.guild_id = g.id and p.week = w and p.idx = q.idx) end,
    'week', w);
end $$;

-- Tags still show [ZERO] next to members' names (with a staff flag for the mark); the board never lists a staff guild.
create or replace function public.guild_tags(p_floor int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(d.name, jsonb_build_object('tag', g.tag, 'banner', g.banner, 'staff', g.is_staff)), '{}'::jsonb)
  from public.damage d join public.guild_members m on m.user_id = d.user_id join public.guilds g on g.id = m.guild_id where d.floor = p_floor and not d.is_staff $$;
create or replace function public.guild_board(p_floor int default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.damage desc, x.name), '[]'::jsonb) from (
    select g.id, g.name, g.tag, g.banner, public.gv2_level(g.xp) as level, g.open, (select count(*) from public.guild_members m2 where m2.guild_id = g.id) as members,
           coalesce(sum(d.damage) filter (where not d.is_staff and not m.is_staff), 0) as damage
    from public.guilds g join public.guild_members m on m.guild_id = g.id
    left join public.damage d on d.user_id = m.user_id and (p_floor is null or d.floor = p_floor)
    where not g.is_staff
    group by g.id order by damage desc, g.name limit 25) x;
$$;

-- Grants: internal helpers stay private; RPCs keep the same grants as the v2 addendum.
revoke all on function public.gv2_reserved(text, text) from public, anon, authenticated;
revoke all on function public.gv2_staff_guild(bigint) from public, anon, authenticated;
revoke all on function public.gv2_quest_bump(bigint, text, bigint, boolean) from public, anon, authenticated;
revoke all on function public.gv2_check_leader(bigint) from public, anon, authenticated;
revoke all on function public.gv2_donate_inner(bigint) from public, anon, authenticated;
revoke all on function public.gv2_upgrade_inner(text) from public, anon, authenticated;
do $$ declare f text; begin
  for f in select unnest(array['guild_create(text, text)', 'guild_join(text)', 'guild_leave()', 'guild_set_open(boolean)', 'guild_set_role(uuid, text)', 'guild_donate(bigint)', 'guild_upgrade(text)', 'guild_info()']) loop
    execute format('revoke all on function public.%s from public, anon', f); execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'grant execute on function public.guild_board(int) to anon, authenticated'; execute 'grant execute on function public.guild_tags(int) to anon, authenticated';
end $$;

-- $LOGOUT addendum: OPEN CHAT + launch fixes. Idempotent: safe to run more than once.
-- Run after every other addendum (schema, guilds-chat, guilds-v2, staff-guild, floor-zero, floors-11-20, arc1-pacing, turnout-scaling).
-- 1) Every player may post in floor chat and guild chat (guest accounts too), behind a shared server-side gate (chat_gate):
--    - guests must have played a little first: account at least 5 minutes old and at least one damage submit;
--    - slow mode 1 message / 10 s (unchanged), and at most 30 messages per rolling hour per account (both channels together);
--    - the same text twice in a row within 2 minutes is refused (copy-paste spam);
--    - floor-wide flood guard: when the floor channel had 40+ messages in the last minute, only bound accounts may post;
--    - max 200 chars, links / wallet-like strings refused, banned words masked (chat_clean, unchanged), guild chat members only.
--    Authors stay an opaque hash; no email, wallet or user id is ever written to a message.
-- 2) submit_damage() returns the floor row AFTER the turnout trigger (it used to return the unscaled max_hp on a floor change).
alter table public.profiles add column if not exists chat_win_start timestamptz;
alter table public.profiles add column if not exists chat_win_n int not null default 0;
alter table public.profiles add column if not exists chat_last_hash text;
create index if not exists chat_messages_floor_at on public.chat_messages (floor, at);
insert into public.chat_banned_words (word) values ('kike'), ('tranny'), ('wetback'), ('beaner'), ('towelhead') on conflict do nothing;

-- Raises with a player-facing reason, or returns the (locked) profile. p_floor is null for guild chat.
create or replace function public.chat_gate(p_uid uuid, p_body text, p_floor int) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare prof public.profiles; anon boolean; h text := md5(lower(btrim(coalesce(p_body, ''))));
begin
  select coalesce(u.is_anonymous, true) into anon from auth.users u where u.id = p_uid;
  select * into prof from public.profiles where id = p_uid for update;
  if prof.id is null then raise exception 'not signed in'; end if;
  if anon is distinct from false and prof.role <> 'gm' then
    if prof.created_at > now() - interval '5 minutes' or prof.last_submit is null then raise exception 'climb for a few minutes before you can chat'; end if;
    if p_floor is not null and (select count(*) from public.chat_messages where floor = p_floor and at > now() - interval '1 minute') >= 40 then
      raise exception 'chat is very busy: bind your identity (System) to post right now'; end if;
  end if;
  if prof.chat_win_start is null or prof.chat_win_start < now() - interval '1 hour' then prof.chat_win_start := now(); prof.chat_win_n := 0; end if;
  if prof.chat_win_n >= 30 and prof.role <> 'gm' then raise exception 'chat limit: 30 messages per hour'; end if;
  if prof.chat_last_hash = h and coalesce(greatest(prof.last_chat, prof.last_gchat), now() - interval '1 day') > now() - interval '2 minutes' then raise exception 'you just said that'; end if;
  update public.profiles set chat_win_start = prof.chat_win_start, chat_win_n = prof.chat_win_n + 1, chat_last_hash = h where id = p_uid;
  return prof;
end $$;

create or replace function public.chat_post(p_name text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); prof public.profiles; c jsonb; nm jsonb; f int; tag text; m public.chat_messages;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select floor into f from public.floor_state where id = 1;
  select last_chat into prof.last_chat from public.profiles where id = uid;
  if prof.last_chat is not null and prof.last_chat > now() - interval '10 seconds' then raise exception 'slow mode: 1 message every 10 seconds'; end if;
  c := public.chat_clean(p_body, 200); if not (c->>'ok')::boolean then raise exception '%', c->>'reason'; end if;
  nm := public.chat_clean(left(p_name, 20), 20); if not (nm->>'ok')::boolean or nm->>'text' <> btrim(left(p_name, 20)) then raise exception 'name not allowed in chat'; end if;
  prof := public.chat_gate(uid, p_body, f);
  select g.tag into tag from public.guild_members gm join public.guilds g on g.id = gm.guild_id where gm.user_id = uid;
  update public.profiles set last_chat = now() where id = uid;
  insert into public.chat_messages (floor, author, name, guild_tag, is_staff, body)
    values (f, left(md5('logout-chat:' || uid::text), 12), nm->>'text', tag, prof.role = 'gm', c->>'text') returning * into m;
  delete from public.chat_messages where floor = f and id <= (select id from public.chat_messages where floor = f order by id desc offset 100 limit 1);
  return jsonb_build_object('id', m.id, 'floor', m.floor, 'author', m.author, 'name', m.name, 'guild_tag', m.guild_tag, 'is_staff', m.is_staff, 'body', m.body, 'at', m.at);
end $$;

create or replace function public.guild_chat_post(p_name text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); prof public.profiles; c jsonb; nm jsonb; me public.guild_members; m public.guild_messages; lg timestamptz;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into me from public.guild_members where user_id = uid; if me.user_id is null then raise exception 'not in a guild'; end if;
  select last_gchat into lg from public.profiles where id = uid;
  if lg is not null and lg > now() - interval '10 seconds' then raise exception 'slow mode: 1 message every 10 seconds'; end if;
  c := public.chat_clean(p_body, 200); if not (c->>'ok')::boolean then raise exception '%', c->>'reason'; end if;
  nm := public.chat_clean(left(p_name, 20), 20); if not (nm->>'ok')::boolean or nm->>'text' <> btrim(left(p_name, 20)) then raise exception 'name not allowed in chat'; end if;
  prof := public.chat_gate(uid, p_body, null);
  update public.profiles set last_gchat = now() where id = uid;
  insert into public.guild_messages (guild_id, author, name, is_staff, body) values (me.guild_id, left(md5('logout-chat:' || uid::text), 12), nm->>'text', me.is_staff, c->>'text') returning * into m;
  delete from public.guild_messages where guild_id = me.guild_id and id <= (select id from public.guild_messages where guild_id = me.guild_id order by id desc offset 100 limit 1);
  return to_jsonb(m) - 'guild_id';
end $$;
revoke all on function public.chat_gate(uuid, text, int) from public, anon, authenticated;
revoke all on function public.chat_post(text, text), public.guild_chat_post(text, text) from public, anon;
grant execute on function public.chat_post(text, text), public.guild_chat_post(text, text) to authenticated;

-- ---- 2) submit_damage: same as schema-addendum-guilds-chat.sql, but returns the row as stored (after the turnout trigger).
create or replace function public.submit_damage(p_amount bigint, p_name text, p_level int, p_gear int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); prof public.profiles; fs public.floor_state;
  elapsed double precision; max_dps double precision; allowed bigint; accepted bigint; staff boolean; over bigint; ranking text[]; dm jsonb;
  lv double precision := greatest(least(p_level, 500), 1); forge double precision := power(1.15, greatest(least(p_gear, 200), 0));
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into prof from public.profiles where id = uid for update;
  staff := coalesce(prof.role = 'gm', false);
  elapsed := least(extract(epoch from now() - coalesce(prof.last_submit, now() - interval '30 seconds')), 12 * 3600);
  update public.profiles set last_submit = now() where id = uid;
  select * into fs from public.floor_state where id = 1 for update;
  max_dps := greatest(
    6.5 * (1 + 0.25 * lv - 0.25) * forge * 4 + 50,
    (6.5 * (1 + 0.25 * lv - 0.25) + 1.5 * public.gear_scale(least(fs.floor + 5, fs.max_floor)) * 3.6) * forge * 8 + 50);
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
    returning floor, hp, max_hp into fs.floor, fs.hp, fs.max_hp; -- values after the turnout trigger (scaled max_hp on a new floor)
  return jsonb_build_object('floor', fs.floor, 'hp', fs.hp, 'max_hp', fs.max_hp, 'accepted', accepted, 'gm_present_until', fs.gm_present_until, 'gm_announce', fs.gm_announce,
    'gm_marks', fs.gm_marks);
end $$;

-- ---- 3) Lean reads (free-tier egress). floor_clears rows carry every player's name and damage (tens of KB at a busy launch),
-- and every client used to download each one, plus 300 of them for the Tower Map. These return only what one client needs.
create or replace function public.my_clears(p_after bigint, p_name text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'floor', c.floor, 'max_hp', c.max_hp,
           'rank', coalesce(array_position(c.ranking, left(p_name, 20)), 0), 'dmg', coalesce((c.dmg->>left(p_name, 20))::bigint, 0)) order by c.id), '[]'::jsonb)
  from (select * from public.floor_clears where id > coalesce(p_after, 0) order by id limit 50) c $$;
create or replace function public.floor_history() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('floor', x.floor, 'at', x.at, 'top', x.ranking[1]) order by x.id desc), '[]'::jsonb)
  from (select id, floor, at, ranking from public.floor_clears order by id desc limit 300) x $$;
grant execute on function public.my_clears(bigint, text), public.floor_history() to anon, authenticated;
-- guild_tags: only the floor's top 50 damage dealers (the leaderboard shows 25; chat rows carry their own tag). It returned every
-- guild member on the floor: ~28 KB at 500 players, polled by every client.
create or replace function public.guild_tags(p_floor int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(t.name, jsonb_build_object('tag', g.tag, 'banner', g.banner, 'staff', g.is_staff)), '{}'::jsonb)
  from (select d.name, d.user_id from public.damage d where d.floor = p_floor and not d.is_staff order by d.damage desc limit 50) t
  join public.guild_members m on m.user_id = t.user_id join public.guilds g on g.id = m.guild_id $$;
grant execute on function public.guild_tags(int) to anon, authenticated;

-- $LOGOUT schema addendum: guilds + filtered floor chat. Run AFTER schema.sql, in the SQL Editor.
-- Idempotent: safe to run again (create ... if not exists, create or replace, policies dropped and recreated).
-- RLS is on for every table; clients can only READ. Every write goes through the SECURITY DEFINER functions below.
-- The client keeps both features behind FEATURES.guilds / FEATURES.chat (config.js), 'off' until this has run.

-- ============================== tables ==============================
create table if not exists public.guilds (
  id bigserial primary key,
  name text not null check (char_length(name) between 3 and 24),
  tag text not null check (tag ~ '^[A-Z0-9]{2,4}$'),
  owner uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists guilds_name_ci on public.guilds (lower(name));
create unique index if not exists guilds_tag_u on public.guilds (tag);
create table if not exists public.guild_members (
  user_id uuid primary key references auth.users on delete cascade,  -- one guild per account
  guild_id bigint not null references public.guilds on delete cascade,
  is_staff boolean not null default false,   -- staff may sit in a guild but never owns one and adds nothing to its total
  joined_at timestamptz not null default now()
);
create index if not exists guild_members_g on public.guild_members (guild_id);
create table if not exists public.chat_banned_words (word text primary key check (word ~ '^[a-z]{3,}$'));
insert into public.chat_banned_words (word) values
  ('fuck'), ('shit'), ('cunt'), ('bitch'), ('asshole'), ('bastard'), ('dick'), ('pussy'), ('whore'), ('slut'),
  ('nigger'), ('nigga'), ('faggot'), ('fag'), ('retard'), ('rape'), ('kys'), ('nazi')
  on conflict do nothing;                    -- mirrors js/chatfilter.js BANNED; add more rows here any time
create table if not exists public.chat_messages (
  id bigserial primary key,
  floor int not null,
  author text not null,                      -- short opaque hash of the account (for client-side mute); never the user id
  name text not null,
  guild_tag text,
  is_staff boolean not null default false,
  body text not null check (char_length(body) <= 200),
  hidden boolean not null default false,     -- set by reports (3 distinct reporters) or a moderator
  at timestamptz not null default now()
);
create index if not exists chat_floor_id on public.chat_messages (floor, id);
create table if not exists public.chat_reports (
  message_id bigint not null references public.chat_messages on delete cascade,
  reporter uuid not null references auth.users on delete cascade,
  reason text check (char_length(reason) <= 60),
  at timestamptz not null default now(),
  primary key (message_id, reporter)
);
alter table public.profiles add column if not exists last_chat timestamptz;

alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.chat_banned_words enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reports enable row level security;
drop policy if exists "public guilds" on public.guilds;
create policy "public guilds" on public.guilds for select using (true);
drop policy if exists "public guild members" on public.guild_members;
create policy "public guild members" on public.guild_members for select using (true);
drop policy if exists "visible chat" on public.chat_messages;
create policy "visible chat" on public.chat_messages for select using (not hidden);
-- chat_banned_words and chat_reports: no policies at all, so clients can neither read nor write them.

-- ============================== filter ==============================
-- Mirrors js/chatfilter.js cleanChat(). Links and wallet-like strings are refused; banned words are masked.
create or replace function public.chat_clean(p text, p_max int default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t text; w text; n text; outw text[] := '{}';
begin
  t := regexp_replace(coalesce(p, ''), '[\x01-\x1f\x7f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]', '', 'g');
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  if t = '' then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(t) > p_max then return jsonb_build_object('ok', false, 'reason', 'too long'); end if;
  if t ~* '(https?|ftp|wss?)://' or t ~* '\ywww\.' or t ~* 'discord\s*\.?\s*(gg|com/invite)' or t ~* '\yt\.me\y'
     or t ~* '\y[a-z0-9-]{2,}(\.|\s*[([]dot[])]\s*)[a-z]{2,}\y'
     or t ~* '\y[a-z0-9-]{2,}\s+dot\s+(com|net|org|io|gg|xyz|app|me|co|ru|sol|eth|link|site|fun|xxx|info|biz|dev|tv|to|cc)\y' then
    return jsonb_build_object('ok', false, 'reason', 'links are not allowed'); end if;
  if t ~ '\y[1-9A-HJ-NP-Za-km-z]{26,}\y' or t ~ '\y0x[0-9a-fA-F]{20,}' or t ~* '\ybc1[a-z0-9]{20,}' or t ~ '\y(?=[A-Za-z]*[0-9])[A-Za-z0-9]{20,}\y' then
    return jsonb_build_object('ok', false, 'reason', 'addresses and codes are not allowed'); end if;
  foreach w in array string_to_array(t, ' ') loop
    n := regexp_replace(translate(lower(w), '01345789@$!', 'oieastbgasi'), '[^a-z]', '', 'g');
    if n <> '' and exists (select 1 from public.chat_banned_words b where n like b.word || '%') then outw := outw || repeat('*', char_length(w));
    else outw := outw || w; end if;
  end loop;
  return jsonb_build_object('ok', true, 'text', array_to_string(outw, ' '));
end $$;

-- ============================== guilds ==============================
create or replace function public.guild_create(p_name text, p_tag text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); t text := upper(btrim(coalesce(p_tag, ''))); g public.guilds; c jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.profiles where id = uid and role = 'gm') then raise exception 'staff cannot own a guild'; end if;
  if exists (select 1 from public.guild_members where user_id = uid) then raise exception 'already in a guild'; end if;
  if n !~ '^[A-Za-z0-9'' -]{3,24}$' then raise exception 'name: 3-24 letters, digits, spaces'; end if;
  if t !~ '^[A-Z0-9]{2,4}$' then raise exception 'tag: 2-4 letters or digits'; end if;
  c := public.chat_clean(n, 24); if not (c->>'ok')::boolean or c->>'text' <> n then raise exception 'that name is not allowed'; end if;
  c := public.chat_clean(t, 24); if not (c->>'ok')::boolean or c->>'text' <> t then raise exception 'that name is not allowed'; end if;
  if exists (select 1 from public.guilds where lower(name) = lower(n) or tag = t) then raise exception 'name or tag taken'; end if;
  insert into public.guilds (name, tag, owner) values (n, t, uid) returning * into g;
  insert into public.guild_members (user_id, guild_id) values (uid, g.id);
  return to_jsonb(g);
end $$;
create or replace function public.guild_join(p_tag text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g public.guilds; staff boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.guild_members where user_id = uid) then raise exception 'already in a guild'; end if;
  select * into g from public.guilds where tag = upper(btrim(p_tag)) for update;
  if g.id is null then raise exception 'no such guild'; end if;
  if (select count(*) from public.guild_members where guild_id = g.id) >= 30 then raise exception 'guild is full'; end if;
  staff := exists (select 1 from public.profiles where id = uid and role = 'gm');
  insert into public.guild_members (user_id, guild_id, is_staff) values (uid, g.id, staff);
  return to_jsonb(g);
end $$;
create or replace function public.guild_leave() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); gid bigint; heir uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.guild_members where user_id = uid returning guild_id into gid;
  if gid is null then return; end if;
  if (select owner from public.guilds where id = gid) = uid then           -- hand the guild to the longest-serving non-staff member
    select user_id into heir from public.guild_members where guild_id = gid and not is_staff order by joined_at limit 1;
    if heir is null then delete from public.guilds where id = gid; else update public.guilds set owner = heir where id = gid; end if;
  end if;
  if not exists (select 1 from public.guild_members where guild_id = gid) then delete from public.guilds where id = gid; end if;
end $$;
-- Guild totals for a floor (null = all floors). Staff damage is never added to a guild, so a guild gets no advantage from staff.
create or replace function public.guild_board(p_floor int default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.damage desc, x.name), '[]'::jsonb) from (
    select g.id, g.name, g.tag, (select count(*) from public.guild_members m2 where m2.guild_id = g.id) as members,
           coalesce(sum(d.damage) filter (where not d.is_staff and not m.is_staff), 0) as damage
    from public.guilds g join public.guild_members m on m.guild_id = g.id
    left join public.damage d on d.user_id = m.user_id and (p_floor is null or d.floor = p_floor)
    group by g.id order by damage desc, g.name limit 25) x;
$$;

-- ============================== chat ==============================
-- One channel per floor (the CURRENT shared floor, decided here). Identity-bound accounts only, 1 message / 10 s,
-- max 200 chars, links and addresses refused, banned words masked, only the last 100 messages per floor kept.
create or replace function public.chat_post(p_name text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); prof public.profiles; anon boolean; c jsonb; nm jsonb; f int; tag text; m public.chat_messages;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select coalesce(u.is_anonymous, true) into anon from auth.users u where u.id = uid;
  if anon is distinct from false then raise exception 'bind your identity to post'; end if;
  select * into prof from public.profiles where id = uid for update;
  if prof.last_chat is not null and prof.last_chat > now() - interval '10 seconds' then raise exception 'slow mode: 1 message every 10 seconds'; end if;
  c := public.chat_clean(p_body, 200); if not (c->>'ok')::boolean then raise exception '%', c->>'reason'; end if;
  nm := public.chat_clean(left(p_name, 20), 20); if not (nm->>'ok')::boolean or nm->>'text' <> btrim(left(p_name, 20)) then raise exception 'name not allowed in chat'; end if;
  select floor into f from public.floor_state where id = 1;
  select g.tag into tag from public.guild_members gm join public.guilds g on g.id = gm.guild_id where gm.user_id = uid;
  update public.profiles set last_chat = now() where id = uid;
  insert into public.chat_messages (floor, author, name, guild_tag, is_staff, body)
    values (f, left(md5('logout-chat:' || uid::text), 12), nm->>'text', tag, prof.role = 'gm', c->>'text') returning * into m;
  delete from public.chat_messages where floor = f and id <= (select id from public.chat_messages where floor = f order by id desc offset 100 limit 1);
  return jsonb_build_object('id', m.id, 'floor', m.floor, 'author', m.author, 'name', m.name, 'guild_tag', m.guild_tag, 'is_staff', m.is_staff, 'body', m.body, 'at', m.at);
end $$;
create or replace function public.chat_report(p_id bigint, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.chat_reports (message_id, reporter, reason) values (p_id, uid, left(p_reason, 60)) on conflict do nothing;
  update public.chat_messages set hidden = true where id = p_id and (select count(*) from public.chat_reports where message_id = p_id) >= 3;
end $$;

revoke all on function public.chat_clean(text, int), public.guild_create(text, text), public.guild_join(text), public.guild_leave(),
  public.guild_board(int), public.chat_post(text, text), public.chat_report(bigint, text) from public;
grant execute on function public.guild_create(text, text), public.guild_join(text), public.guild_leave(),
  public.guild_board(int), public.chat_post(text, text), public.chat_report(bigint, text) to authenticated;
grant execute on function public.guild_board(int) to anon;
-- chat_clean stays internal (called by the functions above only).

-- ============================== staff Codex marks ==============================
-- Codex effects other players can see (role = gm only, so they can't be spoofed): Cornerstone rune, Supernova burst,
-- "The Architect has shaped Floor N." (The Final Shape), Herald's Voice entrance line (filtered), Final Decree / Collapse
-- of Stars (+6% Decree) and Decree Echo (presence lingers 2 min). Polled with floor_state; rate-limited per floor per 10 min.
alter table public.floor_state add column if not exists gm_marks jsonb not null default '{}'::jsonb;
create or replace function public.gm_mark(p_kind text, p_floor int, p_text text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare m jsonb; prev jsonb; t text := null; c jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'gm') then raise exception 'forbidden'; end if;
  if p_kind not in ('cornerstone', 'supernova', 'shaped', 'herald', 'decree6', 'echo') then raise exception 'unknown mark'; end if;
  select coalesce(gm_marks, '{}'::jsonb) into m from public.floor_state where id = 1 for update;
  if p_kind = 'echo' then
    update public.floor_state set gm_present_until = greatest(coalesce(gm_present_until, now()), now() + interval '210 seconds') where id = 1; return true; end if;
  if p_kind = 'decree6' then
    update public.floor_state set gm_marks = m || jsonb_build_object('decree6', jsonb_build_object('floor', p_floor, 'at', now(),
      'until', now() + case when p_text = 'final' then interval '120 seconds' else interval '10 seconds' end)) where id = 1; return true; end if;
  prev := m -> p_kind;
  if prev is not null and (prev->>'floor')::int = p_floor and (prev->>'at')::timestamptz > now() - interval '10 minutes' then return false; end if;
  if p_kind = 'herald' then c := public.chat_clean(p_text, 80); if not (c->>'ok')::boolean then raise exception '%', c->>'reason'; end if; t := c->>'text'; end if;
  update public.floor_state set gm_marks = m || jsonb_build_object(p_kind, jsonb_build_object('floor', p_floor, 'at', now(), 'text', t)) where id = 1;
  return true;
end $$;
revoke all on function public.gm_mark(text, int, text) from public;
grant execute on function public.gm_mark(text, int, text) to authenticated;

-- $LOGOUT addendum: DAILY QUESTS, GUILD WEEKLY MEMBER REWARDS, PLAYER ID CARDS. Idempotent: safe to run more than once.
-- Run after schema-addendum-sanctum.sql (last in the list). The client keeps working before this has run (it degrades gracefully).
--
-- 1) Daily quests: 3 per player per UTC day (reset 00:00 UTC, the same reset as the login streak). Only things the SERVER sees count,
--    so progress can't be faked from a saved game: accepted boss damage (offline batches included, already clamped by submit_damage),
--    time online (gaps between ticks of 20 min or less), floor chat posts, being on a floor when it falls, guild bank donations.
--    Progress rides inside tick() (the call the client already makes every flush) as a ~25-byte 'q' key: no new polling.
--    quest_claim() checks the target, pays the gold into the saved game once, and returns an XP share the client banks with the level cap.
-- 2) Guild weeklies: weeks now start Monday 00:00 UTC. Each member's contribution to the week's quests is recorded; when a quest is done,
--    every member who contributed (damage/donate: at least 1% of the target; floors/active: any) claims a personal gold + XP reward once.
-- 3) player_card(): read-only public ID card (hero, level, class, title, gear, talents, look, pet, guild). Whitelisted fields only:
--    never emails, wallets, auth ids, roles, saves' private fields. Staff shows only as a public 'st' flag (the "Tower Staff" badge
--    everyone already sees on the board); staff items are stripped from every non-staff card.

-- ============================== shared helpers ==============================
-- Price tier: ×1 on Floor 1 (mirrors baseHp(f) / baseHp(1) in js/floors.js; milestone ×2.5 removed).
create or replace function public.q_tier(f int) returns double precision language sql immutable as $$
  select public.floor_hp(greatest(f, 1)) / (case when greatest(f, 1) % 10 = 0 then 2.5 else 1 end) / public.floor_hp(1)::double precision $$;
create or replace function public.q_pay(p_uid uuid, p_gold bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare sv public.saves; gold bigint;
begin
  select * into sv from public.saves where user_id = p_uid for update;
  if sv.user_id is null then raise exception 'no saved game yet: play a minute, then claim'; end if;
  gold := floor(coalesce((sv.data->>'gold')::numeric, 0)) + greatest(p_gold, 0);
  update public.saves set data = jsonb_set(data, '{gold}', to_jsonb(gold)), updated_at = now() where user_id = p_uid;
  return gold;
end $$;

-- ============================== 1) daily quests ==============================
create table if not exists public.quest_days (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  f int not null,                          -- floor when the day's quests were drawn (sets the reward tier)
  kinds text[] not null,
  targets bigint[] not null,
  prog bigint[] not null,
  claimed int not null default 0,          -- bitmask of claimed quests
  last_at timestamptz,                     -- last tick seen
  primary key (user_id, day)
);
alter table public.quest_days enable row level security; -- no policies: definer functions only
create index if not exists quest_days_day on public.quest_days (day);

-- Rewards per kind: gold × tier of the floor the quests were drawn on, and a share of the current level's XP (client applies the cap).
create or replace function public.dq_reward(p_kind text, p_f int) returns jsonb language sql immutable as $$
  select jsonb_build_object('g', round((case p_kind when 'dmg' then 150 when 'online' then 120 else 180 end) * public.q_tier(p_f))::bigint,
    'x', case p_kind when 'dmg' then 0.25 when 'online' then 0.2 else 0.3 end) $$;
-- Third quest rotates by day: chat, clear, donate (donate falls back to clear outside a guild).
create or replace function public.dq_third(p_day date) returns text language sql immutable as $$
  select (array['chat', 'clear', 'donate'])[1 + ((p_day - date '2026-01-01') % 3 + 3) % 3] $$;
-- Today's row for a player; drawn on first sight of the day. Damage target ≈ 40 min of a base hero at this level/forge (capped like submit_damage).
create or replace function public.dq_row(p_uid uuid, p_level int, p_gear int) returns public.quest_days
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'utc')::date; r public.quest_days; f int; staff boolean; lv double precision; gr int; third text; dmg bigint;
begin
  select * into r from public.quest_days where user_id = p_uid and day = today;
  if r.user_id is not null then return r; end if;
  select floor into f from public.floor_state where id = 1; f := coalesce(f, 1);
  staff := exists (select 1 from public.profiles where id = p_uid and role = 'gm');
  lv := greatest(least(coalesce(p_level, 1), 500), 1); gr := greatest(least(coalesce(p_gear, 0), 200), 0);
  if not staff then lv := least(lv, public.level_cap(f)); gr := least(gr, public.forge_cap(f)); end if;
  dmg := greatest(1000, round(6.5 * (1 + 0.25 * (lv - 1)) * power(1.15, gr) * 2400 / 100) * 100)::bigint;
  third := public.dq_third(today);
  if third = 'donate' and not exists (select 1 from public.guild_members m join public.guilds g on g.id = m.guild_id where m.user_id = p_uid and not g.is_staff and not m.is_staff) then third := 'clear'; end if;
  insert into public.quest_days (user_id, day, f, kinds, targets, prog) values (p_uid, today, f, array['dmg', 'online', third],
    array[dmg, 2700, case third when 'chat' then 3 when 'clear' then 1 else greatest(100, round(200 * public.q_tier(f)))::bigint end], array[0, 0, 0]::bigint[])
    on conflict do nothing;
  select * into r from public.quest_days where user_id = p_uid and day = today; return r;
end $$;
-- Add progress to today's quest of that kind (no-op without a row: the first tick of the day draws it).
create or replace function public.dq_bump(p_uid uuid, p_kind text, p_amount bigint) returns void
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'utc')::date; i int;
begin
  if p_uid is null or coalesce(p_amount, 0) <= 0 then return; end if;
  select array_position(kinds, p_kind) into i from public.quest_days where user_id = p_uid and day = today; if i is null then return; end if;
  update public.quest_days set prog[i] = least(targets[i], prog[i] + p_amount) where user_id = p_uid and day = today;
end $$;
-- Compact state for the client: k kinds, t targets, p progress, c claimed mask, g/x rewards, d day.
create or replace function public.dq_json(r public.quest_days, p_full boolean) returns jsonb language sql stable as $$
  select case when r.user_id is null then null when p_full then jsonb_build_object('d', r.day, 'k', r.kinds, 't', r.targets, 'p', r.prog, 'c', r.claimed,
    'g', (select jsonb_agg((public.dq_reward(k, r.f)->>'g')::bigint) from unnest(r.kinds) k), 'x', (select jsonb_agg((public.dq_reward(k, r.f)->>'x')::numeric) from unnest(r.kinds) k))
    else jsonb_build_object('p', r.prog, 'c', r.claimed) end $$;

create or replace function public.quest_state(p_level int default 1, p_gear int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  return public.dq_json(public.dq_row(uid, p_level, p_gear), true);
end $$;
create or replace function public.quest_claim(p_idx int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'utc')::date; r public.quest_days; rw jsonb; gold bigint; bit int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_idx is null or p_idx < 0 or p_idx > 2 then raise exception 'no such quest'; end if;
  select * into r from public.quest_days where user_id = uid and day = today for update;
  if r.user_id is null then raise exception 'no quests today yet'; end if;
  bit := 1 << p_idx;
  if r.claimed & bit <> 0 then raise exception 'already claimed'; end if;
  if r.prog[p_idx + 1] < r.targets[p_idx + 1] then raise exception 'quest not finished yet'; end if;
  rw := public.dq_reward(r.kinds[p_idx + 1], r.f);
  update public.quest_days set claimed = claimed | bit where user_id = uid and day = today;
  gold := public.q_pay(uid, (rw->>'g')::bigint);
  return jsonb_build_object('gold', gold, 'add', (rw->>'g')::bigint, 'xp', (rw->>'x')::numeric, 'kind', r.kinds[p_idx + 1], 'c', r.claimed | bit);
end $$;

-- Progress sources (all server-side events):
create or replace function public.dq_on_chat() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.dq_bump(auth.uid(), 'chat', 1); return new; end $$;
drop trigger if exists dq_chat on public.chat_messages;
create trigger dq_chat after insert on public.chat_messages for each row execute function public.dq_on_chat();
create or replace function public.dq_on_clear() returns trigger language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select d.user_id from public.damage d where d.floor = new.floor and d.damage > 0 loop perform public.dq_bump(u, 'clear', 1); end loop;
  return new;
end $$;
drop trigger if exists dq_clear on public.floor_clears;
create trigger dq_clear after insert on public.floor_clears for each row execute function public.dq_on_clear();
create or replace function public.dq_on_ledger() returns trigger language plpgsql security definer set search_path = public as $$
begin if new.kind = 'donate' and new.user_id is not null then perform public.dq_bump(new.user_id, 'donate', new.amount); end if; return new; end $$;
drop trigger if exists dq_donate on public.guild_ledger;
create trigger dq_donate after insert on public.guild_ledger for each row execute function public.dq_on_ledger();

-- tick(): same as schema-addendum-daily.sql plus the quest key 'q' (full defs on the first tick of the day, else progress + claimed only).
create or replace function public.tick(p_amount bigint, p_name text, p_level int, p_gear int, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s jsonb; r jsonb; gid bigint; dl jsonb; q public.quest_days; prev timestamptz; fresh boolean; gap double precision;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select last_submit into prev from public.profiles where id = uid;
  s := public.submit_damage(p_amount, p_name, p_level, p_gear);
  select guild_id into gid from public.guild_members where user_id = uid;
  dl := public.daily_claim(uid); -- first tick of the UTC day claims the login reward (null otherwise)
  fresh := not exists (select 1 from public.quest_days where user_id = uid and day = (now() at time zone 'utc')::date);
  q := public.dq_row(uid, p_level, p_gear);
  if not public.in_sanctum() then
    perform public.dq_bump(uid, 'dmg', coalesce((s->>'accepted')::bigint, 0));
    gap := extract(epoch from now() - coalesce(prev, now())); -- time since this player's previous tick
    if not fresh and gap > 0 and gap <= 1200 then perform public.dq_bump(uid, 'online', floor(gap)::bigint); end if;
  end if;
  update public.quest_days set last_at = now() where user_id = uid and day = q.day returning * into q;
  r := jsonb_strip_nulls(jsonb_build_object('f', s->'floor', 'hp', s->'hp', 'mx', s->'max_hp', 'a', s->'accepted',
    'gm', s->'gm_present_until', 'an', nullif(s->'gm_announce', 'null'::jsonb), 'mk', nullif(s->'gm_marks', '{}'::jsonb),
    'cl', nullif((select coalesce(jsonb_agg(jsonb_build_array(c.id, c.floor, c.max_hp, coalesce(array_position(c.ranking, left(p_name, 20)), 0), coalesce((c.dmg->>left(p_name, 20))::bigint, 0)) order by c.id), '[]')
                  from (select * from public.floor_clears where id > coalesce(p_after, 0) order by id limit 20) c), '[]'::jsonb),
    'cv', (select max(id) from public.chat_messages where floor = (s->>'floor')::int),
    'dl', dl, 'q', public.dq_json(q, fresh), 'gv', case when gid is null then null else (select max(id) from public.guild_messages where guild_id = gid) end));
  insert into public.egress_stats as e (day, calls, bytes) values (current_date, 1, octet_length(r::text) + 600)
    on conflict (day) do update set calls = e.calls + 1, bytes = e.bytes + excluded.bytes;
  return r;
end $$;
revoke all on function public.tick(bigint, text, int, int, bigint) from public, anon;
grant execute on function public.tick(bigint, text, int, int, bigint) to authenticated;

-- ============================== 2) guild weeklies ==============================
-- Weeks start Monday 00:00 UTC (the Unix epoch was a Thursday; Monday 1970-01-05 = epoch + 4 days). Mirrors weekOf() in js/guildsv2.js.
create or replace function public.gv2_week(p_at timestamptz default now()) returns int language sql stable as $$
  select floor((extract(epoch from p_at) - 345600) / 604800)::int $$;
create table if not exists public.guild_quest_contrib (
  guild_id bigint not null references public.guilds on delete cascade,
  week int not null, idx int not null,
  user_id uuid not null references auth.users on delete cascade,
  amount bigint not null default 0,
  claimed boolean not null default false,
  primary key (guild_id, week, idx, user_id)
);
alter table public.guild_quest_contrib enable row level security; -- read through guild_info()
create or replace function public.gq_credit(p_gid bigint, p_kind text, p_uid uuid, p_amount bigint, p_set boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare w int := public.gv2_week(); q record;
begin
  if p_uid is null or coalesce(p_amount, 0) <= 0 or public.gv2_staff_guild(p_gid) then return; end if;
  if not exists (select 1 from public.guild_members where user_id = p_uid and guild_id = p_gid and not is_staff) then return; end if;
  select * into q from public.gv2_quests(w) where kind = p_kind; if q.idx is null then return; end if;
  if exists (select 1 from public.guild_quests where guild_id = p_gid and week = w and idx = q.idx and done) then return; end if; -- counted until it's done
  insert into public.guild_quest_contrib as c (guild_id, week, idx, user_id, amount) values (p_gid, w, q.idx, p_uid, p_amount)
    on conflict (guild_id, week, idx, user_id) do update set amount = case when p_set then greatest(c.amount, excluded.amount) else c.amount + excluded.amount end;
end $$;
-- Same as schema-addendum-staff-guild.sql, plus the caller's contribution (damage / donate: amount; active: 1). Floors: see gv2_on_clear.
create or replace function public.gv2_quest_bump(p_gid bigint, p_kind text, p_amount bigint, p_set boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare w int := public.gv2_week(); q record; cur public.guild_quests;
begin
  if public.gv2_staff_guild(p_gid) then return; end if;
  select * into q from public.gv2_quests(w) where kind = p_kind; if q.idx is null then return; end if;
  if p_kind in ('damage', 'donate') then perform public.gq_credit(p_gid, p_kind, auth.uid(), p_amount);
  elsif p_kind = 'active' then perform public.gq_credit(p_gid, p_kind, auth.uid(), 1, true); end if;
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
create or replace function public.gv2_on_clear() returns trigger
language plpgsql security definer set search_path = public as $$
declare g bigint; u uuid;
begin
  for g in select distinct m.guild_id from public.damage d join public.guild_members m on m.user_id = d.user_id
           where d.floor = new.floor and d.damage > 0 and not d.is_staff and not m.is_staff loop
    for u in select d.user_id from public.damage d join public.guild_members m on m.user_id = d.user_id
             where m.guild_id = g and d.floor = new.floor and d.damage > 0 and not d.is_staff and not m.is_staff loop
      perform public.gq_credit(g, 'floors', u, 1);
    end loop;
    perform public.gv2_quest_bump(g, 'floors', 1);
  end loop;
  return new;
end $$;
-- Personal reward per finished weekly quest, for each member who helped (gold × tier of the current floor; XP share, capped client-side).
create or replace function public.gq_member_reward(p_f int) returns jsonb language sql immutable as $$
  select jsonb_build_object('g', round(250 * public.q_tier(p_f))::bigint, 'x', 0.3) $$;
create or replace function public.gq_eligible(p_kind text, p_target bigint, p_amount bigint) returns boolean language sql immutable as $$
  select coalesce(p_amount, 0) > 0 and (p_kind not in ('damage', 'donate') or p_amount >= greatest(1, ceil(p_target * 0.01))) $$;
-- Claim this or last week's reward (a quest finished late on Sunday can still be claimed on Monday).
create or replace function public.guild_quest_claim(p_week int, p_idx int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); w int := public.gv2_week(); c public.guild_quest_contrib; q record; f int; rw jsonb; gold bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_week is null or p_week not in (w, w - 1) then raise exception 'that week is closed'; end if;
  select * into c from public.guild_quest_contrib where week = p_week and idx = p_idx and user_id = uid for update;
  if c.user_id is null then raise exception 'you did not help with that quest'; end if;
  if c.claimed then raise exception 'already claimed'; end if;
  if not exists (select 1 from public.guild_quests where guild_id = c.guild_id and week = p_week and idx = p_idx and done) then raise exception 'quest not finished yet'; end if;
  select * into q from public.gv2_quests(p_week) where idx = p_idx;
  if not public.gq_eligible(q.kind, q.target, c.amount) then raise exception 'help with at least 1%% of the goal to earn a share'; end if;
  select floor into f from public.floor_state where id = 1; rw := public.gq_member_reward(coalesce(f, 1));
  update public.guild_quest_contrib set claimed = true where guild_id = c.guild_id and week = p_week and idx = p_idx and user_id = uid;
  gold := public.q_pay(uid, (rw->>'g')::bigint);
  return jsonb_build_object('gold', gold, 'add', (rw->>'g')::bigint, 'xp', (rw->>'x')::numeric);
end $$;
-- guild_info(): as schema-addendum-floor-zero.sql, plus per-quest 'mine' (my contribution), 'claimed', 'ok' (eligible), the member reward,
-- and last week's unclaimed finished quests ('prev'), so the Quests tab needs no extra call.
create or replace function public.guild_info() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.guild_members; g public.guilds; lv int; w int := public.gv2_week(); f int;
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
  select * into g from public.guilds where id = me.guild_id; lv := public.gv2_level(g.xp);
  select floor into f from public.floor_state where id = 1;
  return jsonb_build_object(
    'guild', to_jsonb(g) || jsonb_build_object('level', lv, 'slots', public.gv2_slots(lv), 'bonus_pct', case when g.is_staff then 0 else public.gv2_bonus(g.bonus_tier) end, 'sigils', public.gv2_sigils(lv, g.banner_unlocks), 'prestige', g.is_staff, 'hall_display', case when g.is_staff then public.gv2_staff_hall(lv) else g.hall end),
    'me', jsonb_build_object('role', me.role, 'is_staff', me.is_staff, 'user_id', uid),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', public.gv2_name(m.user_id), 'role', m.role, 'contrib', m.contrib, 'last_active', m.last_active, 'is_staff', m.is_staff)
                  order by array_position(array['leader','officer','member'], m.role), m.contrib desc), '[]') from public.guild_members m where m.guild_id = g.id),
    'requests', case when me.role in ('leader', 'officer') and not g.is_staff then (select coalesce(jsonb_agg(jsonb_build_object('user_id', r.user_id, 'name', r.name, 'at', r.at) order by r.at), '[]') from public.guild_requests r where r.guild_id = g.id) else '[]'::jsonb end,
    'ledger', (select coalesce(jsonb_agg(x order by x.id desc), '[]') from (select id, name, kind, amount, item, at from public.guild_ledger where guild_id = g.id order by id desc limit 30) x),
    'quests', case when g.is_staff then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('idx', q.idx, 'kind', q.kind, 'target', q.target, 'xp', q.xp, 'gold', q.gold, 'progress', coalesce(p.progress, 0), 'done', coalesce(p.done, false),
                  'mine', coalesce(c.amount, 0), 'claimed', coalesce(c.claimed, false), 'ok', public.gq_eligible(q.kind, q.target, c.amount)) order by q.idx), '[]')
                from public.gv2_quests(w) q left join public.guild_quests p on p.guild_id = g.id and p.week = w and p.idx = q.idx
                left join public.guild_quest_contrib c on c.guild_id = g.id and c.week = w and c.idx = q.idx and c.user_id = uid) end,
    'prev', case when g.is_staff then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('week', w - 1, 'idx', q.idx, 'kind', q.kind, 'target', q.target) order by q.idx), '[]')
                from public.gv2_quests(w - 1) q join public.guild_quests p on p.guild_id = g.id and p.week = w - 1 and p.idx = q.idx and p.done
                join public.guild_quest_contrib c on c.guild_id = g.id and c.week = w - 1 and c.idx = q.idx and c.user_id = uid and not c.claimed
                where public.gq_eligible(q.kind, q.target, c.amount)) end,
    'mreward', public.gq_member_reward(coalesce(f, 1)),
    'week', w);
end $$;

-- ============================== 3) player ID card ==============================
-- Whitelist one gear piece: name, slot, rarity, element, floor, numeric stats, Unique ability/drawback text. Nothing else from the save.
create or replace function public.card_item(it jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(it) <> 'object' then null else jsonb_strip_nulls(jsonb_build_object(
    'name', left(it->>'name', 48), 'slot', left(it->>'slot', 10), 'rarity', left(it->>'rarity', 12), 'element', left(it->>'element', 12),
    'floor', case when jsonb_typeof(it->'floor') = 'number' then (it->>'floor')::numeric end, 'gm', case when (it->>'gm')::boolean then true end,
    'id', case when it->>'id' like 'gm-%' then left(it->>'id', 24) end,
    'stats', (select jsonb_object_agg(k, v) from jsonb_each(case when jsonb_typeof(it->'stats') = 'object' then it->'stats' else '{}' end) e(k, v)
              where k in ('dps', 'dpsPct', 'goldPct', 'xpPct', 'capH') and jsonb_typeof(v) = 'number'),
    'ability', case when jsonb_typeof(it->'ability') = 'object' then jsonb_build_object('id', left(it->'ability'->>'id', 24), 'text', left(it->'ability'->>'text', 160)) end,
    'drawback', case when jsonb_typeof(it->'drawback') = 'object' then jsonb_build_object('id', left(it->'drawback'->>'id', 24), 'text', left(it->'drawback'->>'text', 160)) end)) end $$;
create or replace function public.player_card(p_name text default null, p_author text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid; sv jsonb; h jsonb; staff boolean; eq jsonb := '{}'; k text; it jsonb; look jsonb; tal jsonb; pet jsonb; gu jsonb; lv int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_author is not null and p_author ~ '^[0-9a-f]{12}$' then
    select p.id into uid from public.profiles p where left(md5('logout-chat:' || p.id::text), 12) = p_author limit 1;
  elsif p_name is not null then
    select d.user_id into uid from public.damage d join public.profiles p on p.id = d.user_id where d.name = left(btrim(p_name), 20)
      order by d.floor desc, p.last_submit desc nulls last limit 1;
  end if;
  if uid is null then return null; end if;
  select data into sv from public.saves where user_id = uid; h := sv->'heroes'->0;
  if h is null or jsonb_typeof(h) <> 'object' then return null; end if;
  staff := exists (select 1 from public.profiles where id = uid and role = 'gm');
  for k in select unnest(array['weapon', 'armor', 'trinket']) loop
    it := public.card_item(h->'equip'->k);
    if it is not null and not staff and (it ? 'gm' or it ? 'id') then it := null; end if; -- staff items never show on a player's card
    if it is not null then eq := eq || jsonb_build_object(k, it - 'gm' - 'id'); end if;
  end loop;
  select coalesce(jsonb_object_agg(e.key, left(e.value #>> '{}', 40)), '{}') into look from jsonb_each(case when jsonb_typeof(h->'look') = 'object' then h->'look' else '{}' end) e
    where e.key in ('title', 'ptitle', 'nameColor', 'aura', 'skin', 'skinSet', 'outfitStyle', 'outfitColor', 'hairStyle', 'hairColor', 'weapon', 'weaponColor', 'trim')
      and jsonb_typeof(e.value) = 'string' and (staff or e.value #>> '{}' not like 'gm-%');
  if look ? 'ptitle' and not exists (select 1 from public.shop_owned where user_id = uid and item = look->>'ptitle') then look := look - 'ptitle'; end if; -- bought titles only
  select coalesce(jsonb_object_agg(e.key, least((e.value #>> '{}')::numeric, 10)), '{}') into tal from jsonb_each(case when jsonb_typeof(h->'talents') = 'object' then h->'talents' else '{}' end) e
    where jsonb_typeof(e.value) = 'number' and e.key ~ '^[a-zA-Z0-9_-]{1,24}$' and (staff or e.key not like 'cx-%');
  select jsonb_build_object('sp', p.sp, 'rarity', p.rarity, 'perk', p.perk_k, 'v', p.perk_v, 'name', p.uname) into pet
    from public.profiles pr join public.pets p on p.id = pr.active_pet and p.user_id = pr.id where pr.id = uid and p.rarity <> 'divine';
  select jsonb_build_object('tag', g.tag, 'name', g.name, 'banner', g.banner, 'staff', g.is_staff) into gu from public.guild_members m join public.guilds g on g.id = m.guild_id where m.user_id = uid;
  lv := greatest(1, least(coalesce((h->>'level')::numeric, 1), 100000))::int;
  return jsonb_strip_nulls(jsonb_build_object('v', 1, 'name', left(coalesce((select d.name from public.damage d where d.user_id = uid order by d.floor desc limit 1), h->>'name', 'Nameless'), 20),
    'cls', case when staff or h->>'cls' in ('Vanguard', 'Blade', 'Arcanist') then left(h->>'cls', 20) else 'Vanguard' end,
    'level', lv, 'gear', greatest(0, least(coalesce((h->>'gear')::numeric, 0), 1000))::int, 'equip', eq, 'look', look, 'talents', tal, 'pet', pet, 'guild', gu,
    'st', case when staff then true end, 'spirit', case when staff and coalesce(sv->>'spirit', 'false') not in ('false', 'null', '0', '') then true end));
end $$;

-- ============================== grants ==============================
revoke all on function public.q_pay(uuid, bigint), public.dq_row(uuid, int, int), public.dq_bump(uuid, text, bigint), public.dq_on_chat(), public.dq_on_clear(), public.dq_on_ledger(),
  public.gq_credit(bigint, text, uuid, bigint, boolean), public.gv2_quest_bump(bigint, text, bigint, boolean), public.gv2_on_clear() from public, anon, authenticated;
revoke all on function public.quest_state(int, int), public.quest_claim(int), public.guild_quest_claim(int, int), public.guild_info(), public.player_card(text, text) from public, anon;
grant execute on function public.quest_state(int, int), public.quest_claim(int), public.guild_quest_claim(int, int), public.guild_info(), public.player_card(text, text) to authenticated;

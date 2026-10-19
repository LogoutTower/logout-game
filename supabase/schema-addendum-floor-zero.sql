-- $LOGOUT Floor Zero addendum (run after schema-addendum-staff-guild.sql). Idempotent: safe to run more than once.
-- 1) The exclusive "zero" sigil (gold ring around an inverted tower on a black void). Only the staff guild may fly it; it always
--    uses its own black/gold pair (#e8b923 on #050505), which is outside the player palette, so no other guild can copy the combo.
--    It becomes Floor Zero's banner unless the guild already picked something other than the old default.
-- 2) Prestige XP for the staff guild, DISPLAY ONLY: members' boss damage (the GM's too, for this guild's XP only) earns guild XP
--    and levels. Bonus stays 0; no bank, no quest progress or rewards; still off the guild board; no payouts. Levels may raise
--    member slots and unlock cosmetic hall pieces (gv2_staff_hall), nothing else. Normal guilds are unchanged.
create or replace function public.gv2_zero_banner() returns jsonb language sql immutable as $$
  select '{"sigil":"zero","c1":"#e8b923","c2":"#050505"}'::jsonb $$;
-- Cosmetic hall pieces for the staff guild come from its level (one piece every 4 levels, max 5). Nothing reads it for stats.
create or replace function public.gv2_staff_hall(p_level int) returns int language sql immutable as $$ select least(5, greatest(0, (p_level - 1) / 4)) $$;

-- Guard the column itself: only a staff guild may hold the zero sigil or the exact black/gold pair, however the row is written.
create or replace function public.gv2_banner_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.is_staff and tg_op = 'INSERT' and (new.banner is null or new.banner = '{"sigil":"tower","c1":"#ffd76a","c2":"#2a1450"}'::jsonb) then new.banner := public.gv2_zero_banner(); end if;
  if not new.is_staff and (new.banner->>'sigil' = 'zero' or (least(new.banner->>'c1', new.banner->>'c2') = '#050505' and greatest(new.banner->>'c1', new.banner->>'c2') = '#e8b923')) then
    raise exception 'that sigil belongs to Floor Zero';
  end if;
  return new;
end $$;
drop trigger if exists gv2_banner_guard on public.guilds;
create trigger gv2_banner_guard before insert or update of banner, is_staff on public.guilds for each row execute function public.gv2_banner_guard();
update public.guilds set banner = public.gv2_zero_banner()
  where is_staff and banner = '{"sigil":"tower","c1":"#ffd76a","c2":"#2a1450"}'::jsonb;

create or replace function public.guild_set_banner(p_sigil text, p_c1 text, p_c2 text) returns void
language plpgsql security definer set search_path = public as $$
declare me public.guild_members := public.gv2_need(true); g public.guilds; i int;
begin
  select * into g from public.guilds where id = me.guild_id;
  if p_sigil = 'zero' then
    if not g.is_staff then raise exception 'that sigil belongs to Floor Zero'; end if;
    update public.guilds set banner = public.gv2_zero_banner() where id = g.id; return;  -- its palette is fixed
  end if;
  i := array_position(public.gv2_sigil_list(), p_sigil);
  if i is null or i > public.gv2_sigils(public.gv2_level(g.xp), g.banner_unlocks) then raise exception 'that sigil is locked'; end if;
  if not (p_c1 = any (public.gv2_palette())) or not (p_c2 = any (public.gv2_palette())) or p_c1 = p_c2 then raise exception 'pick two different palette colours'; end if;
  update public.guilds set banner = jsonb_build_object('sigil', p_sigil, 'c1', p_c1, 'c2', p_c2) where id = g.id;
end $$;

-- Damage: normal guilds as before (staff damage never counts). Staff guild: every member's damage, the GM's included, adds
-- prestige XP and contribution only (no quests, no bank, no bonus).
create or replace function public.gv2_on_damage() returns trigger
language plpgsql security definer set search_path = public as $$
declare d bigint := new.damage - coalesce(case when tg_op = 'UPDATE' then old.damage end, 0); m public.guild_members; act int;
begin
  if d <= 0 then return new; end if;
  select * into m from public.guild_members where user_id = new.user_id; if m.user_id is null then return new; end if;
  if public.gv2_staff_guild(m.guild_id) then
    update public.guild_members set contrib = contrib + d, last_active = now(), active_week = public.gv2_week() where user_id = new.user_id;
    update public.guilds set xp = xp + d where id = m.guild_id;
    return new;
  end if;
  if new.is_staff or m.is_staff then return new; end if;
  update public.guild_members set contrib = contrib + d, last_active = now(), active_week = public.gv2_week() where user_id = new.user_id;
  update public.guilds set xp = xp + d where id = m.guild_id;
  perform public.gv2_quest_bump(m.guild_id, 'damage', d);
  select count(*) into act from public.guild_members where guild_id = m.guild_id and not is_staff and active_week = public.gv2_week();
  perform public.gv2_quest_bump(m.guild_id, 'active', act, true);
  perform public.gv2_check_leader(m.guild_id);
  return new;
end $$;

-- Info: the staff guild now reports its real level (prestige), bonus 0, no quests, and a cosmetic hall level.
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
  select * into g from public.guilds where id = me.guild_id; lv := public.gv2_level(g.xp);
  return jsonb_build_object(
    'guild', to_jsonb(g) || jsonb_build_object('level', lv, 'slots', public.gv2_slots(lv), 'bonus_pct', case when g.is_staff then 0 else public.gv2_bonus(g.bonus_tier) end, 'sigils', public.gv2_sigils(lv, g.banner_unlocks), 'prestige', g.is_staff, 'hall_display', case when g.is_staff then public.gv2_staff_hall(lv) else g.hall end),
    'me', jsonb_build_object('role', me.role, 'is_staff', me.is_staff, 'user_id', uid),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', public.gv2_name(m.user_id), 'role', m.role, 'contrib', m.contrib, 'last_active', m.last_active, 'is_staff', m.is_staff)
                  order by array_position(array['leader','officer','member'], m.role), m.contrib desc), '[]') from public.guild_members m where m.guild_id = g.id),
    'requests', case when me.role in ('leader', 'officer') and not g.is_staff then (select coalesce(jsonb_agg(jsonb_build_object('user_id', r.user_id, 'name', r.name, 'at', r.at) order by r.at), '[]') from public.guild_requests r where r.guild_id = g.id) else '[]'::jsonb end,
    'ledger', (select coalesce(jsonb_agg(x order by x.id desc), '[]') from (select id, name, kind, amount, item, at from public.guild_ledger where guild_id = g.id order by id desc limit 30) x),
    'quests', case when g.is_staff then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('idx', q.idx, 'kind', q.kind, 'target', q.target, 'xp', q.xp, 'gold', q.gold, 'progress', coalesce(p.progress, 0), 'done', coalesce(p.done, false)) order by q.idx), '[]')
                from public.gv2_quests(w) q left join public.guild_quests p on p.guild_id = g.id and p.week = w and p.idx = q.idx) end,
    'week', w);
end $$;

revoke all on function public.gv2_zero_banner() from public, anon, authenticated;
revoke all on function public.gv2_staff_hall(int) from public, anon, authenticated;
revoke all on function public.gv2_banner_guard() from public, anon, authenticated;
revoke all on function public.gv2_on_damage() from public, anon, authenticated;
revoke all on function public.guild_set_banner(text, text, text) from public, anon; grant execute on function public.guild_set_banner(text, text, text) to authenticated;
revoke all on function public.guild_info() from public, anon; grant execute on function public.guild_info() to authenticated;

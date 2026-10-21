-- $LOGOUT addendum: FORGE PRESTIGE (evolution loop). Idempotent: safe to run more than once. Run after schema-addendum-forge.sql.
-- IN-GAME ONLY: gold and materials in the saved game; nothing touches the $LOGOUT token, wallets, creator fees or real value.
-- Evolving at +10 consumes Evolution Sigils, resets the weapon to +0 and raises its evo tier (Evo I..V, cap V). Each tier: +8% base damage,
-- stacking with the +levels (+3% each): weapon multiplier = (1 + 0.03 x up) x (1 + 0.08 x tier). The first evolution also adds the set's one
-- bonus effect (at most +8% damage). Max: 1.30 x 1.40 x 1.08 = 1.966.
-- Costs at evo tier e: gold x (1 + 0.5e), material counts x (1 + 0.75e) rounded, sigils to evolve into Evo I..V: 1, 1, 2, 2, 3.
-- Pacing: a full Evo V +10 weapon needs ~555 Boss Cores and 9 Sigils including expected fails (~1,100 h of farming at 0.6 cores/h and
-- 0.05 sigils/h), about 10 weeks for an active player who checks in twice a day (~16 h/day of fighting counted). Only Rare+ can evolve. Mirrors js/forge.js (pglite parity test).
-- Migration: weapons evolved under the old rules carry "evo" without "tier" and stay at +10. They read as Evo I at +10; no row is rewritten.
-- Damage limit: submit_damage's ceiling (max_dps) never knew about weapon upgrades. A player's ceiling is now multiplied by the multiplier of the
-- weapon in their own saved game (forge_dmg_mul, max 1.966), so a maxed weapon is never clipped. Players without upgrades keep the old ceiling
-- exactly (x1). Staff are unchanged (their raid softener still applies; staff gear is never upgraded). submit_damage below is the
-- schema-addendum-gm-softener-prelaunch.sql body plus that one line.
create or replace function public.forge_gold3(f int, t int, e int) returns bigint language sql immutable as $$
  select round((120 * power(1.6::numeric, t) * (1 + (greatest(1, least(100, f)) - 1) / 4.0) * (1 + 0.5 * greatest(0, e))))::bigint $$;
create or replace function public.forge_mats3(f int, t int, e int) returns jsonb language sql immutable as $$
  select case when t = 11 then jsonb_build_object('sigil' || (s * 10), (array[1, 1, 2, 2, 3])[greatest(0, least(4, e)) + 1])
    else coalesce((select jsonb_object_agg(key, round(value::numeric * (1 + 0.75 * greatest(0, e)))::int) from jsonb_each_text(public.forge_mats(f, t))), '{}'::jsonb) end
  from (select greatest(1, ceil(greatest(1, f) / 10.0))::int s) x $$;
-- Rarity scale of js/loot.js; only Rare (2) or better can evolve or receive a transfer.
create or replace function public.forge_rank(r text) returns int language sql immutable as $$
  select coalesce(array_position(array['common', 'uncommon', 'rare', 'epic', 'legendary', 'unique'], r) - 1, 0) $$;
create or replace function public.forge_evo_tier(w jsonb) returns int language sql immutable as $$
  select case when w ? 'evo' and jsonb_typeof(w->'evo') = 'object' then greatest(1, least(5, coalesce(floor(nullif(w #>> '{evo,tier}', '')::numeric)::int, 1))) else 0 end $$;
create or replace function public.forge_dmg_mul(uid uuid) returns double precision language sql stable security definer set search_path = public as $$
  select least(1.966, greatest(1, coalesce((
    select (1 + 0.03 * greatest(0, least(10, coalesce(floor(nullif(w->>'up', '')::numeric), 0)))) * (1 + 0.08 * public.forge_evo_tier(w)) * case when w ? 'evo' then 1.08 else 1 end
    from (select data #> '{heroes,0,equip,weapon}' w from public.saves where user_id = uid) x
    where jsonb_typeof(w) = 'object' and coalesce(w->>'gm', 'false') <> 'true' and coalesce(w->>'id', '') not like 'gm-%'), 1))) $$;

create or replace function public.forge_upgrade(p_evolve boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); sv public.saves; w jsonb; f int; t int; up int; e int; cost jsonb; price bigint; gold bigint; mats jsonb; k text; need int;
  rate int; roll int; ok boolean; ev jsonb; nm text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into sv from public.saves where user_id = uid for update;
  if sv.user_id is null then raise exception 'no saved game'; end if;
  w := sv.data #> '{heroes,0,equip,weapon}';
  if w is null or jsonb_typeof(w) <> 'object' then raise exception 'equip a weapon first'; end if;
  if coalesce(w->>'gm', 'false') = 'true' or coalesce(w->>'id', '') like 'gm-%' or coalesce(w->>'slot', '') <> 'weapon' then raise exception 'staff gear has its own path'; end if;
  f := greatest(1, least(100, floor(coalesce(nullif(w->>'floor', '')::numeric, 1))::int));
  up := greatest(0, least(10, floor(coalesce(nullif(w->>'up', '')::numeric, 0))::int)); e := public.forge_evo_tier(w);
  if p_evolve then
    if up < 10 then raise exception 'reach +10 first'; end if;
    if e >= 5 then raise exception 'this weapon is at Evo V, the final form'; end if;
    if public.forge_rank(w->>'rarity') < 2 then raise exception 'only Rare or better weapons can evolve'; end if; t := 11;
  else
    if up >= 10 then raise exception 'already +10: evolve it'; end if; t := up + 1;
  end if;
  price := public.forge_gold3(f, t, e); cost := public.forge_mats3(f, t, e); rate := public.forge_rate(t);
  gold := floor(coalesce((sv.data->>'gold')::numeric, 0)); mats := coalesce(sv.data->'mats', '{}'::jsonb);
  if jsonb_typeof(mats) <> 'object' then mats := '{}'::jsonb; end if;
  if gold < price then raise exception 'not enough gold'; end if;
  for k, need in select key, value::int from jsonb_each_text(cost) loop
    if floor(coalesce((mats->>k)::numeric, 0)) < need then raise exception 'not enough materials'; end if;
    mats := jsonb_set(mats, array[k], to_jsonb(floor(coalesce((mats->>k)::numeric, 0))::int - need));
  end loop;
  roll := floor(random() * 100)::int; ok := roll < rate;
  if ok then
    gold := gold - price;
    if t = 11 then
      if e = 0 then ev := public.forge_evo(ceil(f / 10.0)::int);
        w := w || jsonb_build_object('evo', jsonb_build_object('base', w->>'name', 'pre', ev->>'pre', 'hue', (ev->>'hue')::int, 'text', ev->>'text'),
          'stats', coalesce(w->'stats', '{}'::jsonb) || jsonb_build_object(ev->>'k', coalesce((w #>> array['stats', ev->>'k'])::numeric, 0) + (ev->>'v')::numeric)); end if;
      w := jsonb_set(w, '{evo,tier}', to_jsonb(e + 1));
      nm := (w #>> '{evo,pre}') || ' ' || coalesce(w #>> '{evo,base}', '') || case when e + 1 > 1 then ' ' || (array['I','II','III','IV','V'])[e + 1] else '' end;
      w := w || jsonb_build_object('name', left(nm, 64), 'up', 0);
    else w := jsonb_set(w, '{up}', to_jsonb(t)); end if;
  end if;
  update public.saves set data = jsonb_set(jsonb_set(jsonb_set(data, '{gold}', to_jsonb(gold)), '{mats}', mats), '{heroes,0,equip,weapon}', w), updated_at = now() where user_id = uid;
  return jsonb_build_object('ok', ok, 'roll', roll, 'rate', rate, 't', t, 'e', e, 'gold', gold, 'price', case when ok then price else 0 end, 'cost', cost, 'mats', mats, 'weapon', w);
end $$;
revoke all on function public.forge_upgrade(boolean) from public, anon; grant execute on function public.forge_upgrade(boolean) to authenticated;
revoke all on function public.forge_rank(text), public.forge_gold3(int, int, int), public.forge_mats3(int, int, int), public.forge_evo_tier(jsonb), public.forge_dmg_mul(uuid) from public, anon, authenticated;


-- Transfer: the equipped weapon's evo tier moves onto bag weapon inv[p_inv] (id must match: guards against a stale index).
-- A MOVE, never a copy (both weapons are rewritten in one locked update, so a tier can't be duplicated). Target: Rare+, rarity >= source,
-- not staff gear; it ends at the HIGHER of the two tiers, at +0, keeping its own form if already evolved (else its own set's form/effect).
-- Source: loses its evo (name back to base, bonus effect removed), resets to +0 and takes the target's bag slot.
-- Cost (tier = the source's tier moved): gold = forge_gold3(target floor, 10, tier), 30 x tier Tower Shards, 10 x tier of the target set's
-- Floor Essence, all x1.5 per rarity step from source to target (same rarity = base fee). Upgrade/evolve costs never depend on rarity. Mirrors js/forge.js.
create or replace function public.forge_transfer(p_inv int, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); sv public.saves; src jsonb; dst jsonb; xm numeric; e int; f int; sf int; s int; price bigint; gold bigint; mats jsonb; cost jsonb; k text; need int; ev jsonb; dv jsonb; nm text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into sv from public.saves where user_id = uid for update;
  if sv.user_id is null then raise exception 'no saved game'; end if;
  src := sv.data #> '{heroes,0,equip,weapon}'; dst := sv.data #> array['inv', p_inv::text];
  if src is null or jsonb_typeof(src) <> 'object' or coalesce(src->>'gm', 'false') = 'true' or coalesce(src->>'id', '') like 'gm-%' or public.forge_evo_tier(src) = 0 then raise exception 'equip an evolved weapon first'; end if;
  if dst is null or jsonb_typeof(dst) <> 'object' or coalesce(dst->>'id', '') <> coalesce(p_id, '') or coalesce(dst->>'slot', '') <> 'weapon'
    or coalesce(dst->>'gm', 'false') = 'true' or coalesce(dst->>'id', '') like 'gm-%' then raise exception 'pick a weapon from your bag'; end if;
  if public.forge_rank(dst->>'rarity') < 2 or public.forge_rank(dst->>'rarity') < public.forge_rank(src->>'rarity') then raise exception 'the target must be Rare or better and at least the same rarity'; end if;
  e := public.forge_evo_tier(src); f := greatest(1, least(100, floor(coalesce(nullif(dst->>'floor', '')::numeric, 1))::int)); s := ceil(f / 10.0)::int;
  sf := greatest(1, least(100, floor(coalesce(nullif(src->>'floor', '')::numeric, 1))::int));
  xm := power(1.5::numeric, greatest(0, public.forge_rank(dst->>'rarity') - public.forge_rank(src->>'rarity'))); -- x1.5 per rarity step up
  price := round(public.forge_gold3(f, 10, e) * xm)::bigint; cost := jsonb_build_object('shard', round(30 * e * xm)::int, 'ess' || s, round(10 * e * xm)::int);
  gold := floor(coalesce((sv.data->>'gold')::numeric, 0)); mats := coalesce(sv.data->'mats', '{}'::jsonb); if jsonb_typeof(mats) <> 'object' then mats := '{}'::jsonb; end if;
  if gold < price then raise exception 'not enough gold'; end if;
  for k, need in select key, value::int from jsonb_each_text(cost) loop
    if floor(coalesce((mats->>k)::numeric, 0)) < need then raise exception 'not enough materials'; end if;
    mats := jsonb_set(mats, array[k], to_jsonb(floor(coalesce((mats->>k)::numeric, 0))::int - need));
  end loop;
  -- source: the bonus effect of its own form comes off
  select x into ev from unnest(array(select public.forge_evo(i) from generate_series(1, 10) i)) x where x->>'pre' = src #>> '{evo,pre}' limit 1;
  ev := coalesce(ev, public.forge_evo(ceil(sf / 10.0)::int));
  src := src || jsonb_build_object('name', coalesce(src #>> '{evo,base}', src->>'name'), 'up', 0,
    'stats', coalesce(src->'stats', '{}'::jsonb) || jsonb_build_object(ev->>'k', coalesce((src #>> array['stats', ev->>'k'])::numeric, 0) - (ev->>'v')::numeric));
  if ((src #>> array['stats', ev->>'k'])::numeric) = 0 then src := src #- array['stats', ev->>'k']; end if;
  src := src - 'evo';
  -- target: the higher tier, +0; its own form if already evolved, else its own set's form and effect
  e := greatest(e, public.forge_evo_tier(dst));
  if not (dst ? 'evo') then dv := public.forge_evo(s);
    dst := dst || jsonb_build_object('evo', jsonb_build_object('base', dst->>'name', 'pre', dv->>'pre', 'hue', (dv->>'hue')::int, 'text', dv->>'text'),
      'stats', coalesce(dst->'stats', '{}'::jsonb) || jsonb_build_object(dv->>'k', coalesce((dst #>> array['stats', dv->>'k'])::numeric, 0) + (dv->>'v')::numeric)); end if;
  dst := jsonb_set(dst, '{evo,tier}', to_jsonb(e));
  nm := (dst #>> '{evo,pre}') || ' ' || coalesce(dst #>> '{evo,base}', '') || case when e > 1 then ' ' || (array['I','II','III','IV','V'])[e] else '' end;
  dst := dst || jsonb_build_object('up', 0, 'name', left(nm, 64));
  update public.saves set data = jsonb_set(jsonb_set(jsonb_set(jsonb_set(data, '{gold}', to_jsonb(gold - price)), '{mats}', mats), '{heroes,0,equip,weapon}', dst), array['inv', p_inv::text], src), updated_at = now() where user_id = uid;
  return jsonb_build_object('e', e, 'gold', gold - price, 'price', price, 'cost', cost, 'mats', mats, 'weapon', dst, 'back', src);
end $$;
revoke all on function public.forge_transfer(int, text) from public, anon; grant execute on function public.forge_transfer(int, text) to authenticated;

-- submit_damage: schema-addendum-gm-softener-prelaunch.sql body + the forge multiplier line.
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
  if not staff then wm := public.forge_dmg_mul(uid); max_dps := max_dps * wm; end if; -- forge prestige: the saved weapon's upgrade x evo multiplier (max 1.966)
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


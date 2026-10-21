-- $LOGOUT addendum: THE FORGE, weapon upgrades +1..+10 and evolution. Idempotent: safe to run more than once. Run after schema-addendum-player-count.sql.
-- IN-GAME ONLY: gold and materials from the saved game. Nothing here touches the $LOGOUT token, wallets, creator fees or anything with real value.
-- The SERVER rolls (Postgres random(); the client never sends a roll) and edits the saved game atomically under a row lock.
-- Rules mirror js/forge.js (pglite test checks parity): +1..+5 gold only, never fail; +6..+10 gold + materials, 90/75/60/45/30%;
-- a fail burns the materials only (gold, weapon and level are kept); evolve at +10 with one Evolution Sigil of the weapon's milestone floor.
-- Staff gear (Eventide / Vesperveil, "gm": true or id gm-*) is refused: it keeps its own tier path. One RPC per attempt; nothing rides in tick().
create or replace function public.forge_gold(f int, t int) returns bigint language sql immutable as $$
  select round((120 * power(1.6::numeric, t) * (1 + (greatest(1, least(100, f)) - 1) / 4.0)))::bigint $$;
create or replace function public.forge_rate(t int) returns int language sql immutable as $$
  select case when t <= 5 or t > 10 then 100 when t = 6 then 90 when t = 7 then 75 when t = 8 then 60 when t = 9 then 45 else 30 end $$;
create or replace function public.forge_mats(f int, t int) returns jsonb language sql immutable as $$
  select case t when 6 then jsonb_build_object('shard', 10, 'ess' || s, 3) when 7 then jsonb_build_object('shard', 20, 'ess' || s, 5)
    when 8 then jsonb_build_object('ess' || s, 8, 'core' || f, 2) when 9 then jsonb_build_object('ess' || s, 12, 'core' || f, 4)
    when 10 then jsonb_build_object('core' || f, 6) when 11 then jsonb_build_object('sigil' || (s * 10), 1) else '{}'::jsonb end
  from (select greatest(1, ceil(greatest(1, f) / 10.0))::int s) x $$;
-- One evolved form per 10-floor set (index = set - 1). Mirrors EVOS in js/forge.js.
create or replace function public.forge_evo(s int) returns jsonb language sql immutable as $$
  select (array[
    '{"pre":"Cinderborn","hue":18,"k":"dpsPct","v":8,"text":"Cinder Edge: +8% damage"}', '{"pre":"Frostwoken","hue":190,"k":"xpPct","v":10,"text":"Rime Memory: +10% XP"}',
    '{"pre":"Gildsworn","hue":45,"k":"goldPct","v":10,"text":"Gilded Oath: +10% gold"}', '{"pre":"Hollowed","hue":270,"k":"capH","v":1,"text":"Hollow Vigil: +1h offline cap"}',
    '{"pre":"Tideforged","hue":200,"k":"dpsPct","v":8,"text":"Undertow: +8% damage"}', '{"pre":"Emberheart","hue":8,"k":"goldPct","v":10,"text":"Kiln Tithe: +10% gold"}',
    '{"pre":"Stormbound","hue":230,"k":"dpsPct","v":8,"text":"Static Lash: +8% damage"}', '{"pre":"Verdant","hue":120,"k":"xpPct","v":10,"text":"Overgrowth: +10% XP"}',
    '{"pre":"Duskwrought","hue":290,"k":"capH","v":1,"text":"Long Shadow: +1h offline cap"}', '{"pre":"Nullborn","hue":300,"k":"dpsPct","v":8,"text":"Zero Point: +8% damage"}'
  ]::jsonb[])[greatest(1, least(10, s))] $$;

create or replace function public.forge_upgrade(p_evolve boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); sv public.saves; w jsonb; f int; t int; up int; cost jsonb; price bigint; gold bigint; mats jsonb; k text; need int;
  rate int; roll int; ok boolean; e jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into sv from public.saves where user_id = uid for update;
  if sv.user_id is null then raise exception 'no saved game'; end if;
  w := sv.data #> '{heroes,0,equip,weapon}';
  if w is null or jsonb_typeof(w) <> 'object' then raise exception 'equip a weapon first'; end if;
  if coalesce(w->>'gm', 'false') = 'true' or coalesce(w->>'id', '') like 'gm-%' or coalesce(w->>'slot', '') <> 'weapon' then raise exception 'staff gear has its own path'; end if;
  f := greatest(1, least(100, floor(coalesce(nullif(w->>'floor', '')::numeric, 1))::int));
  up := greatest(0, least(10, floor(coalesce(nullif(w->>'up', '')::numeric, 0))::int));
  if p_evolve then
    if up < 10 then raise exception 'reach +10 first'; end if;
    if w ? 'evo' then raise exception 'this weapon is fully evolved'; end if; t := 11;
  else
    if up >= 10 then raise exception 'already +10: evolve it'; end if; t := up + 1;
  end if;
  price := public.forge_gold(f, t); cost := public.forge_mats(f, t); rate := public.forge_rate(t);
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
    if t = 11 then e := public.forge_evo(ceil(f / 10.0)::int);
      w := w || jsonb_build_object('evo', jsonb_build_object('base', w->>'name', 'pre', e->>'pre', 'hue', (e->>'hue')::int, 'text', e->>'text'),
        'name', left(e->>'pre' || ' ' || coalesce(w->>'name', ''), 60),
        'stats', coalesce(w->'stats', '{}'::jsonb) || jsonb_build_object(e->>'k', coalesce((w #>> array['stats', e->>'k'])::numeric, 0) + (e->>'v')::numeric));
    else w := jsonb_set(w, '{up}', to_jsonb(t)); end if;
  end if;
  update public.saves set data = jsonb_set(jsonb_set(jsonb_set(data, '{gold}', to_jsonb(gold)), '{mats}', mats), '{heroes,0,equip,weapon}', w), updated_at = now() where user_id = uid;
  return jsonb_build_object('ok', ok, 'roll', roll, 'rate', rate, 't', t, 'gold', gold, 'price', case when ok then price else 0 end, 'cost', cost, 'mats', mats, 'weapon', w);
end $$;
revoke all on function public.forge_upgrade(boolean) from public, anon; grant execute on function public.forge_upgrade(boolean) to authenticated;
revoke all on function public.forge_gold(int, int), public.forge_rate(int), public.forge_mats(int, int), public.forge_evo(int) from public, anon;

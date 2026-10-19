-- $LOGOUT addendum: LATE-GAME GOLD SINKS + PETS. Idempotent: safe to run more than once. Run after schema-addendum-daily.sql.
-- All purchases are server-side: the price, gating and ownership are decided here and the gold is taken from the saved game
-- (same pattern as guild_donate). Nothing sold here adds combat power, except a pet's tiny DPS % (epic+ Ember Wisp: 1-3%),
-- which stays inside submit_damage's clamp. Staff-only items (Vesperveil, Floor Zero sigil, the Equinox pet) are never sold or granted.
-- Mirrors js/prestige.js (a pglite test checks parity).
create table if not exists public.shop_owned (user_id uuid references auth.users on delete cascade, item text, at timestamptz not null default now(), primary key (user_id, item));
create table if not exists public.shop_tokens (user_id uuid references auth.users on delete cascade, kind text, n int not null default 0 check (n >= 0), primary key (user_id, kind));
create table if not exists public.shop_global (item text primary key, sold int not null default 0);
create table if not exists public.pets (id bigserial primary key, user_id uuid not null references auth.users on delete cascade, sp text not null, rarity text not null,
  perk_k text not null, perk_v numeric not null, uname text unique, src text not null, at timestamptz not null default now());
create index if not exists pets_user on public.pets (user_id);
create table if not exists public.memorials (id bigserial primary key, floor int not null, user_id uuid not null references auth.users on delete cascade,
  name text not null, price bigint not null, at timestamptz not null default now(), unique (user_id, floor));
create index if not exists memorials_floor on public.memorials (floor, at desc);
create table if not exists public.guild_decor (guild_id bigint references public.guilds on delete cascade, item text, by_user uuid, at timestamptz not null default now(), primary key (guild_id, item));
alter table public.profiles add column if not exists active_pet bigint;
do $$ begin execute 'alter table public.shop_owned enable row level security'; execute 'alter table public.shop_tokens enable row level security';
  execute 'alter table public.shop_global enable row level security'; execute 'alter table public.pets enable row level security';
  execute 'alter table public.memorials enable row level security'; execute 'alter table public.guild_decor enable row level security'; end $$; -- no policies: RPCs only

create or replace function public.shop_items() returns table (id text, kind text, arc int, price bigint, step numeric) language sql immutable as $$
  values ('tr-arc1','trophy',1,300000::bigint,1::numeric), ('tr-arc2','trophy',2,3000000,1), ('sk-stonekeep','skin',1,5000000,1), ('sk-clockfrost','skin',2,12000000,1),
    ('egg-arc1','egg',1,400000,1), ('egg-arc2','egg',2,4000000,1), ('tok-rename','token',1,250000,1), ('tok-reroll','token',1,100000,1),
    ('pt-patron','prestige',1,2000000,1.12), ('pt-benefactor','prestige',1,8000000,1.12), ('pt-lantern','prestige',2,25000000,1.15) $$;
create or replace function public.decor_items() returns table (id text, price bigint) language sql immutable as $$
  values ('dc-trophy',150000::bigint), ('dc-banners',400000), ('dc-throne',1500000), ('dc-chandelier',3000000) $$;
create or replace function public.pet_species() returns table (sp text, perk text) language sql immutable as $$
  values ('torch','goldPct'), ('moth','capH'), ('owl','lootPct'), ('mote','drainPct'), ('pup','xpPct'), ('wisp','dpsPct') $$;
create or replace function public.pet_perk_v(p_perk text, p_rarity text) returns numeric language sql immutable as $$
  select (case p_perk when 'goldPct' then array[2,3,5,7,10,12] when 'xpPct' then array[2,3,5,7,10,12] when 'drainPct' then array[5,8,12,16,20,25]
    when 'capH' then array[1,1,2,3,4,5] when 'lootPct' then array[3,5,8,12,16,20] when 'dpsPct' then array[0,0,0,1,2,3] end)
    [array_position(array['common','uncommon','rare','epic','legendary','unique'], p_rarity)] $$;
create or replace function public.memorial_price(f int) returns bigint language sql immutable as $$ select (100000 * power(10, ceil(greatest(f, 1) / 10.0) - 1))::bigint $$;

-- Names (rename token, memorial wall): 2-20 chars, must pass the chat filter untouched, and can't pose as staff.
create or replace function public.shop_name_ok(n text) returns boolean language plpgsql stable security definer set search_path = public as $$
declare c jsonb := public.chat_clean(n, 20);
begin
  return char_length(n) between 2 and 20 and (c->>'ok')::boolean and c->>'text' = n
    and lower(n) !~ '(staff|admin|moderator|\ygm\y|umbra|architect|shaper|system)';
end $$;

-- Gold comes out of the saved game (locked row); raises if short.
create or replace function public.shop_spend(p_uid uuid, p_amount bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare sv public.saves; gold bigint;
begin
  select * into sv from public.saves where user_id = p_uid for update; gold := floor(coalesce((sv.data->>'gold')::numeric, 0));
  if sv.user_id is null or gold < p_amount then raise exception 'not enough gold in your saved game'; end if;
  update public.saves set data = jsonb_set(data, '{gold}', to_jsonb(gold - p_amount)), updated_at = now() where user_id = p_uid;
  return gold - p_amount;
end $$;
create or replace function public.arc_reached(a int) returns boolean language sql stable security definer set search_path = public as $$
  select floor >= (a - 1) * 10 + 1 from public.floor_state where id = 1 $$;
create or replace function public.arc_cleared(a int) returns boolean language sql stable security definer set search_path = public as $$
  select floor > a * 10 or (floor = a * 10 and hp <= 0) from public.floor_state where id = 1 $$;

-- Pets: rarity roll (arc 2 has better odds), random species; a Unique gets a one-of-a-kind name (else falls back to Legendary).
create or replace function public.pet_grant(p_uid uuid, p_arc int, p_src text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w double precision[] := case when p_arc >= 2 then array[35,30,20,10,4,1] else array[55,27,12,5,0.9,0.1] end; x double precision := random() * 100; i int := 1;
  r text; s record; nm text; p public.pets;
begin
  while i < 6 and x >= w[i] loop x := x - w[i]; i := i + 1; end loop; r := (array['common','uncommon','rare','epic','legendary','unique'])[i];
  select * into s from public.pet_species() order by random() limit 1;
  if r = 'unique' then
    select n into nm from unnest(array['Cinderwake','Hollowlight','Gearheart','Rimesong','Lastlantern','Stonewhisper','Brassveil','Emberhush']) n
      where not exists (select 1 from public.pets where uname = n) order by random() limit 1;
    if nm is null then r := 'legendary'; end if;
  end if;
  insert into public.pets (user_id, sp, rarity, perk_k, perk_v, uname, src) values (p_uid, s.sp, r, s.perk, public.pet_perk_v(s.perk, r), nm, p_src) returning * into p;
  return jsonb_build_object('id', p.id, 'sp', p.sp, 'rarity', p.rarity, 'perk', jsonb_build_object('k', p.perk_k, 'v', p.perk_v), 'uname', p.uname);
end $$;

create or replace function public.shop_buy(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); it record; price bigint; sold int; gold bigint; pet jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into it from public.shop_items() where id = p_id; if it.id is null then raise exception 'unknown item'; end if;
  if it.kind = 'trophy' and not public.arc_cleared(it.arc) then raise exception 'this arc has not fallen yet'; end if;
  if it.kind <> 'trophy' and not public.arc_reached(it.arc) then raise exception 'reach this arc first'; end if;
  if it.kind in ('trophy', 'skin', 'prestige') and exists (select 1 from public.shop_owned where user_id = uid and item = p_id) then raise exception 'already owned'; end if;
  price := it.price;
  if it.kind = 'prestige' then insert into public.shop_global (item) values (p_id) on conflict do nothing;
    select g.sold into sold from public.shop_global g where g.item = p_id for update; price := round(it.price * power(it.step, sold)); end if;
  gold := public.shop_spend(uid, price);
  if it.kind = 'prestige' then update public.shop_global set sold = shop_global.sold + 1 where item = p_id; end if;
  if it.kind in ('trophy', 'skin', 'prestige') then insert into public.shop_owned (user_id, item) values (uid, p_id); end if;
  if it.kind = 'token' then insert into public.shop_tokens as t (user_id, kind, n) values (uid, p_id, 1) on conflict (user_id, kind) do update set n = t.n + 1; end if;
  if it.kind = 'egg' then pet := public.pet_grant(uid, it.arc, 'egg'); end if;
  return jsonb_strip_nulls(jsonb_build_object('gold', gold, 'price', price, 'pet', pet));
end $$;

create or replace function public.shop_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'owned', (select coalesce(jsonb_agg(item), '[]') from public.shop_owned where user_id = auth.uid()),
    'tokens', (select coalesce(jsonb_object_agg(kind, n), '{}') from public.shop_tokens where user_id = auth.uid()),
    'pets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'sp', sp, 'rarity', rarity, 'perk', jsonb_build_object('k', perk_k, 'v', perk_v), 'uname', uname) order by id), '[]') from public.pets where user_id = auth.uid()),
    'active', (select active_pet from public.profiles where id = auth.uid()),
    'prices', (select jsonb_object_agg(i.id, round(i.price * power(i.step, coalesce(g.sold, 0)))) from public.shop_items() i left join public.shop_global g on g.item = i.id where i.kind = 'prestige'),
    'arc', (select floor from public.floor_state where id = 1)) $$;

create or replace function public.pet_equip(p_pet bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_pet is not null and not exists (select 1 from public.pets where id = p_pet and user_id = auth.uid()) then raise exception 'not your pet'; end if;
  update public.profiles set active_pet = p_pet where id = auth.uid();
end $$;

-- Tokens. Rename: same filter as chat (length, banned words, no links or wallets), written to the saved game and profile.
create or replace function public.token_use(p_kind text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c jsonb; n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_kind = 'tok-rename' then
    if not public.shop_name_ok(n) then raise exception 'that name is not allowed'; end if; end if;
  update public.shop_tokens set n = shop_tokens.n - 1 where user_id = uid and kind = p_kind and shop_tokens.n > 0;
  if not found then raise exception 'no token left'; end if;
  if p_kind = 'tok-rename' then
    update public.saves set data = jsonb_set(data, '{heroes,0,name}', to_jsonb(n)), updated_at = now() where user_id = uid;
    update public.profiles set display_name = n where id = uid; end if;
  return jsonb_build_object('kind', p_kind, 'name', nullif(n, ''));
end $$;

-- Memorial wall: one carve per account per floor, on a floor the tower has reached; chat filters; capped list (12 newest).
create or replace function public.memorial_carve(p_floor int, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); c jsonb; gold bigint; f int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select floor into f from public.floor_state where id = 1; if p_floor is null or p_floor < 1 or p_floor > f then raise exception 'that floor has not been reached'; end if;
  if not public.shop_name_ok(n) then raise exception 'that name is not allowed'; end if;
  if exists (select 1 from public.memorials where user_id = uid and floor = p_floor) then raise exception 'your name is already on this wall'; end if;
  gold := public.shop_spend(uid, public.memorial_price(p_floor));
  insert into public.memorials (floor, user_id, name, price) values (p_floor, uid, n, public.memorial_price(p_floor));
  return jsonb_build_object('gold', gold, 'floor', p_floor, 'name', n);
end $$;
create or replace function public.memorial_wall(p_floor int) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(name order by at desc), '[]') from (select name, at from public.memorials where floor = p_floor order by at desc limit 12) x $$;

-- Guild hall decor: leader/officers. A normal guild pays from its bank; the staff guild (no bank) pays from the buyer's own gold
-- and the decor is prestige only (decor never has an effect anywhere).
create or replace function public.guild_decor_buy(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.guild_members; it record; g public.guilds;
begin
  select * into me from public.guild_members where user_id = uid; if me.user_id is null then raise exception 'not in a guild'; end if;
  if me.role not in ('leader', 'officer') then raise exception 'only the leader or officers can buy decor'; end if;
  select * into it from public.decor_items() where id = p_id; if it.id is null then raise exception 'unknown decor'; end if;
  if exists (select 1 from public.guild_decor where guild_id = me.guild_id and item = p_id) then raise exception 'the hall already has that'; end if;
  select * into g from public.guilds where id = me.guild_id for update;
  if public.gv2_staff_guild(g.id) then perform public.shop_spend(uid, it.price);
  else if g.bank < it.price then raise exception 'the bank needs % gold', it.price; end if; update public.guilds set bank = bank - it.price where id = g.id;
    insert into public.guild_ledger (guild_id, user_id, name, kind, amount, item) values (g.id, uid, left(public.gv2_name(uid), 20), 'spend', it.price, 'Decor: ' || p_id); end if;
  insert into public.guild_decor (guild_id, item, by_user) values (g.id, p_id, uid);
  return jsonb_build_object('item', p_id, 'bank', (select bank from public.guilds where id = g.id));
end $$;
create or replace function public.guild_decor_list() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(item order by at), '[]') from public.guild_decor where guild_id = (select guild_id from public.guild_members where user_id = auth.uid()) $$;

-- Pet sources besides eggs: rare floor-clear drops (3% for each non-staff hero with >= 5% of the guardian's HP) and the day-7 chest (50%).
create or replace function public.pet_on_clear() returns trigger language plpgsql security definer set search_path = public as $$
declare d record;
begin
  for d in select user_id from public.damage where floor = new.floor and not is_staff and damage >= 0.05 * new.max_hp loop
    if random() < 0.03 then perform public.pet_grant(d.user_id, ceil(new.floor / 10.0)::int, 'clear'); end if;
  end loop; return new;
end $$;
drop trigger if exists pet_on_clear on public.floor_clears;
create trigger pet_on_clear after insert on public.floor_clears for each row execute function public.pet_on_clear();
create or replace function public.pet_on_day7() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.streak = 7 and new.last_day is distinct from old.last_day and random() < 0.5 then
    perform public.pet_grant(new.user_id, ceil((select floor from public.floor_state where id = 1) / 10.0)::int, 'chest'); end if;
  return new;
end $$;
drop trigger if exists pet_on_day7 on public.daily_claims;
create trigger pet_on_day7 after update on public.daily_claims for each row execute function public.pet_on_day7();

revoke all on function public.shop_name_ok(text), public.shop_spend(uuid, bigint), public.pet_grant(uuid, int, text), public.pet_on_clear(), public.pet_on_day7() from public, anon, authenticated;
revoke all on function public.shop_buy(text), public.shop_state(), public.pet_equip(bigint), public.token_use(text, text), public.memorial_carve(int, text), public.guild_decor_buy(text), public.guild_decor_list() from public, anon;
grant execute on function public.shop_buy(text), public.shop_state(), public.pet_equip(bigint), public.token_use(text, text), public.memorial_carve(int, text), public.guild_decor_buy(text), public.guild_decor_list() to authenticated;
grant execute on function public.memorial_wall(int) to anon, authenticated;

-- snapshot(): adds 'mw' (each floor's 12 newest memorial names) so memorial walls cost no Supabase reads.
create or replace function public.snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  with fs as (select floor from public.floor_state where id = 1),
       top as (select d.name, d.damage, d.is_staff, d.user_id from public.damage d, fs where d.floor = fs.floor order by d.damage desc limit 25)
  select jsonb_build_object('v', 1, 'at', now(), 'f', (select floor from fs),
    'lb', (select coalesce(jsonb_agg(jsonb_build_array(t.name, t.damage, t.is_staff) order by t.damage desc), '[]') from top t),
    'tg', (select coalesce(jsonb_object_agg(t.name, jsonb_build_array(g.tag, g.banner, g.is_staff)), '{}') from top t join public.guild_members m on m.user_id = t.user_id join public.guilds g on g.id = m.guild_id where not t.is_staff),
    'h', (select coalesce(jsonb_agg(jsonb_build_array(x.floor, x.at, x.ranking[1]) order by x.id desc), '[]') from (select id, floor, at, ranking from public.floor_clears order by id desc limit 120) x),
    'mw', (select coalesce(jsonb_object_agg(m.floor, m.names), '{}') from (select floor, jsonb_agg(name order by at desc) names from (select floor, name, at, row_number() over (partition by floor order by at desc) rn from public.memorials) z where rn <= 12 group by floor) m),
    'wl', (select public.waitlist_count()), 'eg', public.egress_estimate()) $$;
grant execute on function public.snapshot() to anon, authenticated;

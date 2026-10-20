-- $LOGOUT addendum: THE GLITCH DEN (in-game gold casino, a gold sink). Idempotent: safe to run more than once. Run after schema-addendum-quests-profile.sql.
-- GOLD ONLY. Nothing here touches the $LOGOUT token, wallets, creator fees or anything with real value, and nothing is ever sold for money.
-- The SERVER rolls (Postgres random(), seeded per connection from the OS; the client never sends a seed or a result) and moves the gold
-- in the saved game atomically under a row lock, so a bet can never take gold below 0. Writes go through casino_play() only.
-- One RPC per spin; nothing rides in tick(). Winnings are plain gold: they never add boss damage, never enter rankings, quests or the snapshot.
-- Staff (GM) may play under the same limits; the per-day stats table is private (no policies, no public reader), so staff winnings show nowhere.
-- House edge: Coin Flip 3% (1.94x on 50/50) · Dice 4% (pays 96 / win-chance%) · Glitch Wheel 5% (EV 0.95). Mirrors js/casino.js (pglite test checks parity).
-- Limits: min bet 10g; max bet 2,000g × floor tier (floor_base_hp ratio, = baseHp in js/floors.js); daily wager 50 × max bet (resets 00:00 UTC); 1.5 s between spins.
create table if not exists public.casino_days (user_id uuid references auth.users on delete cascade, day date, wagered bigint not null default 0 check (wagered >= 0),
  won bigint not null default 0, spins int not null default 0, last_at timestamptz, primary key (user_id, day));
alter table public.casino_days enable row level security; -- no policies: definer functions only

create or replace function public.casino_limits(f int) returns jsonb language sql immutable as $$
  select jsonb_build_object('min', 10, 'max', (round(2000 * (public.floor_base_hp(greatest(f, 1)) / public.floor_base_hp(1)::double precision) / 10) * 10)::bigint, 'lim', (round(2000 * (public.floor_base_hp(greatest(f, 1)) / public.floor_base_hp(1)::double precision) / 10) * 10)::bigint * 50, 'cd', 1500) $$;
-- Wheel: weight (of 1000), multiplier. EV = 0.950.
create or replace function public.casino_wheel() returns table (i int, w int, m numeric) language sql immutable as $$
  values (0, 4, 25::numeric), (1, 20, 5), (2, 120, 2), (3, 200, 1.5), (4, 420, 0.5), (5, 236, 0) $$;
-- Dice: chance in % (5..95) -> multiplier floor(9600 / chance) / 100.
create or replace function public.casino_dice_mult(chance int) returns numeric language sql immutable as $$ select floor(9600.0 / chance) / 100 $$;

create or replace function public.casino_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select public.casino_limits(fs.floor) || jsonb_build_object('f', fs.floor, 'used', coalesce(c.wagered, 0), 'open', true)
  from public.floor_state fs left join public.casino_days c on c.user_id = auth.uid() and c.day = (now() at time zone 'utc')::date where fs.id = 1 $$;
revoke all on function public.casino_state() from public, anon; grant execute on function public.casino_state() to authenticated;

-- p_game: 'flip' (p_pick 0 heads / 1 tails), 'dice' (p_pick > 0: roll over p_pick; < 0: roll under -p_pick; roll is 1..100), 'wheel'.
create or replace function public.casino_play(p_game text, p_bet bigint, p_pick int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'utc')::date; f int; lim jsonb; c public.casino_days; sv public.saves;
  gold bigint; roll int; win boolean; mult numeric := 0; chance int; seg int; pay bigint; acc int := 0; x int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_game not in ('flip', 'dice', 'wheel') then raise exception 'unknown game'; end if;
  select floor into f from public.floor_state where id = 1; lim := public.casino_limits(f);
  if p_bet is null or p_bet < (lim->>'min')::bigint then raise exception 'minimum bet is % gold', lim->>'min'; end if;
  if p_bet > (lim->>'max')::bigint then raise exception 'max bet on this floor is % gold', lim->>'max'; end if;
  if p_game = 'flip' and p_pick not in (0, 1) then raise exception 'pick heads or tails'; end if;
  if p_game = 'dice' then chance := case when p_pick > 0 then 100 - p_pick when p_pick < 0 then -p_pick - 1 else 0 end;
    if chance < 5 or chance > 95 then raise exception 'win chance must be 5-95%%'; end if; end if;
  insert into public.casino_days (user_id, day) values (uid, today) on conflict do nothing;
  select * into c from public.casino_days where user_id = uid and day = today for update;
  if c.last_at is not null and now() - c.last_at < make_interval(secs => (lim->>'cd')::int / 1000.0) then raise exception 'the den is still spinning, wait a moment'; end if;
  if c.wagered + p_bet > (lim->>'lim')::bigint then raise exception 'daily wager limit reached (% gold, resets 00:00 UTC)', lim->>'lim'; end if;
  select * into sv from public.saves where user_id = uid for update; gold := floor(coalesce((sv.data->>'gold')::numeric, 0));
  if sv.user_id is null or gold < p_bet then raise exception 'not enough gold in your saved game'; end if;
  if p_game = 'flip' then roll := floor(random() * 2)::int; win := roll = p_pick; if win then mult := 1.94; end if;
  elsif p_game = 'dice' then roll := 1 + floor(random() * 100)::int; win := (p_pick > 0 and roll > p_pick) or (p_pick < 0 and roll < -p_pick);
    if win then mult := public.casino_dice_mult(chance); end if;
  else roll := floor(random() * 1000)::int; x := roll;
    for seg, acc, mult in select w.i, w.w, w.m from public.casino_wheel() w order by w.i loop exit when x < acc; x := x - acc; end loop;
    win := mult > 0; end if;
  pay := floor(p_bet * mult)::bigint;
  update public.saves set data = jsonb_set(data, '{gold}', to_jsonb(gold - p_bet + pay)), updated_at = now() where user_id = uid;
  update public.casino_days set wagered = wagered + p_bet, won = won + pay, spins = spins + 1, last_at = now() where user_id = uid and day = today;
  return jsonb_build_object('g', p_game, 'r', roll, 's', seg, 'w', win, 'm', mult, 'p', pay, 'd', pay - p_bet, 'gold', gold - p_bet + pay,
    'used', c.wagered + p_bet, 'lim', lim->'lim', 'max', lim->'max');
end $$;
revoke all on function public.casino_play(text, bigint, int) from public, anon; grant execute on function public.casino_play(text, bigint, int) to authenticated;
revoke all on function public.casino_limits(int), public.casino_wheel(), public.casino_dice_mult(int) from public, anon;

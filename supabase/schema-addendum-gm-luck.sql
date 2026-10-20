-- $LOGOUT addendum: STAFF GM LUCK in the Glitch Den. Idempotent: safe to run more than once. Run after schema-addendum-casino.sql.
-- Applies ONLY when the caller's profile has role = 'gm' (checked here, on the server). Every other player keeps the exact rules of
-- schema-addendum-casino.sql (the pglite test replays them). Still gold only; winnings still never touch boss damage, rankings or the snapshot.
-- GM: Coin Flip wins 52.5% and pays 2x (+5% player edge) · Dice pays floor(10500 / chance%) / 100 (about +5%) · Glitch Wheel multipliers
-- raised (28 / 5.5 / 2.2 / 1.65 / 0.55 / 0, EV 1.047). No daily wager limit, max bet 10x. Min bet, the 1.5 s cooldown and the
-- gold-can't-go-negative check stay. Mirrors js/casino.js.
create or replace function public.casino_is_gm(u uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = u and role = 'gm') $$;
create or replace function public.casino_limits_for(u uuid, f int) returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.casino_is_gm(u) then l || jsonb_build_object('max', (l->>'max')::bigint * 10, 'lim', null, 'gm', true) else l end
  from (select public.casino_limits(f) l) x $$;
create or replace function public.casino_wheel_gm() returns table (i int, w int, m numeric) language sql immutable as $$
  values (0, 4, 28::numeric), (1, 20, 5.5), (2, 120, 2.2), (3, 200, 1.65), (4, 420, 0.55), (5, 236, 0) $$;

create or replace function public.casino_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(public.casino_limits_for(auth.uid(), fs.floor) || jsonb_build_object('f', fs.floor, 'used', coalesce(c.wagered, 0), 'open', true))
  from public.floor_state fs left join public.casino_days c on c.user_id = auth.uid() and c.day = (now() at time zone 'utc')::date where fs.id = 1 $$;
revoke all on function public.casino_state() from public, anon; grant execute on function public.casino_state() to authenticated;

create or replace function public.casino_play(p_game text, p_bet bigint, p_pick int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'utc')::date; f int; lim jsonb; c public.casino_days; sv public.saves; gm boolean;
  gold bigint; roll int; win boolean; mult numeric := 0; chance int; seg int; pay bigint; acc int := 0; x int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_game not in ('flip', 'dice', 'wheel') then raise exception 'unknown game'; end if;
  gm := public.casino_is_gm(uid);
  select floor into f from public.floor_state where id = 1; lim := public.casino_limits_for(uid, f);
  if p_bet is null or p_bet < (lim->>'min')::bigint then raise exception 'minimum bet is % gold', lim->>'min'; end if;
  if p_bet > (lim->>'max')::bigint then raise exception 'max bet on this floor is % gold', lim->>'max'; end if;
  if p_game = 'flip' and p_pick not in (0, 1) then raise exception 'pick heads or tails'; end if;
  if p_game = 'dice' then chance := case when p_pick > 0 then 100 - p_pick when p_pick < 0 then -p_pick - 1 else 0 end;
    if chance < 5 or chance > 95 then raise exception 'win chance must be 5-95%%'; end if; end if;
  insert into public.casino_days (user_id, day) values (uid, today) on conflict do nothing;
  select * into c from public.casino_days where user_id = uid and day = today for update;
  if c.last_at is not null and now() - c.last_at < make_interval(secs => (lim->>'cd')::int / 1000.0) then raise exception 'the den is still spinning, wait a moment'; end if;
  if not gm and c.wagered + p_bet > (lim->>'lim')::bigint then raise exception 'daily wager limit reached (% gold, resets 00:00 UTC)', lim->>'lim'; end if;
  select * into sv from public.saves where user_id = uid for update; gold := floor(coalesce((sv.data->>'gold')::numeric, 0));
  if sv.user_id is null or gold < p_bet then raise exception 'not enough gold in your saved game'; end if;
  if p_game = 'flip' then
    if gm then roll := case when random() < 0.525 then p_pick else 1 - p_pick end; else roll := floor(random() * 2)::int; end if;
    win := roll = p_pick; if win then mult := case when gm then 2 else 1.94 end; end if;
  elsif p_game = 'dice' then roll := 1 + floor(random() * 100)::int; win := (p_pick > 0 and roll > p_pick) or (p_pick < 0 and roll < -p_pick);
    if win then mult := case when gm then floor(10500.0 / chance) / 100 else public.casino_dice_mult(chance) end; end if;
  else roll := floor(random() * 1000)::int; x := roll;
    for seg, acc, mult in select w.i, w.w, w.m from (select * from public.casino_wheel() where not gm union all select * from public.casino_wheel_gm() where gm) w order by w.i loop
      exit when x < acc; x := x - acc; end loop;
    win := mult > 0; end if;
  pay := floor(p_bet * mult)::bigint;
  update public.saves set data = jsonb_set(data, '{gold}', to_jsonb(gold - p_bet + pay)), updated_at = now() where user_id = uid;
  update public.casino_days set wagered = wagered + p_bet, won = won + pay, spins = spins + 1, last_at = now() where user_id = uid and day = today;
  return jsonb_strip_nulls(jsonb_build_object('g', p_game, 'r', roll, 's', seg, 'w', win, 'm', mult, 'p', pay, 'd', pay - p_bet, 'gold', gold - p_bet + pay,
    'used', c.wagered + p_bet, 'lim', lim->'lim', 'max', lim->'max'));
end $$;
revoke all on function public.casino_play(text, bigint, int) from public, anon; grant execute on function public.casino_play(text, bigint, int) to authenticated;
revoke all on function public.casino_is_gm(uuid), public.casino_limits_for(uuid, int), public.casino_wheel_gm() from public, anon, authenticated;

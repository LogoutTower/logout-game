# Pre-launch staff run and pre-release reset

Two SQL files, run by hand in the Supabase SQL editor. Nothing here runs automatically, and the tests only use PGlite (never the live DB).

## Order

1. **`supabase/schema-addendum-gm-softener-prelaunch.sql`**: run once, any time before the run. It's idempotent, so it's safe to re-run.
2. Optional: `select public.prelaunch_suggest(40);` prints the staff hero's level and forge tier, the hours needed at factor 1, and a
   suggested factor for a 40 h run. Apply it with `update public.tower_config set prelaunch_hp_factor = <x> where id = 1;`. The new
   factor applies from the next floor. Re-running the addendum also rescales the floor in progress (it only lowers HP).
3. **The staff run**: floors 11-20, online, before Mon Oct 26 10:30 AM CT (2026-10-26 15:30 UTC).
4. **`supabase/admin-reset-tower.sql`**: run after the run and before release. It's idempotent.

## What the addendum does

- **`public.tower_config`** is a single settings row with no client access:
  - `gm_soft_mult` (default 1.5)
  - `prelaunch_hp_factor` (default 0.04)
  - `prelaunch_until` (2026-10-26 15:30 UTC)
  - `prelaunch_enabled` (default true)
- **GM raid softener, always on, before and after launch.** For `role = 'gm'`, `submit_damage` accepts at most
  `gm_soft_mult × ref_dps(floor) × elapsed` against the shared boss.
  - `ref_dps` is a strong normal player on that floor: class-average base, level cap floor+10, forge cap floor+8, and the floor's
    Legendary weapon and armor.
  - The client mirrors it (`GM_SOFTEN_MULT` in `config.js`, `softenGm()` in `js/loot.js`), so the damage numbers and boss HP bar show
    the softened amount.
  - Unaffected: players, the Sanctum, gold, XP, the ID card and the GM's displayed DPS.
- **Pre-launch HP factor.** While it's enabled and `now() < prelaunch_until`, floors 11-20 start at `floor_hp × turnout × factor`.
  - The turnout trigger now includes the factor.
  - The floor in progress is scaled once, keeping its remaining fraction.
  - At or after the launch instant, or once it's disabled, the factor is 1 and the addendum is inert.
  - After launch, the hourly surge check can raise a reduced floor back up (it never lowers HP). The reset puts the tower back on
    Floor 1 anyway.

**How the two interact:** the softener stays on during the run. The factor (0.04) was chosen for the softened damage, so they're
compatible. At 1.5× a reference player, the softener only binds for a very strong staff hero (around Lv 45+ with forge +25 or more).

Estimated online hours for floors 11-20 at factor 0.04, with turnout at its 0.5 minimum and the softener on (no talents or pets,
level held fixed; 2x XP makes it faster):

| Staff hero | Hours |
|---|---|
| Lv 25, forge +10 | ~105 |
| Lv 35, forge +20 | ~58 |
| Lv 50, forge +30 | ~39 |
| Lv 80, forge +40 | ~36 (softener-bound) |

## What `admin-reset-tower.sql` wipes

- **Pre-launch factor:** `tower_config.prelaunch_enabled = false` (permanently inert).
- **Leaderboard, damage records and clear history:** all rows in `damage` and `floor_clears`.
- **Floor memorials:** all rows in `memorials`.
- **Guild weeklies:** `guild_quests` and `guild_quest_contrib`.
- **Guild progress:** `guild_ledger` and `guild_decor` are emptied. Non-staff guilds get xp, bank, bonus tier, hall level and banner
  unlocks set back to 0.
- **Tester heroes** (every account without `role = 'gm'`): their `saves`, `pets`, `shop_owned`, `shop_tokens`, `daily_claims` and
  `quest_days`, plus their active pet.
- **Shop:** `shop_global.sold = 0`, so the climbing prestige prices start over.
- **Turnout:** `profiles.last_submit = null` for everyone (nobody counts as recently active) and `sanctum = false`.
- **The tower:** Floor 1 at full HP, scaled by the turnout trigger (0.5× with no recent players). Decree, announce and marks are cleared.

## What it keeps

- Auth accounts and profiles, including the staff role binding
- The waitlist
- Guilds and their memberships and ranks
- Chat
- Egress stats
- The staff save
- `max_floor`

**Caveat:** when the cloud save is missing, `loadSave()` (js/supabase.js) keeps the browser's local copy and uploads it again. Testers
must clear site data for the game before they next open it, or their old progress comes back. A client-side save-epoch check would
close this gap, but none exists yet.

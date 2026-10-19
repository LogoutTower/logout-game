# Balance: floors 11-20 (arc 2, The Frozen Clockspire)

All numbers come from js/floors.js (`ARC_HP`, `floorBossHp`) and match `floor_hp()` in supabase/schema-addendum-floors-11-20.sql (a pglite test checks parity for floors 1-30).

## HP curve

Floors 1-10 are unchanged: 2,161,050 HP in total. The GM cleared them overnight, which works out to about 50 DPS sustained for 12 h.

Arc 2 keeps the same soft-exponential base and the x2.5 milestone, then multiplies by `ARC_HP`: x60 on floor 11, growing x1.33 per floor (x781 on floor 20), and flat after floor 20 until arc 3 is tuned. Gear and shop prices keep scaling with the base curve only, so heroes don't outgrow the boss.

| Floor | Guardian | HP | Arc multiplier |
|---|---|---|---|
| 11 | The Brass Sentinel | 31,194,000 | ×60.0 |
| 12 | The Rime Weaver | 52,173,000 | ×79.8 |
| 13 | The Pendulum Knight | 86,351,000 | ×106.1 |
| 14 | The Cogwyrm | 141,539,000 | ×141.2 |
| 15 | The Stilled Hour | 229,926,000 | ×187.7 |
| 16 | The Frostbound Matron | 370,497,000 | ×249.7 |
| 17 | The Gearhound | 592,489,000 | ×332.1 |
| 18 | The Glass Seraph | 940,966,000 | ×441.7 |
| 19 | The Keeper of Spent Hours | 1,484,758,000 | ×587.4 |
| 20 | The Unwound Sovereign | 5,822,028,000 | ×781.3 |

**Arc 2 total: 9,751,921,000 HP (9.75B).** Floor 20, the finale, alone is about 60% of it.

## Why this size

One hero's daily damage depends on the time it is effectively fighting (live time plus up to 12 h offline per return) and its average DPS. Being worn down (DPS halved after about 12 min without the Inn) lowers the effective rate.

- **Strong solo hero**, playing 24 h a day at about 400 effective DPS (Lv 30+, Clockspire Legendary/Unique gear): about 35M damage per day. Solo, arc 2 would take about 279 days. A single hero can't solo it overnight; it can't even solo floor 13 in one night (86M).
- **Typical active hero**, about 120 effective DPS for about 20 h a day (two returns): about 8.6M per day.
- **Community**, at 8.6M per hero per day: arc 2 is 1,134 hero-days of damage: about 11 days with 100 daily-active heroes (the target: 1 to 2+ weeks), about 23 days with 50, and about 4 days with 300. Retune `ARC_HP` if launch turnout is very different. Floors 11-14 fall within the first days; 17-20 are the long climb.
- DPS grows during the arc, since Clockspire gear scales with the base curve: a floor-20 Legendary weapon gives +91 flat DPS before forge. That is why later floors grow x1.33 per floor on top of the base curve.

**Retune in one place:** change `ARC_HP` in js/floors.js and `floor_arc_mul()` in the addendum together. The parity test fails if they drift.

## Server

- floor_state.max_floor goes from 10 to 20.
- If floor 10 is already cleared at the cap, the addendum advances it to floor 11 once.
- submit_damage is unchanged: its clamp already allows the best Unique weapon of floor min(current + 5, max_floor) with 8x headroom. The pglite test shows an honest Lv30/+12 Clockspire build is not clipped and a 100x claim still is.
- **Before the SQL runs:** the server stays capped at 10. The client shows the floor 10 guardian at 0 HP with 'the stair to Floor 11 is opening soon'.

## Mechanics (live fights only; offline maths never apply them)

- casing: -15% damage while the boss is above 80% HP.
- frostbite: drain x1.2.
- enrage: drain x1.4 below 20% HP.
- weakness: +20% damage with a weapon of that element.
- stillHour: alternating layers give x0.9 or x1.1 damage.
- overclock: below 40% HP, damage x1.15 and drain x1.3.

None of them affect the server clamp.

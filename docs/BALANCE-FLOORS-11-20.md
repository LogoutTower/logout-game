# Balance: launch pacing (supersedes the HP numbers further down)

**Current numbers live in js/floors.js (`ARC1_HP`, `ARC_HP`, `floorBossHp`) and `floor_hp()` in supabase/schema-addendum-arc1-pacing.sql; pglite tests check parity for floors 1-30.** The older "HP curve" tables below describe the first arc 2 tuning (x60, x1.33) and are kept for history only.

## DPS model (fresh launch-day heroes, not the 400 DPS strong hero)
- A fresh Lv 1 Blade, simulated minute by minute: damage gives 10% gold and 5% XP, XP levels it up, and gold buys the cheaper of a level or a forge tier. Loot adds about 25%; wear-down and Inn gaps cost about 30% (efficiency 0.7). The result is about Lv 13/forge 9 (~54 DPS) at 1 h, Lv 21 (~116 DPS) at 7 h, and Lv 24-25 (~150 DPS) at 18-24 h.
- On top of that, a 0.6 realism factor (late spending while idle or offline, gaps, not everyone online) and arrivals spread over the first 3 h. That comes to about 6.3M damage per hero in the first 24 h. From day 2 the model uses about 8.6M per hero per day, which is the arc 2 figure.

## Floors 1-10 (Gatefall Hold): about 18 h for 100 heroes
| Floor | HP | Target clear (100 heroes, from gate open) |
|---|---|---|
| 1 | 86,000 | ~0.25 h |
| 2 | 630,000 | ~0.75 h |
| 3 | 2,400,000 | ~1.5 h |
| 4 | 7,300,000 | ~2.5 h |
| 5 | 21,000,000 | ~4 h |
| 6 | 33,000,000 | ~5.75 h |
| 7 | 44,000,000 | ~7.75 h |
| 8 | 55,000,000 | ~10 h |
| 9 | 74,000,000 | ~12.75 h |
| 10 | 150,000,000 | ~18 h |

Total is 387.4M. The early floors fall in minutes, the climb is gentle, and Floor 10 (150M, 2x Floor 9) is the mini-wall at about 5 h.

## Floors 11-20 (Rimegear Ascent): about 1 week at 100 DAU
`ARC_HP = { start: 332, growth: 0.988 }`. Floor 11 is 172.6M, 1.15x Floor 10, with no cliff, and each floor after that is about 1.2x the one before. The arc total is 6.01B, about 7 days at 100 heroes x 8.6M a day.
| Floor | HP | Cumulative (days at 100 DAU) |
|---|---|---|
| 11 | 172,607,000 | ~0.2 d |
| 12 | 214,457,000 | ~0.5 d |
| 13 | 263,671,000 | ~0.8 d |
| 14 | 321,055,000 | ~1.1 d |
| 15 | 387,432,000 | ~1.6 d |
| 16 | 463,765,000 | ~2.1 d |
| 17 | 550,933,000 | ~2.8 d |
| 18 | 649,977,000 | ~3.5 d |
| 19 | 761,877,000 | ~4.4 d |
| 20 | 2,219,263,000 | ~7.0 d |

## Turnout scaling (server-side, supabase/schema-addendum-turnout-scaling.sql)
When a floor starts, `max_hp = floor_hp(f) x clamp(active / 100, 0.5, 50)`. Here `active` counts the profiles whose `last_submit` falls in the last 24 h. Overflow damage carries over. **Mid-floor surge:** the server re-checks turnout at most once an hour, on the next damage write. If more HP is needed, `max_hp` grows and the remaining fraction is kept. It never shrinks mid-floor. The cost is one indexed count per hour, which fits the free tier. A trigger on floor_state applies this, so it covers every advance path, and clients already show the server's `max_hp`. With 50-5,000 active heroes, clear times hold at about 18 h for arc 1 and about 1 week for arc 2. Fewer than 50 heroes is slower (25 heroes take about 2x as long); more than 5,000 is faster. The floor that is live when the addendum runs keeps its unscaled HP. Gold, XP and loot come from damage dealt, so per-hero rewards don't change; only floor-clear drops slow down.

# Balance: floors 11-20 (arc 2, Rimegear Ascent)

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

- **Strong solo hero**, playing 24 h a day at about 400 effective DPS (Lv 30+, Rimegear Ascent Legendary/Unique gear): about 35M damage per day. Solo, arc 2 would take about 279 days. A single hero can't solo it overnight; it can't even solo floor 13 in one night (86M).
- **Typical active hero**, about 120 effective DPS for about 20 h a day (two returns): about 8.6M per day.
- **Community**, at 8.6M per hero per day: arc 2 is 1,134 hero-days of damage: about 11 days with 100 daily-active heroes (the target: 1 to 2+ weeks), about 23 days with 50, and about 4 days with 300. Retune `ARC_HP` if launch turnout is very different. Floors 11-14 fall within the first days; 17-20 are the long climb.
- DPS grows during the arc, since Rimegear Ascent gear scales with the base curve: a floor-20 Legendary weapon gives +91 flat DPS before forge. That is why later floors grow x1.33 per floor on top of the base curve.

**Retune in one place:** change `ARC_HP` in js/floors.js and `floor_arc_mul()` in the addendum together. The parity test fails if they drift.

## Server

- floor_state.max_floor goes from 10 to 20.
- If floor 10 is already cleared at the cap, the addendum advances it to floor 11 once.
- submit_damage is unchanged: its clamp already allows the best Unique weapon of floor min(current + 5, max_floor) with 8x headroom. The pglite test shows an honest Lv30/+12 arc 2 build is not clipped and a 100x claim still is.
- **Before the SQL runs:** the server stays capped at 10. The client shows the floor 10 guardian at 0 HP with 'the stair to Floor 11 is opening soon'.

## Mechanics (live fights only; offline maths never apply them)

- casing: -15% damage while the boss is above 80% HP.
- frostbite: drain x1.2.
- enrage: drain x1.4 below 20% HP.
- weakness: +20% damage with a weapon of that element.
- stillHour: alternating layers give x0.9 or x1.1 damage.
- overclock: below 40% HP, damage x1.15 and drain x1.3.

None of them affect the server clamp.

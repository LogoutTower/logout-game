# Late-game gold sinks + pets

All six sinks are cosmetic or prestige only. Prices, gating, ownership, global prestige prices, pets and perks are decided server-side in
`supabase/schema-addendum-shop.sql`; `js/prestige.js` mirrors the catalog for display (parity checked in `test/schema-shop.pglite.mjs`).
Gold comes out of the saved game exactly like `guild_donate` (lock the save row, check, deduct). Staff-only items (Vesperveil, Floor Zero sigil, Equinox) are never sold or granted.
Prices scale ×10 per arc.

| Item | Gate | Price |
|---|---|---|
| Gatefall Hold Trophy 🏰 | after arc 1 falls | 300k |
| Rimegear Ascent Trophy ⚙️ | after arc 2 falls | 3M |
| Stone-Keep Knight (skin) | arc 1 | 5M |
| Clockwork Frost Suit (skin) | arc 2 reached | 12M |
| Gatefall Pet Egg | arc 1 | 400k |
| Rimegear Pet Egg (better odds) | arc 2 reached | 4M |
| Rename Token (chat filter + no staff-like names) | — | 250k |
| Re-roll Token (look from unlocked colours) | — | 100k |
| Tower Patron (prestige title) | — | 2M × 1.12^sold (global) |
| Spire Benefactor | — | 8M × 1.12^sold |
| Keeper of the Lanterns | arc 2 reached | 25M × 1.15^sold |
| Floor memorial (one per hero per floor, 12 newest shown, rides in the snapshot) | floor reached | 100k (arc 1), 1M (arc 2) |
| Guild decor: Trophy Stand / Hall Banners / Gatefall Throne / Rimegear Chandelier | leader/officer, guild bank (staff guild: own gold) | 150k / 400k / 1.5M / 3M |

## Pets
Rarities match gear (common → unique, same colours). One active pet; one passive perk scaled by rarity:

| Pet | Perk | C / U / R / E / L / Unique |
|---|---|---|
| Torch Sprite | gold % | 2 / 3 / 5 / 7 / 10 / 12 |
| Stone Pup | XP % (level cap still applies) | 2 / 3 / 5 / 7 / 10 / 12 |
| Frost Mote | HP drain −% | 5 / 8 / 12 / 16 / 20 / 25 |
| Lantern Moth | offline cap +h | 1 / 1 / 2 / 3 / 4 / 5 |
| Gear Owl | loot find % | 3 / 5 / 8 / 12 / 16 / 20 |
| Ember Wisp | DPS % | 0 / 0 / 0 / 1 / 2 / 3 |

Sources: eggs (Goods), the day-7 chest (50%, rolled in a `daily_claims` trigger) and floor clears (3% for each non-staff hero with ≥5% of the guardian's HP).
Odds arc 1: 55 / 27 / 12 / 5 / 0.9 / 0.1 %; arc 2: 35 / 30 / 20 / 10 / 4 / 1 %. A Unique gets one of 8 one-of-a-kind names (unique index); when all are taken it becomes Legendary.
Perk values are written by the server (`pet_perk_v`), the client clamps to the top tier, and `submit_damage`'s level/forge clamp is unchanged, so no pet passes the caps.

**Equinox (staff only):** two orbiting halves (light: the Architect; shadow: Umbra, violet glow + starlit motes). Rendered only when the staff check passes; the server has no
function that grants it and non-staff saves are stripped of it. *Architect's Light*: the Decree aura, taken as max() with the Decree (never above +5%). *Umbra's Eclipse*:
every 10 min a 20 s eclipse overlay and +3% XP for the staff hero only. No party effect beyond the existing Decree; staff stays out of rankings.

## Rehearsal (100 heroes, full arc 2, `UNTIL_FLOOR=99 node test/rehearsal.pglite.mjs 100 300`)
Pet perks are in the hero model (each hero follows its best gold/XP/DPS pet). 25% of heroes are collectors (spend above two tonics); the rest buy only
from gold beyond twice their next level/forge step.

- Floor 10 at 19.5 h (unchanged), Floor 20 at 188 h (was 186 h): arc 2 ≈ 7 days.
- Shop absorbed **151.1M** gold in 273 purchases (memorials 111.1M, eggs 30M, trophies 7.5M, tokens 2.5M) vs tonics 6.9M (≈ 22×) and daily gold 55.8M.
- 183 pets existed by the end (75 from eggs, the rest from clear drops / chests). RPC error rate 0.01% (probes excluded).
- Non-collectors bought nothing: in arc 2 their spare gold (≈2.7M) is below the next forge step (≈4.1M), i.e. the forge cap is still the main sink.

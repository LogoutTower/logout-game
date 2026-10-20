# Staff Sanctum ("The Architect's Sanctum", working name)

A private training room **outside the tower** for the staff hero: a black-and-gold drafting hall with glowing blueprint lines, an unfinished tower model,
the empty slot where the log-out button once was, and starlight. Solumbra's halo and the Vesperveil cloak render there because the hero renders unchanged.

- **Toggle:** a small portal button on the arena (`◈ Sanctum` / `◈ Tower`). Online it shows only when the server gm role check passes (`be.isGm()`), and in offline mode when the existing staff check passes. Players are stripped of the flag (`sanitizeSave`).
- **Training construct:** HP from the floor-HP curve at its level (1-200) × an HP multiplier (0.1-1000). It re-forms when broken. Live 10 s DPS, session average, total and break count are shown; GM tools (sandbox, cutscene preview) open from the meter.
- **Never shared:** in the Sanctum the client sends **no damage ticks and no floor polls, only save pushes** (cheaper egress). No trickle loot. Offline time accrues to whichever mode the staff hero was in.
- **Server (`supabase/schema-addendum-sanctum.sql`, run after shop):**
  - `staff_sanctum(on)` is gm role only.
  - `turnout_mul()` ignores Sanctum profiles.
  - Triggers keyed on the caller cancel any damage row, floor HP or floor change, Decree presence and `floor_clears` insert from a Sanctum profile, so there are no rankings and no clear or pet drops.
  - Leaving resets `last_submit`, so Sanctum time can't be claimed as tower damage.
- **XP and gold** stay client-side at the normal staff rate (2× XP, uncapped). They are not validated anywhere server-side, so no extra RPC is needed.
- **Tests:** `test/sanctum.test.mjs` (unit), `test/schema-sanctum.pglite.mjs` (server), `test/e2e.sanctum.mjs` (browser).

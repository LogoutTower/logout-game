# $LOGOUT — idle tower prototype (v1)
Static browser idle game: an auto-fighting hero climbs floors 1–10, chipping at a shared floor boss (other players simulated locally). Offline progress is computed from timestamps (capped at 12h). Saves go to localStorage.

**Run locally:** `python3 -m http.server 8000` then open http://localhost:8000. Tests: `for t in offline cosmetics floors progress loot town loop unique talents storage.contract; do node test/$t.test.mjs; done`; browser regression (needs playwright-core): `node test/e2e.play.mjs [url]` and `node test/e2e.buttons.mjs [url]`. Dev-only boss plan preview: `/preview-bosses.html`.

**Deploy:** no build step. *GitHub Pages:* push the repo, Settings → Pages → deploy from branch `main`, root. *Cloudflare Pages:* connect the repo, build command empty, output dir `/`.

Later: `js/storage.js` is the backend seam (add a Supabase backend with the same interface); token perk check not in v1.

**Floors:** `js/floors.js` holds the 100-floor plan. Floors 1–9 are hand-made, special slots (10, 20 … 90 and 91–100) are never generated and currently hold hand-made `placeholder_special` bosses, and every other floor is generated deterministically from the floor number (base creature + element + add-ons, see `js/bosses.js`). Set `MAX_FLOOR` in `config.js` (10 for the prototype, up to 100).

**Unique weapons:** the top rarity (0.05% per gear roll, 0.15% on special floors, boss kills only). Each one is generated on drop (seeded): a one-of-a-kind name and serial, stats above Legendary, one ability and one mild drawback from the pools in `js/loot.js` (`ABILITIES`, `DRAWBACKS`, `FORBIDDEN` pairs). They are never auto-salvaged.

**Talents:** `js/talents.js` — each class has 3 branches of 5 nodes (rank caps 1–3, node *n* needs 2·n points spent in its branch, the last node is a capstone). 1 point per level from level 2 (Scholar adds bonus points). First respec is free, then gold scaled by floor. Effects go through the same pipeline as gear and Unique weapons (DPS, HP, drain, gold/XP, offline cap and efficiency, loot, salvage, inn/shop prices, Well Rested) and apply in offline maths too. Save version 5.

**Online mode (Supabase, off by default):** `js/supabase.js` (`SupabaseBackend`, same interface as `LocalBackend`), `supabase/schema.sql` and `supabase/SETUP.md`. Setup in short: create the project, run `schema.sql` in the SQL Editor, enable the **Anonymous**, **Web3 Wallet (Solana)** and **Email** (magic link) providers, set the Site URL and redirect URL to `https://logouttower.github.io/logout-game/`, then set `FEATURES.online = 'all'` in `config.js`. With it off (or the URL/key empty) the game runs exactly as before on local storage. Guests play instantly (anonymous auth); "Bind your identity" upgrades them with a Phantom message signature (never a transaction) or an email magic link. Holder check: set `TOKEN_MINT` and `HOLDER_THRESHOLD`. Tests: `node test/storage.contract.test.mjs`, and `node test/schema.pglite.mjs` (needs `@electric-sql/pglite`).

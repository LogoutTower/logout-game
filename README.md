# $LOGOUT — idle tower prototype (v1)
Static browser idle game: an auto-fighting hero climbs floors 1–10, chipping at a shared floor boss (other players simulated locally). Offline progress is computed from timestamps (capped at 12h). Saves go to localStorage.

**Run locally:** `python3 -m http.server 8000` then open http://localhost:8000. Tests: `node test/offline.test.mjs`, `node test/cosmetics.test.mjs`, `node test/floors.test.mjs`. Dev-only boss plan preview: `/preview-bosses.html`.

**Deploy:** no build step. *GitHub Pages:* push the repo, Settings → Pages → deploy from branch `main`, root. *Cloudflare Pages:* connect the repo, build command empty, output dir `/`.

Later: `js/storage.js` is the backend seam (add a Supabase backend with the same interface); token perk check not in v1.

**Floors:** `js/floors.js` holds the 100-floor plan. Floors 1–9 are hand-made, unique slots (10, 20 … 90 and 91–100) are never generated and currently hold hand-made `placeholder_unique` bosses, and every other floor is generated deterministically from the floor number (base creature + element + add-ons, see `js/bosses.js`). Set `MAX_FLOOR` in `config.js` (10 for the prototype, up to 100).

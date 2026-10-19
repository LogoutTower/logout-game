# $LOGOUT — idle tower prototype (v1)
Static browser idle game: an auto-fighting hero climbs floors 1–10, chipping at a shared floor boss (other players simulated locally). Offline progress is computed from timestamps (capped at 12h). Saves go to localStorage.

**Run locally:** `python3 -m http.server 8000` then open http://localhost:8000. Tests: `node test/offline.test.mjs` and `node test/cosmetics.test.mjs`.

**Deploy:** no build step. *GitHub Pages:* push the repo, Settings → Pages → deploy from branch `main`, root. *Cloudflare Pages:* connect the repo, build command empty, output dir `/`.

Later: `js/storage.js` is the backend seam (add a Supabase backend with the same interface); token perk check not in v1.

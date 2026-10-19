# Supabase setup ($LOGOUT online mode)

Online mode is **on** (`FEATURES.online: 'all'`). Set it back to `'off'` to return to local-only play. Any sign-in or network failure falls back to local play automatically.

1. **Run the schema.** Dashboard → SQL Editor → New query → paste all of `supabase/schema.sql` → Run. It is idempotent (tables `if not exists`, functions `create or replace`, policies dropped and recreated), so it is safe to run again after edits. RLS is enabled on every table (`profiles`, `saves`, `floor_state`, `damage`, `floor_clears`).
2. **Auth providers** (Authentication → Sign In / Providers):
   - **Anonymous sign-ins**: enable (guests get a server identity instantly).
   - **Web3 Wallet → Solana**: enable (Sign in with Solana via Phantom; message signature only).
   - **Email**: enable, with magic link / OTP. Keep "Confirm email" on.
3. **URL configuration** (Authentication → URL Configuration): Site URL `https://logouttower.github.io/logout-game/`, and add the same URL under Redirect URLs.
4. **Rate limits** (Authentication → Rate Limits): keep anonymous sign-ins low (e.g. 30 per hour per IP), email sends at the default (2–4 per hour), token refreshes default, Web3 sign-ins ~30 per 5 min per IP. Optionally turn on CAPTCHA for anonymous sign-ins if abuse shows up.
5. **Grant the GM role** (SQL Editor, as project owner; nobody can self-assign it through the API):
   `update public.profiles set role = 'gm' where id = '<auth user uuid>';`
   Find the uuid under Authentication → Users after that account has signed in once.
6. **Flip it on.** In `config.js` set `FEATURES.online` to `'all'` (URL and anon key are already filled in), commit and push.

Notes on the server logic (see `submit_damage` in schema.sql):
- Clients batch damage and call `submit_damage` at most every 30 s; the floor is polled every 30 s; no realtime subscriptions (free-tier friendly).
- Damage is clamped to `elapsed seconds since the user's last submit (max 12h) × max plausible DPS`, where max plausible DPS = 6.5 × level factor × 1.15^forge × 4 (+50). Over-claims are trimmed, not rejected.
- The floor advances atomically under a row lock, carrying overflow damage into the next floor, and writes a `floor_clears` row with the ranking. GM ("staff") damage counts toward the floor but is never ranked or rewarded.
- `gm_present_until` and `gm_announce` on `floor_state` are only writable through `submit_damage` / `gm_presence` / `gm_announce`, which check `profiles.role = 'gm'` server-side. The announce is limited to once per floor per 10 min.
- Logic tested locally with PGlite: `npm i @electric-sql/pglite && node test/schema.pglite.mjs`.

## Addendum: guilds + floor chat

1. SQL Editor → New query → paste all of `supabase/schema-addendum-guilds-chat.sql` → Run. It's idempotent, so running it again is fine. It needs `schema.sql` to have run first.
2. Check: Table Editor shows `guilds`, `guild_members`, `chat_messages`, `chat_reports` and `chat_banned_words`, and each one has RLS enabled.
3. Optional: add more filtered words with `insert into public.chat_banned_words (word) values ('...') on conflict do nothing;` (lowercase letters only, 3 or more). Also add each word to `BANNED` in `js/chatfilter.js` so the client gives instant feedback.
4. Tell the dev that it ran. The client keeps `FEATURES.guilds` / `FEATURES.chat` at `'off'` until then, and they get switched on in `config.js` after that.
Moderation: hide a message with `update public.chat_messages set hidden = true where id = <id>;` (3 player reports hide it automatically).

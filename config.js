export const MAX_FLOOR = 20; // arcs 1-2 open (floors 1-20); the server cap is floor_state.max_floor (schema-addendum-floors-11-20.sql)
export const OFFLINE_CAP_HOURS = 12;
// ---- Online services. Used only when FEATURES.online is 'all' AND both values are set; otherwise offline/local mode (the game works exactly as before).
export const SUPABASE_URL = 'https://wouftzosktizxjfvflsz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvdWZ0em9za3RpenhqZnZmbHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNzI1OTYsImV4cCI6MjEwNzk0ODU5Nn0.FSGjLWph1GtjoPE6V_17mCv1GDoo45xcSV3d0T7DYKY'; // public anon key (safe in the client; RLS protects the data)
export const SOLANA_RPC = 'https://api.mainnet-beta.solana.com'; // public read-only RPC for the holder check
export const TOKEN_MINT = '';         // $LOGOUT mint address; empty disables the holder check
export const HOLDER_THRESHOLD = 0;    // minimum token balance (UI units) for the holder perk
// ---- Feature flags: 'off' | 'gm' (staff early access) | 'all'
// online stays 'off' until supabase/schema.sql has been run on the project (see supabase/SETUP.md).
export const FEATURES = { online: 'all', bindIdentity: 'all', sandbox: 'gm', guilds: 'all', chat: 'all', guildsV2: 'all', prelaunchLock: true }; // v2 addendum ran 2026-10-19; // addendum ran 2026-10-19; chat posting still needs a bound identity (bindIdentity)
// ---- Local-only staff unlock (used only while Supabase is off). SHA-256 hex of a passphrase; empty disables it.
export const GM_PASS_HASH = '374da5e28297c53b43468e29236c132652675fbf158573f24daaf9cfcbbed19b';
// ---- Pre-launch gate (index.html at the site root): only a passcode screen until LAUNCH_AT, or until FEATURES.prelaunchLock is false.
// Unlocks with the team passcode (SHA-256 below) or the GM passphrase. After editing, run node scripts/stamp.mjs (it copies these into index.html/app.html).
export const TEAM_PASS_HASH = '05882b977150fcf7838197d682204bea98807c7b3a4919c795eec7bcaade9a2e';
export const LAUNCH_AT = '2026-10-26T15:30:00Z'; // Mon Oct 26, 10:30 AM CT

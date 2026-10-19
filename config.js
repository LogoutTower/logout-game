export const MAX_FLOOR = 10;
export const OFFLINE_CAP_HOURS = 12;
// ---- Online services. Used only when FEATURES.online is 'all' AND both values are set; otherwise offline/local mode (the game works exactly as before).
export const SUPABASE_URL = 'https://wouftzosktizxjfvflsz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvdWZ0em9za3RpenhqZnZmbHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNzI1OTYsImV4cCI6MjEwNzk0ODU5Nn0.FSGjLWph1GtjoPE6V_17mCv1GDoo45xcSV3d0T7DYKY'; // public anon key (safe in the client; RLS protects the data)
export const SOLANA_RPC = 'https://api.mainnet-beta.solana.com'; // public read-only RPC for the holder check
export const TOKEN_MINT = '';         // $LOGOUT mint address; empty disables the holder check
export const HOLDER_THRESHOLD = 0;    // minimum token balance (UI units) for the holder perk
// ---- Feature flags: 'off' | 'gm' (staff early access) | 'all'
// online stays 'off' until supabase/schema.sql has been run on the project (see supabase/SETUP.md).
export const FEATURES = { online: 'off', bindIdentity: 'gm', sandbox: 'gm' };
// ---- Local-only staff unlock (used only while Supabase is off). SHA-256 hex of a passphrase; empty disables it.
export const GM_PASS_HASH = '';

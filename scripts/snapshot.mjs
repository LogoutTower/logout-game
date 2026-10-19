// Publishes the public board snapshot for the game (node scripts/snapshot.mjs [out=snapshot.json]). Uses only the public anon key
// from config.js and the read-only snapshot() RPC (schema-addendum-egress.sql). Prints the egress pace; exit code 2 = pace warning.
import fs from 'node:fs'; import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
const out = process.argv[2] || 'snapshot.json';
const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/snapshot`, { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'content-type': 'application/json' }, body: '{}' });
if (r.status === 404) { console.log('snapshot() not installed yet (run supabase/schema-addendum-egress.sql); skipping'); if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'skip=1\nwarn=0\n'); process.exit(0); }
if (!r.ok) { console.error(`snapshot rpc failed: ${r.status} ${await r.text()}`); process.exit(1); }
const s = await r.json(); fs.writeFileSync(out, JSON.stringify(s));
const e = s.eg || {}; console.log(`floor ${s.f} · board ${s.lb.length} · egress ~${e.day_gb} GB/day · month pace ~${e.month_pace_gb} of ${e.quota_gb} GB${e.warn ? ' · WARNING over 80%' : ''}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `warn=${e.warn ? 1 : 0}\npace=${e.month_pace_gb}\n`);
process.exit(e.warn && process.env.FAIL_ON_WARN ? 2 : 0);

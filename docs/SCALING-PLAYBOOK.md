# Scaling playbook: Supabase egress and the Pro upgrade

## Where the bytes go (after the egress diet, schema-addendum-egress.sql)
| Call | When | Size (body + ~0.6 KB HTTP) |
|---|---|---|
| `tick()` (damage + floor + my clears + chat heads) | 60 s active · 10 min background tab · 15 min after 10 min idle | ~0.7 KB |
| save push | at most every 5 min, plus on page hide | ~0.6 KB (the response is minimal; the upload is ingress) |
| guild panel poll (`guild_info`) | 10 min, visible tab, guild members only | ~2.6 KB |
| chat | only while the chat window is open (4 s); badge dots come from `tick` heads with no fetch | — |
| leaderboard, guild tags, Tower Map history | from `snapshot.json` on GitHub (raw.githubusercontent.com), refreshed about every 10 min by `.github/workflows/snapshot.yml`; RPC fallback only if the snapshot is missing or older than 30 min | 0 Supabase bytes |
| page load (auth, profile, save, guild) | ~3 a day | ~20 KB each |

**Model:** a player day is 1.5 h active + 2.5 h visible but idle + 8 h background tab + 3 page loads, which comes to **~0.31 MB per player per day**. That was ~2.7 MB after the rehearsal fixes and ~17 MB before them.

| Daily players | Egress/day | Egress/30 days | Fits free 5 GB? |
|---|---|---|---|
| 100 | ~31 MB | ~0.9 GB (19%) | yes, for the full month |
| 500 | ~155 MB | ~4.7 GB (93%) | just about; the 80% warning fires |
| 2,000 | ~620 MB | ~18.6 GB | no: needs Pro (250 GB included) |

Pro's 250 GB covers about 27,000 such daily players before overage ($0.09/GB).

## Early warning (free)
- **What it measures:** `tick()` adds its own response size to `public.egress_stats` per day. `egress_estimate()` scales that up to all traffic (tick ≈ 33% of bytes) and reports `day_gb`, `month_pace_gb` and `warn` (true when the 30-day pace passes 80% of 5 GB, i.e. 4 GB).
- **Where it runs:** the snapshot Action (every ~10 min, free on this public repo) embeds the estimate in `snapshot.json` as `eg`. When `warn` is true it opens one GitHub issue, "Supabase egress pace above 80% of free tier", and doesn't open a duplicate while that issue is open.
- **Manual check:** `node scripts/snapshot.mjs /tmp/s.json` prints the pace. You can also open `https://raw.githubusercontent.com/LogoutTower/logout-game/snapshot/snapshot.json` and read `eg`.
- **Caveats:**
  - It's an estimate. The source of truth is the organization's **Usage** page in the Supabase dashboard.
  - GitHub disables scheduled workflows after 60 days with no repo activity, and cron runs can be delayed under load.

## Upgrade triggers
- **Upgrade:** the warning issue opens, *or* the dashboard Usage page shows egress past 4 GB in the cycle, *or* the 7-day average is above ~133 MB a day (≈ 430 daily players in this model).
- **Plan the upgrade (don't panic):** daily players stay above ~400 for 3+ days.
- **On the Free Plan:** going over the quota isn't billed. Supabase may restrict the project under its Fair Use Policy, so upgrade before that happens.

## How to upgrade (Supabase docs: "Manage your subscription")
1. In the dashboard, open the **organization's billing page**.
2. In **Subscription Plan**, click **Change subscription plan**.
3. Choose **Pro** in the side panel and follow the prompts. Add a card under **Payment Methods → Add new card** if asked.
4. The upgrade takes effect immediately and shows the costs before you confirm.

**Cost:** Pro is a fixed $25/month per organization (see supabase.com/pricing for the current figure; it includes compute credits that cover the default instance), plus usage beyond the included quotas:

| Item | Included in Pro | Overage |
|---|---|---|
| Egress | 250 GB | $0.09/GB |
| Database disk | 8 GB | $0.125/GB |
| Monthly active users (MAU) | 100,000 | $0.00325 each |
| Realtime peak connections | 500 | — |

**Spend Cap:** Pro only. With it on, usage past a quota (egress included) is blocked instead of billed. Leave it **on** at first; it's in **Cost Control** on the organization's billing page.

## After upgrading: settings to revisit
- **Polling (`js/supabase.js`):** can speed back up for a livelier feel. 250 GB is ~50x the free quota.
  - Suggested: `CADENCE.activeMs` 30 s, `hiddenMs` 5 min, `SAVE_MS` 2 min, `LB_MS` 60 s.
  - Guild poll back to 2 min in `js/main.js` (`lastGPoll`).
  - Then run `node scripts/stamp.mjs` and the tests.
- **Snapshot:** keep it. It's still free and keeps the leaderboard off Supabase.
- **Warning threshold:** change `5e9` and `'quota_gb', 5` in `egress_estimate()` to 250 GB, so the warning tracks the new quota. Re-run it as a new addendum.
- **Auth:** raise the per-IP anonymous sign-in limit (Auth → Rate limits) and use custom SMTP (Brevo).
- **Compute:** the default instance is fine up to a few thousand players (submit is one row lock per minute per player). Watch CPU on the Database → Reports page.

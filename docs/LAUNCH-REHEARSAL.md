# Launch-day rehearsal (local only)

Everything here runs on the box. Nothing touches the live database.

- `node test/rehearsal.pglite.mjs 100 30` (or `500 30`) runs PGlite with every addendum applied in order (twice, to prove they are idempotent) and Supabase's default table grants, so RLS decides. Time is mocked by back-dating server timestamps one 30-minute round at a time.
- `node test/e2e.launch.mjs` runs headless Chromium against the static site: the gate before LAUNCH_AT, auto-open at LAUNCH_AT with a mocked clock, the gate off, and the game on desktop and iPhone 13. The live backend is blocked.

Addendum order: schema, guilds-chat, guilds-v2, staff-guild, floor-zero, floors-11-20, arc1-pacing, turnout-scaling, waitlist, waitlist-count, **open-chat** (new).

## Results
| Heroes | Floor clears (hours after the gate opens) | Floor 10 down | RPC error rate (excluding the deliberate chat-gate probes) |
|---|---|---|---|
| 100 | 1@0.5 2@1 3@2 4@2.5 5@4.5 6@6.5 7@9 8@11.5 9@14.5 10@20 | ~20 h | 0.14% (only the waitlist `slow_down` limit firing, because every simulated signup shares one source) |
| 500 | 1@0.5 2@0.5 3@1 4@2 5@4 6@6 7@8.5 8@11 9@14 10@20 | ~20 h | 0.04% |

- **Turnout scaling holds the clear time.** At 500 heroes the multiplier rose 0.73 → 0.98 → 2.5 → 5 while heroes arrived, and Floor 10 still fell at about 20 h. The 18 h target in the balance doc assumes damage lands continuously; the rehearsal books it at the end of each 30-minute round and clamps each hero's first submit to 30 s.
- **Hourly surge check.** Doubling the active heroes mid-floor doubled max HP and kept the remaining fraction (0.9819 → 0.9819 at 100 heroes, 0.9411 → 0.9411 at 500).
- **Cutscene trigger.** `clearedArcs()` reports arc 1 cleared as the floor reaches 11.
- **Offline progress.** A 15 h absence is capped at 12 h, and the server accepts that 12 h batch in full.
- **Chat gate.** A brand-new guest is refused. A guest who has played can post. The flood guard, duplicate check, link block, hourly cap and members-only guild chat all work. Markup is stored as plain text, which the client escapes. No user ids or emails appear in chat rows.

## Bugs found and fixed
1. **`submit_damage` returned the unscaled `max_hp` on a floor change.** The turnout trigger rewrote the row after the function had built its reply, so clients showed the wrong HP for up to a poll. It now returns the stored row (open-chat addendum).
2. **The leaderboard was refetched every 5 s.** `renderLb` runs on every sync. It is now cached for 60 s, cleared on flush, cut to 25 rows, and skipped in background tabs.
3. **Every client downloaded every `floor_clears` row in full, with every player's name and damage.** That was tens of KB per clear at a busy launch, plus 300 rows each time the Tower Map opened. The new lean RPCs `my_clears` (my rank and damage only) and `floor_history` (top name only) replace it, with a fallback for servers that haven't run the addendum.
4. **`guild_tags` returned every guild member on the floor** (~28 KB at 500 players, polled every 30 s). It now returns only the top 50 damage dealers, and the client refreshes it every 5 min.
5. **Polling was relaxed:** damage flush and floor poll 30 s → 60 s, badge poll 30 s → 60 s, guild info 1 → 2 min.

## Supabase free-tier estimate (after fixes)
These are estimates from response sizes measured in the rehearsal plus about 0.6 KB of HTTP overhead per request.

- **A visible tab** makes about 6.2 requests a minute (~6.8 KB). Before the fixes it was about 24 (~60 KB).
- **A background tab** (timers throttled to once a minute) makes about 3 requests a minute (~2.2 KB).
- **A typical player day**, assumed as 4 h visible plus 8 h in the background, comes to about 2.7 MB. Before the fixes it was about 17 MB.

| Players (daily) | Egress per day | Free 5 GB per month lasts | Peak requests/s (all visible) | Database size |
|---|---|---|---|---|
| 100 | ~0.27 GB (was ~1.7) | ~18 days at full launch activity (was ~3) | ~10 | <10 MB |
| 500 | ~1.35 GB (was ~8.5) | ~4 days | ~52 | ~15 MB |
| 2,000 | ~5.4 GB (was ~34) | <1 day | ~207 | ~50 MB (of 500 MB) |

- **Requests:** the free tier has no request cap. `submit_damage` locks one row: about 33 submits/s at 2,000 players at a few ms each, which is fine.
- **Connections:** REST traffic goes through PostgREST's pool, so the direct-connection limit is not touched.
- **Realtime:** not used (0 of 200 concurrent).
- **Auth:** 50k monthly active users is plenty.
- **Anonymous sign-ins** are rate-limited per IP by default (Auth → Rate limits). Raise this before launch, or players on shared IPs (schools, mobile carriers) get stuck as offline guests.
- **Email binding** uses Supabase's built-in SMTP, which sends only a few emails an hour. Point Auth SMTP at Brevo before launch.
- **Verdict:** egress is the only free-tier limit at risk. 100 players fit through the launch weeks. At 500+ daily players, or if a sustained 100 lasts a whole month, upgrade to Pro (250 GB) or cut polling further.

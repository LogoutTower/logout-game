// Daily quests (3 per UTC day, reset 00:00 UTC like the login streak). Online, the SERVER draws, counts and pays them
// (supabase/schema-addendum-quests-profile.sql: progress rides in tick() as `q`, quest_claim() pays gold into the saved game).
// This file mirrors the rules for display and for offline/local mode, and banks the XP share through applyXp with the level cap.
// Only server-visible actions count online (boss damage incl. offline batches, time online, chat, floor clears, guild donations),
// so a hacked save can't finish a quest. Forge/tonic spending is client-side only and therefore not a quest.
import { baseHp } from './floors.js';
import { applyXp, xpToNext, levelCap } from './game.js';
export const RESET_DQ = 'Three quests a day, counted by the tower. Resets at 00:00 UTC (7 PM CDT / 6 PM CST), with the daily streak.';
export const DQ_KINDS = ['dmg', 'online', 'chat', 'clear', 'donate'];
export const DQ_ONLINE_S = 2700, DQ_GAP_S = 1200; // 45 min; gaps over 20 min are offline time (they still count for damage)
export const dqTier = f => baseHp(Math.max(1, f)) / baseHp(1);
const GOLD = { dmg: 150, online: 120 }, XP = { dmg: 0.25, online: 0.2 };
/** Reward for one quest drawn on floor f: { g: gold, x: share of the current level's XP }. Mirrors dq_reward(). */
export const dqReward = (kind, f) => ({ g: Math.round((GOLD[kind] ?? 180) * dqTier(f)), x: XP[kind] ?? 0.3 });
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const DAY0 = Date.UTC(2026, 0, 1) / 864e5;
/** Rotating third quest (mirrors dq_third()): chat, clear, donate; donate becomes clear outside a guild. */
export const dqThird = (day, inGuild = true) => { const n = Math.floor(Date.parse(day + 'T00:00:00Z') / 864e5) - DAY0, k = ['chat', 'clear', 'donate'][((n % 3) + 3) % 3]; return k === 'donate' && !inGuild ? 'clear' : k; };
/** Damage target ≈ 40 min of a base hero at this level / forge tier (both capped like the server). */
export const dqDmgTarget = (level, gear, f, gm = false) => { const lv = gm ? level : Math.min(level, f + 10), gr = gm ? gear : Math.min(gear, f + 8); return Math.max(1000, Math.round(6.5 * (1 + 0.25 * (Math.max(1, lv) - 1)) * Math.pow(1.15, Math.max(0, gr)) * 2400 / 100) * 100); };
export function drawQuests(day, f, h, { inGuild = false, gm = false } = {}) {
  const third = dqThird(day, inGuild), k = ['dmg', 'online', third], t = [dqDmgTarget(h.level || 1, h.gear || 0, f, gm), DQ_ONLINE_S, third === 'chat' ? 3 : third === 'clear' ? 1 : Math.max(100, Math.round(200 * dqTier(f)))];
  return { d: day, k, t, p: [0, 0, 0], c: 0, g: k.map(x => dqReward(x, f).g), x: k.map(x => dqReward(x, f).x), f };
}
export const questText = (kind, t, fmt = String) => ({ dmg: `Deal ${fmt(t)} damage (offline counts)`, online: `Stay online for ${Math.round(t / 60)} min`, chat: `Post ${t} messages in floor chat`,
  clear: `Be on a floor when it falls`, donate: `Donate ${fmt(t)} gold to your guild bank` })[kind] || kind;
/** Merge the server's tick payload ({k,t,p,c,g,x,d} on the first tick of the day, else {p,c}). Returns true if a quest just became claimable. */
export function adoptQuests(save, q, now = Date.now()) {
  if (!q) return false; const old = save.dq, before = old ? old.p.filter((p, i) => p >= old.t[i] && !(old.c & (1 << i))).length : 0;
  if (q.k) save.dq = { d: String(q.d || utcDay(now)), k: q.k, t: q.t.map(Number), p: q.p.map(Number), c: q.c | 0, g: q.g.map(Number), x: q.x.map(Number) };
  else if (old && old.d === utcDay(now)) { old.p = q.p.map(Number); old.c = q.c | 0; } else return false; // new day without defs: the panel asks quest_state() once
  const d = save.dq; return d.p.filter((p, i) => p >= d.t[i] && !(d.c & (1 << i))).length > before;
}
export const questsToday = (save, now = Date.now()) => save.dq && save.dq.d === utcDay(now) ? save.dq : null;
export const claimable = (save, now = Date.now()) => { const d = questsToday(save, now); return d ? d.p.filter((p, i) => p >= d.t[i] && !(d.c & (1 << i))).length : 0; };
/** Offline/local mode only: the same rules on this browser. Draws today's quests on first use, then counts an event. */
export function localQuest(save, kind, amount, f, { inGuild = false, gm = false, now = Date.now() } = {}) {
  const day = utcDay(now); if (!save.dq || save.dq.d !== day) save.dq = drawQuests(day, f, save.heroes[0], { inGuild, gm });
  const d = save.dq, i = d.k.indexOf(kind); if (i < 0 || !(amount > 0)) return false; const was = d.p[i] >= d.t[i];
  d.p[i] = Math.min(d.t[i], d.p[i] + amount); return !was && d.p[i] >= d.t[i];
}
/** Local claim: gold + XP. Online the server pays the gold (claimServer adopts it); both bank XP with the level cap. */
export function claimLocal(save, i, f, gm = false, now = Date.now()) {
  const d = questsToday(save, now); if (!d || d.p[i] < d.t[i] || d.c & (1 << i)) return null;
  d.c |= 1 << i; save.gold += d.g[i]; bankXp(save, d.x[i], f, gm); return { add: d.g[i] };
}
export function claimServer(save, i, r, f, gm = false) { const d = save.dq; if (d) d.c = r.c ?? (d.c | (1 << i)); bankXp(save, Number(r.xp) || 0, f, gm); return { add: Number(r.add) || 0 }; }
export function bankXp(save, share, f, gm = false) { const h = save.heroes[0]; if (share > 0) applyXp([h], Math.floor(xpToNext(h.level) * share), levelCap(f, gm)); }
/** Quest list HTML (fixed labels and numbers only). */
export function questsHtml(d, fmt = String) {
  if (!d) return '<p class="sub">Today\'s quests appear after your first sync.</p>';
  return `<div class="dquests">${d.k.map((k, i) => { const done = d.p[i] >= d.t[i], got = !!(d.c & (1 << i)), pct = Math.min(100, d.p[i] / d.t[i] * 100);
    const shown = k === 'online' ? `${Math.floor(d.p[i] / 60)} / ${Math.round(d.t[i] / 60)} min` : `${fmt(Math.min(d.p[i], d.t[i]))} / ${fmt(d.t[i])}`;
    return `<div class="dquest ${got ? 'got' : done ? 'done' : ''}"><div><b>${got ? '✓ ' : ''}${questText(k, d.t[i], fmt)}</b><div class="gxp"><i style="width:${pct.toFixed(1)}%"></i></div><small class="sub">${shown} · ${fmt(d.g[i])}g + XP</small></div>
      <button data-dq="${i}" ${done && !got ? '' : 'disabled'}>${got ? 'Claimed' : done ? 'Claim' : `${Math.floor(pct)}%`}</button></div>`; }).join('')}</div>`;
}

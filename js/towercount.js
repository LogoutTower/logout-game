// Player counter: '1,204 trapped · 87 online now' under the Battle floor header. Pure helpers + a tiny visibility-aware poller.
// Server: tower_counts() (supabase/schema-addendum-player-count.sql). Missing RPC, offline or local backend: the line stays hidden.
export const COUNT_MS = 180000; // at most one call every 3 minutes, and only while the tab is visible
const n = v => Math.max(0, Math.floor(+v || 0)).toLocaleString('en-US');
/** { t, o } -> '1,204 trapped · 87 online now', or '' when there is nothing honest to show. */
export function countText(c) { if (!c || !Number.isFinite(+c.t) || +c.t <= 0) return ''; return `${n(c.t)} trapped · ${n(c.o)} online now`; }
/** [[floor, players], ...] -> Map(floor -> players) */
export const clearPlayers = c => new Map((Array.isArray(c?.f) ? c.f : []).filter(r => Array.isArray(r) && +r[1] > 0).map(r => [+r[0], +r[1]]));
/** Poller. fetchCounts() resolves { t, o, f } or null; render(c|null) draws it. Returns { refresh, last, stop }. */
export function countPoller({ fetchCounts, render, doc = globalThis.document, now = () => Date.now(), setTimer = setInterval, clearTimer = clearInterval, every = COUNT_MS }) {
  let lastAt = -Infinity, busy = false; const st = { last: null };
  const refresh = async (force = false) => {
    if (busy || doc?.hidden || (!force && now() - lastAt < every)) return st.last;
    busy = true; lastAt = now();
    try { const c = await fetchCounts(); st.last = c && Number.isFinite(+c.t) ? c : null; } catch { st.last = null; } finally { busy = false; }
    render(st.last); return st.last;
  };
  const onVis = () => { if (!doc.hidden) refresh(); }; doc?.addEventListener?.('visibilitychange', onVis);
  const id = setTimer(() => refresh(), Math.min(every, 60000)); refresh();
  return Object.assign(st, { refresh, stop: () => { clearTimer(id); doc?.removeEventListener?.('visibilitychange', onVis); } });
}

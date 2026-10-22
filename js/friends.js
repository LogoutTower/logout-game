// Friends list (Guild Hub update, FEATURES.guildHub): pure rules shared by the client, LocalBackend (js/friendslocal.js) and mirrored
// in supabase/schema-addendum-guild-hub.sql (friend_* RPCs; the pglite test checks the numbers agree). Friends see each other's floor
// and online / last-seen status on ID cards and in the Friends view. Nothing else is shared: no class, gear, items or staff flags.
export const FRIEND_CAP = 100;          // accepted friends per player (both sides are checked)
export const REQ_PER_HOUR = 20;         // friend requests a player may send per rolling hour
export const OUT_PENDING_MAX = 50;      // outgoing requests waiting for an answer
export const NAME_MAX = 20;
export const cleanName = n => String(n ?? '').trim().slice(0, NAME_MAX);
/** Can `me` send a request to `name`? st = { friends:[names], outgoing:[names], blocked:[names], sentLastHour, theirCount, blockedByThem, exists } */
export function checkRequest(me, name, st = {}) {
  const n = cleanName(name); if (!n) return { ok: false, reason: 'enter a hero name' };
  if (n === me) return { ok: false, reason: 'that is you' };
  if (!st.exists) return { ok: false, reason: 'no hero with that name' };
  if ((st.blocked || []).includes(n)) return { ok: false, reason: 'unblock them first' };
  if ((st.friends || []).includes(n)) return { ok: false, reason: 'already friends' };
  if ((st.outgoing || []).includes(n)) return { ok: false, reason: 'request already sent' };
  if ((st.friends || []).length >= FRIEND_CAP) return { ok: false, reason: `friend list full (${FRIEND_CAP})` };
  if ((st.sentLastHour || 0) >= REQ_PER_HOUR) return { ok: false, reason: 'too many requests, try again later' };
  if ((st.outgoing || []).length >= OUT_PENDING_MAX) return { ok: false, reason: 'too many pending requests' };
  if ((st.theirCount || 0) >= FRIEND_CAP) return { ok: false, reason: 'their friend list is full' };
  return { ok: true, silent: !!st.blockedByThem }; // blocked by them: looks sent, never delivered (a block is never revealed)
}

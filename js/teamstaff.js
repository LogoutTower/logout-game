// Team staff accounts (profiles.team, schema-addendum-team-staff.sql): normal heroes run by the dev team. They get a visible STAFF tag
// (distinct from the GM sigil) in chat, the guild roster and on ID cards. The tag is display only and grants nothing.
export const TEAM_TTL = 600000; // one tiny public read per 10 min (free-tier egress)
export const teamTag = () => '<span class="tstaff" title="Team staff account: a normal hero, unranked and never rewarded">STAFF</span>';
let names = new Set(), authors = new Set(), at = 0;
/** Load the public team roster ([{ n: name, a: chat author hash }]) via the team_roster RPC. Local/offline or older servers: empty. */
export async function loadTeam(be, now = Date.now()) {
  if (now - at < TEAM_TTL || !be?.sb?.rpc) return; at = now;
  try { const { data, error } = await be.sb.rpc('team_roster'); if (!error && Array.isArray(data)) { setTeam(data); return true; } } catch {}
}
export function setTeam(list = []) { names = new Set(list.map(x => x?.n).filter(Boolean)); authors = new Set(list.map(x => x?.a).filter(Boolean)); }
/** True for a team staff hero, by chat author hash or display name. Never true for the GM (the server roster excludes role gm). */
export const isTeam = (name, author = null) => (!!author && authors.has(author)) || (!!name && names.has(name));

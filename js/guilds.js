// Guilds: pure rules shared by both backends (server copy in supabase/schema-addendum-guilds-chat.sql).
import { cleanChat } from './chatfilter.js';
export const GUILD_CAP = 30, GUILD_BUFF = 0.02; // +2% XP and gold for members; never touches damage, ranks or rewards
/** Validates a guild name (3-24: letters, digits, spaces, ' and -) and tag (2-4: A-Z, 0-9). */
// "Floor Zero" / "ZERO" (and near-variants like "FloorZero", "Floor 0") are reserved for the staff guild. Same rule as gv2_reserved() in SQL.
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/0/g, 'o').replace(/1/g, 'i');
export function isReservedGuild(name, tag) { const n = norm(name); return n.includes('floorzero') || n === 'flooro' || norm(tag) === 'zero'; }
// Until schema-addendum-staff-guild.sql runs, the server still refuses staff founders: show a friendly line instead.
export const guildError = m => /staff cannot own a guild|gv2_reserved|is_staff/i.test(String(m || '')) ? 'Staff guilds open soon.' : String(m || '');
export const STAFF_GUILD = { name: 'Floor Zero', tag: 'ZERO' }, STAFF_MARK = '◈';
export function checkGuild(name, tag, staff = false) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim(), t = String(tag ?? '').trim().toUpperCase();
  if (!/^[A-Za-z0-9' -]{3,24}$/.test(n)) return { ok: false, reason: 'name: 3-24 letters, digits, spaces' };
  if (!/^[A-Z0-9]{2,4}$/.test(t)) return { ok: false, reason: 'tag: 2-4 letters or digits' };
  if (!staff && isReservedGuild(n, t)) return { ok: false, reason: 'That name is reserved.' };
  for (const s of [n, t]) { const c = cleanChat(s, 24); if (!c.ok || c.text !== s) return { ok: false, reason: 'that name is not allowed' }; }
  return { ok: true, name: n, tag: t };
}
/** Guild board from damage rows + membership. Staff damage never counts toward a guild (no reward advantage). */
export function guildBoard(rows, members, guilds) {
  const by = new Map(guilds.filter(g => !g.is_staff).map(g => [g.id, { id: g.id, name: g.name, tag: g.tag, damage: 0, members: 0 }]));
  for (const m of members) { const g = by.get(m.guild_id); if (g) g.members++; }
  for (const r of rows) { if (r.staff) continue; const m = members.find(x => x.name === r.name || (r.user_id && x.user_id === r.user_id)); const g = m && by.get(m.guild_id); if (g) g.damage += r.damage; }
  return [...by.values()].filter(g => g.members > 0).sort((a, b) => b.damage - a.damage || a.name.localeCompare(b.name)).map((g, i) => ({ ...g, rank: i + 1 }));
}

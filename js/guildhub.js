// Guild Hub update (FEATURES.guildHub): presence, guild boss races and bank buffs. Pure rules shared by the client, LocalBackend and
// mirrored 1:1 in supabase/schema-addendum-guild-hub.sql (the pglite test checks they agree). Gold only: nothing here pays out to players.
import { guildBoard } from './guilds.js';
// ---- presence: active in the last ONLINE_S seconds = online. Polled when a view opens (no realtime).
export const ONLINE_S = 180, PRESENCE_TTL = 60000, PRESENCE_MAX = 50;
export function presenceOf(p, now = Date.now()) {
  if (!p || !p.seen) return null;
  const s = Math.max(0, (now - Date.parse(p.seen)) / 1000), online = s <= ONLINE_S;
  const ago = s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
  return { online, floor: p.floor ? Math.max(1, p.floor | 0) : null, label: online ? 'online' : `last seen ${ago}` };
}
/** Who may see whose presence: yourself, or someone in the same guild. (No friends list exists yet; the SQL helper is the one place to add it.) */
export const canSeePresence = (viewerGuild, targetGuild, self = false) => self || (viewerGuild != null && viewerGuild === targetGuild);
// ---- guild boss races: per floor, top guild by member damage. Staff/team rows and the staff guild never count (same rule as the board).
export const raceBoard = (rows, members, guilds) => guildBoard(rows, members, guilds).filter(g => g.damage > 0);
export const RACE_TITLE = 'Race Champion';
// ---- bank buffs: officers/leader spend bank gold on a guild-wide buff. One active buff per kind, server-priced, damage capped at +5%.
export const MAX_DMG_PCT = 5;
export const BUFFS = { dmg5: { kind: 'dmg', pct: 5, hours: 24, price: 40000, label: '+5% damage for 24h' } };
export function checkBuff(key, { role, bank = 0, staffGuild = false, active = [] } = {}) {
  const b = BUFFS[key]; if (!b) return { ok: false, reason: 'no such buff' };
  if (staffGuild) return { ok: false, reason: 'a staff guild has no bank' };
  if (role !== 'leader' && role !== 'officer') return { ok: false, reason: 'officers and the leader only' };
  if (active.some(a => a.kind === b.kind && Date.parse(a.until) > Date.now())) return { ok: false, reason: 'that buff is already active' };
  if (bank < b.price) return { ok: false, reason: 'not enough gold in the bank' };
  return { ok: true, buff: b };
}
/** Damage multiplier for this client from active guild buffs (staff never get one; capped like the server). */
export const buffDmgMul = (ctx, now = Date.now()) => !ctx || ctx.gm || !ctx.gbDmg || !(ctx.gbUntil > now) ? 1 : 1 + Math.min(MAX_DMG_PCT, ctx.gbDmg) / 100;

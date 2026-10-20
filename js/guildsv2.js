import { baseHp } from './floors.js';
const baseHpR = f => baseHp(Math.max(1, f)) / baseHp(1);
// Guilds v2 rules, shared by the client, LocalBackend and mirrored 1:1 in supabase/schema-addendum-guilds-v2.sql
// (the pglite test checks the quest generator and level maths agree). XP/gold bonus only, never damage, ranks or rewards.
export const ROLES = ['leader', 'officer', 'member'];
export const LEVEL_CAP = 21, XP_PER_LEVEL = 20000, BASE_SLOTS = 30, MAX_SLOTS = 50, BASE_BONUS = 2, MAX_BONUS = 5;
export const levelOf = xp => Math.min(LEVEL_CAP, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / XP_PER_LEVEL)));
export const xpForLevel = l => (Math.max(1, l) - 1) ** 2 * XP_PER_LEVEL; // xp needed to reach level l
export const slotsOf = level => Math.min(MAX_SLOTS, BASE_SLOTS + (level - 1));
export const bonusPctOf = tier => Math.min(MAX_BONUS, BASE_BONUS + tier);
export const SIGILS = ['tower', 'crown', 'star', 'moon', 'sword', 'shield', 'flame', 'eye', 'key', 'skull', 'wing', 'rune'];
export const PALETTE = ['#ffd76a', '#7ff6ff', '#ff3355', '#5cff8a', '#b98cff', '#ff9b3d', '#f4f1ff', '#2a1450'];
export const sigilsAvailable = (level, banner) => Math.min(SIGILS.length, 4 + Math.floor((level - 1) / 4) + 2 * banner);
export const UPGRADES = {
  bonus: { max: 3, cost: [20000, 60000, 150000], level: [5, 10, 15], label: 'Bonus tier (+1% XP & gold)' },
  hall: { max: 5, cost: [5000, 15000, 40000, 100000, 250000], level: [2, 4, 7, 10, 14], label: 'Hall upgrade' },
  banner: { max: 3, cost: [3000, 10000, 30000], level: [1, 1, 1], label: 'Banner unlock (+2 sigils)' },
};
export const upgradeCol = { bonus: 'bonus_tier', hall: 'hall', banner: 'banner_unlocks' };
/** Next step of an upgrade for a guild, or null at max. */
export function nextUpgrade(g, kind) { const u = UPGRADES[kind], cur = g[upgradeCol[kind]] || 0; return cur >= u.max ? null : { kind, step: cur + 1, cost: u.cost[cur], level: u.level[cur], ok: levelOf(g.xp || 0) >= u.level[cur] && (g.bank || 0) >= u.cost[cur] }; }
export const DONATE_DAILY_CAP = 25000, DONATE_COOLDOWN_S = 30, INACTIVE_DAYS = 14;
// ---- permissions
export const canManage = role => role === 'leader' || role === 'officer'; // invite, kick (members only for officers), accept/deny, spend, banner
export const canKick = (actor, target) => actor === 'leader' ? target !== 'leader' : actor === 'officer' ? target === 'member' : false;
export const canPromote = actor => actor === 'leader'; // promote / demote / transfer
// ---- weekly quests: 3 of 4 kinds, seeded by week number
export const WEEK_S = 604800;
export const WEEK_OFFSET_S = 345600; // weeks start Monday 00:00 UTC (the epoch was a Thursday); mirrors gv2_week()
export const weekOf = ms => Math.floor((ms / 1000 - WEEK_OFFSET_S) / WEEK_S);
// Member reward for a finished weekly quest (mirrors gq_member_reward / gq_eligible): gold × floor tier + 30% of a level's XP.
export const memberReward = f => ({ g: Math.round(250 * (baseHpR(f))), x: 0.3 });
export const eligible = (kind, target, mine) => (mine || 0) > 0 && (!['damage', 'donate'].includes(kind) || mine >= Math.max(1, Math.ceil(target * 0.01)));
export const QUEST_KINDS = ['damage', 'floors', 'active', 'donate'];
const qh = (week, k) => (week * 2654435761 + k * 40503) % 2147483647;
export function weekQuests(week) {
  const skip = week % 4;
  return QUEST_KINDS.map((kind, k) => ({ kind, k })).filter(q => q.k !== skip).map(({ kind, k }, idx) => {
    const h = qh(week, k), m = 1 + (h % 3);
    const target = kind === 'damage' ? 50000 * (1 + (h % 4)) : kind === 'floors' ? m : kind === 'active' ? 2 + (h % 3) : 2000 * m;
    return { idx, kind, target, xp: 8000 * m, gold: 1000 * m, text: questText(kind, target) };
  });
}
export const questText = (kind, t) => kind === 'damage' ? `Deal ${t.toLocaleString('en-US')} damage together` : kind === 'floors' ? `Be present when ${t} floor${t > 1 ? 's' : ''} fall${t > 1 ? '' : 's'}` : kind === 'active' ? `${t} members active this week` : `Donate ${t.toLocaleString('en-US')} gold to the bank`;
export const isHex = c => PALETTE.includes(c);
// Floor Zero: the exclusive "zero" sigil (staff guild only) with its fixed black/gold pair, outside PALETTE. Mirrors gv2_zero_banner() in SQL.
export const STAFF_SIGIL = 'zero', ZERO_BANNER = { sigil: 'zero', c1: '#e8b923', c2: '#050505' };
export const isZeroPair = b => !!b && [b.c1, b.c2].sort().join() === [ZERO_BANNER.c1, ZERO_BANNER.c2].sort().join();
// Staff guild prestige: one cosmetic hall piece every 4 levels (max 5). Mirrors gv2_staff_hall(). No stat effect anywhere.
export const staffHall = level => Math.min(5, Math.max(0, Math.floor((level - 1) / 4)));
// What to draw for a guild: a staff guild still on the old default banner (SQL not run yet) shows the zero banner anyway.
export const displayBanner = (b, staff = false) => staff && (!b || (b.sigil === DEFAULT_BANNER.sigil && b.c1 === DEFAULT_BANNER.c1 && b.c2 === DEFAULT_BANNER.c2)) ? ZERO_BANNER : (b || DEFAULT_BANNER);
export function checkBanner(b, level, bannerUnlocks, staff = false) {
  if (b?.sigil === STAFF_SIGIL) return staff ? { ok: true, banner: { ...ZERO_BANNER } } : { ok: false, reason: 'that sigil belongs to Floor Zero' };
  if (isZeroPair(b)) return { ok: false, reason: 'that sigil belongs to Floor Zero' };
  const i = SIGILS.indexOf(b?.sigil); if (i < 0 || i >= sigilsAvailable(level, bannerUnlocks)) return { ok: false, reason: 'that sigil is locked' };
  if (!isHex(b.c1) || !isHex(b.c2) || b.c1 === b.c2) return { ok: false, reason: 'pick two different palette colours' };
  return { ok: true, banner: { sigil: b.sigil, c1: b.c1, c2: b.c2 } };
}
export const DEFAULT_BANNER = { sigil: 'tower', c1: '#ffd76a', c2: '#2a1450' };

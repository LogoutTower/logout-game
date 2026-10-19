// Pure, deterministic game logic (no DOM) — importable in node for tests.
export const CLASSES = {
  Vanguard: { icon: '🛡️', atk: 6, spd: 0.8, hp: 140 },
  Blade:    { icon: '🗡️', atk: 5, spd: 1.3, hp: 100 },
  Arcanist: { icon: '🔮', atk: 9, spd: 0.7, hp: 80 },
};
// Boss names, HP curve and the 100-floor plan live in floors.js.
export { floorBossHp, bossName, bossInfo } from './floors.js';

export function newHero(name, cls) {
  if (!CLASSES[cls]) throw new Error('bad class');
  return { id: Math.random().toString(36).slice(2, 10), name: String(name).slice(0, 20) || 'Nameless', cls, level: 1, xp: 0, gear: 0, hp: CLASSES[cls].hp };
}
/** Summed stats of equipped loot: { dps (flat), dpsPct, goldPct, xpPct, capH }. */
export function gearBonus(h) {
  const b = { dps: 0, dpsPct: 0, goldPct: 0, xpPct: 0, capH: 0 };
  for (const it of Object.values(h?.equip || {})) if (it) for (const [k, v] of Object.entries(it.stats || {})) b[k] = (b[k] || 0) + v;
  return b;
}
// Forge (h.gear) tempers the hero's weapon: +15% per tier. Equipped loot adds flat weapon DPS and % bonuses.
export const heroDps = h => { const c = CLASSES[h.cls], g = gearBonus(h); return +((c.atk * c.spd * (1 + 0.25 * (h.level - 1)) + g.dps) * (1 + 0.15 * h.gear) * (1 + g.dpsPct / 100)).toFixed(3); };
const goldMul = heroes => 1 + gearBonus(heroes[0]).goldPct / 100, xpMul = heroes => 1 + gearBonus(heroes[0]).xpPct / 100;
export const offlineCap = (heroes, base = 12) => base + gearBonus(heroes[0]).capH;
export const xpToNext = lvl => Math.round(50 * Math.pow(1.4, lvl - 1));
export const levelCost = h => Math.round(40 * Math.pow(1.5, h.level - 1));
export const gearCost = h => Math.round(60 * Math.pow(1.6, h.gear));
export const totalDps = heroes => heroes.reduce((s, h) => s + heroDps(h), 0);

/** Deterministic progress for elapsed time between lastTick and now (ms). */
export function computeProgress(heroes, lastTick, now, capHours = 12) {
  const raw = Math.max(0, (now - lastTick) / 1000);
  const secs = Math.min(raw, capHours * 3600);
  const dps = totalDps(heroes);
  const damage = Math.floor(dps * secs);
  return { secs, capped: raw > secs, damage, gold: Math.floor(damage * 0.1 * goldMul(heroes)), xp: Math.floor(damage * 0.05 * xpMul(heroes)) };
}
/** Live accrual with fractional carry (fixes per-tick flooring that kept low-DPS heroes at 0 gold/XP). Mutates save.lastTick/save.carry. */
// ---- Hero HP: the boss chips HP while you fight. Below 30% DPS halves. HP never drops below 1 (no death, no lost progress).
export const DRAIN_SECS = 3600;            // full HP to empty in one hour of fighting
export const LOW_HP = 0.3, LOW_MUL = 0.5;  // worn-down threshold and DPS penalty
export const RESTED = { secs: 1800, mul: 1.15 }, ELIXIR = { secs: 600, mul: 1.25 };
export const heroMaxHp = h => Math.round(CLASSES[h.cls].hp * (1 + 0.1 * (h.level - 1)));
export const heroHp = h => Math.min(heroMaxHp(h), h.hp ?? heroMaxHp(h));
export const isWorn = h => heroHp(h) <= LOW_HP * heroMaxHp(h) + 1e-9;
export const buffsOf = save => save.buffs || (save.buffs = { rested: 0, elixir: 0, vigil: 0 });
/** DPS right now, including the low-HP penalty and an active elixir. */
export const effectiveDps = save => totalDps(save.heroes) * (isWorn(save.heroes[0]) ? LOW_MUL : 1) * (buffsOf(save).elixir > 0 ? ELIXIR.mul : 1);
/** Simulate `secs` of fighting (live or offline: same rules). Splits time at HP-threshold and buff-expiry breakpoints.
 *  Mutates hero HP and buff timers; returns float { dmg, gold, xp, lowSecs }. */
export function simulate(save, secs) {
  const h = save.heroes[0], max = heroMaxHp(h), b = buffsOf(save), drain = max / DRAIN_SECS, base = totalDps(save.heroes);
  const gM = goldMul(save.heroes), xM = xpMul(save.heroes);
  let hp = heroHp(h), t = Math.max(0, secs), dmg = 0, gold = 0, xp = 0, lowSecs = 0;
  for (let guard = 0; t > 1e-9 && guard < 16; guard++) {
    const low = hp <= LOW_HP * max + 1e-9; let seg = t;
    if (!low) seg = Math.min(seg, (hp - LOW_HP * max) / drain);
    if (b.rested > 0) seg = Math.min(seg, b.rested);
    if (b.elixir > 0) seg = Math.min(seg, b.elixir);
    if (seg <= 1e-9) { if (!low) hp = LOW_HP * max; continue; }
    const d = base * (low ? LOW_MUL : 1) * (b.elixir > 0 ? ELIXIR.mul : 1) * seg, r = b.rested > 0 ? RESTED.mul : 1;
    dmg += d; gold += d * 0.1 * gM * r; xp += d * 0.05 * xM * r; if (low) lowSecs += seg;
    hp = Math.max(1, hp - drain * seg); b.rested = Math.max(0, b.rested - seg); b.elixir = Math.max(0, b.elixir - seg); t -= seg;
  }
  h.hp = hp;
  return { dmg, gold, xp, lowSecs };
}
const settle = (save, s) => { // float → integer payouts with fractional carry
  const c = save.carry || (save.carry = { dmg: 0, gold: 0, xp: 0 }), out = {};
  for (const [k, v] of [['dmg', s.dmg], ['gold', s.gold], ['xp', s.xp]]) { const x = v + c[k]; out[k] = Math.floor(x); c[k] = x - out[k]; }
  return out;
};
/** Live accrual with fractional carry (fixes per-tick flooring that kept low-DPS heroes at 0 gold/XP). */
export function accrue(save, now, capHours = 12) {
  const raw = Math.max(0, (now - save.lastTick) / 1000), secs = Math.min(raw, capHours * 3600);
  const s = simulate(save, secs), o = settle(save, s); save.lastTick = now;
  return { secs, capped: raw > secs, damage: o.dmg, gold: o.gold, xp: o.xp, lowSecs: s.lowSecs };
}
/** Offline return: same rules as live play. A Scroll of Vigil adds 4h to the cap once (consumed only if the extra time was needed). */
export function offlineProgress(save, now, baseCapHours = 12) {
  const b = buffsOf(save), cap = offlineCap(save.heroes, baseCapHours) + (b.vigil || 0), raw = Math.max(0, (now - save.lastTick) / 1000);
  const vigilUsed = b.vigil > 0 && raw > (cap - b.vigil) * 3600; if (vigilUsed) b.vigil = 0;
  const r = accrue(save, now, cap); return { ...r, cap, vigilUsed };
}
export function applyXp(heroes, xp) {
  if (!heroes.length) return [];
  const per = Math.floor(xp / heroes.length), ups = [];
  for (const h of heroes) {
    h.xp += per;
    while (h.xp >= xpToNext(h.level)) { h.xp -= xpToNext(h.level); h.level++; ups.push(h.name); }
  }
  return ups;
}
export const fmt = n => n >= 1e9 ? (n/1e9).toFixed(2)+'B' : n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(Math.floor(n));
export const fmtDur = s => { s = Math.floor(s); const h = Math.floor(s/3600), m = Math.floor(s%3600/60); return h ? `${h}h ${m}m` : m ? `${m}m ${s%60}s` : `${s}s`; };

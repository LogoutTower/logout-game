import { GUILD_BUFF } from './guilds.js';
// Pure, deterministic game logic (no DOM) — importable in node for tests.
export const CLASSES = {
  Vanguard: { icon: '🛡️', atk: 6, spd: 0.8, hp: 140 },
  Blade:    { icon: '🗡️', atk: 5, spd: 1.3, hp: 100 },
  Arcanist: { icon: '🔮', atk: 9, spd: 0.7, hp: 80 },
};
// Boss names, HP curve and the 100-floor plan live in floors.js.
export { floorBossHp, bossName, bossInfo } from './floors.js';
import { talentBonus } from './talents.js';
export { talentBonus };

// Staff class stats are registered by gm.js (kept out of CLASSES so it never appears in the class picker).
export const STAFF_CLASSES = {};
export const classOf = cls => CLASSES[cls] || STAFF_CLASSES[cls];
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
/** Special effects of equipped Unique items (see UNIQUES in loot.js). */
export const effectsOf = h => new Set(['weapon', 'armor'].flatMap(k => { const w = h?.equip?.[k]; return w?.rarity === 'unique' ? [w.ability.id, w.drawback.id] : []; })); // the one-Unique rule means at most one of these is set
export const FX = { tenthMul: 1.1, heavyMul: 0.95, lastLayer: { below: 0.2, mul: 1.3 }, lifesteal: 0.65, drain: 1.2, steadyLowMul: 0.85, hearthHp: 0.5, momentum: { perMin: 0.01, max: 0.3 }, milestoneMul: 1.5, thornsMul: 1.08, aegis: 0.8, stillness: 0.65, dodgeDrain: 0.9, dodgeMul: 1.03, restfulPerMin: 0.01, innkeep: 0.6 };
export const heroDps = h => { const c = classOf(h.cls), g = gearBonus(h), e = effectsOf(h); return +((c.atk * c.spd * (1 + 0.25 * (h.level - 1)) + g.dps) * (1 + 0.15 * h.gear) * (1 + g.dpsPct / 100) * talentDpsMul(h) * (e.has('tenth') ? FX.tenthMul : 1) * (e.has('heavy') ? FX.heavyMul : 1) * (e.has('thorns') ? FX.thornsMul : 1) * (e.has('dodge') ? FX.dodgeMul : 1)).toFixed(3); };
const talentDpsMul = h => { const t = talentBonus(h), high = t.highHpDpsPct && heroHp(h) > 0.5 * heroMaxHp(h) ? t.highHpDpsPct : 0; return (1 + (t.dpsPct + t.rallyPct + t.eclipsePct + t.crackPct + high) / 100) * (1 + t.doublePct / 100); };
const goldMul = heroes => 1 + (gearBonus(heroes[0]).goldPct + talentBonus(heroes[0]).goldPct) / 100, xpMul = heroes => 1 + (gearBonus(heroes[0]).xpPct + talentBonus(heroes[0]).xpPct) / 100;
/** Shaper's Decree: +5% gold/XP for everyone on a floor while a staff hero is fighting there (ctx.decree, set live or from the server floor state). */
const decreeMul = save => save.ctx?.decree ? 1 + (save.ctx.decreePct || 5) / 100 : 1; // Final Decree / Collapse of Stars: 6%
export const guildMul = save => save.ctx?.guild && !save.ctx?.gm ? 1 + (save.ctx.guildPct != null ? Math.min(5, save.ctx.guildPct) / 100 : GUILD_BUFF) : 1; // guild members: XP and gold only (staff gets none)
export const offlineCap = (heroes, base = 12) => base + gearBonus(heroes[0]).capH + talentBonus(heroes[0]).capH;
export const xpToNext = lvl => Math.round(50 * Math.pow(1.4, lvl - 1));
export const levelCost = h => Math.round(40 * Math.pow(1.5, h.level - 1));
export const gearCost = h => Math.round(60 * Math.pow(1.6, h.gear) * (1 - talentBonus(h).forgePct / 100));
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
export const DRAIN_SECS = 1030;            // full → empty in ~17 min; worn down (30%) after ~12 min of fighting
export const LOW_HP = 0.3, LOW_MUL = 0.5;  // worn-down threshold and DPS penalty
export const RESTED = { secs: 1800, mul: 1.15 }, ELIXIR = { secs: 600, mul: 1.25 };
export const heroMaxHp = h => Math.round(classOf(h.cls).hp * (1 + 0.1 * (h.level - 1)) * (1 + talentBonus(h).hpPct / 100));
/** Well Rested gold/XP multiplier (Sanctuary talent strengthens it). */
export const restedMul = h => 1 + (RESTED.mul - 1) * (1 + talentBonus(h).restedMulPct / 100);
export const heroHp = h => Math.min(heroMaxHp(h), h.hp ?? heroMaxHp(h));
export const isWorn = h => heroHp(h) <= LOW_HP * heroMaxHp(h) + 1e-9;
export const buffsOf = save => save.buffs || (save.buffs = { rested: 0, elixir: 0, vigil: 0 });
/** DPS right now, including the low-HP penalty and an active elixir. */
const lowMulOf = h => Math.max(effectsOf(h).has('steady') ? FX.steadyLowMul : LOW_MUL, LOW_MUL + talentBonus(h).lowMulPct / 100);
/** Situational Unique multipliers. save.ctx is transient live context set by the UI ({ bossPct, special, sessionSecs }); offline it is absent. */
// Vesperveil's 'The Unwritten Hour' (staff coat): boss under 10% while the Architect is on the floor → +5% damage for heroes there.
// gmPresent = this client's own valid staff hero, or the server presence (role = gm only), so a local-only GM never lifts others.
export const UNWRITTEN = { below: 0.1, mul: 1.05 };
export const unwrittenHour = c => !!c?.gmPresent && (c.bossPct ?? 1) < UNWRITTEN.below;
export const layerMul = save => { const e = effectsOf(save.heroes[0]), c = save.ctx || {}; let m = unwrittenHour(c) ? UNWRITTEN.mul : 1;
  if (e.has('lastLayer') && (c.bossPct ?? 1) < FX.lastLayer.below) m *= FX.lastLayer.mul;
  if (e.has('momentum')) m *= 1 + Math.min(FX.momentum.max, (c.sessionSecs || 0) / 60 * FX.momentum.perMin);
  if (e.has('milestone') && c.special) m *= FX.milestoneMul;
  const t = talentBonus(save.heroes[0]), w = save.heroes[0].equip?.weapon;
  if (t.layerPct && (c.bossPct ?? 1) < FX.lastLayer.below) m *= 1 + t.layerPct / 100;
  if (t.elementPct && w && c.element && w.element === c.element) m *= 1 + t.elementPct / 100;
  return m; };
export const effectiveDps = save => totalDps(save.heroes) * (!save.ctx?.gm && isWorn(save.heroes[0]) ? lowMulOf(save.heroes[0]) : 1) * (buffsOf(save).elixir > 0 ? ELIXIR.mul : 1) * layerMul(save) * ((save.ctx?.bossPct ?? 1) < 0.5 ? 1 + talentBonus(save.heroes[0]).lowBossPct / 100 : 1);
/** Simulate `secs` of fighting (live or offline: same rules). Splits time at HP-threshold and buff-expiry breakpoints.
 *  Mutates hero HP and buff timers; returns float { dmg, gold, xp, lowSecs }. */
export function simulate(save, secs) {
  if (save.ctx?.gm) save.heroes[0].hp = heroMaxHp(save.heroes[0]); // staff: no drain, never worn down (also restores HP drained before the unlock)
  const h = save.heroes[0], max = heroMaxHp(h), b = buffsOf(save), e = effectsOf(h), tb = talentBonus(h), raw = max / DRAIN_SECS * (e.has('lifesteal') ? FX.lifesteal : 1) * (e.has('drain') ? FX.drain : 1) * (e.has('aegis') ? FX.aegis : 1) * (e.has('stillness') ? FX.stillness : 1) * (e.has('dodge') ? FX.dodgeDrain : 1);
  const drain = save.ctx?.gm ? 0 : Math.max(raw * 0.1, raw * (1 - tb.drainPct / 100) - tb.regenPct / 100 * max / 60); // talents: slower drain + regen
  const base = totalDps(save.heroes) * layerMul(save), lowMul = lowMulOf(h), hearth = e.has('hearth');
  const gM = goldMul(save.heroes) * decreeMul(save) * guildMul(save), xM = xpMul(save.heroes) * decreeMul(save) * guildMul(save);
  let hp = heroHp(h), t = Math.max(0, secs), dmg = 0, gold = 0, xp = 0, lowSecs = 0;
  for (let guard = 0; t > 1e-9 && guard < 16; guard++) {
    const low = hp <= LOW_HP * max + 1e-9; let seg = t; const rs = e.has('restful') && b.rested > 0, dr = rs ? 0 : drain; // restful armor: no drain + regen while Well Rested
    if (!low && dr > 0) seg = Math.min(seg, (hp - LOW_HP * max) / dr);
    const restedTicks = !(hearth && hp > FX.hearthHp * max + 1e-9); // hearth: Well Rested is frozen while above 50% HP
    if (hearth && dr > 0 && hp > FX.hearthHp * max + 1e-9) seg = Math.min(seg, (hp - FX.hearthHp * max) / dr);
    if (b.rested > 0 && restedTicks) seg = Math.min(seg, b.rested);
    if (b.elixir > 0) seg = Math.min(seg, b.elixir);
    if (seg <= 1e-9) { hp -= 1e-7; continue; } // sitting exactly on a threshold: step past it
    const d = base * (low ? lowMul : 1) * (b.elixir > 0 ? ELIXIR.mul : 1) * seg, r = b.rested > 0 ? restedMul(h) : 1;
    dmg += d; gold += d * 0.1 * gM * r; xp += d * 0.05 * xM * r; if (low) lowSecs += seg;
    hp = rs ? Math.min(max, hp + FX.restfulPerMin * max / 60 * seg) : Math.max(1, hp - dr * seg); if (restedTicks) b.rested = Math.max(0, b.rested - seg); b.elixir = Math.max(0, b.elixir - seg); t -= seg;
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
export function accrue(save, now, capHours = 12, offline = false) {
  const raw = Math.max(0, (now - save.lastTick) / 1000), secs = Math.min(raw, capHours * 3600);
  const s = simulate(save, secs), om = offline ? 1 + talentBonus(save.heroes[0]).offlinePct / 100 : 1; s.dmg *= om; s.gold *= om; s.xp *= om; // Shadowstep: offline efficiency
  const o = settle(save, s); save.lastTick = now;
  return { secs, capped: raw > secs, damage: o.dmg, gold: o.gold, xp: o.xp, lowSecs: s.lowSecs };
}
/** Offline return: same rules as live play. A Scroll of Vigil adds 4h to the cap once (consumed only if the extra time was needed). */
export function offlineProgress(save, now, baseCapHours = 12) {
  const b = buffsOf(save), cap = offlineCap(save.heroes, save.ctx?.gm ? 24 : baseCapHours) + (b.vigil || 0), raw = Math.max(0, (now - save.lastTick) / 1000);
  const vigilUsed = b.vigil > 0 && raw > (cap - b.vigil) * 3600; if (vigilUsed) b.vigil = 0;
  const r = accrue(save, now, cap, true); return { ...r, cap, vigilUsed };
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

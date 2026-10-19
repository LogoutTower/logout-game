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
  return { id: Math.random().toString(36).slice(2, 10), name: String(name).slice(0, 20) || 'Nameless', cls, level: 1, xp: 0, gear: 0 };
}
export const heroDps = h => { const c = CLASSES[h.cls]; return +(c.atk * c.spd * (1 + 0.25 * (h.level - 1)) * (1 + 0.15 * h.gear)).toFixed(3); };
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
  return { secs, capped: raw > secs, damage, gold: Math.floor(damage * 0.1), xp: Math.floor(damage * 0.05) };
}
/** Live accrual with fractional carry (fixes per-tick flooring that kept low-DPS heroes at 0 gold/XP). Mutates save.lastTick/save.carry. */
export function accrue(save, now, capHours = 12) {
  const raw = Math.max(0, (now - save.lastTick) / 1000), secs = Math.min(raw, capHours * 3600);
  const c = save.carry || (save.carry = { dmg: 0, gold: 0, xp: 0 });
  const d = totalDps(save.heroes) * secs + c.dmg, damage = Math.floor(d); c.dmg = d - damage;
  const g = damage * 0.1 + c.gold, gold = Math.floor(g); c.gold = g - gold;
  const x = damage * 0.05 + c.xp, xp = Math.floor(x); c.xp = x - xp;
  save.lastTick = now;
  return { secs, capped: raw > secs, damage, gold, xp };
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

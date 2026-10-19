// Staff sandbox: a SEPARATE in-memory state. Never touches the real save, the shared floor, the leaderboard or the server.
import { simulate } from './game.js';
import { bossInfo, floorBossHp, rng } from './floors.js';
import { rollItem } from './loot.js';
export function openSandbox(save) {
  const copy = JSON.parse(JSON.stringify(save)); // deep copy: nothing in here aliases the real save
  copy.ctx = { gm: true }; copy.buffs = { rested: 0, elixir: 0, vigil: 0 };
  return { save: copy, floor: 1, hp: floorBossHp(1), seed: 1, items: [], log: [] };
}
export function sandboxFloor(sb, f) { sb.floor = Math.max(1, Math.min(100, Math.round(f) || 1)); sb.hp = floorBossHp(sb.floor); return bossInfo(sb.floor); }
/** Fight the sandbox boss for `secs` with the copied hero. */
export function sandboxFight(sb, secs = 10) {
  const r = simulate(sb.save, secs); sb.hp = Math.max(0, sb.hp - r.dmg); const killed = sb.hp === 0;
  sb.log.push(`Sandbox: ${Math.round(r.dmg)} damage to ${bossInfo(sb.floor).name}${killed ? ' (defeated)' : ''}`); if (killed) sb.hp = floorBossHp(sb.floor);
  return { ...r, killed };
}
/** Roll test loot at the sandbox floor (any rarity, including Unique). Tagged sandbox; lives only in sb.items. */
export function sandboxLoot(sb, n = 3, weights = null) {
  const out = []; for (let i = 0; i < n; i++) { const it = rollItem(rng(9000 + sb.seed++), sb.floor, bossInfo(sb.floor).lootElement, `sb${sb.seed}`, weights); it.sandbox = true; it.id = 'sandbox-' + it.id; out.push(it); }
  sb.items.push(...out); return out;
}
export function closeSandbox(sb) { sb.items.length = 0; sb.log.length = 0; sb.save = null; return null; }

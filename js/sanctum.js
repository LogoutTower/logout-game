// Staff Sanctum: a private training room OUTSIDE the tower. Pure logic (no DOM). Nothing here touches the shared floor, rankings or drops:
// in the Sanctum the client sends no damage ticks (save pushes only) and the server ignores any that arrive (supabase/schema-addendum-sanctum.sql).
import { floorBossHp } from './floors.js';
import { sprite } from './sprites.js';
export const SANCTUM = { name: "The Architect's Sanctum", sub: 'outside the tower · staff only', alt: ['The Drafting Hall', 'The First Blueprint', "The Architect's Sanctum"] };
/** May this hero use the Sanctum? Online: the server gm role only; offline/local mode: the existing staff check. */
export const sanctumAllowed = ({ gmValid, serverRole, local }) => !!gmValid && (local || !!serverRole);
export const inSanctum = (save, allowed) => !!allowed && save?.sanctum === true;
/** Training construct: HP from the floor-HP curve at its level × an HP multiplier (0.1-1000). It reforms when broken. */
export function newConstruct(level = 10, hpMul = 1) { const lv = Math.max(1, Math.min(200, Math.round(+level) || 1)), m = Math.max(0.1, Math.min(1000, +hpMul || 1)); const max = Math.round(floorBossHp(Math.min(lv, 100)) * m * (lv > 100 ? 1.5 ** (lv - 100) : 1));
  return { level: lv, hpMul: m, max, hp: max, total: 0, broken: 0, since: 0, win: [] }; }
/** Apply damage at time t (ms); keeps a 10 s window for the live DPS meter. */
export function hitConstruct(c, dmg, t) { c.since ||= t; c.total += dmg; c.win.push([t, dmg]); while (c.win.length && t - c.win[0][0] > 10000) c.win.shift();
  c.hp -= dmg; let broke = 0; while (c.hp <= 0) { c.hp += c.max; c.broken++; broke++; } return broke; }
export function dpsMeters(c, t) { const w = c.win.reduce((a, [, d]) => a + d, 0), span = c.win.length ? Math.max(1, (t - c.win[0][0]) / 1000) : 1;
  return { live: c.win.length ? w / Math.min(10, Math.max(span, 1)) : 0, avg: c.since ? c.total / Math.max(1, (t - c.since) / 1000) : 0, total: c.total, broken: c.broken, ttk: null }; }
const cache = {};
// 16×16 original pixel art: a brass-and-blueprint training construct (k ink, g gold, d dark gold, w white, c blueprint cyan, v violet core)
const CONSTRUCT = ['......gggg......', '.....gwwwwg.....', '.....gwcwcg.....', '.....gwwwwg.....', '......gddg......', '..gggggddggggg..', '.gdcccgvvgcccdg.', '.gdc..gvvg..cdg.', '..g...gddg...g..', '......gddg......', '.....gdkkdg.....', '.....gd..dg.....', '....gd....dg....', '....gd....dg....', '...gggg..gggg...', '..dddddddddddd..'];
const TOWER = ['......g.........', '.....gwg........', '.....gcg........', '....gcccg.......', '....gc.cg.......', '....gcccg.......', '...gc...cg......', '...gcccccg......', '...g.c.c.g......', '..gcccccccg.....', '..gc.....cg.....', '..gcccccccg.....', '..gc.c.c.cg.....', '.gdddddddddg....', '.gdddddddddg....', '................'];
const PAL = { k: '#05030a', g: '#d9a93f', d: '#7a5a1f', w: '#fffaf0', c: '#5fd7ff', v: '#9a5cff' };
export const constructSprite = () => cache.c ||= sprite(CONSTRUCT, PAL);
export const towerModelSprite = () => cache.t ||= sprite(TOWER, { ...PAL, c: '#5fd7ff99' }); // unfinished: the top floors are only drawn lines

// Level/forge caps, gold sinks and the daily streak rewards (pure client logic; the server parts are in rehearsal.pglite.mjs).
import assert from 'node:assert';
import { newHero, applyXp, levelCap, forgeCap, xpToNext, LEVEL_CAP_OVER, FORGE_CAP_OVER, accrue } from '../js/game.js';
import { TONICS, buyTonic, tonicPrice, TONIC_MAX, TAILOR, buyCosmetic } from '../js/sinks.js';
import { claimReward, localDaily, savesLeft, DAILY } from '../js/daily.js';
import { byId, isUnlocked } from '../js/cosmetics.js'; import { GM_ITEMS } from '../js/gm.js';
assert.equal(LEVEL_CAP_OVER, 10); assert.equal(levelCap(1), 11); assert.equal(levelCap(20), 30); assert.equal(levelCap(5, true), Infinity); assert.equal(forgeCap(1), 1 + FORGE_CAP_OVER);
const h = newHero('A', 'Blade'); applyXp([h], 1e12, levelCap(1)); assert.equal(h.level, 11, 'stops at the cap'); assert.equal(h.xp, xpToNext(11), 'banks one level only');
applyXp([h], 0, levelCap(2)); assert.equal(h.level, 12, 'levels at once when the cap rises'); assert(h.xp < xpToNext(12));
const save = { gold: 1e9, heroes: [newHero('B', 'Blade')], progress: { drops: [], cleared: [], top3: [], rank1: 0 }, inv: [], lootSeq: 0 };
assert(buyTonic(save, 3, 'insight')); for (let i = 0; i < 9; i++) buyTonic(save, 3, 'insight'); assert.equal(save.buffs.insight, TONIC_MAX, 'tonics stack to 2 h max');
assert.equal(tonicPrice(TONICS[0], 1), 400); assert(tonicPrice(TONICS[0], 20) > 50000);
for (const c of TAILOR) { assert(byId(c.id) && !GM_ITEMS.some(g => g.id === c.id), 'tailor items exist and are never staff items'); assert(buyCosmetic(save, c.id)); assert(isUnlocked(byId(c.id), save.progress)); }
assert(!buyCosmetic(save, TAILOR[0].id), 'cannot buy twice');
// tonic XP still respects the level cap
const s2 = { gold: 0, heroes: [newHero('C', 'Blade')], buffs: { insight: 7200 }, lastTick: 0, ctx: {} }; const p = accrue(s2, 3600e3, 12); applyXp(s2.heroes, p.xp * 1e6, levelCap(1)); assert.equal(s2.heroes[0].level, 11);
// daily rewards: rising gold, chest cosmetic then rare loot, never staff items
const s3 = { gold: 0, heroes: [newHero('D', 'Blade')], progress: { drops: [] }, inv: [], lootSeq: 0 }; let last = 0;
for (let d = 1; d <= 6; d++) { const g0 = s3.gold; claimReward(s3, d, 5); assert(s3.gold - g0 > last); last = s3.gold - g0; }
for (let k = 0; k < 4; k++) claimReward(s3, 7, 5, { seq: k }); assert.deepEqual(s3.progress.drops, ['nc-dawn', 't-faithful', 'au-dawn']); assert(s3.inv.length === 1 && ['rare', 'epic', 'legendary'].includes(s3.inv[0].rarity));
assert(!s3.progress.drops.some(id => GM_ITEMS.some(g => g.id === id)));
// local (offline-mode) streak rule: one save per month
const D = 864e5, t0 = Date.UTC(2026, 9, 1, 12); const s4 = {};
assert.equal(localDaily(s4, t0).d, 1); assert.equal(localDaily(s4, t0 + 3600e3), null, 'once per day');
s4.daily.streak = 1; assert.equal(localDaily(s4, t0 + D).d, 2); s4.daily.streak = 2;
const sv = localDaily(s4, t0 + 3 * D); assert.equal(sv.d, 3); assert(sv.sv, 'first miss this month is saved'); s4.daily.streak = 3; assert.equal(savesLeft(s4, t0 + 3 * D), 0);
assert.equal(localDaily(s4, t0 + 5 * D).d, 1, 'second miss in the month resets'); assert.equal(DAILY.length, 7);
console.log('sinks + daily tests passed');

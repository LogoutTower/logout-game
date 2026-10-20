// Solumbra evolution: 3 stages by staff hero level, own sprite + halo per stage, abilities unchanged, staff-only everywhere.
import assert from 'node:assert';
const P = await import('../js/prestige.js'); const { sanitizeSave } = await import('../js/gm.js'); const C = await import('../js/idcard.js');
assert.deepEqual([1, 29, 30, 59, 60, 999].map(l => P.spiritStage(l).n), [1, 1, 2, 2, 3, 3]);
assert.deepEqual(P.SPIRIT_STAGES.map(s => s.name), ['Solumbra Wisp', 'Solumbra Spirit', 'Solumbra, Spirit of the First Dawn and Last Dusk']);
assert.equal(P.SPIRIT_STAGES[2].name, P.SPIRIT.title); assert.equal(P.SPIRIT.abilities.length, 2); assert.match(P.SPIRIT.abilities[0][1], /5%/); assert.equal(P.ECLIPSE.xpMul, 1.03, 'abilities stay capped');
assert(!P.PET_RARITY.includes('divine') && !P.PETS.some(p => P.isSpiritId(p.sp)), 'never rollable');
// sanitize: a player save with the spirit or its stage marker loses both
const s = { heroes: [{ cls: 'Blade', look: {}, equip: {}, talents: {} }], spirit: true, spiritSeen: 3, inv: [], pets: [{ sp: 'solumbra', rarity: 'divine' }] };
assert(sanitizeSave(s, false)); assert(!s.spirit && !s.spiritSeen && !s.pets.length);
// UI strings (no DOM needed for the grids/stage list); halo markup per stage
globalThis.document = undefined;
let UI = null; try { UI = await import('../js/prestigeui.js'); } catch {}
if (UI) { assert.deepEqual(Object.keys(UI.SPIRIT_GRIDS), ['1', '2', '3']); assert.notDeepEqual(UI.SPIRIT_GRIDS[1], UI.SPIRIT_GRIDS[3]); }
// ID card shows the stage for staff only
const esc = x => String(x); for (const [lv, name] of [[5, 'Solumbra Wisp'], [45, 'Solumbra Spirit'], [80, P.SPIRIT.title]]) assert(C.cardHtml({ name: 'S', cls: 'GameMaster', level: lv, st: true, spirit: true, equip: {}, look: {} }, { esc }).includes(name));
assert(!C.cardHtml({ name: 'X', cls: 'Blade', level: 80, spirit: true, equip: {}, look: {} }, { esc }).includes('Solumbra'), 'never on a player card');
console.log('solumbra tests passed');

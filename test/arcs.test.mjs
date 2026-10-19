// Arcs (scenes + names), floors 11-20 mechanics, signature drops, Tower Map bands. Offline, pure.
import assert from 'node:assert';
const A = await import('../js/arcs.js'), F = await import('../js/floors.js'), T = await import('../js/towermap.js'), L = await import('../js/loot.js'), G = await import('../js/game.js');
const { MAX_FLOOR } = await import('../config.js');
assert.equal(MAX_FLOOR, 20);
// ---- arcs: keyed by ceil(floor/10), named in one place, graceful fallback for arcs without an entry
assert.deepEqual([1, 10, 11, 20, 21, 95].map(A.arcIndex), [1, 1, 2, 2, 3, 10]);
assert.equal(A.arcOf(5).name, A.ARC_NAMES[1]); assert.equal(A.arcOf(15).name, A.ARC_NAMES[2]); assert.notEqual(A.ARC_NAMES[1], A.ARC_NAMES[2]);
assert.equal(A.arcOf(5).props, 'torches'); assert.equal(A.arcOf(15).props, 'gears'); assert.equal(A.arcOf(15).particles, 'snow');
const a3 = A.arcOf(25); assert.equal(a3.n, 3); assert.equal(a3.name, 'Arc 3', 'unnamed arc falls back'); assert.equal(a3.props, A.ARCS.at(-1).props, 'scene falls back to the last arc');
assert.deepEqual([A.arcOf(11).from, A.arcOf(11).to], [11, 20]);
for (const a of A.ARCS) for (const k of ['sky', 'sky2', 'deep', 'strip1', 'strip2', 'glow', 'band']) assert(a.pal[k], `arc ${a.n} ${k}`);
assert.notEqual(A.ARCS[0].pal.sky, A.ARCS[1].pal.sky, 'arc 2 looks different');
// per-floor tint varies within an arc
assert.notEqual(A.sceneOf(12, '#ff8a2e').pal.sky, A.sceneOf(13, '#9a5cff').pal.sky); assert.equal(A.sceneOf(12).pal.sky, A.ARCS[1].pal.sky);
assert.equal(A.sceneVars(A.sceneOf(3)).length, 8);
// ---- tower map: arc, band colour, name; arc 3+ sealed
const rows = T.towerRows({ current: 12, maxFloor: 20 }); const r = f => rows.find(x => x.f === f);
assert.equal(r(12).state, 'current'); assert.equal(r(11).state, 'cleared'); assert.equal(r(20).state, 'fog'); assert.equal(r(21).state, 'undiscovered');
assert.equal(r(5).arcName, A.ARC_NAMES[1]); assert.equal(r(15).arcName, A.ARC_NAMES[2]); assert.equal(r(25).arcName, 'Sealed'); assert.equal(r(15).band, A.ARCS[1].pal.band);
assert(r(15).special && r(20).milestone && r(20).finale && !r(19).finale);
// ---- mechanics: live context only, small, existing systems
const mk = () => { const h = G.newHero('Ash', 'Blade'); h.level = 20; h.hp = null; return { heroes: [h], buffs: {}, inv: [] }; };
const d = c => { const s = mk(); s.ctx = c; return G.effectiveDps(s); }, base = d({});
assert(Math.abs(d({ mech: 'casing', bossPct: 0.9 }) / base - 0.85) < 1e-9); assert.equal(d({ mech: 'casing', bossPct: 0.5 }), base);
assert(Math.abs(d({ mech: 'overclock', bossPct: 0.3 }) / base - 1.15) < 1e-9);
{ const s = mk(); s.heroes[0].equip = { weapon: { slot: 'weapon', element: 'holy', stats: { dps: 1 } } }; s.ctx = {}; const b0 = G.effectiveDps(s); s.ctx = { mech: 'weak:holy' }; assert(Math.abs(G.effectiveDps(s) / b0 - 1.2) < 1e-9, 'element weakness'); s.ctx = { mech: 'weak:fire' }; assert.equal(G.effectiveDps(s), b0); }
assert.equal(F.mechDrain({ mech: 'frostbite' }), 1.2); assert.equal(F.mechDrain({ mech: 'enrage', bossPct: 0.1 }), 1.4); assert.equal(F.mechDrain({ mech: 'enrage', bossPct: 0.5 }), 1);
{ const a = mk(), b = mk(); a.ctx = { mech: 'frostbite' }; b.ctx = {}; G.simulate(a, 300); G.simulate(b, 300); assert(a.heroes[0].hp < b.heroes[0].hp, 'frostbite drains faster'); }
assert.equal(F.mechDps({}, 'fire'), 1, 'no mech → no effect (offline ctx)');
// ---- loot: floors 11-20 scale, signature drops keep the rolled stats
for (let f = 11; f <= 20; f++) assert(L.gearScale(f) > L.gearScale(f - 1));
const sigs = L.signatureList(); assert(sigs.length >= 10 && sigs.every(s => s.floor >= 11 && s.floor <= 20));
{ const it = L.rollItem(F.rng(3), 13, 'shadow', 1, [0, 0, 0, 0, 1, 0]); let got = null; for (let i = 0; i < 50 && !got; i++) { const s = L.signature(F.rng(i), 13, { ...it, slot: 'weapon' }); if (s.signature) got = s; }
  assert(got); assert.equal(got.name, 'Hourstroke Pendulum'); assert.deepEqual(got.stats, it.stats, 'no power creep'); }
assert.equal(L.signature(F.rng(1), 5, { slot: 'weapon', rarity: 'legendary', name: 'x' }).name, 'x', 'arc 1 has no signatures');
console.log('arcs + floors 11-20 tests passed');

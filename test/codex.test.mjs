// The Architect's Codex (staff-only tree), Vesperveil, the galaxy aura and the Codex hooks.
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem();
const G = await import('../js/gm.js');
const { CODEX, CODEX_IDS, codexPoints, cx } = await import('../js/codex.js');
const T = await import('../js/talents.js');
const { newHero, heroDps, heroMaxHp, gearCost, effectiveDps, simulate, offlineProgress, CLASSES } = await import('../js/game.js');
const L = await import('../js/loot.js');
const { galaxyTier } = await import('../js/galaxy.js');
const SB = await import('../js/sandbox.js');
const mk = (cls = 'Blade', level = 49) => { const h = newHero('T', cls); h.level = level; h.hp = null; h.id = 'h1'; return { version: 9, gold: 1e6, heroes: [h], lastTick: 0, buffs: {}, inv: [], progress: { cleared: [1, 2, 3], top3: [], rank1: 0, drops: [] }, lootSeq: 0 }; };
const gm = (level = 49) => { const s = mk('Blade', level); G.becomeGm(s, L.legendaryWeaponDps(5), 5); s.ctx = { gm: true }; return s; };
const maxAll = (h, ids) => { for (const id of ids) h.talents[id] = T.nodeById(id).max; };
// ---- shape: 4 branches × 7 nodes + hidden 29th = 48 ranks; 1 point per level
const vis = CODEX.filter(b => !b.nodes.every(n => n.hidden)); assert.equal(vis.length, 4); assert(vis.every(b => b.nodes.length === 7)); assert.equal(CODEX_IDS.length, 29); assert.equal(codexPoints(), 48);
assert.deepEqual(vis.map(b => b.nodes.at(-1).name), ['Master Plan', 'Collapse of Stars', 'Shaper of Destiny', 'Final Decree']);
{ const s = gm(), h = s.heroes[0]; assert.equal(T.treeOf(h.cls), CODEX, 'Codex replaces the class tree'); assert.equal(T.totalPoints(h), 48, 'level 49 → 48 points'); assert.equal(T.respecCost(h, 50, true), 0, 'free respec');
  assert(!Object.keys(T.TREES).includes('GameMaster'), 'not in the class trees list');
  // every branch can be completed with its own budget (gates fit), and the hidden node stays sealed until all 4 capstones
  for (const b of vis) for (const n of b.nodes) for (let r = 0; r < n.max; r++) assert.equal(T.learn(h, n.id) || T.canLearn(h, n.id), true, `${n.id} learnable in order`);
  const s2 = gm(), h2 = s2.heroes[0]; for (const b of vis.slice(0, 3)) for (const n of b.nodes) for (let r = 0; r < n.max; r++) T.learn(h2, n.id);
  assert.equal(T.canLearn(h2, 'cx-shape'), 'sealed', 'hidden until all capstones'); for (const n of vis[3].nodes) for (let r = 0; r < n.max; r++) T.learn(h2, n.id);
  assert.equal(T.canLearn(h2, 'cx-shape'), null); assert(T.learn(h2, 'cx-shape')); assert.equal(T.freePoints(h2), 0, 'exactly 48 points'); assert(cx(h2, 'cx-shape')); }
// ---- non-staff can never use Codex ranks; paste is stripped on load
{ const s = mk(), h = s.heroes[0]; assert.equal(T.canLearn(h, 'cx-gravity'), 'other class'); h.talents = { 'cx-gravity': 3, 'cx-final': 1 };
  assert.equal(T.talentBonus(h).dpsPct, T.talentBonus({ ...h, talents: {} }).dpsPct, 'ignored for other classes'); assert(!cx(h, 'cx-final'));
  assert(G.sanitizeSave(s, false)); assert.deepEqual(h.talents, {}, 'stripped'); }
// ---- combat parity: maxed Codex ≤ the strongest maxed class tree (and not far below)
const score = (t, bossLow = 0.5) => (1 + (t.dpsPct + t.rallyPct + t.eclipsePct + t.crackPct + t.highHpDpsPct) / 100) * (1 + t.doublePct / 100) * (1 + t.layerPct / 100) * (1 + t.elementPct / 400) * (1 + bossLow * t.lowBossPct / 100) * (1 + t.hpPct / 400);
{ const best = Math.max(...Object.keys(CLASSES).map(c => { const h = newHero('x', c); h.talents = {}; maxAll(h, T.treeOf(c).flatMap(b => b.nodes.map(n => n.id))); return score(T.talentBonus(h)); }));
  const g = gm().heroes[0]; maxAll(g, CODEX_IDS); const cs = score(T.talentBonus(g)); assert(cs <= best * 1.02 && cs >= best * 0.6, `codex ${cs.toFixed(3)} vs best class ${best.toFixed(3)}`); }
// ---- each combat/economy node applies
{ const s = gm(), h = s.heroes[0], base = { dps: heroDps(h), hp: heroMaxHp(h), forge: gearCost(h) };
  h.talents = { 'cx-load': 3 }; assert.equal(heroMaxHp(h), Math.round(base.hp / 1 * 1.06) || heroMaxHp(h)); assert(heroMaxHp(h) > base.hp, 'Load-Bearing');
  h.talents = { 'cx-scaffold': 3 }; assert.equal(gearCost(h), Math.round(base.forge / (1) * 0.85) || gearCost(h)); assert(gearCost(h) < base.forge, 'Scaffold');
  h.talents = { 'cx-gravity': 3 }; assert(Math.abs(heroDps(h) / base.dps - 1.09) < 0.01, 'Gravity Well');
  h.talents = { 'cx-integrity': 2 }; assert(Math.abs(heroDps(h) / base.dps - 1.08) < 0.01, 'Structural Integrity (full HP)'); h.hp = 1; assert(Math.abs(heroDps(h) / base.dps - 1) < 0.01, 'off at low HP'); h.hp = null;
  h.talents = { 'cx-orbit': 3 }; assert(Math.abs(heroDps(h) / base.dps - 1.06) < 0.01, 'Orbit');
  h.talents = { 'cx-eclipse': 1, 'cx-collapse': 1 }; assert(Math.abs(heroDps(h) / base.dps - 1.10) < 0.01, 'Eclipse ×2 averaged');
  h.talents = { 'cx-gilded': 3 }; assert(Math.abs(heroDps(h) / base.dps - 1.06) < 0.01, 'Gilded Fracture');
  h.talents = { 'cx-horizon': 3 }; s.ctx = { gm: true, bossPct: 0.9 }; const hi = effectiveDps(s); s.ctx.bossPct = 0.4; assert(Math.abs(effectiveDps(s) / hi - 1.09) < 0.01, 'Event Horizon');
  h.talents = {}; s.ctx = { gm: true, decree: true }; const g5 = simulate(JSON.parse(JSON.stringify(s)), 600); s.ctx.decreePct = 6; const g6 = simulate(JSON.parse(JSON.stringify({ ...s, ctx: s.ctx })), 600); assert(Math.abs(g6.gold / g5.gold - 1.06 / 1.05) < 0.01, 'Final Decree +6%');
  h.talents = { 'cx-weave': 3 }; s.ctx = { gm: true }; const gw = simulate(JSON.parse(JSON.stringify(s)), 600); h.talents = {}; const g0 = simulate(JSON.parse(JSON.stringify(s)), 600); assert(Math.abs(gw.gold / g0.gold - 1.09) < 0.01, "Fortune's Weave");
  h.talents = { 'cx-hour': 3 }; const o = gm(); o.heroes[0].talents = { 'cx-hour': 3 }; o.lastTick = Date.now() - 3600e3; const ro = offlineProgress(o, Date.now()); const p = gm(); p.lastTick = Date.now() - 3600e3; const rp = offlineProgress(p, Date.now()); assert(Math.abs(ro.damage / rp.damage - 1.15) < 0.02, 'Fated Hour'); assert.equal(ro.cap, 24, 'still 24h');
}
// ---- Second Draft (seeded ~15%), Shaper of Destiny, Master Plan
{ const s = gm(), h = s.heroes[0]; h.talents = { 'cx-draft': 3 }; const it = L.rollItem(L.rng ? L.rng(1) : (await import('../js/floors.js')).rng(1), 5, 'fire', 1, [1, 0, 0, 0, 0, 0]); const base = L.salvageGold(s, it); let dbl = 0; for (let i = 0; i < 4000; i++) if (L.salvagePay(s, it) === base * 2) dbl++; assert(Math.abs(dbl / 4000 - 0.15) < 0.02, `Second Draft ${dbl / 4000}`);
  assert(L.chooseDestiny(s, 'frost')); assert(!L.chooseDestiny(s, 'fire'), 'once a day'); let got = null; for (let i = 0; !got && i < 300; i++) { const d = L.grantDrops(s, 3, 1); if (d.items.length) got = d.items[0]; else s.destiny.element = 'frost'; }
  assert.equal(got.element, 'frost', 'next boss drop uses the chosen element'); assert.equal(s.destiny.element, null, 'consumed');
  const n = mk(); n.destiny = { element: 'frost', at: 0 }; assert.equal(L.takeDestiny(n), null, 'players cannot use it');
  s.inv = [L.rollItem((await import('../js/floors.js')).rng(5), 5, 'fire', 2, [0, 0, 1, 0, 0, 0])]; const before = JSON.stringify(s.inv[0].stats); const r1 = L.rerollItem(s, 0, 5); assert(r1 && r1.rarity === 'rare'); assert.equal(L.rerollItem(s, 0, 5), null, 'once per floor'); assert(L.rerollItem(s, 0, 6), 'next floor ok'); void before; }
// ---- Floorplan edits only the sandbox
{ const s = gm(), snap = JSON.stringify(s), sb = SB.openSandbox(s); SB.sandboxFloor(sb, 37); SB.sandboxEdit(sb, { hpMul: 3, element: 'holy' }); SB.sandboxFight(sb, 5); const it = SB.sandboxLoot(sb, 1)[0]; assert.equal(it.element, 'holy'); SB.closeSandbox(sb); assert.equal(JSON.stringify(s), snap, 'real save untouched'); }
// ---- galaxy aura tiers + Vesperveil + exclusivity coverage
assert.deepEqual([5, 20, 50].map(l => galaxyTier(l).tier), [1, 3, 5]); assert(galaxyTier(1).scale < galaxyTier(20).scale && galaxyTier(20).scale < galaxyTier(50).scale);
assert.deepEqual([1, 10, 20, 30, 40].map(l => galaxyTier(l).tier), [1, 2, 3, 4, 5]);
assert.equal(G.VESPERVEIL.label, 'Vesperveil, Mantle of the Unwritten'); assert.equal(G.VESPERVEIL.lore, 'System notice: wearer identity not found. The tower stopped asking.');
for (const n of ['Vesperveil', 'Galaxy of the Unwritten', 'Unsheathed', "The Architect's Codex", 'The Final Shape', 'Collapse of Stars']) assert(G.GM_NAMES.includes(n), `exclusivity scan covers ${n}`); // gm.test.mjs scans every pool for GM_NAMES
// ---- Vesperveil: The Unwritten Hour (+5% under 10% boss HP while staff is present; same in offline maths)
{ const { unwrittenHour, layerMul, accrue } = await import('../js/game.js'); assert(G.VESPERVEIL.ability.startsWith('The Unwritten Hour'));
  const p = mk(); p.ctx = { bossPct: 0.05 }; const off = effectiveDps(p); p.ctx.gmPresent = true; assert(Math.abs(effectiveDps(p) / off - 1.05) < 1e-6, '+5% while present');
  p.ctx.bossPct = 0.2; assert.equal(effectiveDps(p), (p.ctx.gmPresent = false, effectiveDps(p)), 'off above 10%'); assert(!unwrittenHour({ bossPct: 0.05 }), 'no presence, no bonus');
  const a = mk(), b = mk(); a.ctx = { bossPct: 0.05, gmPresent: true }; b.ctx = { bossPct: 0.05 }; a.lastTick = b.lastTick = Date.now() - 600e3; const ra = accrue(a, Date.now()), rb = accrue(b, Date.now()); assert(Math.abs(ra.damage / rb.damage - 1.05) < 0.01, 'offline maths agree');
  const L2 = await import('../js/loot.js'); assert(![...L2.ABILITIES, ...L2.ARMOR_ABILITIES].some(x => /unwritten/i.test(x.id + x.text)), 'never in a Unique pool'); }
console.log('codex tests passed');

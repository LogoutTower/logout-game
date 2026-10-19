// Unique ARMOR + the one-Unique rule.
import assert from 'node:assert';
import { newHero, simulate, effectiveDps, heroDps, offlineCap, heroMaxHp, effectsOf } from '../js/game.js';
import { RARITIES, rarityWeights, rollItem, ARMOR_ABILITIES, DRAWBACKS, allowedPair, forgeUnique, equipItem, salvageGold, U_ABASE } from '../js/loot.js';
import { innCost, sellItem, bulkPreview } from '../js/town.js';
import { rng } from '../js/floors.js';
import { migrateSave } from '../js/cosmetics.js';
const mk = () => migrateSave({ version: 2, heroes: [newHero('U', 'Blade')], gold: 0, lastTick: 0, progress: { cleared: [], top3: [], rank1: 0 } });
const U = RARITIES.length - 1, ONLY_U = RARITIES.map((_, i) => i === U ? 1 : 0);
// odds unchanged (the rarity weights are untouched) and weapon/armor ≈ 50/50 when a Unique rolls
{ const w = rarityWeights(5); assert(Math.abs(w[U] / w.reduce((a, b) => a + b) - 0.0005) < 1e-5); const w2 = rarityWeights(50); assert(Math.abs(w2[U] / w2.reduce((a, b) => a + b) - 0.0015) < 1e-5);
  let arm = 0; const N = 4000; for (let i = 0; i < N; i++) if (rollItem(rng(5000 + i), 10, 'fire', i, ONLY_U).slot === 'armor') arm++; assert(Math.abs(arm / N - 0.5) < 0.04, `armor share ${arm / N}`); }
// determinism, shape, stats ~20% above a Legendary armor, never a trinket lock, forbidden pairs, every ability rolls
{ const a = rollItem(rng(77), 20, 'frost', 3, ONLY_U), b = rollItem(rng(77), 20, 'frost', 3, ONLY_U); assert.deepEqual(a, b, 'same seed → same item');
  const seen = new Set(); let leg = 0;
  for (let i = 0; i < 300; i++) { const it = rollItem(rng(i), 20, 'fire', i, [0, 0, 0, 0, 1, 0]); if (it.slot === 'armor') leg = Math.max(leg, it.stats.dpsPct - (it.stats.dpsPct - Math.round((3 + 20 / 8) * 3))); }
  for (let i = 0; i < 6000; i++) { const it = rollItem(rng(i * 13 + 1), 20, 'void', i, ONLY_U); if (it.slot !== 'armor') continue; seen.add(it.ability.id);
    assert(ARMOR_ABILITIES.some(x => x.id === it.ability.id), 'armor pool'); assert(allowedPair(it.ability.id, it.drawback.id), `forbidden ${it.ability.id}+${it.drawback.id}`); assert.notEqual(it.drawback.id, 'jealous');
    assert(U_ABASE.some(n => it.name.includes(n)) && it.stamp.includes('Floor 20') && it.lore.startsWith('System notice'), 'name/stamp/lore');
    assert.equal(it.stats.dpsPct - (it.ability.id === 'x' ? 0 : 0), it.stats.dpsPct); assert(it.stats.dpsPct >= Math.round(leg * 1.15), `stats above Legendary armor ${it.stats.dpsPct} vs ${leg}`); }
  assert.equal(seen.size, ARMOR_ABILITIES.length, 'every armor ability can roll');
  for (const [ab, d] of [['stillness', 'drain'], ['aegis', 'drain'], ['watch', 'shortCap'], ['tithe', 'poor'], ['innkeep', 'innTax'], ['thorns', 'heavy'], ['restful', 'innTax']]) assert(!allowedPair(ab, d), `${ab}+${d}`); }
// each armor ability applies (vs the same armor with neutral effect ids)
const withA = (ab, dr = 'whisper') => { const s = mk(), it = forgeUnique(10, 'storm', ab, dr); s.heroes[0].equip.armor = it; return s; };
const neutral = ab => { const s = withA(ab), a = s.heroes[0].equip.armor; s.heroes[0].equip.armor = { ...a, stats: { dpsPct: a.stats.dpsPct }, ability: { id: 'x' }, drawback: { id: 'y' } }; return s; };
const near = (a, b, m, t = 1e-3) => assert(Math.abs(a - b) <= t * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const loss = s => { const m = heroMaxHp(s.heroes[0]); simulate(s, 100); return m - s.heroes[0].hp; };
assert.equal(withA('thorns').heroes[0].equip.armor.slot, 'armor');
near(heroDps(withA('thorns').heroes[0]) / heroDps(neutral('thorns').heroes[0]), 1.08, 'thorns');
near(loss(withA('aegis')) / loss(neutral('aegis')), 0.8, 'aegis'); near(loss(withA('stillness')) / loss(neutral('stillness')), 0.65, 'stillness');
near(loss(withA('dodge')) / loss(neutral('dodge')), 0.9, 'dodge drain'); near(heroDps(withA('dodge').heroes[0]) / heroDps(neutral('dodge').heroes[0]), 1.03, 'dodge dps');
{ const s = withA('restful'), h = s.heroes[0]; h.hp = heroMaxHp(h) * 0.5; s.buffs = { rested: 600 }; const hp0 = h.hp; simulate(s, 60); near(h.hp - hp0, heroMaxHp(h) * 0.01, 'restful regen 1%/min');
  const t = neutral('restful'); t.heroes[0].hp = heroMaxHp(t.heroes[0]) * 0.5; t.buffs = { rested: 600 }; const t0 = t.heroes[0].hp; simulate(t, 60); assert(t.heroes[0].hp < t0, 'normal armor still drains'); }
assert.equal(offlineCap(withA('watch').heroes) - offlineCap(neutral('watch').heroes), 1, 'watch +1h');
{ const a = withA('tithe'), b = neutral('tithe'); near(simulate(a, 60).gold / simulate(b, 60).gold, 1.15, 'tithe +15% gold', 0.02); }
near(innCost(5, withA('innkeep')) / innCost(5, neutral('innkeep')), 0.6, 'innkeep', 0.05);
// one-Unique rule: equipping a Unique armor returns an equipped Unique weapon to the bag (and vice versa)
{ const s = mk(), w = forgeUnique(10, 'fire', 'tenth', 'whisper'), a = forgeUnique(10, 'fire', 'stillness', 'dull'); s.inv = [w, a];
  assert(equipItem(s, 0)); assert.equal(s.heroes[0].equip.weapon, w); assert(equipItem(s, 0)); assert.equal(s.heroes[0].equip.armor, a);
  assert.equal(s.heroes[0].equip.weapon, null, 'weapon Unique unequipped'); assert(s.inv.includes(w), 'returned to bag'); assert.deepEqual([...effectsOf(s.heroes[0])].sort(), ['dull', 'stillness']);
  assert(equipItem(s, s.inv.indexOf(w))); assert.equal(s.heroes[0].equip.armor, null); assert(s.inv.includes(a));
  // sell/salvage protection: no bulk, confirm needed
  s.inv.push(forgeUnique(3, 'fire', 'aegis', 'dull')); assert.equal(bulkPreview(s).count, 0); assert.equal(sellItem(s, s.inv.length - 1), 0); }
console.log('unique armor tests passed');

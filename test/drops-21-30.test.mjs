// Arc 3 signature drops (Floors 21-30): behind the arc 3 lock, optional flavor / display rarity / custom icon, in-hand + back-mount looks.
import assert from 'node:assert';
const F = await import('../js/floors.js'), L = await import('../js/loot.js'), C = await import('../js/cosmetics.js');
const { SIGS_21_30 } = await import('../js/drops-21-30.js');
assert.equal(SIGS_21_30.length, 10);
F.setArc3Preview(false);
for (let f = 21; f <= 30; f++) assert.deepEqual(F.bossInfo(f).sig || [], [], `locked: no sig on ${f}`);
assert(!L.signatureList().some(s => s.floor > 20), 'locked: codex lists no arc 3 signatures');
const roll = (f, slot) => L.signature(() => 0.1, f, { slot, rarity: 'epic', name: 'x', id: 'i' + f, element: 'void', stats: {} });
assert.equal(roll(22, 'weapon').name, 'x', 'locked: no arc 3 signature rolls');
F.setArc3Preview(true);
for (const s of SIGS_21_30) { const b = F.bossInfo(s.floor).sig; assert.equal(b.length, 1); assert.equal(b[0].name, s.name);
  const it = roll(s.floor, s.slot); assert.equal(it.name, s.name); assert(it.signature); assert.equal(it.flavor, s.flavor); assert.deepEqual(it.sigEquip, s.equip);
  assert(['epic', 'legendary'].includes(b[0].rarity)); assert.equal(s.icon.length, 16); }
assert.equal(L.signatureList().filter(s => s.floor > 20).length, 10);
const h = { cls: 'Vanguard', look: C.defaultLook('Vanguard'), equip: { weapon: roll(30, 'weapon'), armor: roll(26, 'armor'), trinket: roll(21, 'trinket') } };
assert.equal(C.sigLook({ equip: { trinket: h.equip.trinket } }), null, 'trinkets have no look');
const base = C.heroGridV2(h.look, 'Vanguard').rows.join(), hand = C.heroGridV2({ ...h.look, sig: C.sigLook(h) }, 'Vanguard'), back = C.heroGridV2({ ...h.look, sig: C.sigLook(h), sigMount: 'back' }, 'Vanguard');
assert.equal(hand.rows.length, 64); assert(hand.rows.every(r => r.length === 64)); assert.notEqual(hand.rows.join(), base); assert.notEqual(back.rows.join(), hand.rows.join());
F.setArc3Preview(false);
console.log('drops 21-30 tests passed');

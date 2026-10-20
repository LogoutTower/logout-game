// Staff gear level tiers: Eventide + Vesperveil follow the staff hero's level (I <30, II 30, III 45, Divine Awakening 60). Staff-only throughout.
import assert from 'node:assert';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const G = await import('../js/gm.js'); const Gm = await import('../js/game.js'); const L = await import('../js/loot.js'); const T = await import('../js/town.js');
const C = await import('../js/cosmetics.js'); const I = await import('../js/idcard.js'); const Ic = await import('../js/icons.js'); const { rng } = await import('../js/floors.js');
assert.deepEqual([1, 29, 30, 44, 45, 59, 60, 500].map(l => G.gmTier(l).n), [1, 1, 2, 2, 3, 3, 4, 4]);
const f = 12, wd = L.legendaryWeaponDps(f), ap = L.legendaryArmorPct(f);
const e = [1, 2, 3, 4].map(t => G.eventide(f, wd, t)), v = [1, 2, 3, 4].map(t => G.vesperveil(f, ap, t));
assert.deepEqual(e[0], { ...G.eventide(f, wd), tier: 1, tierLabel: 'Tier I' }, 'tier I = the current version'); assert.equal(e[0].stats.dps, wd); assert.equal(v[0].stats.dpsPct, ap);
for (let i = 1; i < 4; i++) { assert(e[i].stats.dps > e[i - 1].stats.dps && v[i].stats.dpsPct >= v[i - 1].stats.dpsPct, `tier ${i + 1} bump`); }
assert(e[3].stats.dps <= wd * 1.2 + 0.1 && v[3].stats.dpsPct <= Math.round(ap * 1.2), 'within the Unique band');
assert.equal(e[3].name, 'Eventide, Awakened'); assert.equal(v[3].name, 'Vesperveil, Awakened'); assert(e[3].divine && v[3].divine && e[3].show === 'divine');
assert.equal(e[3].stats.dpsPct, 3); assert.equal(v[3].stats.goldPct, 3); assert(e[3].staffPower.includes('Dusk Remembered') && v[3].staffPower.includes('Gilded Unwriting'));
assert.equal(e[3].rarity, 'legendary', 'internal rarity unchanged (never in a pool)');
assert.deepEqual([1, 2, 3, 4].map(t => Ic.iconShape(e[t - 1])), ['katana', 'katana', 'katana2', 'katanaD']); assert.deepEqual([1, 2, 3, 4].map(t => Ic.iconShape(v[t - 1])), ['armor', 'armor', 'armor2', 'armorD']);
for (const it of [...e, ...v]) assert(typeof Ic.itemIcon(it) === 'string');
// gmGear follows the level both ways (a forced level in tests only)
const mk = () => { const h = Gm.newHero('Tess', 'Blade'); h.hp = null; return C.migrateSave({ version: 2, heroes: [h], gold: 0, lastTick: 0, progress: { cleared: [], top3: [], rank1: 0 } }); };
const s = mk(); s.heroes[0].level = 28; G.becomeGm(s, wd, f, ap); assert.equal(s.heroes[0].equip.weapon.tier, 1);
for (const [lv, n] of [[30, 2], [45, 3], [60, 4], [28, 1]]) { s.heroes[0].level = lv; assert(G.gmGear(s, f, wd, ap)); assert.equal(s.heroes[0].equip.weapon.tier, n); assert.equal(s.heroes[0].equip.armor.tier, n); assert(!G.gmGear(s, f, wd, ap), 'stable'); }
s.heroes[0].level = 61; s.inv.push(s.heroes[0].equip.armor); s.heroes[0].equip.armor = null; G.gmGear(s, f, wd, ap); assert.equal(s.inv.find(i => i.id === G.VESPER_ID).tier, 4, 'bag copy refreshed too');
// lock rules: never sold, rerolled, rolled; stripped from non-staff saves with the banner marker
for (const it of [e[3], v[3]]) { assert(!T.sellable(it)); const p = mk(); p.inv.push(it); assert.equal(L.rerollItem(p, 0, 99), null); }
for (let i = 0; i < 3000; i++) assert(!/Awakened|Dusk Remembered|Gilded Unwriting/.test(JSON.stringify(L.rollItem(rng(i), 1 + (i % 100), 'void', i, i % 2 ? [0, 0, 0, 0, 0, 1] : null))));
const p = mk(); p.heroes[0].equip.weapon = e[3]; p.heroes[0].equip.armor = v[3]; p.inv.push(e[2]); p.gmTierSeen = 4;
assert(G.sanitizeSave(p, false)); assert(!p.heroes[0].equip.weapon && !p.heroes[0].equip.armor && !p.inv.length && !p.gmTierSeen);
// ID card: the staff card shows item + tier (Divine when awakened); a player card never shows staff gear
const esc = x => String(x), strip = it => ({ name: it.name, slot: it.slot, rarity: it.rarity, floor: it.floor, stats: it.stats }); // what card_item() lets through
for (const [lv, want] of [[28, 'Tier I'], [35, 'Tier II'], [50, 'Tier III'], [65, 'Divine · Awakened']]) {
  const t = G.gmTier(lv).n, html = I.cardHtml({ name: 'S', cls: G.GM_CLASS, level: lv, st: true, equip: { weapon: strip(G.eventide(f, wd, t)), armor: strip(G.vesperveil(f, ap, t)) }, look: {} }, { esc });
  assert(html.includes(want), `card shows ${want}`); assert(!html.includes('Dusk Remembered') && !html.includes('Gilded Unwriting') && !html.includes('System notice: origin'), 'no staff internals on the card'); }
const pl = I.cardHtml({ name: 'X', cls: 'Blade', level: 65, equip: { weapon: { ...strip(e[3]), gm: true } }, look: {} }, { esc }); assert(!pl.includes('Awakened'));
const pl2 = I.cardHtml({ name: 'X', cls: 'Blade', level: 65, equip: { weapon: strip(e[3]) }, look: {} }, { esc }); assert(!pl2.includes('Divine') && !pl2.includes('Tier'), 'a player card never shows a staff tier');
console.log('gm gear tier tests passed');

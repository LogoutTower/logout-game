// Staff (gm) package: hidden everywhere for normal players, combat parity, rank exclusion, unlock rules, perks, sandbox isolation.
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem();
const G = await import('../js/gm.js');
const { CLASSES, newHero, heroDps, heroMaxHp, simulate, offlineProgress } = await import('../js/game.js');
const C = await import('../js/cosmetics.js');
const L = await import('../js/loot.js');
const T = await import('../js/town.js');
const { TREES, respecCost, respec } = await import('../js/talents.js');
const { bossInfo, rng, PLAN_FLOORS } = await import('../js/floors.js');
const { LocalBackend } = await import('../js/storage.js');
const { featureOn } = await import('../js/features.js');
const S = await import('../js/sandbox.js');
const fs = await import('node:fs');
const mk = (cls = 'Blade') => { const h = newHero('Tess', cls); h.hp = null; return C.migrateSave({ version: 2, heroes: [h], gold: 1e6, lastTick: 0, progress: { cleared: [], top3: [], rank1: 0 } }); };
const gmSave = () => { const s = mk('Blade'); s.heroes[0].level = 7; s.heroes[0].gear = 2; G.becomeGm(s, L.legendaryWeaponDps(5), 5); s.ctx = { gm: true }; return s; };
// ---- hidden for normal players: class picker, Wardrobe (all slots, all classes, locked lists), catalog
assert(!(G.GM_CLASS in CLASSES), 'GM not in the class picker');
for (const cls of Object.keys(CLASSES)) for (const slot of C.SLOTS) for (const it of C.itemsFor(slot, cls)) assert(!G.isGmId(it.id), `wardrobe ${slot} ${it.id}`);
assert(!C.CATALOG.some(i => G.isGmId(i.id) || i.value === G.GM_TITLE), 'catalog has no staff items'); assert(!C.DROP_COSMETICS.some(i => G.isGmId(i.id)));
assert.equal(C.byId('gm-title').value, G.GM_TITLE, 'staff items still resolve for rendering');
// ---- strict exclusivity: scan every generator and pool over many seeds
const BAD = [...G.GM_NAMES, G.GM_TITLE, 'gm-', 'Architect', 'Eventide'];
const clean = (x, where) => { const j = JSON.stringify(x); for (const b of BAD) assert(!j.includes(b), `${where} leaked "${b}"`); };
for (let i = 0; i < 4000; i++) { const f = 1 + (i % 100); clean(L.rollItem(rng(i), f, bossInfo(f).lootElement, i, i % 2 ? [0, 0, 0, 0, 0, 1] : null), 'rollItem'); }
for (let i = 0; i < 2000; i++) clean(L.rollDrops({ heroId: 'h' + i, floor: 1 + (i % 100), share: 1, seq: i }), 'rollDrops');
{ const s = mk(); for (let i = 0; i < 300; i++) { clean(L.trickleDrops(s, L.TRICKLE.secs, 1 + (i % 100), Infinity), 'trickle'); s.inv.length = 0; } }
for (let f = 1; f <= 100; f++) for (let b = 0; b < 6; b++) clean(T.shopStock(f, b * T.SHOP_BUCKET_MS), 'shop');
clean([L.ABILITIES, L.ARMOR_ABILITIES, L.DRAWBACKS, L.U_PRE, L.U_BASE, L.U_ABASE, L.U_EPI, L.RARITIES, L.FORBIDDEN], 'Unique pools');
for (let i = 0; i < 3000; i++) clean(L.rollItem(rng(70000 + i), 1 + (i % 100), 'void', i, [0, 0, 0, 0, 0, 1]), 'Unique weapons + armor');
clean([C.CATALOG, C.SLOTS, C.CREATION_SLOTS, Object.keys(CLASSES), TREES], 'catalog/classes/trees');
for (let f = 1; f <= PLAN_FLOORS; f++) clean(bossInfo(f), 'boss plan');
clean(fs.readFileSync(new URL('../preview-bosses.html', import.meta.url), 'utf8'), 'preview page');
// ---- combat parity: base DPS and HP equal the average of the three classes; Eventide = Legendary base of the floor, no ability
{ const s = gmSave(), h = s.heroes[0]; delete h.equip.weapon; const others = Object.keys(CLASSES).map(c => { const x = newHero('x', c); x.level = h.level; x.gear = h.gear; return x; });
  const avg = f => others.reduce((a, x) => a + f(x), 0) / others.length;
  assert(Math.abs(heroDps(h) - avg(heroDps)) < 0.01, `dps parity ${heroDps(h)} vs ${avg(heroDps)}`); assert(Math.abs(heroMaxHp(h) - avg(heroMaxHp)) <= 1, 'hp parity');
  const e = G.eventide(30, L.legendaryWeaponDps(30)); assert.equal(e.name, 'Eventide, the Final Shape'); assert(e.lore.startsWith('System notice: this object has no origin'));
  let leg = null; for (let i = 0; !leg; i++) { const it = L.rollItem(rng(i), 30, 'void', i, [0, 0, 0, 0, 1, 0]); if (it.slot === 'weapon') leg = it; }
  assert.equal(e.stats.dps, +(leg.stats.dps).toFixed(1), 'Legendary parity'); assert.equal(e.rarity, 'legendary'); assert(!e.ability && !e.drawback && Object.keys(e.stats).length === 1, 'no Unique ability');
  assert.equal(TREES[G.GM_CLASS], undefined, 'no talent tree'); }
// ---- rank exclusion: staff shown on a separate line, never ranked, never in a clear ranking
{ globalThis.localStorage = mem(); const be = new LocalBackend(); be._sim = function (w) { w.t = Date.now(); this._adv(w); };
  await be.getFloor(); await be.submitDamage('Staff', 1000, { staff: true }); await be.submitDamage('Tess', 10, {});
  const lb = await be.leaderboard('Staff'); assert(lb[0].staff && lb[0].rank === 0 && lb[0].name === 'Staff'); assert(!lb.slice(1).some(r => r.name === 'Staff'), 'staff not in ranked list');
  assert.equal(lb.filter(r => !r.staff)[0].rank, 1);
  const w = JSON.parse(globalThis.localStorage.getItem('logout.v1.world')); w.hp = 5; globalThis.localStorage.setItem('logout.v1.world', JSON.stringify(w));
  const r = await be.submitDamage('Staff', 100, { staff: true }); assert(r.clears.length && !r.clears[0].ranking.includes('Staff'), 'staff excluded from clear ranking'); assert(r.clears[0].dmg.Staff > 0); }
{ const s = mk(); const got = C.recordClear(s, 1, 0, 1); assert.equal(s.progress.top3.length, 0, 'rank 0 (staff) earns no top-3 unlocks'); assert.equal(s.progress.rank1, 0); }
// ---- unlock: SHA-256 passphrase vs GM_PASS_HASH; empty = disabled; config ships empty
{ const h = await G.sha256hex('test phrase'); assert(/^[0-9a-f]{64}$/.test(h));
  assert(await G.checkPass('test phrase', h)); assert(!(await G.checkPass('wrong', h))); assert(!(await G.checkPass('test phrase', '')), 'empty hash disables'); assert(!(await G.checkPass('', h)));
  const cfg = fs.readFileSync(new URL('../config.js', import.meta.url), 'utf8'); assert(/GM_PASS_HASH = '([0-9a-f]{64})?'/.test(cfg), 'GM_PASS_HASH is empty or a SHA-256 hex'); }
// ---- paste-protection on load + equip refusal
{ const s = gmSave(); delete s.ctx; s.inv.push({ ...G.eventide(3, 1), id: 'gm-eventide' }); assert(G.sanitizeSave(s, false)); const h = s.heroes[0];
  assert.equal(h.cls, 'Blade', 'class restored'); assert(!Object.values(h.look).some(G.isGmId), 'look stripped'); assert(!h.equip.weapon, 'Eventide stripped'); assert(!s.inv.some(i => i.gm), 'bag stripped');
  const v = gmSave(); assert(!G.sanitizeSave(v, true), 'valid staff keeps everything'); assert.equal(v.heroes[0].cls, G.GM_CLASS);
  const n = mk(); n.inv.push(G.eventide(3, 1)); assert.equal(L.equipItem(n, 0), false, 'equip refused without the staff flag'); n.ctx = { gm: true }; assert(L.equipItem(n, 0)); }
// ---- perks (only with ctx.gm)
{ const s = gmSave(), h = s.heroes[0], m = heroMaxHp(h); simulate(s, 3600); assert.equal(h.hp ?? m, m, 'no HP drain'); const n = mk(); simulate(n, 3600); assert(n.heroes[0].hp < heroMaxHp(n.heroes[0]));
  assert.equal(T.innCost(50, s), 0, 'inn free'); s.gold = 0; s.heroes[0].hp = 1; assert(T.rest(s, 50) && s.buffs.rested > 0, 'Well Rested still applies');
  const o = gmSave(); o.lastTick = 0; assert.equal(offlineProgress(o, 30 * 3600e3).secs, 24 * 3600, '24h offline cap'); const p = mk(); p.lastTick = 0; assert.equal(offlineProgress(p, 30 * 3600e3).secs, 12 * 3600);
  assert.equal(L.bagSize(gmSave()), 60); assert.equal(L.bagSize(mk()), 20);
  const b = gmSave(); for (let i = 0; i < 59; i++) b.inv.push({ id: 'x' + i }); assert.equal(L.trickleDrops(b, L.TRICKLE.secs, 1, Infinity)[0].salvaged, undefined, 'item fits in the 60-slot bag');
  const r = gmSave(); r.heroes[0].respecs = 5; r.heroes[0].talents = { 'ed-hone': 1 }; assert.equal(respecCost(r.heroes[0], 50, true), 0); const g0 = r.gold; assert(respec(r, 50)); assert.equal(r.gold, g0, 'free respec');
  const d1 = mk(), d2 = mk(); d2.ctx = { decree: true }; const a = simulate(d1, 60), z = simulate(d2, 60); assert(Math.abs(z.gold / a.gold - 1.05) < 1e-9 && Math.abs(z.xp / a.xp - 1.05) < 1e-9, "Shaper's Decree +5%");
  assert(G.shouldAnnounce(null, 3, 0)); assert(!G.shouldAnnounce({ floor: 3, at: 0 }, 3, 5 * 60e3), 'rate limited'); assert(G.shouldAnnounce({ floor: 3, at: 0 }, 3, 11 * 60e3)); assert(G.shouldAnnounce({ floor: 3, at: 0 }, 4, 1));
  assert(featureOn({ x: 'gm' }, 'x', true) && !featureOn({ x: 'gm' }, 'x', false) && featureOn({ x: 'all' }, 'x') && !featureOn({ x: 'off' }, 'x', true) && !featureOn({}, 'x', true));
  const cfg = await import('../config.js'); assert.equal(cfg.FEATURES.bindIdentity, 'gm', 'Bind identity is staff early access'); }
// ---- sandbox: separate state; the real save and the floor state stay byte-identical
{ globalThis.localStorage = mem(); const be = new LocalBackend(); be._sim = function (w) { w.t = 1; this._adv(w); }; await be.getFloor();
  const save = gmSave(); const before = JSON.stringify(save), world = globalThis.localStorage.getItem('logout.v1.world');
  let sb = S.openSandbox(save); for (const f of [1, 10, 37, 95, 100]) { S.sandboxFloor(sb, f); S.sandboxFight(sb, 30); S.sandboxLoot(sb, 3); S.sandboxLoot(sb, 1, [0, 0, 0, 0, 0, 1]); }
  assert(sb.items.length === 20 && sb.items.every(i => i.sandbox && i.id.startsWith('sandbox-')), 'test items tagged'); const items = sb.items; sb = S.closeSandbox(sb); assert.equal(items.length, 0, 'removed on close');
  assert.equal(JSON.stringify(save), before, 'real save untouched'); assert.equal(globalThis.localStorage.getItem('logout.v1.world'), world, 'floor state untouched'); }
console.log('gm tests passed');

// ---- regression: local-unlock GM with online mode on (iPhone report: HP 1/192, "Worn down · DPS ½")
{ const { effectiveDps, isWorn } = await import('../js/game.js'); const { SupabaseBackend } = await import('../js/supabase.js');
  const s = gmSave(), h = s.heroes[0]; h.hp = 1; // drained before the unlock / by an older build
  const full = { ...gmSave() }; full.heroes[0].hp = null;
  assert.equal(effectiveDps(s), effectiveDps(full), 'no worn-down DPS penalty for staff even at 1 HP');
  simulate(s, 1); assert.equal(h.hp, heroMaxHp(h), 'live tick restores staff to full HP'); assert(!isWorn(h));
  h.hp = 1; s.lastTick = Date.now() - 6 * 3600e3; offlineProgress(s, Date.now()); assert.equal(h.hp ?? heroMaxHp(h), heroMaxHp(h), 'offline / background catch-up: full HP');
  // nothing (save, name or damage) leaves the device while the staff unlock is local-only
  const calls = [], sb = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', is_anonymous: true } } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => { const a = { select: () => a, eq: () => a, order: () => a, limit: () => a, maybeSingle: async () => ({ data: null }), single: async () => ({ data: { id: 1, floor: 1, hp: 100, max_hp: 100, max_floor: 10 } }), then: r => r({ data: [] }), upsert: async row => (calls.push(['upsert', JSON.stringify(row)]), {}) }; return a; },
    rpc: async (fn, a) => (calls.push(['rpc', fn, JSON.stringify(a)]), { data: { floor: 1, hp: 100, max_hp: 100 } }) };
  const be = new SupabaseBackend(sb, { storage: mem() }); await be.init(); be.holdUploads = true; h.name = 'Nick';
  await be._push(s); await be.saveSave(s); await be.submitDamage(h.name, 5000, { ...h, staff: true });
  assert(!calls.some(c => c[0] === 'upsert' || c[1] === 'submit_damage'), 'no save push or damage submit'); assert(!JSON.stringify(calls).includes('Nick'), 'GM name never sent');
  console.log('ok local-unlock staff online: full HP, no penalty, nothing uploaded'); }
// ---- staff items DISPLAY as Unique but are not generated Uniques
{ const G2 = await import('../js/gm.js'), L2 = await import('../js/loot.js'), T2 = await import('../js/town.js'), GM2 = await import('../js/game.js');
  const ev = G2.eventide(30, L2.legendaryWeaponDps(30)); assert.equal(ev.show, 'unique'); assert.equal(ev.rarity, 'legendary', 'internal rarity stays Legendary (parity, no Unique machinery)');
  assert.equal(ev.stamp, 'Forged before Floor 1'); assert(!ev.serial && !ev.ability && !ev.drawback, 'no serial / ability / drawback'); assert.equal(ev.stats.dps, L2.legendaryWeaponDps(30));
  assert(!T2.sellable(ev), 'never sellable');
  const s = { heroes: [GM2.newHero('A', 'Blade')], inv: [L2.forgeUnique(10, 'fire', 'stillness', 'dull')], gold: 0 }; s.heroes[0].equip = { weapon: ev };
  assert(L2.equipItem(s, 0)); assert.equal(s.heroes[0].equip.weapon, ev, 'Eventide is outside the one-Unique rule'); assert.equal(s.heroes[0].equip.armor.rarity, 'unique');
  assert.deepEqual([...GM2.effectsOf(s.heroes[0])].sort(), ['dull', 'stillness']);
  for (let i = 0; i < 2000; i++) { const it = L2.rollItem(rng(90000 + i), 1 + i % 100, 'void', i, [0, 0, 0, 0, 0, 1]); assert(!it.gm && it.stamp !== G2.STAFF_STAMP && it.name !== ev.name); } }
console.log('gm display-as-Unique checks passed');


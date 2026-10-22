// Guild Hub: rules, LocalBackend flow (presence visibility, race champion, bank buffs), Supabase wiring (mock), panel gating, flag = 'gm'.
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem();
const H = await import('../js/guildhub.js');
const { LocalBackend } = await import('../js/storage.js');
const { SupabaseBackend } = await import('../js/supabase.js');
const { renderGuildV2, setGuildTab } = await import('../js/guildpanel.js');
const { presenceHtml, raceHtml, buffsHtml } = await import('../js/guildhubui.js');
const { layerMul, newHero } = await import('../js/game.js');
const { FEATURES } = await import('../config.js'); const { featureOn } = await import('../js/features.js');
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
// ---- flag: staff preview only
assert.equal(FEATURES.guildHub, 'gm'); assert.equal(featureOn(FEATURES, 'guildHub', false), false); assert.equal(featureOn(FEATURES, 'guildHub', true), true);
// ---- rules
const t0 = Date.parse('2026-10-22T12:00:00Z');
assert.deepEqual(H.presenceOf({ floor: 21, seen: new Date(t0 - 60e3).toISOString() }, t0), { online: true, floor: 21, label: 'online' });
assert.equal(H.presenceOf({ floor: 20, seen: new Date(t0 - 181e3).toISOString() }, t0).online, false);
assert.equal(H.presenceOf({ floor: 20, seen: new Date(t0 - 3 * 3600e3).toISOString() }, t0).label, 'last seen 3h ago');
assert.equal(H.presenceOf(null), null); assert.equal(presenceHtml(null), '');
assert.equal(H.canSeePresence(1, 1), true); assert.equal(H.canSeePresence(1, 2), false); assert.equal(H.canSeePresence(null, null), false); assert.equal(H.canSeePresence(null, null, true), true);
assert.equal(H.checkBuff('dmg5', { role: 'member', bank: 1e6 }).reason, 'officers and the leader only');
assert.equal(H.checkBuff('dmg5', { role: 'officer', bank: 10 }).reason, 'not enough gold in the bank');
assert.equal(H.checkBuff('dmg5', { role: 'leader', bank: 1e6, staffGuild: true }).reason, 'a staff guild has no bank');
assert.equal(H.checkBuff('dmg5', { role: 'leader', bank: 1e6, active: [{ kind: 'dmg', until: new Date(Date.now() + 1e6).toISOString() }] }).reason, 'that buff is already active');
assert.ok(H.checkBuff('dmg5', { role: 'officer', bank: 1e6 }).ok);
for (const b of Object.values(H.BUFFS)) assert.ok(b.pct <= H.MAX_DMG_PCT && b.price > 0, 'buff catalogue capped');
assert.equal(H.buffDmgMul({ gbDmg: 5, gbUntil: Date.now() + 1e5 }), 1.05); assert.equal(H.buffDmgMul({ gbDmg: 50, gbUntil: Date.now() + 1e5 }), 1.05, 'client cap');
assert.equal(H.buffDmgMul({ gbDmg: 5, gbUntil: Date.now() - 1 }), 1, 'expired'); assert.equal(H.buffDmgMul({ gm: true, gbDmg: 5, gbUntil: Date.now() + 1e5 }), 1, 'staff never');
{ const s = { heroes: [newHero('T', 'Blade')], ctx: {} }, base = layerMul(s); s.ctx.gbDmg = 5; s.ctx.gbUntil = Date.now() + 1e5; assert.ok(Math.abs(layerMul(s) / base - 1.05) < 1e-9, 'buff in the damage maths'); }
assert.deepEqual(H.raceBoard([{ name: 'A', damage: 5 }, { name: 'B', damage: 9 }, { name: 'S', damage: 999, staff: true }], [{ name: 'A', guild_id: 1 }, { name: 'B', guild_id: 2 }, { name: 'S', guild_id: 1 }, { name: 'Z', guild_id: 3 }],
  [{ id: 1, name: 'One', tag: 'ONE' }, { id: 2, name: 'Two', tag: 'TWO' }, { id: 3, name: 'Three', tag: 'THR' }, { id: 4, name: 'Staff', tag: 'ZERO', is_staff: true }]).map(r => [r.tag, r.damage]), [['TWO', 9], ['ONE', 5]], 'staff rows out, no-damage guilds out');
// ---- LocalBackend
const be = new LocalBackend(); await be.createGuild('Lantern Watch', 'LW', { name: 'Tess', staff: false });
let I = await be.guildInfo(); const g = be._g(); g.members.push({ name: 'Wren', guild_id: I.guild.id, role: 'officer', last_active: new Date(Date.now() - 7200e3).toISOString() }); be._sg(g);
const other = g.members.find(m => m.guild_id !== I.guild.id)?.name; assert.ok(other, 'a stranger in another guild');
const pr = await be.guildPresence(['Tess', 'Wren', other]); assert.deepEqual(Object.keys(pr).sort(), ['Tess', 'Wren'], 'stranger hidden'); assert.equal(H.presenceOf(pr.Wren).online, false); assert.equal(H.presenceOf(pr.Tess).online, true);
assert.match(await err(be.guildBuyBuff('dmg5')), /not enough gold/);
{ const g2 = be._g(); g2.guilds.find(x => x.id === I.guild.id).bank = 50000; be._sg(g2); }
await be.guildBuyBuff('dmg5'); let hub = await be.guildHub(); assert.equal(hub.buffs.length, 1); assert.equal(hub.buffs[0].pct, 5); I = await be.guildInfo(); assert.equal(I.guild.bank, 10000); assert.equal(I.ledger[0].kind, 'spend');
assert.match(await err(be.guildBuyBuff('dmg5')), /already active/);
// race: Tess tops the floor; when it falls LW is champion
{ const w = be._w(); for (const k of Object.keys(w.dmg)) w.dmg[k] = 1; w.dmg.Tess = 1e9; be._sw(w); }
hub = await be.guildHub(); assert.equal(hub.live[0].tag, 'LW'); const f = hub.floor; be._ghClear(f, be._w().dmg, {}); assert.equal((await be.guildHub()).champion, null, 'title only once the floor has fallen'); { const w = be._w(); w.floor = f + 1; be._sw(w); } hub = await be.guildHub(); assert.equal(hub.champion.tag, 'LW'); assert.equal(hub.champion.floor, f);
// ---- Supabase wiring (mock)
const calls = []; const sb = { rpc: async (fn, a) => { calls.push([fn, a]); return { data: fn === 'guild_presence' ? { Wren: { floor: 3, seen: new Date().toISOString() } } : {}, error: null }; } };
const sbe = Object.assign(Object.create(SupabaseBackend.prototype), { sb, holdUploads: false });
await sbe.guildHub(); await sbe.guildBuyBuff('dmg5'); const sp = await sbe.guildPresence(Array.from({ length: 80 }, (_, i) => 'n' + i));
assert.deepEqual(calls.map(c => c[0]), ['guild_hub', 'guild_buy_buff', 'guild_presence']); assert.equal(calls[2][1].p_names.length, 50, 'capped request'); assert.ok(sp.Wren);
sbe.holdUploads = true; assert.deepEqual(await sbe.guildPresence(['x']), {}, 'local staff unlock sends nothing');
// ---- panel: no hub → no Race tab, no buffs, old Seen column (what regular players get while the flag is 'gm')
const el = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null, closest: () => null, isConnected: true };
I = await be.guildInfo(); setGuildTab('members'); renderGuildV2(I, { be, save: { gold: 0 }, el, name: 'Tess', staff: false, log() {}, refresh() {} });
assert.ok(!/data-tab="race"/.test(el.innerHTML)); assert.ok(/<th>Seen<\/th>/.test(el.innerHTML));
renderGuildV2(I, { hub: { ...hub, presence: pr }, be, save: { gold: 0 }, el, name: 'Tess', staff: false, log() {}, refresh() {} });
assert.ok(/data-tab="race"/.test(el.innerHTML)); assert.ok(/Floor · status/.test(el.innerHTML)); assert.ok(/pres on/.test(el.innerHTML)); assert.ok(/Race Champion/.test(el.innerHTML));
assert.ok(/data-buff/.test(buffsHtml(hub, { mgr: true, bank: 1e6 })) && /Active/.test(buffsHtml(hub, { mgr: true, bank: 1e6 }))); assert.ok(/Guild race · Floor/.test(raceHtml(hub, I.guild.id)));
console.log('guild hub ok');

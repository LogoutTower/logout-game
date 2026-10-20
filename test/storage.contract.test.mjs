// Storage-interface contract: the same suite runs against LocalBackend and a mocked SupabaseBackend.
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() }; };
globalThis.localStorage = mem();
const { LocalBackend, onlineConfigured } = await import('../js/storage.js');
const { SupabaseBackend, mergeSaves, holderStatus, FLUSH_MS } = await import('../js/supabase.js');
const { floorBossHp } = await import('../js/floors.js');
// ---- mock Supabase client: tables in memory + a JS model of submit_damage (mirrors schema.sql incl. staff exclusion)
function mockClient({ role = 'player' } = {}) {
  const T = { profiles: [], saves: [], floor_state: [{ id: 1, floor: 1, hp: floorBossHp(1), max_hp: floorBossHp(1), max_floor: 10, gm_present_until: null, gm_announce: null }], damage: [], floor_clears: [] };
  let user = null, nextClear = 1; const calls = [];
  const q = (name) => { const st = { f: [], ord: null, lim: null }; const rows = () => { let r = T[name].filter(x => st.f.every(([k, op, v]) => op === 'eq' ? x[k] === v : x[k] > v)); if (st.ord) r = [...r].sort((a, b) => st.ord.asc ? a[st.ord.k] - b[st.ord.k] : b[st.ord.k] - a[st.ord.k]); return st.lim ? r.slice(0, st.lim) : r; };
    const api = { select: () => api, eq: (k, v) => (st.f.push([k, 'eq', v]), api), gt: (k, v) => (st.f.push([k, 'gt', v]), api), order: (k, o = {}) => (st.ord = { k, asc: o.ascending !== false }, api), limit: n => (st.lim = n, api),
      maybeSingle: async () => ({ data: rows()[0] || null }), single: async () => ({ data: rows()[0] }), then: (res, rej) => Promise.resolve({ data: rows() }).then(res, rej),
      upsert: async (row) => { calls.push(['upsert', name]); const i = T[name].findIndex(x => x.user_id === row.user_id); if (i >= 0) T[name][i] = row; else T[name].push(row); return {}; } };
    return api; };
  let uid = 0; const newUser = (anon) => { const u = { id: 'u' + (++uid), is_anonymous: anon }; T.profiles.push({ id: u.id, role }); return u; };
  return { T, calls,
    auth: { getSession: async () => ({ data: { session: user ? { user } : null } }),
      getUser: async () => { if (T.netDown) throw new TypeError('Load failed'); return user && !(T.deleted || []).includes(user.id) ? { data: { user } } : { data: { user: null }, error: { status: 403, message: 'User from sub claim in JWT does not exist' } }; }, signInAnonymously: async () => { user = newUser(true); return { data: { session: { user } } }; },
      signInWithWeb3: async ({ chain, statement, wallet }) => { calls.push(['web3', chain, statement]); const key = wallet?.key || 'w'; T.wallets ||= {};
        user = T.wallets[key] ||= Object.assign(newUser(false), { app_metadata: { provider: 'web3' } }); return { data: { user, session: { user } } }; },
      updateUser: async ({ email }) => { calls.push(['updateUser', email]); return {}; }, signInWithOtp: async ({ email }) => { calls.push(['otp', email]); return {}; }, signOut: async () => { user = null; return {}; } },
    from: q,
    rpc: async (fn, a) => { calls.push(['rpc', fn]);
      if (fn === 'wallet_link_issue') { T.codes ||= {}; const c = 'c' + Object.keys(T.codes).length; T.codes[c] = user.id; return { data: c }; }
      if (fn === 'wallet_link_claim') { const src = T.codes?.[a.p_code]; delete T.codes[a.p_code]; if (T.saves.some(x => x.user_id === user.id)) return { data: { moved: false, reason: 'existing' } };
        T.saves.filter(x => x.user_id === src).forEach(x => x.user_id = user.id); const p = T.profiles.find(x => x.id === src); if (p) { T.profiles = T.profiles.filter(x => x.id !== user.id); p.id = user.id; } return { data: { moved: true } }; }
      if (fn !== 'submit_damage') return { data: null };
      const fs = T.floor_state[0], staff = T.profiles.find(p => p.id === user.id).role === 'gm', acc = Math.max(0, a.p_amount);
      let d = T.damage.find(x => x.user_id === user.id && x.floor === fs.floor); if (!d) T.damage.push(d = { user_id: user.id, floor: fs.floor, name: a.p_name, damage: 0, is_staff: staff }); d.damage += acc; fs.hp -= acc;
      while (fs.hp <= 0 && fs.floor < fs.max_floor) { const over = -fs.hp, on = T.damage.filter(x => x.floor === fs.floor);
        T.floor_clears.push({ id: nextClear++, floor: fs.floor, max_hp: fs.max_hp, ranking: on.filter(x => !x.is_staff).sort((x, y) => y.damage - x.damage).map(x => x.name), dmg: Object.fromEntries(on.map(x => [x.name, x.damage])) });
        fs.floor++; fs.max_hp = floorBossHp(fs.floor); fs.hp = fs.max_hp - over; }
      return { data: { floor: fs.floor, hp: fs.hp, max_hp: fs.max_hp, accepted: acc, gm_present_until: null } }; } };
}
async function contract(name, make, flush = async () => {}) {
  globalThis.localStorage = mem(); const { be } = await make();
  await be.init?.();
  assert.equal(await be.loadSave(), null, `${name}: no save at first`);
  const s = { version: 5, gold: 7, heroes: [{ name: 'Tess', level: 3, gear: 1 }], lastTick: 1 }; await be.saveSave(s);
  assert.equal((await be.loadSave()).gold, 7, `${name}: save round-trips`);
  const f = await be.getFloor(); assert(f.floor >= 1 && f.maxHp === floorBossHp(f.floor) && f.hp > 0 && f.hp <= f.maxHp, `${name}: floor shape`);
  let r = await be.submitDamage('Tess', 100, s.heroes[0]); await flush(be); r = await be.submitDamage('Tess', 0, s.heroes[0]);
  assert(r.floor >= 1 && typeof r.hp === 'number' && Array.isArray(r.clears), `${name}: submit result shape`);
  const lb = await be.leaderboard('Tess'); assert(lb.some(x => x.name === 'Tess' && x.damage >= 100), `${name}: player on the leaderboard ${JSON.stringify(lb.slice(-2))}`);
  const big = (await be.getFloor()).hp + 10; await be.submitDamage('Tess', big, s.heroes[0]); await flush(be); r = await be.submitDamage('Tess', 0, s.heroes[0]);
  const all = [...(r.clears || [])]; assert.equal(r.floor, f.floor + 1, `${name}: floor advanced`); if (name !== 'local') assert(all.some(c => c.floor === f.floor && c.ranking[0] === 'Tess'), `${name}: clear reported with ranking`);
  return be;
}
await contract('local', async () => { const be = new LocalBackend(); be._sim = function (w) { w.t = Date.now(); this._adv(w); }; return { be }; }); // no random fake-player damage in the contract run
let t = 1e9; const advance = async () => { t += FLUSH_MS; };
const mc = mockClient();
const sb = await contract('supabase', async () => ({ be: new SupabaseBackend(mc, { storage: globalThis.localStorage, now: () => t }) }), advance);
// ---- Supabase specifics
assert(mc.T.profiles[0] && sb.isAnonymous(), 'guest-first: anonymous sign-in on init');
{ const rpcs = mc.calls.filter(c => c[0] === 'rpc' && c[1] === 'submit_damage').length; await sb.submitDamage('Tess', 5, {}); await sb.submitDamage('Tess', 5, {}); assert.equal(mc.calls.filter(c => c[0] === 'rpc' && c[1] === 'submit_damage').length, rpcs, 'damage batched (no RPC inside 30s)');
  t += FLUSH_MS; await sb.submitDamage('Tess', 5, {}); assert.equal(mc.calls.filter(c => c[0] === 'rpc' && c[1] === 'submit_damage').length, rpcs + 1, 'flushed after 30s'); }
assert.equal(mergeSaves({ updatedAt: 5, a: 1 }, { updatedAt: 3, a: 2 }).a, 1); assert.equal(mergeSaves({ updatedAt: 3, a: 1 }, { updatedAt: 5, a: 2 }).a, 2); assert.equal(mergeSaves(null, { a: 2 }).a, 2); assert.equal(mergeSaves({ a: 1 }, null).a, 1);
{ // first wallet bind: local progress is merged into the new account's cloud save
  globalThis.localStorage = mem(); const c = mockClient(), be = new SupabaseBackend(c, { storage: globalThis.localStorage, now: () => t }); await be.init();
  await be.saveSave({ version: 5, gold: 42, heroes: [{ name: 'A' }] }); await be.bindWallet({});
  const web3 = c.calls.find(x => x[0] === 'web3'); assert.equal(web3[1], 'solana'); assert(/signature only/.test(web3[2]) && /does not send a transaction/.test(web3[2]), 'signature-only statement');
  assert(!be.isAnonymous()); assert.equal(c.T.saves.find(s => s.user_id === be.user.id).data.gold, 42, 'local merged into cloud on bind');
  assert(c.calls.some(x => x[1] === 'wallet_link_issue') && c.calls.some(x => x[1] === 'wallet_link_claim'), 'wallet attaches through a link code');
  // device 2: a different guest connects the same wallet and loads the linked account; its own guest save never overwrites it
  const wid = be.user.id; const b2 = new SupabaseBackend(c, { storage: mem(), now: () => t + 1e6 });
  await c.auth.signOut(); await b2.init(); await b2.saveSave({ version: 5, gold: 1, heroes: [{ name: 'guest' }] }); const r2 = await b2.bindWallet({});
  assert.equal(b2.user.id, wid, 'same account'); assert.equal(r2.mode, 'signedin'); assert.equal(r2.save.gold, 42, 'linked save wins on device 2');
  assert.equal(c.T.saves.find(s => s.user_id === wid).data.gold, 42);
  await be.bindEmail('x@example.invalid'); assert(c.calls.some(x => x[0] === 'otp'), 'magic link when already bound');
  const g = new SupabaseBackend(mockClient(), { storage: mem(), now: () => t }); await g.init(); await g.bindEmail('y@example.invalid'); assert(g.sb.calls.some(x => x[0] === 'updateUser'), 'anonymous → email upgrade keeps the user');
  await be.sever(); assert.equal(be.user, null); assert.equal(globalThis.localStorage.getItem('logout.v1.save'), null, 'sever link clears the local cache');
}
{ // staff rows are listed separately and never ranked
  globalThis.localStorage = mem(); const c = mockClient({ role: 'gm' }), be = new SupabaseBackend(c, { storage: globalThis.localStorage, now: () => t }); await be.init(); assert(be.isGm(), 'role comes from the server profile');
  await be.submitDamage('Staff', 50, {}); t += FLUSH_MS; await be.submitDamage('Staff', 0, {}); const lb = await be.leaderboard('Staff'); assert(lb[0].staff && lb[0].rank === 0 && !lb.some(r => !r.staff && r.name === 'Staff'), 'GM in staff line');
}
// ---- existing local-mode save carries over into the new guest account (not wiped or reset)
{ globalThis.localStorage = mem(); const lb = new LocalBackend(); await lb.saveSave({ version: 5, gold: 1234, heroes: [{ name: 'Old', level: 9, gear: 3 }], lastTick: 5 });
  const c = mockClient(), be = new SupabaseBackend(c, { storage: globalThis.localStorage, now: () => t }); await be.init(); const s = await be.loadSave();
  assert.equal(s.gold, 1234); assert.equal(s.heroes[0].level, 9, 'local save kept'); assert.equal(c.T.saves[0].data.gold, 1234, 'and uploaded to the guest cloud save');
  assert.equal(mergeSaves({ updatedAt: 5, a: 1 }, { updatedAt: 5, a: 2 }).a, 1, 'tie keeps local'); }
// ---- staff data never reaches the server without the server role; local copy keeps it
{ globalThis.localStorage = mem(); await import('../js/gm.js'); const c = mockClient(), be = new SupabaseBackend(c, { storage: globalThis.localStorage, now: () => t }); await be.init();
  const s = { version: 5, gold: 1, inv: [{ id: 'gm-eventide', gm: true }], heroes: [{ name: 'S', cls: 'GameMaster', prevCls: 'Blade', look: { title: 'gm-title' }, equip: { weapon: { id: 'gm-eventide', gm: true } } }] };
  t += FLUSH_MS; await be.saveSave(s); const cloud = c.T.saves[0].data; assert.equal(cloud.heroes[0].cls, 'Blade'); assert(!JSON.stringify(cloud).includes('gm-'), 'cloud copy stripped');
  assert.equal(JSON.parse(globalThis.localStorage.getItem('logout.v1.save')).heroes[0].cls, 'GameMaster', 'local copy intact');
  const g = mockClient({ role: 'gm' }), gb = new SupabaseBackend(g, { storage: mem(), now: () => t }); await gb.init(); await gb._push(s); assert.equal(g.T.saves[0].data.heroes[0].cls, 'GameMaster', 'server role may store staff data'); }
// ---- unreachable / rate-limited server: damage kept and retried, cached floor served, no throw
{ globalThis.localStorage = mem(); const c = mockClient(), be = new SupabaseBackend(c, { storage: globalThis.localStorage, now: () => t }); await be.init(); await be.getFloor();
  const realRpc = c.rpc, realFrom = c.from; c.rpc = async () => ({ error: { message: 'rate limited', status: 429 } }); c.from = n => { const q = realFrom(n); q.single = async () => ({ error: { message: 'down' } }); return q; };
  t += FLUSH_MS * 2; const r = await be.submitDamage('X', 500, {}); assert(r.offline && r.accepted === 0 && be.pending === 500, 'damage kept for retry'); assert(r.floor >= 1, 'cached floor');
  c.rpc = realRpc; c.from = realFrom; t += FLUSH_MS; const r2 = await be.submitDamage('X', 0, {}); assert.equal(r2.accepted, 500, 'retried after recovery'); }
{ // makeBackend falls back to local play when the client library/server cannot be reached (here: node cannot import the CDN module)
  const cfg = await import('../config.js'); const st = await import('../js/storage.js'); globalThis.localStorage = mem();
  const be = await st.makeBackend(); assert.equal(be.name, cfg.FEATURES.online === 'all' ? 'local' : 'local', 'falls back to LocalBackend'); }
// ---- holder check: read-only RPC call, disabled while mint is empty
assert.deepEqual(await holderStatus('Owner1', { mint: '' }), { enabled: false, holder: false, amount: 0 });
{ let body; const fetchFn = async (u, o) => { body = JSON.parse(o.body); return { json: async () => ({ result: { value: [{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: 1500 } } } } } }] } }) }; };
  const h = await holderStatus('Owner1', { rpc: 'https://rpc.invalid', mint: 'Mint1', threshold: 1000, fetchFn }); assert(h.holder && h.amount === 1500); assert.equal(body.method, 'getTokenAccountsByOwner', 'read-only method');
  assert(!(await holderStatus('Owner1', { rpc: 'x', mint: 'Mint1', threshold: 2000, fetchFn })).holder); }
// ---- off by default: the live config never goes online until the flag is flipped
assert.equal(onlineConfigured('', '', { online: 'all' }), false); assert.equal(onlineConfigured('u', 'k', { online: 'all' }), true);
console.log('storage contract tests passed');

// ---- stale guest: the stored anon session's user was deleted server-side (cleanup SQL) -> fresh guest, local save kept
{
  globalThis.localStorage = mem(); const c = mockClient();
  const a = new SupabaseBackend(c, { storage: globalThis.localStorage }); await a.init(); const oldId = a.user.id;
  const local = { version: 9, heroes: [{ name: 'Tess', level: 7, xp: 3, gold: 120 }], updatedAt: 1000 };
  globalThis.localStorage.setItem('logout.v1.save', JSON.stringify(local));
  c.T.deleted = [oldId]; c.T.saves = c.T.saves.filter(r => r.user_id !== oldId);
  const b = new SupabaseBackend(c, { storage: globalThis.localStorage }); await b.init();
  assert.notEqual(b.user.id, oldId, 'stale guest replaced by a fresh one'); assert.ok(b.recovered && b.isAnonymous());
  const s = await b.loadSave(); assert.equal(s.heroes[0].name, 'Tess'); assert.equal(s.heroes[0].level, 7, 'local save kept');
  assert.ok(c.T.saves.some(r => r.user_id === b.user.id && r.data.heroes[0].level === 7), 'local save uploaded to the fresh guest');
  // a network blip while validating is NOT treated as a dead session
  c.T.netDown = true; const d = new SupabaseBackend(c, { storage: globalThis.localStorage }); await d.init(); assert.equal(d.user.id, b.user.id); assert.ok(!d.recovered);
  console.log('ok stale guest session recovers with local save');
}

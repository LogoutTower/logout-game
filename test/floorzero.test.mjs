// Floor Zero (offline): exclusive "zero" sigil, its locked black/gold pair, graceful display before the SQL runs, prestige-only XP.
import assert from 'node:assert';
const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = mem();
const R = await import('../js/guildsv2.js');
const { bannerIcon, SIGIL_ROWS, SIGIL_ROWS_2X } = await import('../js/banner.js');
const { LocalBackend } = await import('../js/storage.js');
const { guildMul } = await import('../js/game.js');
const err = async p => { try { await p; } catch (e) { return e.message; } return null; };
// ---- art: 7x7 and 14x14 renders, distinct from every player sigil
assert.equal(SIGIL_ROWS.zero.length, 7); assert(SIGIL_ROWS.zero.every(r => r.length === 7)); assert.equal(SIGIL_ROWS_2X.zero.length, 14); assert(SIGIL_ROWS_2X.zero.every(r => r.length === 14));
assert(!R.SIGILS.includes('zero'), 'never in the player sigil list'); assert(!R.PALETTE.includes(R.ZERO_BANNER.c1) && !R.PALETTE.includes(R.ZERO_BANNER.c2), 'its colours are outside the player palette');
assert.notEqual(bannerIcon(R.ZERO_BANNER), bannerIcon(R.ZERO_BANNER, true), '2x render differs'); assert.equal(bannerIcon(R.DEFAULT_BANNER, true), bannerIcon(R.DEFAULT_BANNER), 'no 2x for other sigils: same art');
// ---- exclusivity rules
assert.equal(R.checkBanner({ sigil: 'zero', c1: '#e8b923', c2: '#050505' }, 21, 3).reason, 'that sigil belongs to Floor Zero');
assert.equal(R.checkBanner({ sigil: 'tower', c1: '#050505', c2: '#e8b923' }, 21, 3).reason, 'that sigil belongs to Floor Zero', 'pair locked');
assert.deepEqual(R.checkBanner({ sigil: 'zero', c1: '#ffd76a', c2: '#2a1450' }, 1, 0, true).banner, R.ZERO_BANNER, 'staff: palette forced');
assert.equal(R.checkBanner({ sigil: 'moon', c1: '#ffd76a', c2: '#2a1450' }, 1, 0, true).ok, true);
// ---- graceful before the SQL: a staff guild on the old default still draws the zero banner; players never do
assert.deepEqual(R.displayBanner(R.DEFAULT_BANNER, true), R.ZERO_BANNER); assert.deepEqual(R.displayBanner(R.DEFAULT_BANNER, false), R.DEFAULT_BANNER);
assert.deepEqual(R.displayBanner({ sigil: 'moon', c1: '#ffd76a', c2: '#2a1450' }, true).sigil, 'moon', 'a chosen banner is respected');
// ---- local backend: default banner, picker exclusivity, prestige XP
const be = new LocalBackend();
const sg = await be.createGuild('Floor Zero', 'ZERO', { name: 'Warden', staff: true }); assert.deepEqual(sg.banner, R.ZERO_BANNER, 'default banner');
be._gv2Damage('Warden', 300000, true); let I = await be.guildInfo();
assert.equal(I.guild.xp, 300000, 'GM damage counts for the staff guild'); assert.equal(I.guild.level, R.levelOf(300000)); assert.equal(I.guild.slots, R.slotsOf(I.guild.level)); assert.equal(I.guild.hall_display, R.staffHall(I.guild.level));
assert.equal(I.guild.bonus_pct, 0); assert.deepEqual(I.quests, []); assert.equal(I.guild.bank, 0); assert.equal(I.guild.prestige, true);
assert.match(await err(be.guildUpgrade('bonus')), /no bank/); assert.match(await err(be.guildDonate(5, { gold: 99 })), /no bank/);
assert(!(await be.guildBoard(true)).some(b => b.tag === 'ZERO'), 'off the leaderboard');
assert.equal(guildMul({ ctx: { guild: false, guildPct: 0 } }), 1, 'no bonus in play');
await be.guildSetBanner('moon', '#ffd76a', '#2a1450'); await be.guildSetBanner('zero', '#000', '#fff'); assert.deepEqual((await be.guildInfo()).guild.banner, R.ZERO_BANNER);
assert.equal((await be.guildTags()).Warden.banner.sigil, 'zero');
// a player guild can't take it, and a GM's damage still adds nothing to a player guild
{ const g = be._g(); g.me = null; be._sg(g); } const pg = await be.createGuild('Lantern Watch', 'LW', { name: 'Tess', staff: false });
assert.equal(await err(be.guildSetBanner('zero', '#e8b923', '#050505')), 'that sigil belongs to Floor Zero');
{ const g = be._g(); g.members.push({ name: 'Keeper', guild_id: pg.id, is_staff: true }); be._sg(g); } be._gv2Damage('Keeper', 50000, true); assert.equal((await be.guildInfo()).guild.xp, 0);
assert.equal(R.staffHall(1), 0); assert.equal(R.staffHall(5), 1); assert.equal(R.staffHall(21), 5);
console.log('floor zero tests passed');

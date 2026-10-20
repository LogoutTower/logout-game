// The Glitch Den: a gold-only casino in town (a gold sink). Mirrors supabase/schema-addendum-casino.sql.
// GOLD ONLY: never the token, wallets, creator fees or anything with real value; nothing is bought with money.
// Online the SERVER rolls and moves the gold (casino_play, one RPC per spin, never inside tick()); this file only mirrors the
// rules for display and runs them on this browser in local/offline mode. Winnings are gold: never boss damage, rankings or quests.
import { baseHp } from './floors.js';
export const DEN_LINE = 'Gold only. No real money, no token.';
export const FLIP_MULT = 1.94, DICE_RTP = 96, CD_MS = 1500, MIN_BET = 10;
export const WHEEL = [{ l: 'JACKPOT', w: 4, m: 25 }, { l: '×5', w: 20, m: 5 }, { l: '×2', w: 120, m: 2 }, { l: '×1.5', w: 200, m: 1.5 }, { l: '×0.5', w: 420, m: 0.5 }, { l: 'GLITCH', w: 236, m: 0 }];
export const EDGE = { flip: 1 - FLIP_MULT / 2, dice: 1 - DICE_RTP / 100, wheel: 1 - WHEEL.reduce((s, x) => s + x.w * x.m, 0) / 1000 };
const tier = f => baseHp(Math.max(1, f)) / baseHp(1);
/** Limits on floor f (mirrors casino_limits): max bet 2,000g × floor tier, daily wager 50 × max bet, 1.5 s cooldown. */
export const denLimits = f => { const max = Math.round(2000 * tier(f) / 10) * 10; return { min: MIN_BET, max, lim: max * 50, cd: CD_MS }; };
export const diceChance = pick => pick > 0 ? 100 - pick : pick < 0 ? -pick - 1 : 0;
export const diceMult = chance => Math.floor(9600 / chance) / 100;
/** Resolve one spin from a raw roll (same maths as the server). roll: flip 0|1, dice 1..100, wheel 0..999. */
export function resolve(game, bet, pick, roll) {
  let m = 0, s = null;
  if (game === 'flip') m = roll === pick ? FLIP_MULT : 0;
  else if (game === 'dice') { const win = (pick > 0 && roll > pick) || (pick < 0 && roll < -pick); m = win ? diceMult(diceChance(pick)) : 0; }
  else { let x = roll; for (s = 0; s < WHEEL.length - 1 && x >= WHEEL[s].w; s++) x -= WHEEL[s].w; m = WHEEL[s].m; }
  const p = Math.floor(bet * m); return { g: game, r: roll, s, w: m > 0, m, p, d: p - bet };
}
export function checkBet(game, bet, pick, lim, used, gold) {
  if (!['flip', 'dice', 'wheel'].includes(game)) return 'unknown game';
  if (!(bet >= lim.min)) return `minimum bet is ${lim.min} gold`; if (bet > lim.max) return `max bet on this floor is ${lim.max} gold`;
  if (game === 'flip' && pick !== 0 && pick !== 1) return 'pick heads or tails';
  if (game === 'dice') { const c = diceChance(pick); if (c < 5 || c > 95) return 'win chance must be 5-95%'; }
  if (used + bet > lim.lim) return `daily wager limit reached (${lim.lim} gold, resets 00:00 UTC)`;
  if (gold < bet) return 'not enough gold'; return null;
}
const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const day = () => new Date().toISOString().slice(0, 10);
/** Backend glue. Local mode plays on this browser; online calls casino_state/casino_play. state() null = the SQL isn't live yet ("opening soon"). */
export function denBackend(be) {
  if (be.name === 'local') return {
    async state(save, f) { const d = save.den?.d === day() ? save.den : { d: day(), used: 0 }; return { ...denLimits(f), f, used: d.used, open: true }; },
    async play(save, f, game, bet, pick) { const st = await this.state(save, f), now = Date.now();
      if (save.den?.t && now - save.den.t < CD_MS) throw new Error('the den is still spinning, wait a moment');
      const e = checkBet(game, bet, pick, st, st.used, Math.floor(save.gold)); if (e) throw new Error(e);
      const r = resolve(game, bet, pick, game === 'flip' ? rnd(2) : game === 'dice' ? 1 + rnd(100) : rnd(1000));
      save.gold += r.d; save.den = { d: day(), used: st.used + bet, t: now }; return { ...r, used: st.used + bet, lim: st.lim, max: st.max }; } };
  return {
    pushed: false,
    async state() { if (be.holdUploads || !be.sb) return null; const { data, error } = await be.sb.rpc('casino_state'); return error ? null : data; },
    async play(save, f, game, bet, pick) { if (be.holdUploads) throw new Error('local staff unlock: nothing is sent');
      if (!this.pushed) { await be._push(save); this.pushed = true; } // once per visit so the server sees today's gold
      const call = () => be.sb.rpc('casino_play', { p_game: game, p_bet: bet, p_pick: pick });
      let { data, error } = await call();
      if (error && /not enough gold/.test(error.message) && save.gold >= bet) { await be._push(save); ({ data, error } = await call()); }
      if (error) throw new Error(error.message); save.gold += Number(data.d); return data; } }; // apply the server's delta; the next save push matches it
}
const fmtN = (n, fmt) => fmt ? fmt(n) : String(n);
/** Den pane HTML. st null = opening soon. */
export function denHtml(st, { gold, fmt, game = 'flip', bet, pick = 0, last = null } = {}) {
  const head = `<div class="den"><h3>The Glitch Den <small>· where Umbra's code leaks</small></h3><p class="denline"><b>${DEN_LINE}</b></p>`;
  if (!st) return head + `<p class="sub">The Den is opening soon. Its tables are still being wired into the tower.</p></div>`;
  const b = Math.min(st.max, Math.max(st.min, bet || st.min)), left = Math.max(0, st.lim - st.used), dc = diceChance(pick);
  const tabs = [['flip', 'Coin Flip'], ['dice', 'Dice'], ['wheel', 'Glitch Wheel']].map(([k, l]) => `<button data-den-g="${k}" aria-pressed="${k === game}">${l}</button>`).join('');
  const body = game === 'flip' ? `<p class="sub">50 / 50 · pays ×${FLIP_MULT}</p><div class="denpick"><button data-den-p="0" aria-pressed="${pick === 0}">Heads</button><button data-den-p="1" aria-pressed="${pick === 1}">Tails</button></div>`
    : game === 'dice' ? `<p class="sub">Roll 1-100. ${pick > 0 ? `Over ${pick}` : `Under ${-pick}`} · ${dc}% to win · pays ×${dc >= 5 && dc <= 95 ? diceMult(dc) : '-'}</p><div class="denpick"><button data-den-m="over" aria-pressed="${pick > 0}">Over</button><button data-den-m="under" aria-pressed="${pick < 0}">Under</button></div><input type="range" id="denDice" min="6" max="95" value="${Math.abs(pick) || 50}" aria-label="Dice target">`
    : `<div class="wheel">${WHEEL.map((s, i) => `<span class="wseg w${i} ${last?.g === 'wheel' && last.s === i ? 'hit' : ''}">${s.l}<small>${(s.w / 10).toFixed(1)}%</small></span>`).join('')}</div>`;
  const res = last ? `<p class="denres ${last.w ? 'win' : 'lose'}" role="status">${last.g === 'flip' ? (last.r ? 'Tails' : 'Heads') : last.g === 'dice' ? `Rolled ${last.r}` : WHEEL[last.s]?.l} · ${last.w ? `+${fmtN(last.p, fmt)}g` : 'the glitch eats your gold'}</p>` : '';
  return head + `<div class="dentabs">${tabs}</div>${body}<div class="denbet"><button data-den-b="half">½</button><input id="denBet" type="number" inputmode="numeric" min="${st.min}" max="${st.max}" value="${b}" aria-label="Bet"><button data-den-b="double">×2</button><button data-den-b="max">Max</button></div>`
    + `<button class="cta" data-den-play ${gold < st.min || left < st.min ? 'disabled' : ''}>${game === 'wheel' ? 'Spin' : game === 'flip' ? 'Flip' : 'Roll'}</button>${res}`
    + `<p class="sub">Max bet ${fmtN(st.max, fmt)}g on this floor · ${fmtN(left, fmt)}g of today's ${fmtN(st.lim, fmt)}g wager left (resets 00:00 UTC). House edge 3-5%. Winnings are gold only and never count toward boss damage or rankings.</p></div>`;
}

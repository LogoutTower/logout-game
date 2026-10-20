// The Glitch Den pane (Town → Den). DOM glue only; the rules and backend live in js/casino.js. main.js calls openDen() when the town opens.
import { denBackend, denHtml } from './casino.js';
let ui = { game: 'flip', pick: 0, bet: 0, last: null, st: undefined, busy: false }, den = null, ctx = null;
const $ = id => document.getElementById(id);
const pickFor = (g, prev) => g === 'flip' ? 0 : g === 'dice' ? (prev && prev !== 0 && Math.abs(prev) >= 6 ? prev : 50) : 0;
function draw() { const el = $('denBody'); if (!el) return; const s = ctx.save();
  el.innerHTML = denHtml(ui.st, { gold: Math.floor(s.gold), fmt: ctx.fmt, game: ui.game, bet: ui.bet, pick: ui.pick, last: ui.last });
  if (ui.st) ui.bet = +($('denBet')?.value || ui.bet); }
/** ctx: { be, save: () => save, floor: () => n, fmt, notice, after: async () => {} (persist + render) } */
export async function openDen(c) {
  ctx = c; if (!den || den.be !== c.be) { den = denBackend(c.be); den.be = c.be; ui.st = undefined; }
  if (ui.st === undefined || ui.st?.f !== c.floor()) { draw(); ui.st = await den.state(c.save(), c.floor()).catch(() => null) || null; }
  draw(); const el = $('denBody'); if (!el) return;
  el.onclick = async e => { const t = e.target.closest('button'); if (!t || ui.busy) return; const d = t.dataset;
    if (d.denG) { ui.game = d.denG; ui.pick = pickFor(ui.game, ui.pick); ui.last = null; return draw(); }
    if (d.denP != null) { ui.pick = +d.denP; return draw(); }
    if (d.denM) { const v = Math.abs(ui.pick) || 50; ui.pick = d.denM === 'over' ? v : -v; return draw(); }
    if (d.denB) { const b = +$('denBet').value || ui.st.min; ui.bet = d.denB === 'half' ? Math.floor(b / 2) : d.denB === 'double' ? b * 2 : Math.min(ui.st.max, Math.floor(ctx.save().gold)); ui.bet = Math.max(ui.st.min, Math.min(ui.st.max, ui.bet)); return draw(); }
    if (d.denPlay != null) { ui.bet = Math.floor(+$('denBet').value || 0); ui.busy = true; t.disabled = true; $('denBody').classList.add('rolling');
      try { const r = await den.play(ctx.save(), ctx.floor(), ui.game, ui.bet, ui.pick); ui.last = r; ui.st = { ...ui.st, used: Number(r.used) };
        await new Promise(r => setTimeout(r, 450)); if (r.w) ctx.notice(`Glitch Den · +${ctx.fmt(r.p)}g`, '#c9a0ff'); await ctx.after(); }
      catch (err) { ctx.notice(`Den: ${String(err.message || err)}`); }
      finally { ui.busy = false; $('denBody')?.classList.remove('rolling'); draw(); } } };
  el.onchange = e => { if (e.target.id === 'denDice') { const v = +e.target.value; ui.pick = ui.pick < 0 ? -v : v; ui.bet = +$('denBet').value || ui.bet; draw(); } };
}

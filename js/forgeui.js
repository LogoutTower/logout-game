// Forge upgrades pane (Town → Forge). DOM glue only; rules in js/forge.js. Online the server rolls (forge_upgrade RPC).
import { showHelp } from './helpui.js';
import { nextCost, lacking, canForge, matName, matIcon, kindOf, MAX_UP, forgeLocal, applyAttempt, evoTier, transferCheck, transferCost, transferLocal, canEvolve, EVO_MIN_RARITY, ROMAN, EVO_CAP, EVO_DPS } from './forge.js';
const $ = id => document.getElementById(id);
let ctx = null, busy = false, soon = false;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const matsHtml = (mats = {}) => { const ks = Object.keys(mats).filter(k => mats[k] > 0).sort((a, b) => ['shard', 'ess', 'core', 'sigil'].indexOf(kindOf(a)) - ['shard', 'ess', 'core', 'sigil'].indexOf(kindOf(b)) || a.localeCompare(b, 'en', { numeric: true }));
  return ks.length ? `<div class="matlist">${ks.map(k => `<span>${matIcon(k)} ${esc(matName(k))} <b>×${mats[k]}</b></span>`).join('')}</div>` : '<p class="sub">No materials yet. Every fight drops Tower Shards and Floor Essence.</p>'; };
/** Server attempt: push the save so the server sees today's gold and materials, then apply its answer. */
async function serverAttempt(be, save, evolve) {
  if (be.holdUploads) throw new Error('local staff unlock: nothing is sent');
  await be._push(save); const { data, error } = await be.sb.rpc('forge_upgrade', { p_evolve: !!evolve });
  if (error) { if (/forge_upgrade|function|schema cache/i.test(error.message)) { soon = true; throw new Error('forge upgrades open soon'); } throw new Error(error.message); }
  const h = save.heroes[0]; save.mats = save.mats || {}; for (const [k, n] of Object.entries(data.cost || {})) save.mats[k] = Math.max(0, (save.mats[k] || 0) - n);
  save.gold -= Number(data.price || 0); h.equip.weapon = data.weapon; return { ok: data.ok, roll: data.roll, rate: data.rate, t: data.t };
}
/** ctx: { be, save: () => save, fmt, notice, log, ico, after: async () => {}, play: async (kind, before, after, ok) => {} (animation) } */
export function openForgeUp(c) { ctx = c; draw(); }
export function draw() {
  const el = $('upBody'); if (!el || !ctx) return; const s = ctx.save(), w = s.heroes[0]?.equip?.weapon, f = ctx.fmt;
  let body;
  if (!w) body = '<p class="sub">Equip a weapon to upgrade it.</p>';
  else if (!canForge(w)) body = `<p class="sub">${esc(w.name)} is staff gear and keeps its own tier path.</p>`;
  else { const c = nextCost(w), miss = c ? lacking(s, c) : [];
    body = `<div class="upw">${ctx.ico(w)}<div><b>${esc(w.name)}</b> <span class="uplv">+${w.up || 0}</span>${w.evo ? ` <small class="evo">Evo ${ROMAN[evoTier(w)]}</small>` : ''}<br><small>${w.evo ? esc(w.evo.text) + ` · +${Math.round(EVO_DPS * 100 * evoTier(w))}% base damage (evo) · ` : ''}+${3 * (w.up || 0)}% damage from upgrades</small></div></div>`
      + (c ? `<div class="upcost"><span class="${s.gold < c.gold ? 'no' : ''}">⛁ ${f(c.gold)}</span>${Object.entries(c.mats).map(([k, n]) => `<span class="${(s.mats?.[k] || 0) < n ? 'no' : ''}">${matIcon(k)} ${esc(matName(k))} ${s.mats?.[k] || 0}/${n}</span>`).join('')}</div>
        <p class="sub">${c.t > MAX_UP ? (evoTier(w) ? `Prestige to Evo ${ROMAN[evoTier(w) + 1]}: +${Math.round(EVO_DPS * 100)}% base damage for good, the weapon resets to +0 and the climb starts again (costs rise each tier). Never fails.` : 'Evolve to Evo I: a new form, a new look, one bonus effect and +8% base damage. The weapon resets to +0. Never fails.') : c.rate < 100 ? `Success ${c.rate}%. A fail burns the materials only; your gold, weapon and level are kept.` : 'Never fails.'}</p>
        <button class="cta" data-up="${c.t > MAX_UP ? 'evo' : 'up'}" ${miss.length || soon ? 'disabled' : ''}>${c.t > MAX_UP ? `Evolve · Evo ${ROMAN[evoTier(w) + 1]}` : `Upgrade to +${c.t}`}</button>` : `<p class="sub">Evo ${ROMAN[EVO_CAP]} at +10: this weapon has reached its final form.</p>`)
      + (w.evo ? '<button data-replay>Replay evolution</button>' : '') + (!w.evo && (w.up || 0) >= MAX_UP && !canEvolve(w) ? '<p class="sub">Only Rare or better weapons can evolve.</p>' : '')
      + (w.evo ? transferHtml(s, f) : ''); }
  el.innerHTML = `<h3>Weapon Upgrades <button class="qhelp" data-help="forge" aria-label="Forge help">?</button></h3>${body}<h4>Materials</h4>${matsHtml(s.mats)}`;
  el.onclick = async e => { const tb = e.target.closest('button[data-xfer]'); if (tb && !busy) return transfer(+tb.dataset.xfer, tb.dataset.id); const b = e.target.closest('button[data-up]'); if (b && !busy) attempt(b.dataset.up === 'evo'); else if (e.target.closest('[data-replay]') && !busy) { const w = ctx.save().heroes[0].equip.weapon; busy = true; Promise.resolve(ctx.play?.('evolve', { ...w, evo: undefined, name: w.evo.base }, w, true)).finally(() => { busy = false; }); } else if (e.target.closest('[data-help]')) showHelp(e.target.closest('[data-help]').dataset.help); };
}
async function attempt(evolve) {
  const s = ctx.save(), w0 = { ...s.heroes[0].equip.weapon }; busy = true;
  try { const r = ctx.be.name === 'local' ? forgeLocal(s) : await serverAttempt(ctx.be, s, evolve); const w1 = s.heroes[0].equip.weapon;
    await ctx.play?.(r.t > MAX_UP ? 'evolve' : 'up', w0, w1, r.ok);
    if (r.ok) { ctx.log(r.t > MAX_UP ? `The forge roared: ${w0.name} evolved into ${w1.name} (Evo ${ROMAN[evoTier(w1)]}).` : `The forge rang out: ${w1.name} reached +${r.t}.`, '#ffd76a'); ctx.notice(r.t > MAX_UP ? `Evo ${ROMAN[evoTier(w1)]} · ${w1.name}` : `Upgrade success · +${r.t}`, '#ffd76a'); }
    else { ctx.log(`The upgrade to +${r.t} failed (${r.rate}%). The materials burned; the weapon held.`); ctx.notice(`Upgrade failed · materials burned`); }
    await ctx.after(); }
  catch (err) { ctx.notice(`Forge: ${String(err.message || err)}`); }
  finally { busy = false; draw(); }
}
export { applyAttempt };
function transferHtml(s, f) { const w = s.heroes[0].equip.weapon, list = (s.inv || []).map((it, i) => [it, i]).filter(([it, i]) => !transferCheck(s, i, it.id));
  return `<details class="xfer"><summary>Transfer Evo ${ROMAN[evoTier(w)]} to another weapon</summary><p class="sub">A move, not a copy: the bag weapon (same or higher rarity, ${EVO_MIN_RARITY} or better) ends at the higher of the two Evo tiers and +0; this one goes back to unevolved +0 in the bag.</p>`
    + (list.length ? list.map(([it, i]) => { const c = transferCost(w, it), miss = lacking(s, c); return `<div class="srow">${ctx.ico(it)}<div><b>${esc(it.name)}</b><small>${esc(it.rarity)} · ${c.gap ? `rarity +${c.gap} step${c.gap > 1 ? 's' : ''}, fee ×${c.mul}` : 'same rarity, base fee'} · ⛁ ${f(c.gold)} · ${Object.entries(c.mats).map(([k, n]) => `${matIcon(k)} ${n} ${esc(matName(k))}`).join(' · ')}</small></div><button data-xfer="${i}" data-id="${esc(it.id)}" ${miss.length || soon ? 'disabled' : ''}>Transfer</button></div>`; }).join('') : '<p class="sub">No eligible weapon in your bag.</p>') + '</details>'; }
async function transfer(i, id) { const s = ctx.save(), w0 = { ...s.heroes[0].equip.weapon }; const cc = transferCost(w0, s.inv[i]); if (!confirm(`Fee: ${ctx.fmt(cc.gold)} gold, ${Object.entries(cc.mats).map(([k, n]) => `${n} ${matName(k)}`).join(', ')}${cc.gap ? ` (×${cc.mul} for ${cc.gap} rarity step${cc.gap > 1 ? 's' : ''} up)` : ''}.\nMove Evo ${ROMAN[evoTier(w0)]} onto ${s.inv[i]?.name}? It keeps the higher tier and starts at +0; ${w0.name} goes back to unevolved +0.`)) return; busy = true;
  try { if (ctx.be.name === 'local') transferLocal(s, i, id);
    else { if (ctx.be.holdUploads) throw new Error('local staff unlock: nothing is sent'); await ctx.be._push(s); const { data, error } = await ctx.be.sb.rpc('forge_transfer', { p_inv: i, p_id: id });
      if (error) throw new Error(/forge_transfer|function|schema cache/i.test(error.message) ? 'transfers open soon' : error.message);
      for (const [k, n] of Object.entries(data.cost || {})) s.mats[k] = Math.max(0, (s.mats[k] || 0) - n); s.gold -= Number(data.price || 0); s.heroes[0].equip.weapon = data.weapon; s.inv[i] = data.back; }
    const w1 = s.heroes[0].equip.weapon; await ctx.play?.('evolve', { ...w1, evo: undefined, name: w1.evo.base }, w1, true);
    ctx.log(`The forge moved Evo ${ROMAN[evoTier(w1)]} from ${w0.evo.base} into ${w1.name}.`, '#ffd76a'); ctx.notice(`Transferred · ${w1.name}`, '#ffd76a'); await ctx.after(); }
  catch (err) { ctx.notice(`Forge: ${String(err.message || err)}`); } finally { busy = false; draw(); } }

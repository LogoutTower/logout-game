// Forge upgrades pane (Town → Forge). DOM glue only; rules in js/forge.js. Online the server rolls (forge_upgrade RPC).
import { nextCost, lacking, canForge, matName, matIcon, kindOf, MAX_UP, forgeLocal, applyAttempt } from './forge.js';
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
    body = `<div class="upw">${ctx.ico(w)}<div><b>${esc(w.name)}</b> <span class="uplv">+${w.up || 0}</span>${w.evo ? ' <small class="evo">Evolved</small>' : ''}<br><small>${w.evo ? esc(w.evo.text) + ' · ' : ''}+${3 * (w.up || 0)}% damage from upgrades</small></div></div>`
      + (c ? `<div class="upcost"><span class="${s.gold < c.gold ? 'no' : ''}">⛁ ${f(c.gold)}</span>${Object.entries(c.mats).map(([k, n]) => `<span class="${(s.mats?.[k] || 0) < n ? 'no' : ''}">${matIcon(k)} ${esc(matName(k))} ${s.mats?.[k] || 0}/${n}</span>`).join('')}</div>
        <p class="sub">${c.t > MAX_UP ? 'Evolve: a new form, a new look and one bonus effect. Never fails.' : c.rate < 100 ? `Success ${c.rate}%. A fail burns the materials only; your gold, weapon and level are kept.` : 'Never fails.'}</p>
        <button class="cta" data-up="${c.t > MAX_UP ? 'evo' : 'up'}" ${miss.length || soon ? 'disabled' : ''}>${c.t > MAX_UP ? 'Evolve' : `Upgrade to +${c.t}`}</button>` : '<p class="sub">Fully evolved. This weapon has reached its final form.</p>'); }
  el.innerHTML = `<h3>Weapon Upgrades <button class="qhelp" data-help="forge" aria-label="Forge help">?</button></h3>${body}<h4>Materials</h4>${matsHtml(s.mats)}`;
  el.onclick = async e => { const b = e.target.closest('button[data-up]'); if (b && !busy) attempt(b.dataset.up === 'evo'); else if (e.target.closest('[data-help]')) ctx.help?.(e.target.closest('[data-help]').dataset.help); };
}
async function attempt(evolve) {
  const s = ctx.save(), w0 = { ...s.heroes[0].equip.weapon }; busy = true;
  try { const r = ctx.be.name === 'local' ? forgeLocal(s) : await serverAttempt(ctx.be, s, evolve); const w1 = s.heroes[0].equip.weapon;
    await ctx.play?.(r.t > MAX_UP ? 'evolve' : 'up', w0, w1, r.ok);
    if (r.ok) { ctx.log(r.t > MAX_UP ? `The forge roared: ${w0.name} evolved into ${w1.name}.` : `The forge rang out: ${w1.name} reached +${r.t}.`, '#ffd76a'); ctx.notice(r.t > MAX_UP ? `Evolved · ${w1.name}` : `Upgrade success · +${r.t}`, '#ffd76a'); }
    else { ctx.log(`The upgrade to +${r.t} failed (${r.rate}%). The materials burned; the weapon held.`); ctx.notice(`Upgrade failed · materials burned`); }
    await ctx.after(); }
  catch (err) { ctx.notice(`Forge: ${String(err.message || err)}`); }
  finally { busy = false; draw(); }
}
export { applyAttempt };

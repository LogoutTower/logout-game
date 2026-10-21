// '?' help guides with icons (Forge, Farm). DOM glue; content is plain data so it is easy to extend.
import { MAT_KINDS, lootKeyHtml, UP_RATE } from './forge.js';
const mi = k => `<i class="mat" style="color:${MAT_KINDS[k].color}">${MAT_KINDS[k].icon}</i>`;
const step = (icon, title, text) => `<li><span class="hico" aria-hidden="true">${icon}</span><div><b>${title}</b><br><small>${text}</small></div></li>`;
export const GUIDES = {
  farm: o => ({ title: 'Farm guide', body: `<ol class="hsteps">
    ${step('🗺️', 'Pick a cleared floor', 'Open the Tower Map, tap any floor that has already fallen and press <b>Farm this echo</b>.')}
    ${step('👻', 'Fight its echo', "Your hero fights a weaker, repeatable echo of that floor's boss, live and while you are away.")}
    ${step(mi('core'), 'Earn its materials', 'Farming earns Tower Shards, that set\'s Floor Essence, the floor\'s Boss Core, and on milestone floors (10, 20, 30…) a rare Evolution Sigil.')}
    ${step('⚠️', 'No live-boss damage', 'A farming hero deals <b>no damage</b> to the live guardian. Gold and XP still come in. Press <b>Stop farming</b> to rejoin the climb.')}
  </ol>${o?.set ? lootKeyHtml(o.set, o.upTo) : ''}` }),
  forge: () => ({ title: 'Forge guide', body: `<ol class="hsteps">
    ${step('⚔️', 'Equip a weapon', 'Upgrades belong to the weapon you have equipped and stay on it if you swap.')}
    ${step('⛁', '+1 to +5: gold only', 'Costs gold and never fails.')}
    ${step(mi('shard') + mi('ess'), '+6 to +10: gold and materials', '+6/+7 need Tower Shards and Floor Essence, +8/+9 Essence and Boss Cores, +10 Boss Cores.')}
    ${step('🎲', 'Success chance', `+6 ${UP_RATE[6]}% · +7 ${UP_RATE[7]}% · +8 ${UP_RATE[8]}% · +9 ${UP_RATE[9]}% · +10 ${UP_RATE[10]}%.`)}
    ${step('🔥', 'If it fails', 'Only the materials burn. Your gold, your weapon and its level are always kept.')}
    ${step(mi('sigil'), 'Evolve at +10', "Add one Evolution Sigil from the weapon's milestone floor: a new name, a new look and one bonus effect. Never fails.")}
  </ol><p class="hrar">${['shard', 'ess', 'core', 'sigil'].map(k => `${mi(k)} <b style="color:${MAT_KINDS[k].color}">${MAT_KINDS[k].label}</b> <small>${MAT_KINDS[k].rarity} · ${MAT_KINDS[k].from}</small>`).join('<br>')}</p>` }),
};
export function showHelp(kind, o) {
  let d = document.getElementById('helpSheet'); if (!d) { d = document.createElement('dialog'); d.id = 'helpSheet'; d.className = 'win help'; document.body.append(d); d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); }); }
  const g = GUIDES[kind](o); d.innerHTML = `<h2>${g.title}</h2>${g.body}<button data-close>Close</button>`; if (!d.open) d.showModal();
}

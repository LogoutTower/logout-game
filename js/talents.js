// Talent trees: 3 classes × 3 branches × 5 nodes. Pure (no DOM). Effects feed the same stat pipeline as gear and Unique weapons (see talentBonus).
import { baseHp } from './floors.js';
// eff: per-rank stat contributions. Keys: dpsPct goldPct xpPct capH hpPct drainPct regenPct layerPct rallyPct innPct shopPct offlinePct
//      lootPct salvagePct doublePct elementPct restedPct restedMulPct bonusPts lowMulPct
const N = (id, name, desc, max, eff) => ({ id, name, desc, max, eff });
const B = (id, name, blurb, nodes) => ({ id, name, blurb, nodes: nodes.map((n, i) => ({ ...n, tier: i, req: i * 2, capstone: i === nodes.length - 1 })) });
export const TREES = {
  Vanguard: [
    B('bulwark', 'Bulwark', 'Stand. Endure. Out-wait the tower.', [
      N('vg-thick', 'Thickened Hide', 'System notice: max HP +6% per rank.', 3, { hpPct: 6 }),
      N('vg-brace', 'Braced Stance', 'System notice: the guardian drains you 6% slower per rank.', 3, { drainPct: 6 }),
      N('vg-second', 'Second Wind', 'System notice: recover 0.6% max HP per minute per rank.', 2, { regenPct: 0.6 }),
      N('vg-oath', 'Shield Oath', 'System notice: max HP +8% and drain −5% per rank.', 2, { hpPct: 8, drainPct: 5 }),
      N('vg-iron', 'Iron Will', 'Capstone. System notice: worn down only cuts DPS to 75%.', 1, { lowMulPct: 25 }),
    ]),
    B('warlord', 'Warlord', 'Command the shared fight.', [
      N('wl-cleave', 'Layer Cleave', 'System notice: +8% DPS on the guardian\'s last HP layer per rank.', 3, { layerPct: 8 }),
      N('wl-rally', 'Rallying Cry', 'System notice: +3% DPS per rank. Others fight harder beside you.', 3, { rallyPct: 3 }),
      N('wl-banner', 'War Banner', 'System notice: +4% gold and XP per rank from the shared kill.', 2, { goldPct: 4, xpPct: 4 }),
      N('wl-sunder', 'Sunder Plate', 'System notice: +5% DPS per rank.', 2, { dpsPct: 5 }),
      N('wl-breaker', 'Floor Breaker', 'Capstone. System notice: +30% DPS on the last HP layer.', 1, { layerPct: 30 }),
    ]),
    B('quartermaster', 'Quartermaster', 'An army marches on its coin.', [
      N('qm-purse', 'Heavy Purse', 'System notice: +5% gold per rank.', 3, { goldPct: 5 }),
      N('qm-haggle', 'Haggler', 'System notice: shop prices −5% per rank.', 3, { shopPct: 5 }),
      N('qm-inn', 'Regular at the Inn', 'System notice: inn costs −10% per rank.', 2, { innPct: 10 }),
      N('qm-supply', 'Supply Lines', 'System notice: Well Rested lasts +15% longer per rank.', 2, { restedPct: 15 }),
      N('qm-ledger', 'Golden Ledger', 'Capstone. System notice: +20% gold, salvage +25%.', 1, { goldPct: 20, salvagePct: 25 }),
    ]),
  ],
  Blade: [
    B('edge', 'Edge', 'Faster. Sharper. Again.', [
      N('ed-hone', 'Honed Steel', 'System notice: +5% DPS per rank.', 3, { dpsPct: 5 }),
      N('ed-flurry', 'Flurry', 'System notice: 3% of hits land twice per rank.', 3, { doublePct: 3 }),
      N('ed-weak', 'Find the Seam', 'System notice: +8% DPS on the last HP layer per rank.', 2, { layerPct: 8 }),
      N('ed-blur', 'Blur', 'System notice: +6% DPS per rank.', 2, { dpsPct: 6 }),
      N('ed-cuts', 'Thousand Cuts', 'Capstone. System notice: 15% of hits land twice.', 1, { doublePct: 15 }),
    ]),
    B('shadowstep', 'Shadowstep', 'Fight on while you are gone.', [
      N('sh-idle', 'Idle Hands', 'System notice: +5% gains while offline per rank.', 3, { offlinePct: 5 }),
      N('sh-vigil', 'Long Vigil', 'System notice: +1h offline cap per rank.', 3, { capH: 1 }),
      N('sh-quiet', 'Quiet Breathing', 'System notice: drain −5% per rank.', 2, { drainPct: 5 }),
      N('sh-ghost', 'Ghost Shift', 'System notice: +2h offline cap per rank.', 2, { capH: 2 }),
      N('sh-phantom', 'Phantom Watch', 'Capstone. System notice: +20% gains while offline.', 1, { offlinePct: 20 }),
    ]),
    B('plunder', 'Plunder', 'Everything the tower drops is yours.', [
      N('pl-eye', 'Keen Eye', 'System notice: +6% gear drop chance per rank.', 3, { lootPct: 6 }),
      N('pl-scrap', 'Scrapper', 'System notice: salvage pays +10% per rank.', 3, { salvagePct: 10 }),
      N('pl-pocket', 'Deep Pockets', 'System notice: +4% gold per rank.', 2, { goldPct: 4 }),
      N('pl-fence', 'Black Market', 'System notice: shop prices −6% per rank.', 2, { shopPct: 6 }),
      N('pl-sense', 'Treasure Sense', 'Capstone. System notice: +25% gear drop chance.', 1, { lootPct: 25 }),
    ]),
  ],
  Arcanist: [
    B('ember', 'Ember', 'Burn the guardian down to its element.', [
      N('em-spark', 'Spark', 'System notice: +5% DPS per rank.', 3, { dpsPct: 5 }),
      N('em-attune', 'Attunement', 'System notice: +8% DPS per rank when your weapon\'s element matches the guardian\'s.', 3, { elementPct: 8 }),
      N('em-kindle', 'Kindle', 'System notice: +6% DPS per rank.', 2, { dpsPct: 6 }),
      N('em-sear', 'Sear the Layer', 'System notice: +8% DPS on the last HP layer per rank.', 2, { layerPct: 8 }),
      N('em-wild', 'Wildfire', 'Capstone. System notice: +30% DPS when your weapon\'s element matches.', 1, { elementPct: 30 }),
    ]),
    B('ward', 'Ward', 'Light that mends.', [
      N('wd-mend', 'Mending Glyph', 'System notice: recover 0.6% max HP per minute per rank.', 3, { regenPct: 0.6 }),
      N('wd-dream', 'Lucid Dreams', 'System notice: Well Rested lasts +15% longer per rank.', 3, { restedPct: 15 }),
      N('wd-veil', 'Veil', 'System notice: max HP +8% per rank.', 2, { hpPct: 8 }),
      N('wd-calm', 'Calm Mind', 'System notice: drain −6% per rank.', 2, { drainPct: 6 }),
      N('wd-sanct', 'Sanctuary', 'Capstone. System notice: Well Rested is twice as strong (+30%).', 1, { restedMulPct: 100 }),
    ]),
    B('scholar', 'Scholar', 'Knowledge compounds.', [
      N('sc-study', 'Study', 'System notice: +5% XP per rank.', 3, { xpPct: 5 }),
      N('sc-margin', 'Marginalia', 'System notice: +1 talent point per rank.', 2, { bonusPts: 1 }),
      N('sc-tutor', 'Tutor', 'System notice: +6% XP per rank.', 3, { xpPct: 6 }),
      N('sc-thesis', 'Thesis', 'System notice: +1 talent point and +4% DPS per rank.', 2, { bonusPts: 1, dpsPct: 4 }),
      N('sc-arch', 'Archivist', 'Capstone. System notice: +25% XP.', 1, { xpPct: 25 }),
    ]),
  ],
};
export const KEYS = ['dpsPct', 'goldPct', 'xpPct', 'capH', 'hpPct', 'drainPct', 'regenPct', 'layerPct', 'rallyPct', 'innPct', 'shopPct', 'offlinePct', 'lootPct', 'salvagePct', 'doublePct', 'elementPct', 'restedPct', 'restedMulPct', 'bonusPts', 'lowMulPct'];
const ALL = Object.values(TREES).flatMap(bs => bs.flatMap(b => b.nodes.map(n => ({ ...n, branch: b.id }))));
export const nodeById = id => ALL.find(n => n.id === id);
export const treeOf = cls => TREES[cls] || [];
const ranks = h => h?.talents || {};
/** Summed talent effects for a hero. */
export function talentBonus(h) {
  const b = Object.fromEntries(KEYS.map(k => [k, 0]));
  for (const [id, r] of Object.entries(ranks(h))) { const n = nodeById(id); if (n && r > 0) for (const [k, v] of Object.entries(n.eff)) b[k] += v * Math.min(r, n.max); }
  return b;
}
export const spentIn = (h, branchId) => Object.entries(ranks(h)).reduce((s, [id, r]) => s + (nodeById(id)?.branch === branchId ? r : 0), 0);
export const spent = h => Object.values(ranks(h)).reduce((a, b) => a + b, 0);
/** 1 point per level from level 2, plus Scholar bonus points. */
export const totalPoints = h => Math.max(0, (h.level || 1) - 1) + talentBonus(h).bonusPts;
export const freePoints = h => totalPoints(h) - spent(h);
export function canLearn(h, id) {
  const n = nodeById(id); if (!n) return 'unknown';
  if (!treeOf(h.cls).some(b => b.id === n.branch)) return 'other class';
  const r = ranks(h)[id] || 0; if (r >= n.max) return 'max rank';
  if (freePoints(h) < 1) return 'no points';
  if (spentIn(h, n.branch) < n.req) return `needs ${n.req} points in branch`;
  return null;
}
export function learn(h, id) { if (canLearn(h, id)) return false; h.talents = { ...ranks(h), [id]: (ranks(h)[id] || 0) + 1 }; return true; }
export const respecCost = (h, floor) => (h.respecs || 0) === 0 ? 0 : Math.round(150 * Math.sqrt(baseHp(floor) / baseHp(1)));
/** Refund every point. First respec is free; then gold scaled by floor. */
export function respec(save, floor) {
  const h = save.heroes[0], c = respecCost(h, floor); if (save.gold < c || spent(h) === 0) return false;
  save.gold -= c; h.talents = {}; h.respecs = (h.respecs || 0) + 1; return true;
}

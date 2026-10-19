// The Architect's Codex: the staff-only talent tree (replaces the class tree for the GameMaster).
// 4 branches × 7 nodes + a hidden 29th node = 48 ranks (1 point per level, like everyone else).
// Combat values are scaled so a maxed Codex stays at or under a maxed normal class tree (test/codex.test.mjs);
// cosmetic and QoL nodes are free of combat value. Registered here (never in talents.js) so no class pool can list it.
import { registerTree, B, N, hasTalent, treeOf } from './talents.js';
const GM = 'GameMaster'; // = GM_CLASS (kept literal to avoid an import cycle with gm.js)
const REQ = [0, 1, 2, 3, 4, 6, 8]; // points in the branch needed per tier (fits every branch's rank budget)
const F = (id, name, desc, max = 1, eff = {}, extra = {}) => ({ ...N(id, name, desc, max, eff), ...extra });
export const CODEX = [
  B('cx-blueprint', 'Blueprint', 'Measure the tower. Then correct it.', [
    F('cx-eye', "Draftsman's Eye", 'System notice: shows the boss layer breakdown and the next guardian.'),
    F('cx-load', 'Load-Bearing', 'System notice: max HP +2% per rank.', 3, { hpPct: 2 }),
    F('cx-scaffold', 'Scaffold', 'System notice: Forge upgrades cost 5% less per rank.', 3, { forgePct: 5 }),
    F('cx-floorplan', 'Floorplan', 'System notice: unlocks the boss editor in the Sandbox.'),
    F('cx-integrity', 'Structural Integrity', 'System notice: +4% DPS per rank while above 50% HP.', 2, { highHpDpsPct: 4 }),
    F('cx-corner', 'Cornerstone', 'System notice: a gold rune marks the arena. "The Architect was here." Everyone on the floor sees it (server role).'),
    F('cx-plan', 'Master Plan', 'System notice: once per floor, reroll the stats of one dropped item.'),
  ], { req: REQ }),
  B('cx-starfall', 'Starfall', 'Gravity is a suggestion you make to stars.', [
    F('cx-gravity', 'Gravity Well', 'System notice: +3% DPS per rank.', 3, { dpsPct: 3 }),
    F('cx-orbit', 'Orbit', 'System notice: stardust on hits; +2% double-hit chance per rank.', 3, { doublePct: 2 }),
    F('cx-eclipse', 'Eclipse', 'System notice: a 300% void strike every 60s (averaged into DPS, so it counts offline too).', 1, { eclipsePct: 5 }),
    F('cx-constellation', 'Constellation', 'System notice: a gold star on the coat for every floor cleared (max 100).'),
    F('cx-horizon', 'Event Horizon', 'System notice: +3% boss damage per rank while the boss is under 50% HP.', 3, { lowBossPct: 3 }),
    F('cx-supernova', 'Supernova', 'System notice: a gold burst for everyone on the floor when a guardian falls.'),
    F('cx-collapse', 'Collapse of Stars', "System notice: Eclipse strikes twice, and its cracks raise Shaper's Decree to +6% for 10s.", 1, { eclipsePct: 5 }),
  ], { req: REQ }),
  B('cx-fate', 'Fate-Thread', 'Every drop was decided. You can read the ink.', [
    F('cx-reader', 'Thread-Reader', "System notice: a drop's rarity glows before you open it."),
    F('cx-weave', "Fortune's Weave", 'System notice: +3% gold per rank.', 3, { goldPct: 3 }),
    F('cx-draft', 'Second Draft', 'System notice: 5% chance per rank that a salvage pays double.', 3, { salvageDblPct: 5 }),
    F('cx-prophecy', 'Prophecy', "System notice: the Chronicle names the next guardian's element a floor early."),
    F('cx-hour', 'Fated Hour', 'System notice: offline time counts +5% per rank (still capped at 24h).', 3, { offlinePct: 5 }),
    F('cx-loom', 'Loom of Names', 'System notice: rename your own gear (filtered).'),
    F('cx-destiny', 'Shaper of Destiny', 'System notice: once a day, choose the element of your next boss drop.'),
  ], { req: REQ }),
  B('cx-eventide', 'Eventide', 'The blade remembers the last light.', [
    F('cx-dusk', 'Dusk Edge', "System notice: Eventide's glow brightens with your level."),
    F('cx-echo', 'Decree Echo', "System notice: Shaper's Decree lingers 2 minutes after you leave."),
    F('cx-sheath', 'Twilight Sheath', 'System notice: the first hit after resting deals +50%.'),
    F('cx-longnight', 'Long Night', "System notice: unlocks the skin 'Eventide, Unsheathed' (gold-dominant blade)."),
    F('cx-gilded', 'Gilded Fracture', 'System notice: void cracks deal +2% bonus damage per rank.', 3, { crackPct: 2 }),
    F('cx-herald', "Herald's Voice", 'System notice: set your own entrance line (filtered, rate-limited, server role).'),
    F('cx-final', 'Final Decree', "System notice: Shaper's Decree is +6% instead of +5% for everyone on the floor."),
  ], { req: REQ }),
  B('cx-hidden', '???', 'System notice: page not found.', [
    F('cx-shape', 'The Final Shape', 'System notice: the tower has seen your shape. Gold shimmer on the title, eyes under the hood, and the server hears when you shape a floor.', 1, {},
      { req: 0, hidden: true, capstone: true, gate: ['cx-plan', 'cx-collapse', 'cx-destiny', 'cx-final'] }),
  ]),
];
registerTree(GM, CODEX);
export const CODEX_IDS = CODEX.flatMap(b => b.nodes.map(n => n.id));
export const CODEX_NAMES = ["The Architect's Codex", ...CODEX.filter(b => b.id !== 'cx-hidden').map(b => b.name), ...CODEX.flatMap(b => b.nodes.map(n => n.name))];
export const isCodexId = id => typeof id === 'string' && id.startsWith('cx-');
export const cx = (h, id) => h?.cls === GM && hasTalent(h, id);
export const codexPoints = () => CODEX.reduce((s, b) => s + b.nodes.reduce((a, n) => a + n.max, 0), 0);
export const isCodex = h => treeOf(h?.cls) === CODEX;

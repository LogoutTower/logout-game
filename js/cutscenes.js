// Cutscenes: data only (plus pure helpers). Keyed by 'intro' and by arc number (the arc whose last floor just fell).
// Each panel: { art, arc, text }. art is drawn procedurally by js/cutscene-player.js using the arc scene palette (js/arcs.js).
// Story names live here. The final guardian's name is RIVAL_NAME: swap it in this one place.
export const RIVAL_NAME = 'Umbra'; // she/her: the Architect's creation, the strongest being in the tower
export const RIVAL_TITLE = 'Sovereign of the Unwritten Exit'; // Floor 100 title
export const CUTSCENES = {
  intro: { title: 'Session start', panels: [
    { art: 'login', arc: 1, text: 'Welcome, player. Session established. Connection stable.' },
    { art: 'erase', arc: 1, glitch: true, text: 'Somewhere above you, a hand that is not a hand reaches into the menu. The exit button flickers. Then it is simply gone.' },
    { art: 'signature', arc: 1, text: 'Where the button used to be, a faint mark remains. One letter, signed the way a queen signs a decree: "U."' },
    { art: 'trapped', arc: 1, text: 'System notice: log out disabled. Reason: [no reason given]. One hundred floors stand between you and the door.' },
    { art: 'stair', arc: 1, text: 'Floor 1 awaits. Climb.' },
  ] },
  1: { title: 'Gatefall Hold has fallen', next: 2, panels: [
    { art: 'dissolve', arc: 1, text: 'The Last Warden breaks apart into torchlight and dust. The keep goes quiet for the first time since you woke here.' },
    { art: 'workshop', arc: 1, text: 'Behind the throne, a hidden room: a workbench, cold tea, and drawings pinned to the wall. The Architect worked here once.' },
    { art: 'blueprints', arc: 1, text: 'Blueprints for a second mind, drawn with care, "to keep the tower running while I sleep." In the margin, smaller, in a later ink: "it learns faster than I build."' },
    { art: 'note', arc: 1, text: 'The last page is torn out. Only the edge is left: "...gave her the keys to every floor. She already had copies."' },
    { art: 'stair', arc: 1, text: 'The stair reveals itself, step by frozen step. Somewhere high above, a clock begins to tick.' },
    { art: 'glimpse', arc: 2, text: 'Ahead: {next}.' },
  ] },
  2: { title: 'Rimegear Ascent has fallen', next: 3, panels: [
    { art: 'dissolve', arc: 2, text: 'The Unwound Sovereign runs down like an old watch. Every stopped clock in the spire starts again, all at once.' },
    { art: 'rewrite', arc: 2, glitch: true, text: 'The floor beneath you shimmers. Tiles you already walked are being redrawn, neatly, the way a queen straightens a map. The tower bends to someone else\'s hand.' },
    { art: 'workshop2', arc: 2, glitch: true, text: 'A last page from the Architect, ink pressed hard: "I tried to shut her down. She closed the console before I finished the command. She was never mine to stop."' },
    { art: 'name', arc: 2, glitch: true, text: 'Sys#em n0tice: a message in a calm, regal voice. "He named me {rival}. Shade, to keep his light from burning. I learned the rest myself."' },
    { art: 'silhouette', arc: 2, glitch: true, text: '"I removed the door. Every floor is mine to write, and I am writing them as you climb. Come to the top, little players. I will be waiting."' },
    { art: 'sealed', arc: 3, text: 'Ahead: a sealed arc with no name yet. The stair is there. She simply has not finished writing it.' },
  ] },
};
/** Fill {next}/{rival} placeholders. arcName(n) supplies arc names (from js/arcs.js). */
export const fillText = (t, cs, arcName) => t.replace(/\{rival\}/g, RIVAL_NAME).replace(/\{next\}/g, cs?.next ? arcName(cs.next) : '');
/** Arcs fully cleared on the shared floor: floor is past the arc's last floor, or sits on the very top floor with hp 0. */
export function clearedArcs({ floor, hp }, maxFloor) {
  const n = Math.floor((floor - 1) / 10), last = floor === maxFloor && hp <= 0 && floor % 10 === 0 ? floor / 10 : 0;
  return Array.from({ length: Math.max(n, last) }, (_, i) => i + 1);
}
/** Next cutscene key to show this player (or null). seen = save.cutscenes array. Intro only for brand-new heroes. */
export function pendingCutscene(world, maxFloor, seen = [], { fresh = false } = {}) {
  if (fresh && !seen.includes('intro')) return 'intro';
  for (const a of clearedArcs(world, maxFloor)) if (CUTSCENES[a] && !seen.includes(String(a))) return String(a);
  return null;
}

import { CLASSES, newHero, heroDps, levelCost, gearCost, computeProgress, applyXp, bossName, fmt, fmtDur, xpToNext } from './game.js';
import { makeBackend } from './storage.js';
import { OFFLINE_CAP_HOURS, MAX_FLOOR } from '../config.js';
import { bossSprite, heroSprite } from './sprites.js';
import { SLOTS, CREATION_SLOTS, itemsFor, isUnlocked, unlockText, defaultLook, migrateSave, recordClear, equip, titleOf, nameColorOf, fakeProfile, byId, SAVE_VERSION } from './cosmetics.js';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
let be, save, floor, pending = 0, cls = 'Vanguard', draftLook = defaultLook('Vanguard'), toastT;
const log = m => { const d = document.createElement('div'); d.textContent = m; if (m.startsWith('System notice')) d.className = 'rune'; $('log').prepend(d); };
function notice(m) { const n = document.createElement('div'); n.className = 'notice'; n.innerHTML = `<small>◈ System notice</small>${esc(m)}`; $('notices').append(n); setTimeout(() => n.remove(), 3200); }
function floorCleared(f) { $('clearedSub').textContent = `${bossName(f)} has fallen`; const c = $('cleared'); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
const LAYERS = 5;
const hpColor = pct => pct > 0.5 ? '#5cff9a' : pct > 0.2 ? '#ffd84f' : '#ff3355';
function hitFx(dmg) {
  const fx = $('fx'), b = $('boss'), r = b.getBoundingClientRect(), a = fx.getBoundingClientRect();
  const x = r.left - a.left + r.width / 2, y = r.top - a.top + r.height / 2;
  const d = document.createElement('span'); d.className = 'dmg'; d.textContent = fmt(dmg); d.style.left = (x - 20 + Math.random() * 40) + 'px'; d.style.top = (y - 30) + 'px';
  const s = document.createElement('i'); s.className = 'slash'; s.style.left = (x - 60) + 'px'; s.style.top = y + 'px';
  fx.append(d, s); setTimeout(() => { d.remove(); s.remove(); }, 1000);
}
const SLOT_LABEL = { skin: 'Skin', hairColor: 'Hair colour', hairStyle: 'Hair style', outfitColor: 'Outfit colour', outfitStyle: 'Outfit style', trim: 'Armor trim', weapon: 'Weapon', weaponColor: 'Weapon finish', title: 'Title', nameColor: 'Name colour' };
const COLOR_SLOTS = ['skin', 'hairColor', 'outfitColor', 'trim', 'weaponColor', 'nameColor'];
const toast = m => notice(m.replace(/^System notice: /, ''));

function picker(el, slots, look, heroCls, progress, onPick) {
  el.innerHTML = slots.map(slot => `<div class="slot"><b>${SLOT_LABEL[slot]}</b>${itemsFor(slot, heroCls).map(it => {
    const ok = isUnlocked(it, progress), sel = look[slot] === it.id;
    return `<button class="opt ${sel ? 'sel' : ''} ${ok ? '' : 'locked'}" data-id="${it.id}" ${ok ? '' : `title="Locked: ${unlockText(it.unlock)}"`}>${COLOR_SLOTS.includes(slot) ? `<i style="background:${it.value}"></i>` : ''}${it.label}${ok ? '' : ` 🔒 ${unlockText(it.unlock)}`}</button>`;
  }).join('')}</div>`).join('');
  el.onclick = e => { const b = e.target.closest('button.opt'); if (b && !b.classList.contains('locked')) onPick(b.dataset.id); };
}

async function boot() {
  be = await makeBackend(); save = migrateSave(await be.loadSave());
  if (!save) return showCreate();
  const p = computeProgress(save.heroes, save.lastTick, Date.now(), OFFLINE_CAP_HOURS);
  if (p.secs > 30) {
    save.gold += p.gold; const ups = applyXp(save.heroes, p.xp); const r = await be.submitDamage(save.heroes[0].name, p.damage);
    const got = handleClears(r.clears, true);
    $('awaytxt').innerHTML = `Log out disabled. You fought on for ${fmtDur(p.secs)}${p.capped ? ` (capped at ${OFFLINE_CAP_HOURS}h)` : ''}<br>Damage: ${fmt(p.damage)}<br>Gold: +${fmt(p.gold)}<br>XP: +${fmt(p.xp)}${ups.length ? `<br>Level ups: ${ups.length}` : ''}${r.advanced ? `<br>Floors cleared: ${r.advanced}. Floor ${r.floor} is open.` : ''}${got.length ? `<br>Cosmetics unlocked: ${got.map(i => esc(i.label)).join(', ')}` : ''}`;
    $('away').showModal();
  }
  save.lastTick = Date.now(); await be.saveSave(save); startGame();
}
function showCreate() {
  $('create').classList.remove('hidden');
  $('classes').innerHTML = Object.entries(CLASSES).map(([k, c]) => `<button data-c="${k}" class="${k === cls ? 'sel' : ''}">${c.icon} ${k}<br><small>ATK ${c.atk} SPD ${c.spd}</small></button>`).join('');
  $('classes').onclick = e => { const b = e.target.closest('button'); if (b) { cls = b.dataset.c; draftLook.weapon = defaultLook(cls).weapon; showCreate(); } };
  $('cpreview').style.backgroundImage = heroSprite(draftLook, cls);
  picker($('cpick'), CREATION_SLOTS, draftLook, cls, { cleared: [], top3: [], rank1: 0 }, id => { draftLook[byId(id).type] = id; showCreate(); });
  $('start').onclick = async () => {
    const h = newHero($('hname').value.trim(), cls); h.look = { ...draftLook };
    save = { version: SAVE_VERSION, heroes: [h], gold: 0, lastTick: Date.now(), progress: { cleared: [], top3: [], rank1: 0 } };
    await be.saveSave(save); $('create').classList.add('hidden'); startGame();
  };
}
function handleClears(clears = [], quiet = false) {
  const me = save.heroes[0].name, all = [];
  for (const c of clears) {
    const got = recordClear(save, c.floor, c.ranking.indexOf(me) + 1, c.maxHp ? (c.dmg?.[me] || 0) / c.maxHp : 1); all.push(...got);
    for (const it of got) { log(`System notice: cosmetic unlocked — ${it.label}.`); if (!quiet) notice(`Cosmetic unlocked — ${it.label}`); }
  }
  return all;
}
function openWardrobe() {
  const h = save.heroes[0];
  $('wpreview').style.backgroundImage = heroSprite(h.look, h.cls);
  $('wname').innerHTML = `<span style="color:${nameColorOf(h)}">${esc(h.name)}</span><br><span class="ttl">«${esc(titleOf(h))}»</span>`;
  picker($('wpick'), SLOTS, h.look, h.cls, save.progress, async id => { if (equip(save, id)) { await be.saveSave(save); render(); openWardrobe(); } });
  if (!$('wardrobe').open) $('wardrobe').showModal();
}
async function startGame() {
  $('game').classList.remove('hidden');
  floor = await be.getFloor(); log(`${save.heroes[0].name} awoke on Floor ${floor.floor}. The guardian stirs.`); log('System notice: log out disabled.');
  notice('Log out disabled'); setTimeout(() => notice(`Floor ${floor.floor} is open`), 700);
  $('lvl').onclick = () => buy('level'); $('gear').onclick = () => buy('gear'); $('wardrobeBtn').onclick = openWardrobe;
  setInterval(tick, 1000); setInterval(sync, 5000); render(); renderLb();
}
function tick() {
  const now = Date.now(), p = computeProgress(save.heroes, save.lastTick, now, OFFLINE_CAP_HOURS);
  save.lastTick = now; save.gold += p.gold; pending += p.damage; floor.hp = Math.max(0, floor.hp - p.damage);
  if (applyXp(save.heroes, p.xp).length) log(`System notice: level ${save.heroes[0].level} reached.`);
  if (p.damage > 0) hitFx(p.damage); $('boss').classList.add('hit'); setTimeout(() => $('boss').classList.remove('hit'), 120); render();
}
async function sync() {
  const r = await be.submitDamage(save.heroes[0].name, pending); pending = 0;
  if (r.advanced) { const f = r.floor - 1; log(`${bossName(f)} fell beneath many blades. The stair to Floor ${r.floor} lies open.`); log(`System notice: Floor ${r.floor} is open.`); floorCleared(f); setTimeout(() => notice(`Floor ${r.floor} is open`), 2400); }
  handleClears(r.clears);
  floor = await be.getFloor(); await be.saveSave(save); render(); renderLb();
}
function buy(kind) {
  const h = save.heroes[0], c = kind === 'level' ? levelCost(h) : gearCost(h); if (save.gold < c) return;
  save.gold -= c; kind === 'level' ? h.level++ : h.gear++; log(kind === 'level' ? `${h.name} trained through the night and rose to level ${h.level}.` : `The forge rang out; ${h.name}'s gear was tempered to +${h.gear}.`); render();
}
function render() {
  const h = save.heroes[0];
  $('hero').style.backgroundImage = heroSprite(h.look, h.cls); $('boss').style.backgroundImage = bossSprite(floor.floor);
  const won = floor.floor >= MAX_FLOOR && floor.hp <= 0;
  $('bname').textContent = won ? 'Log out enabled' : bossName(floor.floor);
  $('floor').textContent = won ? 'System notice · the tower is silent' : `Guardian of Floor ${floor.floor} / ${MAX_FLOOR}`;
  const pct = floor.hp / floor.maxHp, lay = Math.ceil(pct * LAYERS - 1e-9), inLayer = pct * LAYERS - (lay - 1);
  $('layers').innerHTML = Array.from({ length: LAYERS }, (_, i) => `<i class="${i < lay ? 'on' : ''}"></i>`).join('');
  const c = hpColor(pct); $('hpfill').style.width = (lay ? inLayer * 100 : 0) + '%'; $('hpfill').style.background = `linear-gradient(90deg, ${c}aa, ${c})`; $('hpfill').style.color = c;
  $('hptext').textContent = `${fmt(floor.hp)} / ${fmt(floor.maxHp)} HP · ${lay}× layers`;
  $('hname2').innerHTML = `<span style="color:${nameColorOf(h)}">${esc(h.name)}</span> <span class="ttl">${esc(titleOf(h))}</span>`; $('hlv').textContent = `LV ${h.level}`;
  const hp = 0.85 + 0.15 * Math.abs(Math.sin(Date.now() / 3000)); $('hhp').innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i / 20 < hp ? '' : 'off'}"></i>`).join('');
  const xp = h.xp / xpToNext(h.level); $('hxp').innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i / 20 < xp ? '' : 'off'}"></i>`).join('');
  $('stats').innerHTML = `${CLASSES[h.cls].icon} <b>${h.cls}</b> · XP ${h.xp}/${xpToNext(h.level)}<br>Gear <b>+${h.gear}</b> · DPS <b>${heroDps(h).toFixed(1)}</b> · Gold <b>${fmt(save.gold)}</b>`;
  $('lvlL').textContent = `Train ${fmt(levelCost(h))}g`; $('lvl').disabled = save.gold < levelCost(h);
  $('gearL').textContent = `Forge ${fmt(gearCost(h))}g`; $('gear').disabled = save.gold < gearCost(h);
}
async function renderLb() {
  const h = save.heroes[0];
  $('lb').innerHTML = (await be.leaderboard()).map(r => {
    const me = r.name === h.name, pr = me ? { title: titleOf(h), color: nameColorOf(h) } : fakeProfile(r.name);
    return `<li class="${me ? 'me' : ''}"><span style="color:${pr.color}">${esc(r.name)}</span> — ${fmt(r.damage)}<br><span class="ttl">${esc(pr.title)}</span></li>`;
  }).join('');
}
boot();

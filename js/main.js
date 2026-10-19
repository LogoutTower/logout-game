import { CLASSES, newHero, heroDps, levelCost, gearCost, computeProgress, accrue, applyXp, offlineCap, bossName, fmt, fmtDur, xpToNext } from './game.js';
import { makeBackend } from './storage.js';
import { grantDrops, equipItem, salvageItem, salvageValue, rarityOf, statLabel, INV_SIZE, GEAR_SLOTS } from './loot.js';
import { OFFLINE_CAP_HOURS, MAX_FLOOR } from '../config.js';
import { bossSprite, bossIsBig, heroSprite } from './sprites.js';
import { SLOTS, CREATION_SLOTS, itemsFor, isUnlocked, unlockText, defaultLook, migrateSave, recordClear, equip, titleOf, nameColorOf, fakeProfile, byId, SAVE_VERSION } from './cosmetics.js';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
let lootLines = [];
let be, save, floor, pending = 0, recent = { dmg: 0, gold: 0, xp: 0 }, quietSync = true, cls = 'Vanguard', draftLook = defaultLook('Vanguard'), toastT;
const log = (m, color) => { const d = document.createElement('div'); d.textContent = m; if (m.startsWith('System notice')) d.className = 'rune'; if (color) { d.style.color = color; d.className = 'loot'; } $('log').prepend(d); };
function notice(m, color) { const n = document.createElement('div'); n.className = 'notice'; if (color) n.style.borderColor = color; n.innerHTML = `<small>◈ System notice</small><span${color ? ` style="color:${color}"` : ''}>${esc(m)}</span>`; $('notices').append(n); setTimeout(() => n.remove(), 3200); }
function floorCleared(f) { $('clearedSub').textContent = `${bossName(f)} has fallen`; const c = $('cleared'); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
const LAYERS = 5;
const hpColor = pct => pct > 0.5 ? '#5cff9a' : pct > 0.2 ? '#ffd84f' : '#ff3355';
function hitFx(dmg, mine = true) {
  const fx = $('fx'), b = $('boss'), r = b.getBoundingClientRect(), a = fx.getBoundingClientRect();
  const x = r.left - a.left + r.width / 2, y = r.top - a.top + r.height / 2;
  const d = document.createElement('span'); d.className = 'dmg' + (mine ? ' me' : ''); d.textContent = fmt(dmg); d.style.left = (x - 20 + Math.random() * 40) + 'px'; d.style.top = (y - 30) + 'px';
  const s = document.createElement('i'); s.className = 'slash'; s.style.left = (x - 60) + 'px'; s.style.top = y + 'px';
  fx.append(d, s); setTimeout(() => { d.remove(); s.remove(); }, 1000);
}
const SLOT_LABEL = { skin: 'Skin', hairColor: 'Hair colour', hairStyle: 'Hair style', outfitColor: 'Outfit colour', outfitStyle: 'Outfit style', trim: 'Armor trim', weapon: 'Weapon', weaponColor: 'Weapon finish', aura: 'Aura', title: 'Title', nameColor: 'Name colour' };
const COLOR_SLOTS = ['skin', 'hairColor', 'outfitColor', 'trim', 'weaponColor', 'nameColor', 'aura'];
const toast = m => notice(m.replace(/^System notice: /, ''));

function picker(el, slots, look, heroCls, progress, onPick) {
  el.innerHTML = slots.map(slot => `<div class="slot"><b>${SLOT_LABEL[slot]}</b>${itemsFor(slot, heroCls).map(it => {
    const ok = isUnlocked(it, progress), sel = look[slot] === it.id;
    return `<button class="opt ${sel ? 'sel' : ''} ${ok ? '' : 'locked'}" data-id="${it.id}" ${ok ? '' : `title="Locked: ${unlockText(it.unlock)}"`}>${COLOR_SLOTS.includes(slot) ? `<i style="background:${it.value}"></i>` : ''}${it.label}${ok ? '' : ` 🔒 ${unlockText(it.unlock)}`}</button>`;
  }).join('')}</div>`).join('');
  el.onclick = e => { const b = e.target.closest('button.opt'); if (b && !b.classList.contains('locked')) onPick(b.dataset.id); };
}

async function boot() {
  $('maxf').textContent = MAX_FLOOR;
  be = await makeBackend(); save = migrateSave(await be.loadSave());
  if (!save) return showCreate();
  const cap = offlineCap(save.heroes, OFFLINE_CAP_HOURS), p = computeProgress(save.heroes, save.lastTick, Date.now(), cap);
  if (p.secs > 30) {
    save.gold += p.gold; const ups = applyXp(save.heroes, p.xp); const r = await be.submitDamage(save.heroes[0].name, p.damage);
    lootLines = []; const got = handleClears(r.clears, true);
    $('awaytxt').innerHTML = `Log out disabled. You fought on for ${fmtDur(p.secs)}${p.capped ? ` (capped at ${cap}h)` : ''}<br>Damage: ${fmt(p.damage)}<br>Gold: +${fmt(p.gold)}<br>XP: +${fmt(p.xp)}${ups.length ? `<br>Level ups: ${ups.length}` : ''}${r.advanced ? `<br>Floors cleared: ${r.advanced}. Floor ${r.floor} is open.` : ''}${got.length ? `<br>Cosmetics unlocked: ${got.map(i => esc(i.label)).join(', ')}` : ''}${lootLines.length ? `<br>Loot: ${lootLines.join(', ')}` : ''}`;
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
    save = migrateSave({ version: 2, heroes: [h], gold: 0, lastTick: Date.now(), progress: { cleared: [], top3: [], rank1: 0 } }); // fills v3 fields
    await be.saveSave(save); $('create').classList.add('hidden'); startGame(true);
  };
}
function handleClears(clears = [], quiet = false) {
  const me = save.heroes[0].name, all = [];
  for (const c of clears) {
    const got = recordClear(save, c.floor, c.ranking.indexOf(me) + 1, c.maxHp ? (c.dmg?.[me] || 0) / c.maxHp : 1); all.push(...got);
    for (const it of got) { log(`System notice: cosmetic unlocked — ${it.label}.`); if (!quiet) notice(`Cosmetic unlocked — ${it.label}`); }
    const share = c.maxHp ? (c.dmg?.[me] || 0) / c.maxHp : 0, d = grantDrops(save, c.floor, share);
    for (const it of d.items) { const R = rarityOf(it.rarity); log(`Loot · ${R.label} ${it.name} (Floor ${c.floor})`, R.color); lootLines.push(`<span style="color:${R.color}">${esc(R.label)} ${esc(it.name)}</span>`); if (!quiet) notice(`${R.label} drop — ${it.name}`, R.color); }
    if (d.salvaged) log(`Bag full: a drop was salvaged for ${fmt(d.salvaged)} gold.`);
    if (d.cosmetic) { const it = byId(d.cosmetic); log(`System notice: rare cosmetic drop — ${it.label}!`, '#ffb02e'); lootLines.push(`<span style="color:#ffb02e">${esc(it.label)} (cosmetic)</span>`); all.push(it); if (!quiet) notice(`Rare cosmetic — ${it.label}`, '#ffb02e'); }
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
async function startGame(fresh = false) {
  $('game').classList.remove('hidden');
  floor = await be.getFloor(); log(`${save.heroes[0].name} awoke on Floor ${floor.floor}. The guardian stirs.`); log('System notice: log out disabled.');
  if (fresh) { notice('Log out disabled'); setTimeout(() => notice(`Floor ${floor.floor} is open`), 900); } // no replayed notices on reload
  $('lvl').onclick = () => buy('level'); $('gear').onclick = () => buy('gear'); $('wardrobeBtn').onclick = openWardrobe;
  $('helpBtn').onclick = () => tourShow(0); $('bagBtn').onclick = openBag; placeDock();
  setInterval(tick, 1000); setInterval(sync, 5000); render(); renderLb();
  if (!save.tutorialSeen) setTimeout(startTour, fresh ? 1600 : 400);
}
function tick() {
  const p = accrue(save, Date.now(), OFFLINE_CAP_HOURS);
  save.gold += p.gold; recent.dmg += p.damage; recent.gold += p.gold; recent.xp += p.xp; pending += p.damage; floor.hp = Math.max(0, floor.hp - p.damage);
  if (applyXp(save.heroes, p.xp).length) { log(`System notice: level ${save.heroes[0].level} reached.`); notice(`Level ${save.heroes[0].level} reached`); }
  if (p.damage > 0) hitFx(p.damage); $('boss').classList.add('hit'); setTimeout(() => $('boss').classList.remove('hit'), 120); render();
}
async function sync() {
  const r = await be.submitDamage(save.heroes[0].name, pending); pending = 0;
  if (recent.dmg > 0) { log(`You strike for ${fmt(recent.dmg)} · +${fmt(recent.gold)} gold · +${fmt(recent.xp)} XP`); recent = { dmg: 0, gold: 0, xp: 0 }; }
  const quiet = quietSync; quietSync = false; // clears that happened before this session are logged, not re-toasted
  if (r.advanced) { const f = r.floor - 1; log(`${bossName(f)} fell beneath many blades. The stair to Floor ${r.floor} lies open.`); log(`System notice: Floor ${r.floor} is open.`); floorCleared(f); setTimeout(() => notice(`Floor ${r.floor} is open`), 2400); }
  handleClears(r.clears, quiet);
  floor = await be.getFloor(); await be.saveSave(save); render(); renderLb();
}
function buy(kind) {
  const h = save.heroes[0], c = kind === 'level' ? levelCost(h) : gearCost(h); if (save.gold < c) return;
  save.gold -= c; kind === 'level' ? h.level++ : h.gear++; log(kind === 'level' ? `${h.name} trained through the night and rose to level ${h.level}.` : `The forge rang out; ${h.name}'s gear was tempered to +${h.gear}.`); render();
}
function render() {
  const h = save.heroes[0];
  $('hero').style.backgroundImage = heroSprite(h.look, h.cls); const au = byId(h.look.aura || 'au-none')?.value; $('hero').style.filter = au ? `drop-shadow(0 0 1.5px ${au}) drop-shadow(0 0 3px ${au})` : ''; $('boss').style.backgroundImage = bossSprite(floor.floor); $('boss').classList.toggle('big', bossIsBig(floor.floor));
  const won = floor.floor >= MAX_FLOOR && floor.hp <= 0;
  $('bname').textContent = won ? 'Log out enabled' : bossName(floor.floor);
  $('floor').textContent = won ? 'System notice · the tower is silent' : `Guardian of Floor ${floor.floor} / ${MAX_FLOOR}`;
  const pct = floor.hp / floor.maxHp, lay = Math.ceil(pct * LAYERS - 1e-9), inLayer = pct * LAYERS - (lay - 1);
  $('layers').innerHTML = Array.from({ length: LAYERS }, (_, i) => `<i class="${i < lay ? 'on' : ''}"></i>`).join('');
  const c = hpColor(pct); $('hpfill').style.width = (lay ? inLayer * 100 : 0) + '%'; $('hpfill').style.background = `linear-gradient(90deg, ${c}aa, ${c})`; $('hpfill').style.color = c;
  $('hptext').textContent = `${fmt(floor.hp)} / ${fmt(floor.maxHp)} HP · ${lay}× layers`;
  $('hname2').innerHTML = `<div style="color:${nameColorOf(h)}">${esc(h.name)}</div><div class="ttl">${esc(titleOf(h))}</div>`; $('hlv').textContent = `LV ${h.level}`;
  const hp = 0.85 + 0.15 * Math.abs(Math.sin(Date.now() / 3000)); $('hhp').innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i / 20 < hp ? '' : 'off'}"></i>`).join('');
  const xp = h.xp / xpToNext(h.level); $('hxp').innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i / 20 < xp ? '' : 'off'}"></i>`).join('');
  $('stats').innerHTML = `${CLASSES[h.cls].icon} <b>${h.cls}</b> · XP ${h.xp}/${xpToNext(h.level)}<br>Gear <b>+${h.gear}</b> · DPS <b>${heroDps(h).toFixed(1)}</b> · Gold <b>${fmt(save.gold)}</b>`;
  $('lvlL').textContent = `Train ${fmt(levelCost(h))}g`; $('lvl').title = `Train: +1 level for ${fmt(levelCost(h))} gold`; $('lvl').disabled = save.gold < levelCost(h);
  $('equipped').innerHTML = GEAR_SLOTS.map(s => { const it = h.equip?.[s]; return `<span class="eq" style="${it ? `color:${rarityOf(it.rarity).color}` : ''}">${s[0].toUpperCase() + s.slice(1)}: ${it ? esc(it.name) : '—'}</span>`; }).join('');
  $('bagL').textContent = `Bag ${save.inv.length}/${INV_SIZE}`; $('gear').title = 'Forge: temper your weapon, +15% damage per tier';
  $('gearL').textContent = `Forge ${fmt(gearCost(h))}g`; $('gear').disabled = save.gold < gearCost(h);
}
async function renderLb() {
  const h = save.heroes[0];
  $('lb').innerHTML = (await be.leaderboard(h.name)).map(r => {
    const me = r.name === h.name, pr = me ? { title: titleOf(h), color: nameColorOf(h) } : fakeProfile(r.name);
    return `<li class="${me ? 'me' : ''}" value="${r.rank}"><span style="color:${pr.color}">${esc(r.name)}</span> — ${fmt(r.damage)}<br><span class="ttl">${esc(pr.title)}</span></li>`;
  }).join('');
}
// ---- Bag: inventory grid, compare panel, equip and salvage
let bagSel = -1;
const itemCard = (it, cls = '') => { const R = rarityOf(it.rarity); return `<div class="item ${cls}" style="--rc:${R.color}"><b style="color:${R.color}">${esc(it.name)}</b><small>${R.label} · ${it.slot} · Floor ${it.floor} · ${it.element}</small>${Object.entries(it.stats).map(([k, v]) => `<div>${statLabel(k, v)}</div>`).join('')}</div>`; };
function openBag() {
  const h = save.heroes[0];
  $('bagCount').textContent = `· ${save.inv.length} / ${INV_SIZE}`;
  $('eqrow').innerHTML = GEAR_SLOTS.map(s => { const it = h.equip[s]; return `<div class="eqslot" title="${s}">${it ? itemCard(it, 'mini') : `<div class="item mini empty">${s}: empty</div>`}</div>`; }).join('');
  $('bagGrid').innerHTML = Array.from({ length: INV_SIZE }, (_, i) => { const it = save.inv[i]; if (!it) return '<button class="cell" disabled aria-label="empty slot"></button>';
    const R = rarityOf(it.rarity); return `<button class="cell ${i === bagSel ? 'sel' : ''}" data-i="${i}" style="--rc:${R.color}" title="${esc(R.label + ' ' + it.name)}">${{ weapon: '⚔', armor: '⛨', trinket: '◈' }[it.slot]}</button>`; }).join('');
  $('bagGrid').onclick = e => { const b = e.target.closest('button.cell[data-i]'); if (b) { bagSel = +b.dataset.i; openBag(); } };
  const it = save.inv[bagSel];
  if (it) {
    const cur = h.equip[it.slot], before = heroDps(h), trial = { ...h, equip: { ...h.equip, [it.slot]: it } }, delta = heroDps(trial) - before;
    $('bagDetail').innerHTML = `${itemCard(it)}<div class="vs">vs equipped</div>${cur ? itemCard(cur, 'mini') : '<div class="item mini empty">nothing equipped</div>'}
      <p class="delta" style="color:${delta >= 0 ? '#5cff8a' : '#ff3355'}">DPS ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} (${before.toFixed(1)} → ${(before + delta).toFixed(1)})</p>${['goldPct', 'xpPct', 'capH'].map(k => { const d = (it.stats[k] || 0) - (cur?.stats[k] || 0); return d ? `<div style="color:${d > 0 ? '#5cff8a' : '#ff3355'}">${k === 'capH' ? 'Offline cap' : k === 'goldPct' ? 'Gold' : 'XP'} ${d > 0 ? '+' : ''}${d}${k === 'capH' ? 'h' : '%'}</div>` : ''; }).join('')}
      <div class="bagbtns"><button id="bEquip" class="cta">Equip</button><button id="bSalv">Salvage · ${fmt(salvageValue(it))}g</button></div>`;
    $('bEquip').onclick = async () => { equipItem(save, bagSel); log(`Equipped ${it.name}.`, rarityOf(it.rarity).color); bagSel = -1; await be.saveSave(save); render(); openBag(); };
    $('bSalv').onclick = async () => { const g = salvageItem(save, bagSel); log(`Salvaged ${it.name} for ${fmt(g)} gold.`); bagSel = -1; await be.saveSave(save); render(); openBag(); };
  } else $('bagDetail').innerHTML = '<p class="sub">Select an item to compare it with what you have equipped.</p>';
  if (!$('bag').open) $('bag').showModal();
}

// ---- intro walkthrough (System notice voice). Seen flag lives in the save; the ? button reopens it.
const TOUR = [
  { t: 'You fight on your own', x: 'Your hero attacks the floor guardian automatically, every second, even while you are offline. Close the tab; the tower keeps count.', el: () => $('arena') },
  { t: 'Gold and XP', x: 'Every hit pays out: 10% of your damage becomes gold and 5% becomes XP. Fill the XP bar to level up and hit harder.', el: () => $('stats') },
  { t: 'Train · Forge · Wardrobe', x: 'Train spends gold on a level. Forge tempers your gear for +15% damage per tier. Wardrobe changes your look; it is cosmetic only.', el: () => $('dock') },
  { t: 'One guardian, whole server', x: 'Everyone in the tower shares this boss. Top damage when it falls earns titles, name colours and other rewards.', el: () => $('lb').closest('.panel') },
  { t: 'Layers', x: 'The guardian\'s HP comes in layers: each diamond is one full HP bar. Break every layer to clear the floor and open the stair.', el: () => $('layers').closest('.gauge') },
];
let tourAt = -1;
function tourShow(i) {
  document.querySelectorAll('.tour-hi').forEach(e => e.classList.remove('tour-hi'));
  if (i < 0 || i >= TOUR.length) { $('tour').classList.add('hidden'); tourAt = -1; if (!save.tutorialSeen) { save.tutorialSeen = true; be.saveSave(save); } return; }
  tourAt = i; const s = TOUR[i], el = s.el();
  $('tstep').textContent = `◈ System notice · ${i + 1} / ${TOUR.length}`; $('ttitle').textContent = s.t; $('ttext').textContent = s.x;
  $('tback').disabled = i === 0; $('tnext').textContent = i === TOUR.length - 1 ? 'Done' : 'Next';
  $('tour').classList.remove('hidden');
  if (el) { el.classList.add('tour-hi'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}
function startTour() { if ($('away').open) return $('away').addEventListener('close', startTour, { once: true }); tourShow(0); }
$('tnext').onclick = () => tourShow(tourAt + 1); $('tback').onclick = () => tourShow(Math.max(0, tourAt - 1)); $('tskip').onclick = () => tourShow(TOUR.length);

// On phones the action bar becomes a fixed dock; it must live under <body> because the glass panel's backdrop-filter traps position:fixed.
const dockMQ = matchMedia('(max-width: 640px)'), dockHome = document.createComment('dock');
function placeDock() { const d = $('dock'); if (dockMQ.matches) { if (d.parentNode !== document.body) { d.replaceWith(dockHome); document.body.append(d); } } else if (dockHome.parentNode) dockHome.replaceWith(d); }
dockMQ.addEventListener('change', placeDock);
boot();

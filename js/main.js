import { effectsOf, CLASSES, newHero, heroDps, levelCost, gearCost, accrue, offlineProgress, applyXp, heroHp, heroMaxHp, isWorn, effectiveDps, buffsOf, bossName, fmt, fmtDur, xpToNext } from './game.js';
import { makeBackend } from './storage.js';
import { priceFor, innCost, rest, shopStock, buy as shopBuy, soldOut, npcGrid } from './town.js';
import { sprite } from './sprites.js';
import { isSpecialSlot, bossInfo } from './floors.js';
import { treeOf, nodeById, canLearn, learn, freePoints, totalPoints, spentIn, respec, respecCost } from './talents.js';
import { TRICKLE, trickleDrops, grantDrops, equipItem, salvageItem, salvageValue, rarityOf, statLabel, INV_SIZE, GEAR_SLOTS } from './loot.js';
import { OFFLINE_CAP_HOURS, MAX_FLOOR, FEATURES, SOLANA_RPC, TOKEN_MINT, HOLDER_THRESHOLD } from '../config.js';
import { featureOn } from './features.js';
import { holderStatus } from './supabase.js';
import { bossSprite, bossIsBig, heroSprite } from './sprites.js';
import { SLOTS, CREATION_SLOTS, itemsFor, isUnlocked, unlockText, defaultLook, migrateSave, recordClear, equip, titleOf, nameColorOf, fakeProfile, byId, SAVE_VERSION } from './cosmetics.js';
const $ = id => document.getElementById(id);
// Write only when changed: avoids rebuilding nodes (and layout shifts that eat clicks) on every 1s tick.
const H = id => { const e = $(id); return { set innerHTML(v) { if (e._v !== v) { e._v = v; e.innerHTML = v; } }, set textContent(v) { if (e.textContent !== v) e.textContent = v; } }; };
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
let lootLines = [];
let be, save, floor, pending = 0, recent = { dmg: 0, gold: 0, xp: 0 }, quietSync = true, cls = 'Vanguard', draftLook = defaultLook('Vanguard'), toastT;
const log = (m, color) => { const d = document.createElement('div'); d.textContent = m; if (m.startsWith('System notice')) d.className = 'rune'; if (color) { d.style.color = color; d.className = 'loot'; } if (color === '#7ff6ff') d.className = 'loot uniq'; $('log').prepend(d); };
function notice(m, color) { const n = document.createElement('div'); n.className = 'notice' + (color === '#7ff6ff' ? ' uniq' : ''); if (color) n.style.borderColor = color; n.innerHTML = `<small>◈ System notice</small><span${color ? ` style="color:${color}"` : ''}>${esc(m)}</span>`; $('notices').append(n); setTimeout(() => n.remove(), color === '#7ff6ff' ? 7000 : 3200); }
const sessionStart = Date.now(); let hits = 0, lastWhisper = Date.now();
const WHISPERS = ['The weapon hums a floor number you have not reached.', 'Something in the blade asks whether you remember logging in.', 'A whisper: "the guardian is afraid of you."', 'The weapon murmurs your name, then someone else\'s.', 'A voice from the steel: "one more floor."'];
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
  be = await makeBackend(); save = migrateSave(await be.loadSave()); if (save) delete save.ctx; // live-only context, never trusted from storage
  if (!save) return showCreate();
  { const f0 = (await be.getFloor()).floor, bi = bossInfo(f0); save.ctx = { element: bi.lootElement, special: isSpecialSlot(f0) }; } // offline maths sees the same floor context
  const p = offlineProgress(save, Date.now(), OFFLINE_CAP_HOURS), cap = p.cap, h0 = save.heroes[0];
  save.gold += p.gold; const ups = applyXp(save.heroes, p.xp); pending += p.damage;
  const offFloor = (await be.getFloor()).floor, trickled = trickleDrops(save, p.secs, offFloor, TRICKLE.offlineMax);
  if (p.secs > 30) {
    const r = await be.submitDamage(h0.name, pending, h0); pending = 0;
    lootLines = []; const got = handleClears(r.clears, true);
    $('awaytxt').innerHTML = `Log out disabled. You fought on for ${fmtDur(p.secs)}${p.capped ? ` (capped at ${cap}h)` : ''}${p.vigilUsed ? ' · Scroll of Vigil burned' : ''}<br>HP: ${Math.round(heroHp(h0))} / ${heroMaxHp(h0)}${p.lowSecs > 0 ? ` · worn down for ${fmtDur(p.lowSecs)} (DPS halved). Rest at the inn.` : ''}<br>Damage: ${fmt(p.damage)}<br>Gold: +${fmt(p.gold)}<br>XP: +${fmt(p.xp)}${ups.length ? `<br>Level ups: ${ups.length}` : ''}${r.advanced ? `<br>Floors cleared: ${r.advanced}. Floor ${r.floor} is open.` : ''}${got.length ? `<br>Cosmetics unlocked: ${got.map(i => esc(i.label)).join(', ')}` : ''}${lootLines.length || trickled.length ? `<br>Loot: ${[...lootLines, ...trickled.map(it => `<span style="color:${rarityOf(it.rarity).color}">${esc(it.name)}</span>`)].join(', ')}` : ''}`;
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
    for (const it of d.items) { const R = rarityOf(it.rarity); if (it.rarity === 'unique') { log(`System notice: UNIQUE item acquired — ${it.name} · ${it.stamp}. ${it.ability.text}; drawback: ${it.drawback.text}.`, R.color); if (!quiet) notice(`UNIQUE item acquired — ${it.name}`, R.color); lootLines.push(`<span class="uniq">UNIQUE ${esc(it.name)}</span>`); continue; } log(`Loot · ${R.label} ${it.name} (Floor ${c.floor})`, R.color); lootLines.push(`<span style="color:${R.color}">${esc(R.label)} ${esc(it.name)}</span>`); if (!quiet) notice(`${R.label} drop — ${it.name}`, R.color); }
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
  $('townBtn').onclick = openTown; $('helpBtn').onclick = () => tourShow(0); $('bagBtn').onclick = openBag; $('sysBtn').onclick = openSystem; $('talBtn').onclick = () => { talSel = null; openTalents(); }; placeDock();
  setInterval(tick, 1000); setInterval(sync, 5000); render(); renderLb();
  if (!save.tutorialSeen) startTour(); // right after creation, and once for older saves
}
function tick() {
  save.ctx = { bossPct: floor.maxHp ? floor.hp / floor.maxHp : 1, special: isSpecialSlot(floor.floor), element: bossInfo(floor.floor).lootElement, sessionSecs: (Date.now() - sessionStart) / 1000 };
  const p = accrue(save, Date.now(), OFFLINE_CAP_HOURS), fx = effectsOf(save.heroes[0]);
  if (fx.has('whisper') && Date.now() - lastWhisper > 120000) { lastWhisper = Date.now(); log(WHISPERS[Math.floor(Math.random() * WHISPERS.length)], '#b9a8ff'); }
  save.gold += p.gold; recent.dmg += p.damage; recent.gold += p.gold; recent.xp += p.xp; pending += p.damage; floor.hp = Math.max(0, floor.hp - p.damage);
  if (applyXp(save.heroes, p.xp).length) { log(`System notice: level ${save.heroes[0].level} reached.`); notice(`Level ${save.heroes[0].level} reached · +1 talent point`); }
  for (const it of trickleDrops(save, p.secs, floor.floor, p.secs > 2 ? TRICKLE.offlineMax : Infinity)) { const R = rarityOf(it.rarity); log(`Loot · ${R.label} ${it.name}${it.salvaged ? ' (bag full: salvaged)' : ''}`, R.color); notice(`${R.label} find — ${it.name}`, R.color); }
  if (p.damage > 0) { hits++; if (fx.has('tenth') && hits % 10 === 0) { hitFx(p.damage); log('The Tenth Bell rings — double hit.', '#7ff6ff'); } hitFx(p.damage); } $('boss').classList.add('hit'); setTimeout(() => $('boss').classList.remove('hit'), 120); render();
}
// Background tabs throttle timers: every tick measures real elapsed time (accrue = offline maths), and we catch up as soon as the tab is visible or focused.
let lastCatchUp = 0;
function catchUp() { if (!save || !floor || Date.now() - lastCatchUp < 500) return; lastCatchUp = Date.now(); tick(); sync(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) catchUp(); });
addEventListener('focus', catchUp); addEventListener('pageshow', catchUp);
async function sync() {
  const r = await be.submitDamage(save.heroes[0].name, pending, save.heroes[0]); pending = 0;
  if (recent.dmg > 0) { log(`You strike for ${fmt(recent.dmg)} · +${fmt(recent.gold)} gold · +${fmt(recent.xp)} XP`); recent = { dmg: 0, gold: 0, xp: 0 }; }
  const quiet = quietSync; quietSync = false; // clears that happened before this session are logged, not re-toasted
  if (r.advanced) { const f = r.floor - 1; log(`${bossName(f)} fell beneath many blades. The stair to Floor ${r.floor} lies open.`); log(`System notice: Floor ${r.floor} is open.`); floorCleared(f); setTimeout(() => notice(`Floor ${r.floor} is open`), 2400); }
  handleClears(r.clears, quiet);
  floor = await be.getFloor(); await be.saveSave(save); render(); renderLb();
}
function buy(kind) {
  const h = save.heroes[0], c = kind === 'level' ? levelCost(h) : gearCost(h); if (save.gold < c) return;
  save.gold -= c; kind === 'level' ? h.level++ : h.gear++; log(kind === 'level' ? `${h.name} trained through the night and rose to level ${h.level}.` : `The forge rang out; ${h.name}'s gear was tempered to +${h.gear}.`);
  render(); be.saveSave(save);
}
function render() {
  const h = save.heroes[0];
  $('hero').style.backgroundImage = heroSprite(h.look, h.cls); const au = byId(h.look.aura || 'au-none')?.value; $('hero').style.filter = au ? `drop-shadow(0 0 1.5px ${au}) drop-shadow(0 0 3px ${au})` : ''; $('boss').style.backgroundImage = bossSprite(floor.floor); $('boss').classList.toggle('big', bossIsBig(floor.floor));
  const won = floor.floor >= MAX_FLOOR && floor.hp <= 0;
  H('bname').textContent = won ? 'Log out enabled' : bossName(floor.floor);
  H('floor').textContent = won ? 'System notice · the tower is silent' : `Guardian of Floor ${floor.floor} / ${MAX_FLOOR}`;
  const pct = floor.hp / floor.maxHp, lay = Math.ceil(pct * LAYERS - 1e-9), inLayer = pct * LAYERS - (lay - 1);
  H('layers').innerHTML = Array.from({ length: LAYERS }, (_, i) => `<i class="${i < lay ? 'on' : ''}"></i>`).join('');
  const c = hpColor(pct); $('hpfill').style.width = (lay ? inLayer * 100 : 0) + '%'; $('hpfill').style.background = `linear-gradient(90deg, ${c}aa, ${c})`; $('hpfill').style.color = c;
  H('hptext').textContent = `${fmt(floor.hp)} / ${fmt(floor.maxHp)} HP · ${lay}× layers`;
  H('hname2').innerHTML = `<div style="color:${nameColorOf(h)}">${esc(h.name)}</div><div class="ttl">${esc(titleOf(h))}</div>`; H('hlv').textContent = `LV ${h.level}`;
  const hp = heroHp(h) / heroMaxHp(h), worn = isWorn(h); $('hhp').className = 'seg' + (worn ? ' worn' : hp < 0.6 ? ' mid' : ''); H('hhp').innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i / 20 < hp ? '' : 'off'}"></i>`).join('');
  $('hhp').title = `HP ${Math.round(heroHp(h))} / ${heroMaxHp(h)}`;
  const b = buffsOf(save), mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  H('buffs').innerHTML = [worn ? '<span class="buff bad" title="Below 30% HP: DPS halved">Worn down · DPS ½</span>' : '', b.rested > 0 ? `<span class="buff" title="+15% gold and XP">Well Rested ${mmss(b.rested)}</span>` : '',
    b.elixir > 0 ? `<span class="buff" title="+25% DPS">Fury ${mmss(b.elixir)}</span>` : '', b.vigil > 0 ? `<span class="buff" title="Offline cap raised once">Vigil +${b.vigil}h</span>` : ''].join('');
  const xp = h.xp / xpToNext(h.level); H('hxp').innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i / 20 < xp ? '' : 'off'}"></i>`).join('');
  H('stats').innerHTML = `${CLASSES[h.cls].icon} <b>${h.cls}</b> · XP ${h.xp}/${xpToNext(h.level)}<br>Gear <b>+${h.gear}</b> · DPS <b>${effectiveDps(save).toFixed(1)}</b> · HP <b>${Math.round(heroHp(h))}/${heroMaxHp(h)}</b> · Gold <b>${fmt(save.gold)}</b>`;
  H('lvlL').textContent = `Train ${fmt(levelCost(h))}g`; $('lvl').title = `Train: +1 level for ${fmt(levelCost(h))} gold`; $('lvl').disabled = save.gold < levelCost(h);
  H('equipped').innerHTML = GEAR_SLOTS.map(s => { const it = h.equip?.[s]; return `<span class="eq" style="${it ? `color:${rarityOf(it.rarity).color}` : ''}">${s[0].toUpperCase() + s.slice(1)}: ${it ? esc(it.name) : '—'}</span>`; }).join('');
  { const fp = freePoints(h); const tb = $('talBadge'); if (tb.hidden !== !(fp > 0)) tb.hidden = !(fp > 0); if (tb.textContent !== String(fp)) tb.textContent = fp; }
  H('bagL').textContent = `Bag ${save.inv.length}/${INV_SIZE}`; $('gear').title = 'Forge: temper your weapon, +15% damage per tier';
  H('gearL').textContent = `Forge ${fmt(gearCost(h))}g`; $('gear').disabled = save.gold < gearCost(h);
}
async function renderLb() {
  const h = save.heroes[0];
  $('lb').innerHTML = (await be.leaderboard(h.name)).map(r => {
    const me = r.name === h.name, pr = me ? { title: titleOf(h), color: nameColorOf(h) } : fakeProfile(r.name);
    return `<li class="${me ? 'me' : ''}" value="${r.rank}"><span style="color:${pr.color}">${esc(r.name)}</span> — ${fmt(r.damage)}<br><span class="ttl">${esc(pr.title)}</span>${me && r.rank > 3 ? '<div class="climb">Climb: Train, Forge and equip loot to raise DPS. Top 3 on a kill earns rare rewards.</div>' : ''}</li>`;
  }).join('');
}
// ---- Town (safe zone of the current floor): inn + rotating shop
function openTown() {
  const f = floor.floor, now = Date.now(), st = shopStock(f, now), h = save.heroes[0], c = innCost(f, save);
  $('townTitle').textContent = `Town of Floor ${f}`;
  $('innkeeper').style.backgroundImage = sprite(npcGrid('innkeeper').rows, npcGrid('innkeeper').pal); $('merchant').style.backgroundImage = sprite(npcGrid('merchant').rows, npcGrid('merchant').pal);
  $('innInfo').innerHTML = `HP <b>${Math.round(heroHp(h))} / ${heroMaxHp(h)}</b>${isWorn(h) ? ' · <span class="bad">worn down</span>' : ''}`;
  $('restBtn').textContent = `Rest · ${fmt(c)}g`; $('restBtn').disabled = save.gold < c;
  $('restBtn').onclick = async () => { if (rest(save, f)) { log('You slept at the inn. HP restored · Well Rested (+15% gold & XP, 30 min).', '#5cff8a'); notice('Well Rested · +15% gold & XP'); await be.saveSave(save); render(); openTown(); } };
  const left = st.endsAt - now; $('shopTimer').textContent = `New stock in ${fmtDur(left / 1000)}`;
  $('shopList').innerHTML = st.items.map((it, i) => { const R = it.item ? rarityOf(it.item.rarity) : null, out = soldOut(save, st, i);
    return `<div class="srow" ${R ? `style="--rc:${R.color}"` : ''}><div><b style="${R ? `color:${R.color}` : ''}">${esc(it.name)}</b><small>${R ? `${R.label} ${it.item.slot} · ${Object.entries(it.item.stats).map(([k, v]) => statLabel(k, v)).join(' · ')}` : esc(it.desc)}</small></div>
      <button data-i="${i}" ${out || save.gold < priceFor(save, it) ? 'disabled' : ''}>${out ? 'Sold' : `${fmt(priceFor(save, it))}g`}</button></div>`; }).join('');
  $('shopList').onclick = async e => { const btn = e.target.closest('button[data-i]'); if (!btn) return; const got = shopBuy(save, f, Date.now(), +btn.dataset.i);
    if (got) { log(`Bought ${got}.`); notice(`Bought · ${got}`); await be.saveSave(save); render(); } openTown(); };
  $('townGold').textContent = `Gold ${fmt(save.gold)}`;
  if (!$('town').open) $('town').showModal();
}

// ---- Bag: inventory grid, compare panel, equip and salvage
let bagSel = -1;
const itemCard = (it, cls = '') => { const R = rarityOf(it.rarity); return `<div class="item ${cls}" style="--rc:${R.color}"><b class="${it.rarity === 'unique' ? 'uniq' : ''}" style="color:${R.color}">${esc(it.name)}</b><small>${R.label} · ${it.slot} · Floor ${it.floor} · ${it.element}</small>${Object.entries(it.stats).map(([k, v]) => `<div>${statLabel(k, v)}</div>`).join('')}${it.rarity === 'unique' ? `<div class="ab">✦ ${esc(it.ability.text)}</div><div class="db">▾ ${esc(it.drawback.text)}</div><div class="lore">${esc(it.lore)}</div><small>${esc(it.stamp)}</small>` : ''}</div>`; };
function openBag() {
  const h = save.heroes[0];
  $('bagCount').textContent = `· ${save.inv.length} / ${INV_SIZE}`;
  $('eqrow').innerHTML = GEAR_SLOTS.map(s => { const it = h.equip[s]; return `<div class="eqslot" title="${s}">${it ? itemCard(it, 'mini') : `<div class="item mini empty">${s}: empty</div>`}</div>`; }).join('');
  $('bagGrid').innerHTML = Array.from({ length: Math.max(INV_SIZE, save.inv.length) }, (_, i) => { const it = save.inv[i]; if (!it) return '<button class="cell" disabled aria-label="empty slot"></button>';
    const R = rarityOf(it.rarity); return `<button class="cell ${i === bagSel ? 'sel' : ''} ${it.rarity === 'unique' ? 'ucell' : ''}" data-i="${i}" style="--rc:${R.color}" title="${esc(R.label + ' ' + it.name)}">${{ weapon: '⚔', armor: '⛨', trinket: '◈' }[it.slot]}</button>`; }).join('');
  $('bagGrid').onclick = e => { const b = e.target.closest('button.cell[data-i]'); if (b) { bagSel = +b.dataset.i; openBag(); } };
  const it = save.inv[bagSel];
  if (it) {
    const cur = h.equip[it.slot], before = heroDps(h), trial = { ...h, equip: { ...h.equip, [it.slot]: it } }, delta = heroDps(trial) - before;
    $('bagDetail').innerHTML = `${itemCard(it)}<div class="vs">vs equipped</div>${cur ? itemCard(cur, 'mini') : '<div class="item mini empty">nothing equipped</div>'}
      <p class="delta" style="color:${delta >= 0 ? '#5cff8a' : '#ff3355'}">DPS ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} (${before.toFixed(1)} → ${(before + delta).toFixed(1)})</p>${['goldPct', 'xpPct', 'capH'].map(k => { const d = (it.stats[k] || 0) - (cur?.stats[k] || 0); return d ? `<div style="color:${d > 0 ? '#5cff8a' : '#ff3355'}">${k === 'capH' ? 'Offline cap' : k === 'goldPct' ? 'Gold' : 'XP'} ${d > 0 ? '+' : ''}${d}${k === 'capH' ? 'h' : '%'}</div>` : ''; }).join('')}
      <div class="bagbtns"><button id="bEquip" class="cta">Equip</button><button id="bSalv">Salvage · ${fmt(salvageValue(it))}g</button></div>`;
    $('bEquip').onclick = async () => { if (!equipItem(save, bagSel)) { notice('Your Unique weapon refuses to share you with a trinket'); return; } log(`Equipped ${it.name}.`, rarityOf(it.rarity).color); bagSel = -1; await be.saveSave(save); render(); openBag(); };
    $('bSalv').onclick = async () => { if (it.rarity === 'unique' && !confirm('Salvage a one-of-a-kind Unique? It can never drop again.')) return; const g = salvageItem(save, bagSel); log(`Salvaged ${it.name} for ${fmt(g)} gold.`); bagSel = -1; await be.saveSave(save); render(); openBag(); };
  } else $('bagDetail').innerHTML = '<p class="sub">Select an item to compare it with what you have equipped.</p>';
  if (!$('bag').open) $('bag').showModal();
}

// ---- intro walkthrough (System notice voice). Seen flag lives in the save; the ? button reopens it.
const TOUR = [
  { t: 'You fight on your own', x: 'Your hero attacks the floor guardian automatically, every second, even while you are offline. Close the tab; the tower keeps count.', el: () => $('arena') },
  { t: 'Gold and XP', x: 'Every hit pays out: 10% of your damage becomes gold and 5% becomes XP. Fill the XP bar to level up and hit harder.', el: () => $('stats') },
  { t: 'Train · Forge · Wardrobe', x: 'Train spends gold on a level. Forge tempers your gear for +15% damage per tier. Wardrobe changes your look (cosmetic only). Bag holds boss loot; Town has an inn to heal and a shop.', el: () => $('dock') },
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
function startTour() { const d = document.querySelector('dialog[open]'); if (d) return d.addEventListener('close', startTour, { once: true }); if (tourAt < 0 && !save.tutorialSeen) tourShow(0); }
$('tnext').onclick = () => tourShow(tourAt + 1); $('tback').onclick = () => tourShow(Math.max(0, tourAt - 1)); $('tskip').onclick = () => tourShow(TOUR.length);

// On phones the action bar becomes a fixed dock; it must live under <body> because the glass panel's backdrop-filter traps position:fixed.
const dockMQ = matchMedia('(max-width: 640px)'), dockHome = document.createComment('dock');
function placeDock() { const d = $('dock'); if (dockMQ.matches) { if (d.parentNode !== document.body) { d.replaceWith(dockHome); document.body.append(d); } } else if (dockHome.parentNode) dockHome.replaceWith(d); }
dockMQ.addEventListener('change', placeDock);
boot();

// ---- Talents: glass-HUD tree, tap a node for its tooltip, Learn / Respec.
let talSel = null;
function openTalents() {
  const h = save.heroes[0], fp = freePoints(h), f = floor.floor, rc = respecCost(h, f);
  $('talPts').textContent = `· ${h.cls} · ${fp} point${fp === 1 ? '' : 's'} free · ${totalPoints(h)} total`;
  $('talTree').innerHTML = treeOf(h.cls).map(b => `<section class="tbranch"><h3>${esc(b.name)} <small>${spentIn(h, b.id)} pts</small></h3><p class="sub">${esc(b.blurb)}</p>${b.nodes.map(n => {
    const r = h.talents?.[n.id] || 0, why = canLearn(h, n.id), gated = why && why.startsWith('needs');
    return `<button class="tnode ${r >= n.max ? 'max' : ''} ${gated ? 'gated' : ''} ${!why ? 'can' : ''} ${n.capstone ? 'cap' : ''} ${talSel === n.id ? 'sel' : ''}" data-id="${n.id}" aria-label="${esc(n.name)} ${r}/${n.max}"><span>${esc(n.name)}</span><b>${r}/${n.max}</b></button>`; }).join('')}</section>`).join('');
  const n = talSel && nodeById(talSel);
  if (n) { const r = h.talents?.[n.id] || 0, why = canLearn(h, n.id);
    $('talTip').innerHTML = `<b>${esc(n.name)}</b>${n.capstone ? ' <small class="capt">capstone</small>' : ''} <small>rank ${r}/${n.max}${n.req ? ` · needs ${n.req} pts in branch` : ''}</small><p>${esc(n.desc)}</p><button id="talLearn" class="cta" ${why ? 'disabled' : ''}>${why ? esc(why) : 'Learn'}</button>`;
    $('talLearn').onclick = async () => { if (learn(h, n.id)) { log(`System notice: talent learned — ${n.name} (${(h.talents[n.id])}/${n.max}).`); await be.saveSave(save); render(); openTalents(); } };
  } else $('talTip').innerHTML = '<p class="sub">Tap a node to see what it does. Later nodes unlock after you spend points in that branch.</p>';
  $('talRespec').textContent = rc ? `Respec · ${fmt(rc)}g` : 'Respec · free once'; $('talRespec').disabled = save.gold < rc || !Object.keys(h.talents || {}).length;
  $('talRespec').onclick = async () => { if (respec(save, f)) { log('System notice: talents reset. All points refunded.'); talSel = null; await be.saveSave(save); render(); openTalents(); } };
  $('talTree').onclick = e => { const b = e.target.closest('.tnode'); if (b) { talSel = b.dataset.id; openTalents(); } };
  if (!$('talents').open) $('talents').showModal();
}

// ---- System / Identity panel. Guest-first; binding is opt-in and feature-flagged.
let gmActive = () => !!be?.isGm?.();
async function openSystem() {
  const online = be.name === 'supabase', canBind = featureOn(FEATURES, 'bindIdentity', gmActive()), anon = online && be.isAnonymous();
  const status = !online ? 'Offline mode. Your progress lives in this browser only.' : anon ? 'Guest identity. Bind it to keep your progress across devices.' : 'Identity bound. Your progress is stored in the tower.';
  $('sysBody').innerHTML = `<div class="sysnote"><p>${esc(status)}</p>
    ${canBind ? `<div class="bind ${online ? '' : 'off'}"><h3>Bind your identity</h3>
      <button id="bindWallet" class="cta" ${online ? '' : 'disabled'}>Sign in with Solana (Phantom)</button>
      <p class="sub">Signature only. $LOGOUT asks your wallet to sign a short message. It never requests a transaction, never sees your keys and never touches your funds.</p>
      <div class="mail"><input id="bindEmail" type="email" placeholder="email for a magic link" ${online ? '' : 'disabled'} autocomplete="email"><button id="bindMail" ${online ? '' : 'disabled'}>Send link</button></div>
      ${online ? '' : '<p class="sub">Online mode is switched off on this server.</p>'}</div>` : ''}
    ${save?.holder ? '<div class="slot2"><b>Holder perk</b> · extra hero slot <span class="sub">(coming soon)</span><div class="emptyslot">+</div></div>' : ''}
    <button class="logout" disabled title="Unlocks on Floor 100">LOG OUT</button><p class="sub center">Log out unlocks on Floor 100.</p>
    <details class="settings"><summary>Settings</summary>${online ? '<button id="sever">Sever link (switch account)</button><p class="sub">Disconnects this browser from the bound identity. Your bound progress stays safe in the tower.</p>' : '<p class="sub">Nothing to sever: this browser is not linked to an online identity.</p>'}<div id="gmSlot"></div></details></div>`;
  const msg = m => { log(`System notice: ${m}`); notice(m); };
  if ($('bindWallet')) $('bindWallet').onclick = async () => { try { const s = await be.bindWallet(); if (s) save = migrateSave(s);
      const pk = window.phantom?.solana?.publicKey?.toString?.(); const hs = await holderStatus(pk, { rpc: SOLANA_RPC, mint: TOKEN_MINT, threshold: HOLDER_THRESHOLD }); if (hs.enabled) save.holder = hs.holder;
      await be.saveSave(save); msg('identity bound to your wallet'); render(); openSystem(); } catch (e) { msg(`binding failed: ${e.message || e}`); } };
  if ($('bindMail')) $('bindMail').onclick = async () => { const em = $('bindEmail').value.trim(); if (!/^\S+@\S+\.\S+$/.test(em)) return notice('Enter a valid email'); try { await be.bindEmail(em); msg('magic link sent, check your inbox'); } catch (e) { msg(`binding failed: ${e.message || e}`); } };
  if ($('sever')) $('sever').onclick = async () => { if (!confirm('Sever the link to this identity on this browser?')) return; await be.sever(); location.reload(); };
  if (typeof renderGmSlot === 'function') renderGmSlot();
  if (!$('system').open) $('system').showModal();
}

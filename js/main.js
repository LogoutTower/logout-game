import { effectsOf, CLASSES, newHero, heroDps, levelCost, gearCost, accrue, offlineProgress, applyXp, heroHp, heroMaxHp, isWorn, effectiveDps, buffsOf, bossName, fmt, fmtDur, xpToNext } from './game.js';
import { makeBackend, onlineConfigured } from './storage.js';
import { BUILD } from './build.js';
import { priceFor, innCost, rest, shopStock, buy as shopBuy, soldOut, npcGrid } from './town.js';
import { sprite } from './sprites.js';
import { isSpecialSlot, bossInfo } from './floors.js';
import { treeOf, nodeById, canLearn, learn, freePoints, totalPoints, spentIn, respec, respecCost } from './talents.js';
import { TRICKLE, trickleDrops, grantDrops, equipItem, salvageItem, salvageValue, rarityOf, statLabel, INV_SIZE, bagSize, GEAR_SLOTS } from './loot.js';
import { GM_PASS_HASH, OFFLINE_CAP_HOURS, MAX_FLOOR, FEATURES, SOLANA_RPC, TOKEN_MINT, HOLDER_THRESHOLD } from '../config.js';
import { featureOn } from './features.js';
import { checkGuild, GUILD_CAP, GUILD_BUFF, STAFF_GUILD, STAFF_MARK, guildError } from './guilds.js';
import { cleanChat, CHAT_MAX } from './chatfilter.js';
import { boardWithStaff, wouldRankLabel } from './ranks.js';
import { gmGear, wearsVesperveil, STAFF_STAMP, VESPERVEIL, staffActive, GM_CLASS, GM_SIGIL, EVENTIDE, gmOn, checkPass, sanitizeSave, becomeGm, leaveGm, eventide, shouldAnnounce } from './gm.js';
import { initUI, go as goTab, townPane, syncHall, setDot, setHeroLabels, heroTab } from './ui.js';
import { openSandbox, sandboxFloor, sandboxFight, sandboxLoot, closeSandbox, sandboxEdit } from './sandbox.js';
import { enforceOneUnique, legendaryArmorPct, legendaryWeaponDps, rerollItem, chooseDestiny, DESTINY_MS } from './loot.js';
import { cx, CODEX, isCodex } from './codex.js';
import { galaxyTier, mountGalaxy } from './galaxy.js';
import { unwrittenHour } from './game.js';
import { towerRows, towerProgress, TOWER_TOP } from './towermap.js';
import { renderGuildV2, invitesHtml } from './guildpanel.js';
import { bannerBadge, hallArt } from './banner.js';
import { slotsOf } from './guildsv2.js';
import { itemIcon } from './icons.js';
import { sellPrice, sellable, toggleLock, sellItem, bulkPreview, sellBulk } from './town.js';
const shownRarity = it => it?.gm ? 'unique' : it?.rarity; // staff items display as Unique (see gm.js)
const ico = (it, cls = 'ico') => `<i class="${cls}${shownRarity(it) === 'unique' ? ' ushim' : ''}" style='background-image:${itemIcon(it).replace(/'/g, '%27')}' aria-hidden="true"></i>`;
import { ELEMENT_WORD } from './loot.js'; const ELEMENTS = Object.keys(ELEMENT_WORD);
import { classOf } from './game.js';
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
function notice(m, color, item = null) { const n = document.createElement('div'); n.className = 'notice' + (color === '#7ff6ff' ? ' uniq' : ''); if (color) n.style.borderColor = color; if (color && cx(save?.heroes?.[0], 'cx-reader')) { n.classList.add('glow-rare'); n.style.setProperty('--glow', color); } /* Thread-Reader */ n.innerHTML = `<small>◈ System notice</small>${item ? ico(item) : ''}<span${color ? ` style="color:${color}"` : ''}>${esc(m)}</span>`; $('notices').append(n); setTimeout(() => n.remove(), color === '#7ff6ff' ? 6000 : 4000); }
const sessionStart = Date.now(); let hits = 0, lastWhisper = Date.now();
const WHISPERS = ['The weapon hums a floor number you have not reached.', 'Something in the blade asks whether you remember logging in.', 'A whisper: "the guardian is afraid of you."', 'The weapon murmurs your name, then someone else\'s.', 'A voice from the steel: "one more floor."'];
function floorCleared(f) { const n = document.createElement('div'); n.className = 'notice cleared'; n.innerHTML = `<small>◈ Floor cleared</small><span>${esc(bossName(f))} has fallen</span>`; $('notices').append(n); setTimeout(() => n.remove(), 4000); }
const LAYERS = 5;
const hpColor = pct => pct > 0.5 ? '#5cff9a' : pct > 0.2 ? '#ffd84f' : '#ff3355';
function hitFx(dmg, mine = true) {
  const fx = $('fx'), b = $('boss'), r = b.getBoundingClientRect(), a = fx.getBoundingClientRect();
  const x = r.left - a.left + r.width / 2, y = r.top - a.top + r.height / 2;
  const gmHit = mine && save?.heroes?.[0]?.cls === GM_CLASS; const d = document.createElement('span'); d.className = 'dmg' + (mine ? ' me' : '') + (gmHit ? ' gm' : ''); d.textContent = fmt(dmg); d.style.left = (x - 20 + Math.random() * 40) + 'px'; d.style.top = (y - 30) + 'px';
  const s = document.createElement('i'); s.className = 'slash'; s.style.left = (x - 60) + 'px'; s.style.top = y + 'px';
  if (gmHit) { s.className = 'slash crack'; s.style.left = (x - 30 + Math.random() * 40) + 'px'; s.style.top = (y - 20 + Math.random() * 30) + 'px'; s.style.rotate = (Math.random() * 360) + 'deg'; } // gold void-crack
  fx.append(d, s); setTimeout(() => { d.remove(); s.remove(); }, 1000);
  if (gmHit && cx(save.heroes[0], 'cx-orbit')) { const u = document.createElement('span'); u.className = 'dmg dust'; u.textContent = '✦'; u.style.left = (x - 40 + Math.random() * 80) + 'px'; u.style.top = (y - 10 + Math.random() * 30) + 'px'; fx.append(u); setTimeout(() => u.remove(), 1000); } // Orbit stardust
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
  be = await makeBackend(); const localUnlock = await checkPass(localStorage.getItem('logout.v1.gm'), GM_PASS_HASH);
  gmValid = staffActive({ serverRole: !!be.isGm?.(), localUnlock }); // policy lives in gm.js
  if (be.name === 'supabase') be.holdUploads = gmValid && !be.isGm(); // local-only staff: no save, name or damage ever leaves this device
  save = migrateSave(await be.loadSave()); if (save) { delete save.ctx; enforceOneUnique(save); } // live-only context, never trusted from storage
  if (save && sanitizeSave(save, gmValid)) { save = migrateSave(save); await be.saveSave(save); } // pasted staff ids are stripped
  if (!save) return showCreate();
  if (gmValid) save.heroes[0].hp = null; if (gmValid && save.heroes[0].cls === GM_CLASS) { const f = (await be.getFloor()).floor; gmGear(save, f, legendaryWeaponDps(f), legendaryArmorPct(f)); } // migrate older GM saves: Vesperveil lands in the armor slot // staff perk: always full HP
  { const fl0 = await be.getFloor(), f0 = fl0.floor, bi = bossInfo(f0); myGuild = featureOn(FEATURES, 'guilds', gmValid) && !localStaffOnly() ? await be.myGuild?.().catch(() => null) : null; if (myGuild && gv2On()) gv2Info = await be.guildInfo().catch(() => null); save.ctx = { element: bi.lootElement, special: isSpecialSlot(f0), gm: gmValid, guild: !!myGuild && !myGuild.is_staff, bossPct: fl0.maxHp ? fl0.hp / fl0.maxHp : 1, gmPresent: (gmValid && (wearsVesperveil(save.heroes[0]) || save.heroes[0].cls === GM_CLASS)) || (fl0.gmUntil || 0) > Date.now() }; } // offline maths sees the same floor context
  const p = offlineProgress(save, Date.now(), OFFLINE_CAP_HOURS), cap = p.cap, h0 = save.heroes[0];
  save.gold += p.gold; const ups = applyXp(save.heroes, p.xp); pending += p.damage;
  const offFloor = (await be.getFloor()).floor, trickled = trickleDrops(save, p.secs, offFloor, TRICKLE.offlineMax);
  if (p.secs > 30) {
    const r = await submitDmg(h0.name, pending, h0); pending = 0;
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
    const got = recordClear(save, c.floor, gmValid ? 0 : c.ranking.indexOf(me) + 1, c.maxHp ? (c.dmg?.[me] || 0) / c.maxHp : 1); all.push(...got);
    for (const it of got) { log(`System notice: cosmetic unlocked — ${it.label}.`); if (!quiet) notice(`Cosmetic unlocked — ${it.label}`); }
    const share = c.maxHp ? (c.dmg?.[me] || 0) / c.maxHp : 0, d = grantDrops(save, c.floor, share);
    for (const it of d.items) { const R = rarityOf(it.rarity); if (it.rarity === 'unique') { log(`System notice: UNIQUE item acquired — ${it.name} · ${it.stamp}. ${it.ability.text}; drawback: ${it.drawback.text}.`, R.color); if (!quiet) notice(`UNIQUE item acquired — ${it.name}`, R.color, it); lootLines.push(`<span class="uniq">UNIQUE ${esc(it.name)}</span>`); continue; } log(`Loot · ${R.label} ${it.name} (Floor ${c.floor})`, R.color); lootLines.push(`<span style="color:${R.color}">${esc(R.label)} ${esc(it.name)}</span>`); if (!quiet) notice(`${R.label} drop — ${it.name}`, R.color, it); }
    if (d.salvaged) log(`Bag full: a drop was salvaged for ${fmt(d.salvaged)} gold.`);
    if (d.cosmetic) { const it = byId(d.cosmetic); log(`System notice: rare cosmetic drop — ${it.label}!`, '#ffb02e'); lootLines.push(`<span style="color:#ffb02e">${esc(it.label)} (cosmetic)</span>`); all.push(it); if (!quiet) notice(`Rare cosmetic — ${it.label}`, '#ffb02e'); }
  }
  return all;
}
function openWardrobe() {
  const h = save.heroes[0];
  $('wpreview').style.backgroundImage = heroSprite(h.look, h.cls);
  $('wname').innerHTML = `<span style="color:${nameColorOf(h)}">${esc(h.name)}</span><br><span class="ttl">«${esc(titleOf(h))}»</span>` + (h.cls === GM_CLASS && h.look.outfitStyle === 'gm-coat' ? `<p class="sub" id="vesper"><b class="uniq" style="color:${rarityOf('unique').color}">${esc(VESPERVEIL.label)}</b> <small style="color:${rarityOf('unique').color}">Unique · coat · ${esc(STAFF_STAMP)}</small><br>${esc(VESPERVEIL.lore)}<br><span style="color:#cfd8ff">✦ ${esc(VESPERVEIL.ability)}</span></p>` : '');
  picker($('wpick'), SLOTS, h.look, h.cls, save.progress, async id => { if (equip(save, id)) { await be.saveSave(save); render(); openWardrobe(); } });
  if (!$('wardrobe').open) $('wardrobe').showModal();
}
async function startGame(fresh = false) {
  $('game').classList.remove('hidden');
  floor = await be.getFloor(); log(`${save.heroes[0].name} awoke on Floor ${floor.floor}. The guardian stirs.`); log('System notice: log out disabled.');
  if (fresh) { notice('Log out disabled'); setTimeout(() => notice(`Floor ${floor.floor} is open`), 900); } // no replayed notices on reload
  $('lvl').onclick = () => buy('level'); $('gear').onclick = () => buy('gear');
  initUI({ gear: () => $('gearSheet').showModal(), bag: openBag, talents: () => { talSel = null; openTalents(); }, wardrobe: openWardrobe, town: openTown, guild: openGuild });
  $('helpBtn').onclick = () => { $('more').close(); tourShow(0); }; $('sysBtn').onclick = openSystem; $('mapBtn').onclick = openMap; $('floorBtn').onclick = openMap; $('chatBtn').onclick = openChat;
  $('lbBtn').onclick = () => $('lbSheet').showModal(); $('top3').onclick = () => $('lbSheet').showModal(); $('logBtn').onclick = () => $('logSheet').showModal(); $('sbBtn').onclick = openSandboxUi;
  $('tabGuild').hidden = !featureOn(FEATURES, 'guilds', gmValid); $('chatBtn').hidden = !featureOn(FEATURES, 'chat', gmValid);
  $('topbar').classList.remove('hidden'); $('tabbar').classList.remove('hidden'); setInterval(badgePoll, 30000); setTimeout(badgePoll, 4000);
  setInterval(tick, 1000); setInterval(sync, 5000); render(); renderLb();
  if (!save.tutorialSeen) startTour(); // right after creation, and once for older saves
}
function tick() {
  save.ctx = { gm: gmValid, gmPresent: (gmValid && (wearsVesperveil(save.heroes[0]) || save.heroes[0].cls === GM_CLASS)) || (floor.gmUntil || 0) > Date.now(), guild: !!myGuild && !myGuild.is_staff, guildPct: myGuild?.is_staff || gv2Info?.guild?.is_staff ? 0 : gv2Info?.guild?.bonus_pct ?? null, decreePct: decreePctNow(), decree: gmValid || (floor.gmUntil || 0) > Date.now() || echoUntil > Date.now(), bossPct: floor.maxHp ? floor.hp / floor.maxHp : 1, special: isSpecialSlot(floor.floor), element: bossInfo(floor.floor).lootElement, sessionSecs: (Date.now() - sessionStart) / 1000 };
  { const uh = unwrittenHour(save.ctx), ar = $('arena'); if (ar.classList.contains('unwritten') !== uh) { ar.classList.toggle('unwritten', uh); ar.title = uh ? 'The Unwritten Hour: +5% damage until the guardian falls' : ''; } }
  const p = accrue(save, Date.now(), OFFLINE_CAP_HOURS), fx = effectsOf(save.heroes[0]);
  if (fx.has('whisper') && Date.now() - lastWhisper > 120000) { lastWhisper = Date.now(); log(WHISPERS[Math.floor(Math.random() * WHISPERS.length)], '#b9a8ff'); }
  if (p.damage > 0 && save.sheath && cx(save.heroes[0], 'cx-sheath')) { const extra = Math.round(p.damage * 0.5); p.damage += extra; save.sheath = false; log('Twilight Sheath: the first cut after rest lands +50%.', '#ffd76a'); } // Twilight Sheath
  codexTick(p);
  save.gold += p.gold; recent.dmg += p.damage; recent.gold += p.gold; recent.xp += p.xp; pending += p.damage; floor.hp = Math.max(0, floor.hp - p.damage);
  if (applyXp(save.heroes, p.xp).length) { log(`System notice: level ${save.heroes[0].level} reached.`); notice(`Level ${save.heroes[0].level} reached · +1 talent point`); }
  for (const it of trickleDrops(save, p.secs, floor.floor, p.secs > 2 ? TRICKLE.offlineMax : Infinity)) { const R = rarityOf(it.rarity); log(`Loot · ${R.label} ${it.name}${it.salvaged ? ' (bag full: salvaged)' : ''}`, R.color); notice(`${R.label} find — ${it.name}`, R.color, it); }
  if (p.damage > 0) { hits++; if (fx.has('tenth') && hits % 10 === 0) { hitFx(p.damage); log('The Tenth Bell rings — double hit.', '#7ff6ff'); } hitFx(p.damage); } $('boss').classList.add('hit'); setTimeout(() => $('boss').classList.remove('hit'), 120); render();
}
// Background tabs throttle timers: every tick measures real elapsed time (accrue = offline maths), and we catch up as soon as the tab is visible or focused.
let lastCatchUp = 0;
function catchUp() { if (!save || !floor || Date.now() - lastCatchUp < 500) return; lastCatchUp = Date.now(); tick(); sync(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) catchUp(); });
addEventListener('focus', catchUp); addEventListener('pageshow', catchUp);
async function sync() {
  if (be.name === 'local') { be.decree = gmValid; be.decreePct = decreePctNow(); }
  const r = await submitDmg(save.heroes[0].name, pending, { ...save.heroes[0], staff: gmValid }); pending = 0;
  if (recent.dmg > 0) { log(`You strike for ${fmt(recent.dmg)} · +${fmt(recent.gold)} gold · +${fmt(recent.xp)} XP`); recent = { dmg: 0, gold: 0, xp: 0 }; }
  const quiet = quietSync; quietSync = false; // clears that happened before this session are logged, not re-toasted
  if (r.advanced) { const f = r.floor - 1; log(`${bossName(f)} fell beneath many blades. The stair to Floor ${r.floor} lies open.`); log(`System notice: Floor ${r.floor} is open.`); floorCleared(f); setTimeout(() => notice(`Floor ${r.floor} is open`), 2400); codexFloorFell(f, r.floor); }
  handleClears(r.clears, quiet);
  floor = await be.getFloor(); gmFloorChecks(); await be.saveSave(save); render(); renderLb();
}
function buy(kind) {
  const h = save.heroes[0], c = kind === 'level' ? levelCost(h) : gearCost(h); if (save.gold < c) return;
  save.gold -= c; kind === 'level' ? h.level++ : h.gear++; log(kind === 'level' ? `${h.name} trained through the night and rose to level ${h.level}.` : `The forge rang out; ${h.name}'s gear was tempered to +${h.gear}.`);
  render(); be.saveSave(save);
}
function render() {
  const h = save.heroes[0];
  $('hero').style.backgroundImage = heroSprite(h.look, h.cls); $('hero').classList.toggle('gmaura', false); renderCodexLook(h); const au = byId(h.look.aura || 'au-none')?.value; $('hero').style.filter = au ? `drop-shadow(0 0 1.5px ${au}) drop-shadow(0 0 3px ${au})` : ''; $('boss').style.backgroundImage = bossSprite(floor.floor); $('boss').classList.toggle('big', bossIsBig(floor.floor));
  const won = floor.floor >= MAX_FLOOR && floor.hp <= 0;
  H('bname').textContent = won ? 'Log out enabled' : bossName(floor.floor);
  H('floor').textContent = won ? 'System notice · the tower is silent' : `Guardian of Floor ${floor.floor} / ${MAX_FLOOR}`;
  const pct = floor.hp / floor.maxHp, lay = Math.ceil(pct * LAYERS - 1e-9), inLayer = pct * LAYERS - (lay - 1);
  H('layers').innerHTML = Array.from({ length: LAYERS }, (_, i) => `<i class="${i < lay ? 'on' : ''}"></i>`).join('');
  const c = hpColor(pct); $('hpfill').style.width = (lay ? inLayer * 100 : 0) + '%'; $('hpfill').style.background = `linear-gradient(90deg, ${c}aa, ${c})`; $('hpfill').style.color = c;
  H('hptext').textContent = `${fmt(floor.hp)} / ${fmt(floor.maxHp)} HP · ${lay}× layers` + (cx(h, 'cx-eye') ? ` · layer ${lay}: ${fmt(Math.max(0, inLayer) * floor.maxHp / LAYERS)} / ${fmt(floor.maxHp / LAYERS)} · next: ${bossName(Math.min(floor.floor + 1, MAX_FLOOR))}` : ''); // Draftsman's Eye
  H('hname2').innerHTML = `<div ${h.cls === GM_CLASS ? `class="gmname${cx(h, 'cx-shape') ? ' shape' : ''}"` : `style="color:${nameColorOf(h)}"`}>${h.cls === GM_CLASS ? GM_SIGIL + ' ' : ''}${esc(h.name)}</div><div class="ttl">${esc(titleOf(h))}</div>`; H('hlv').textContent = `LV ${h.level}`;
  const hp = heroHp(h) / heroMaxHp(h), worn = isWorn(h); $('hhp').className = 'seg' + (worn ? ' worn' : hp < 0.6 ? ' mid' : ''); H('hhp').innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i / 20 < hp ? '' : 'off'}"></i>`).join('');
  $('hhp').title = `HP ${Math.round(heroHp(h))} / ${heroMaxHp(h)}`;
  const b = buffsOf(save), mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  H('buffs').innerHTML = [worn ? '<span class="buff bad" title="Below 30% HP: DPS halved">Worn down · DPS ½</span>' : '', b.rested > 0 ? `<span class="buff" title="+15% gold and XP">Well Rested ${mmss(b.rested)}</span>` : '',
    b.elixir > 0 ? `<span class="buff" title="+25% DPS">Fury ${mmss(b.elixir)}</span>` : '', b.vigil > 0 ? `<span class="buff" title="Offline cap raised once">Vigil +${b.vigil}h</span>` : '', unwrittenHour(save.ctx) ? '<span class="buff gold" title="Vesperveil: +5% damage for heroes on this floor until the guardian falls">The Unwritten Hour · +5%</span>' : '', h.cls === GM_CLASS && h.look.aura === 'gm-aura' ? (g => `<span class="buff gold" id="galaxyTier" title="${esc(g.desc)}">Galaxy · Tier ${g.tier} · ${esc(g.name)}</span>`)(galaxyTier(h.level)) : ''].join('');
  const xp = h.xp / xpToNext(h.level); H('hxp').innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i / 20 < xp ? '' : 'off'}"></i>`).join('');
  H('stats').innerHTML = `${classOf(h.cls).icon} <b>${h.cls}</b> · XP ${h.xp}/${xpToNext(h.level)}<br>Gear <b>+${h.gear}</b> · DPS <b>${effectiveDps(save).toFixed(1)}</b> · HP <b>${Math.round(heroHp(h))}/${heroMaxHp(h)}</b> · Gold <b>${fmt(save.gold)}</b>`;
  H('lvlL').textContent = `Train ${fmt(levelCost(h))}g`; $('lvl').title = `Train: +1 level for ${fmt(levelCost(h))} gold`; $('lvl').disabled = save.gold < levelCost(h);
  H('equipped').innerHTML = GEAR_SLOTS.map(s => { const it = h.equip?.[s]; return `<span class="eq" style="${it ? `color:${rarityOf(shownRarity(it)).color}` : ''}">${s[0].toUpperCase() + s.slice(1)}: ${it ? esc(it.name) : '—'}</span>`; }).join('');
  { const fp = treeOf(h.cls).length ? freePoints(h) : 0, bs = bagSize(save), full = save.inv.length >= bs - 2; setHeroLabels({ bag: `Bag ${save.inv.length}/${bs}`, talents: isCodex(h) ? 'Codex' : fp > 0 ? `Talents · ${fp}` : 'Talents', talentsDot: fp > 0, bagDot: full });
    setDot('dotHero', fp > 0 || full, [fp > 0 ? `${fp} talent point${fp > 1 ? 's' : ''} to spend` : '', full ? (save.inv.length >= bs ? 'Bag full' : 'Bag nearly full') : ''].filter(Boolean).join(' · '));
    H('hdps').textContent = `DPS ${effectiveDps(save).toFixed(1)}`; H('goldTop').textContent = `⛁ ${fmt(save.gold)}`; H('floorTxt').innerHTML = `Floor ${floor.floor}/<span id="maxf">${MAX_FLOOR}</span>`;
    $('ftick').style.width = `${Math.min(100, ((floor.floor - 1) + (1 - floor.hp / floor.maxHp)) / MAX_FLOOR * 100).toFixed(1)}%`; $('floorBtn').setAttribute('aria-label', `Floor ${floor.floor} of ${MAX_FLOOR}: open the tower map`);
    $('sbBtn').hidden = !(gmValid && featureOn(FEATURES, 'sandbox', true)); }
  $('gear').title = 'Forge: temper your weapon, +15% damage per tier';
  H('gearL').textContent = `Forge ${fmt(gearCost(h))}g`; $('gear').disabled = save.gold < gearCost(h);
}
async function renderLb() {
  const h = save.heroes[0];
  let rows = await be.leaderboard(h.name); if (localStaffOnly()) rows = boardWithStaff([{ name: h.name, damage: localStaffDmg, staff: true }, ...(rows.players || rows).filter(r => r.name !== h.name && !r.staff)], null, 10); // local-only staff: shown, never sent
  await refreshTags(); const badge = n => gv2On() && gTags[n] ? bannerBadge(gTags[n].banner, gTags[n].tag) + (gTags[n].staff ? `<span class="smark" title="Staff guild">${STAFF_MARK}</span>` : '') : '';
  const top = (rows.players || rows).filter(r => !r.staff).slice(0, 3), mine = (rows.players || rows).find(r => r.name === h.name && !r.staff);
  $('top3').innerHTML = `<span class="t3h">Top damage</span>${top.map((r, i) => `<span class="t3 ${r.name === h.name ? 'me' : ''}"><b>${i + 1}</b>${badge(r.name)}${esc(r.name)} <small>${fmt(r.damage)}</small></span>`).join('') || '<span class="sub">No hits yet</span>'}${mine && mine.rank > 3 ? `<span class="t3 me"><b>${mine.rank}</b>you</span>` : ''}`;
  $('lb').innerHTML = $('lbSide').innerHTML = rows.map(r => {
    const me = r.name === h.name, pr = me ? { title: titleOf(h), color: nameColorOf(h) } : fakeProfile(r.name);
    if (r.staff) return `<li class="staff" value="0"><small>${esc(wouldRankLabel(r))}</small><span class="gmname">${GM_SIGIL} ${esc(r.name)}</span> — ${fmt(r.damage)}<br><span class="ttl">${esc(me ? titleOf(h) : 'Tower Staff')}</span></li>`;
    return `<li class="${me ? 'me' : ''}" value="${r.rank}">${badge(r.name)}<span style="color:${pr.color}">${esc(r.name)}</span> — ${fmt(r.damage)}<br><span class="ttl">${esc(pr.title)}</span>${me && r.rank > 3 ? '<div class="climb">Climb: Train, Forge and equip loot to raise DPS. Top 3 on a kill earns rare rewards.</div>' : ''}</li>`;
  }).join('');
}
// ---- Town (safe zone of the current floor): inn + rotating shop
function openTown() {
  const f = floor.floor, now = Date.now(), st = shopStock(f, now), h = save.heroes[0], c = innCost(f, save);
  $('townTitle').textContent = `Town of Floor ${f}`; renderHall();
  $('innkeeper').style.backgroundImage = sprite(npcGrid('innkeeper').rows, npcGrid('innkeeper').pal); $('merchant').style.backgroundImage = sprite(npcGrid('merchant').rows, npcGrid('merchant').pal);
  $('innInfo').innerHTML = `HP <b>${Math.round(heroHp(h))} / ${heroMaxHp(h)}</b>${isWorn(h) ? ' · <span class="bad">worn down</span>' : ''}`;
  $('restBtn').textContent = `Rest · ${fmt(c)}g`; $('restBtn').disabled = save.gold < c;
  $('restBtn').onclick = async () => { if (rest(save, f)) { save.sheath = true; log('You slept at the inn. HP restored · Well Rested (+15% gold & XP, 30 min).', '#5cff8a'); notice('Well Rested · +15% gold & XP'); await be.saveSave(save); render(); openTown(); } };
  const left = st.endsAt - now; $('shopTimer').textContent = `New stock in ${fmtDur(left / 1000)}`;
  $('shopList').innerHTML = st.items.map((it, i) => { const R = it.item ? rarityOf(it.item.rarity) : null, out = soldOut(save, st, i);
    return `<div class="srow" ${R ? `style="--rc:${R.color}"` : ''}>${it.item ? ico(it.item) : ''}<div><b style="${R ? `color:${R.color}` : ''}">${esc(it.name)}</b><small>${R ? `${R.label} ${it.item.slot} · ${Object.entries(it.item.stats).map(([k, v]) => statLabel(k, v)).join(' · ')}` : esc(it.desc)}</small></div>
      <button data-i="${i}" ${out || save.gold < priceFor(save, it) ? 'disabled' : ''}>${out ? 'Sold' : `${fmt(priceFor(save, it))}g`}</button></div>`; }).join('');
  $('shopList').onclick = async e => { const btn = e.target.closest('button[data-i]'); if (!btn) return; const got = shopBuy(save, f, Date.now(), +btn.dataset.i);
    if (got) { log(`Bought ${got}.`); notice(`Bought · ${got}`); await be.saveSave(save); render(); } openTown(); };
  const bp = bulkPreview(save), sl = save.inv.map((it, i) => [it, i]).filter(([it]) => sellable(it));
  $('sellBox').innerHTML = `<button id="sellBulk" ${bp.count ? '' : 'disabled'}>Sell all Common/Uncommon · ${bp.count} items · ${fmt(bp.gold)}g</button><p class="sub">Locked items and Uniques are never sold in bulk.</p>` +
    (sl.map(([it, i]) => `<div class="srow" style="--rc:${rarityOf(it.rarity).color}">${ico(it)}<div><b style="color:${rarityOf(it.rarity).color}">${esc(it.name)}</b><small>${rarityOf(it.rarity).label} ${it.slot}</small></div><button data-lock="${i}" title="${it.locked ? 'Unlock' : 'Lock'}">${it.locked ? '🔒' : '🔓'}</button><button data-sell="${i}" ${it.locked ? 'disabled' : ''}>${fmt(sellPrice(save, it))}g</button></div>`).join('') || '<p class="sub">Nothing to sell.</p>');
  $('sellBox').onclick = async e => { const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'sellBulk') { const p = bulkPreview(save); if (!p.count || !confirm(`Sell ${p.count} Common/Uncommon items for ${fmt(p.gold)} gold?`)) return; const r = sellBulk(save); log(`Sold ${r.count} items to Quill for ${fmt(r.gold)} gold.`); notice(`Sold ${r.count} items · +${fmt(r.gold)}g`); }
    else if (b.dataset.lock) toggleLock(save, +b.dataset.lock);
    else if (b.dataset.sell) { const i = +b.dataset.sell, it = save.inv[i]; if (it.rarity === 'unique' && !confirm(`Sell ${it.name}? A Unique is one of a kind and can never drop again.`)) return; const g = sellItem(save, i, { confirmUnique: true }); if (g) log(`Sold ${it.name} for ${fmt(g)} gold.`); }
    await be.saveSave(save); render(); openTown(); };
  $('townGold').textContent = `Gold ${fmt(save.gold)}`;
  if (!$('town').open) $('town').showModal();
}

// ---- Bag: inventory grid, compare panel, equip and salvage
let bagSel = -1;
const itemCard = (it, cls = '') => { const R = rarityOf(shownRarity(it)); return `<div class="item ${cls}" style="--rc:${R.color}">${ico(it)}${it.locked ? '<span class="lock" title="Locked">🔒</span>' : ''}<b class="${R.id === 'unique' ? 'uniq' : ''}" style="color:${R.color}">${esc(it.name)}</b><small>${R.label} · ${it.slot} · Floor ${it.floor} · ${it.element}</small>${Object.entries(it.stats).map(([k, v]) => `<div>${statLabel(k, v)}</div>`).join('')}${it.rarity === 'unique' ? `<div class="ab">✦ ${esc(it.ability.text)}</div><div class="db">▾ ${esc(it.drawback.text)}</div><div class="lore">${esc(it.lore)}</div><small>${esc(it.stamp)}</small>` : it.gm ? `${it.staffPower ? `<div class="ab">✦ ${esc(it.staffPower)}</div>` : ''}<div class="lore">${esc(it.lore || '')}</div><small>${esc(STAFF_STAMP)}</small>` : ''}</div>`; };
function openBag() {
  const h = save.heroes[0];
  $('bagCount').textContent = `· ${save.inv.length} / ${bagSize(save)}`;
  $('eqrow').innerHTML = GEAR_SLOTS.map(s => { const it = h.equip[s]; return `<div class="eqslot" title="${s}">${it ? itemCard(it, 'mini') : `<div class="item mini empty">${s}: empty</div>`}</div>`; }).join('');
  $('bagGrid').innerHTML = Array.from({ length: Math.max(bagSize(save), save.inv.length) }, (_, i) => { const it = save.inv[i]; if (!it) return '<button class="cell" disabled aria-label="empty slot"></button>';
    const R = rarityOf(shownRarity(it)); return `<button class="cell ${i === bagSel ? 'sel' : ''} ${R.id === 'unique' ? 'ucell' : ''}" data-i="${i}" style="--rc:${R.color}" title="${esc(R.label + ' ' + it.name)}">${ico(it, 'ico big')}${it.locked ? '<span class="lock">🔒</span>' : ''}</button>`; }).join('');
  $('bagGrid').onclick = e => { const b = e.target.closest('button.cell[data-i]'); if (b) { bagSel = +b.dataset.i; openBag(); } };
  const it = save.inv[bagSel];
  if (it) {
    const cur = h.equip[it.slot], before = heroDps(h), trial = { ...h, equip: { ...h.equip, [it.slot]: it } }, delta = heroDps(trial) - before;
    $('bagDetail').innerHTML = `${itemCard(it)}<div class="vs">vs equipped</div>${cur ? itemCard(cur, 'mini') : '<div class="item mini empty">nothing equipped</div>'}
      <p class="delta" style="color:${delta >= 0 ? '#5cff8a' : '#ff3355'}">DPS ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} (${before.toFixed(1)} → ${(before + delta).toFixed(1)})</p>${['goldPct', 'xpPct', 'capH'].map(k => { const d = (it.stats[k] || 0) - (cur?.stats[k] || 0); return d ? `<div style="color:${d > 0 ? '#5cff8a' : '#ff3355'}">${k === 'capH' ? 'Offline cap' : k === 'goldPct' ? 'Gold' : 'XP'} ${d > 0 ? '+' : ''}${d}${k === 'capH' ? 'h' : '%'}</div>` : ''; }).join('')}
      <div class="bagbtns"><button id="bEquip" class="cta">Equip</button>${sellable(it) ? `<button id="bLock">${it.locked ? 'Unlock' : 'Lock'}</button>` : ''}${cx(h, 'cx-loom') && !it.gm ? '<button id="bLoom">Rename</button>' : ''}${cx(h, 'cx-plan') && !it.gm && it.rarity !== 'unique' ? `<button id="bPlan" ${save.planFloor === floor.floor ? 'disabled title="Used on this floor"' : ''}>Master Plan · reroll</button>` : ''}</div>`;
    if ($('bLoom')) $('bLoom').onclick = async () => { const v = prompt('Loom of Names: new name (max 28)', it.customName || it.name); if (v == null) return; const c = cleanChat(v, 28); if (!c.ok || c.text !== v.replace(/\s+/g, ' ').trim()) { notice('That name is not allowed'); return; } it.customName = c.text; it.name = c.text; await be.saveSave(save); openBag(); };
    if ($('bPlan')) $('bPlan').onclick = async () => { const n = rerollItem(save, bagSel, floor.floor); if (n) { log(`Master Plan: ${n.name} redrawn.`, '#ffd76a'); await be.saveSave(save); openBag(); } };
    $('bEquip').onclick = async () => { const back = it.rarity === 'unique' ? GEAR_SLOTS.map(k => h.equip[k]).find(x => x?.rarity === 'unique' && x.slot !== it.slot) : null; if (!equipItem(save, bagSel)) { notice('Your Unique weapon refuses to share you with a trinket'); return; } log(`Equipped ${it.name}.`, rarityOf(it.rarity).color); if (back) log(`System notice: one Unique at a time. ${back.name} returned to your bag.`, '#7ff6ff'); bagSel = -1; await be.saveSave(save); render(); openBag(); };
    if ($('bLock')) $('bLock').onclick = async () => { toggleLock(save, bagSel); await be.saveSave(save); openBag(); };
    $('bagDetail').insertAdjacentHTML('beforeend', `<p class="sub">${sellable(it) ? `Sell at Quill's in Town · ${fmt(sellPrice(save, it))}g` : 'Staff items cannot be sold.'}</p>`);
  } else $('bagDetail').innerHTML = '<p class="sub">Select an item to compare it with what you have equipped.</p>';
  if (!$('bag').open) $('bag').showModal();
}

// ---- intro walkthrough (System notice voice). Seen flag lives in the save; the ? button reopens it.
const TOUR = [
  { t: 'You fight on your own', x: 'Your hero attacks the floor guardian automatically, every second, even while you are offline. Close the tab; the tower keeps count.', el: () => $('arena') },
  { t: 'Gold and XP', x: 'Every hit pays out: 10% of your damage becomes gold (top bar) and 5% becomes XP. Fill the XP bar to level up and hit harder.', el: () => $('hstrip') },
  { t: 'Town: Train · Forge', x: 'Train spends gold on a level. Forge tempers your weapon for +15% damage per tier. Town also has the shop, selling and an inn to heal.', el: () => $('tabTown') },
  { t: 'Hero', x: 'Gear, Bag (boss loot), Talents and Wardrobe (cosmetic only). A dot means unspent talent points or a nearly full bag.', el: () => $('tabHero') },
  { t: 'One guardian, whole server', x: 'Everyone in the tower shares this boss. Top damage when it falls earns titles, name colours and other rewards. Tap the strip for the full board.', el: () => matchMedia('(min-width: 1000px)').matches ? $('side') : $('top3') },
  { t: 'Layers', x: 'The guardian\'s HP comes in layers: each diamond is one full HP bar. Break every layer to clear the floor and open the stair.', el: () => $('layers').closest('.gauge') },
  { t: 'More', x: 'Tower Map (or tap the floor up top), leaderboard, floor chat, your chronicle, System for sign-in and settings, and this guide.', el: () => $('tabMore') },
];
let tourAt = -1;
function tourShow(i) {
  document.querySelectorAll('.tour-hi').forEach(e => e.classList.remove('tour-hi'));
  if (i < 0 || i >= TOUR.length) { $('tour').classList.add('hidden'); tourAt = -1; if (!save.tutorialSeen) { save.tutorialSeen = true; be.saveSave(save); } return; }
  tourAt = i; const s = TOUR[i], el = s.el();
  $('tstep').textContent = `◈ System notice · ${i + 1} / ${TOUR.length}`; $('ttitle').textContent = s.t; $('ttext').textContent = s.x;
  $('tback').disabled = i === 0; $('tnext').textContent = i === TOUR.length - 1 ? 'Done' : 'Next';
  $('tour').classList.remove('hidden');
  if (el) { el.classList.add('tour-hi'); el.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
}
function startTour() { const d = document.querySelector('dialog[open]'); if (d) return d.addEventListener('close', startTour, { once: true }); if (tourAt < 0 && !save.tutorialSeen) tourShow(0); }
$('tnext').onclick = () => tourShow(tourAt + 1); $('tback').onclick = () => tourShow(Math.max(0, tourAt - 1)); $('tskip').onclick = () => tourShow(TOUR.length);


// ---- New-deploy check: GitHub Pages caches files for 10 min and phones keep tabs alive for days. version.json is fetched
// with no-store; when it names a different build, save and reload once (sessionStorage guard stops a reload loop).
async function checkDeploy() {
  try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return; const { build } = await r.json();
    if (!build || build === BUILD || sessionStorage.getItem('logout.v1.reloadFor') === build) return;
    sessionStorage.setItem('logout.v1.reloadFor', build); if (save && be) await be.saveSave(save); location.reload();
  } catch { /* offline or blocked: keep playing */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDeploy(); });
window.addEventListener('pageshow', e => { if (e.persisted) checkDeploy(); }); // restored from Safari's back-forward cache
setInterval(checkDeploy, 5 * 60 * 1000);
boot(); checkDeploy();

// ---- Talents: glass-HUD tree, tap a node for its tooltip, Learn / Respec.
let talSel = null;
function openTalents() {
  const h = save.heroes[0], fp = freePoints(h), f = floor.floor, rc = respecCost(h, f, gmValid);
  const codex = isCodex(h); $('talents').classList.toggle('codex', codex); $('talents').querySelector('h2').firstChild.textContent = codex ? "The Architect's Codex " : 'Talents ';
  $('talPts').textContent = `· ${codex ? 'staff' : h.cls} · ${fp} point${fp === 1 ? '' : 's'} free · ${totalPoints(h)} total`;
  $('talTree').innerHTML = treeOf(h.cls).filter(b => !b.nodes.every(n => n.hidden && canLearn(h, n.id) === 'sealed' && !(h.talents?.[n.id]))).map(b => `<section class="tbranch"><h3>${esc(b.name)} <small>${spentIn(h, b.id)} pts</small></h3><p class="sub">${esc(b.blurb)}</p>${b.nodes.map(n => {
    const r = h.talents?.[n.id] || 0, why = canLearn(h, n.id), gated = why && why.startsWith('needs');
    return `<button class="tnode ${r >= n.max ? 'max' : ''} ${gated ? 'gated' : ''} ${!why ? 'can' : ''} ${n.capstone ? 'cap' : ''} ${n.hidden ? 'hiddennode' : ''} ${talSel === n.id ? 'sel' : ''}" data-id="${n.id}" aria-label="${esc(n.name)} ${r}/${n.max}"><span>${esc(n.name)}</span><b>${r}/${n.max}</b></button>`; }).join('')}</section>`).join('');
  const n = talSel && nodeById(talSel);
  if (n) { const r = h.talents?.[n.id] || 0, why = canLearn(h, n.id);
    $('talTip').innerHTML = `<b>${esc(n.name)}</b>${n.capstone ? ' <small class="capt">capstone</small>' : ''} <small>rank ${r}/${n.max}${n.req ? ` · needs ${n.req} pts in branch` : ''}</small><p>${esc(n.desc)}</p><button id="talLearn" class="cta" ${why ? 'disabled' : ''}>${why ? esc(why) : 'Learn'}</button>${codexExtra(h, n)}`;
    wireCodexExtra(h, n);
    $('talLearn').onclick = async () => { if (learn(h, n.id)) { log(`System notice: talent learned — ${n.name} (${(h.talents[n.id])}/${n.max}).`); await be.saveSave(save); render(); openTalents(); } };
  } else $('talTip').innerHTML = '<p class="sub">Tap a node to see what it does. Later nodes unlock after you spend points in that branch.</p>';
  $('talRespec').textContent = rc ? `Respec · ${fmt(rc)}g` : gmValid ? 'Respec · free (staff)' : 'Respec · free once'; $('talRespec').disabled = save.gold < rc || !Object.keys(h.talents || {}).length;
  $('talRespec').onclick = async () => { if (respec(save, f)) { log('System notice: talents reset. All points refunded.'); talSel = null; await be.saveSave(save); render(); openTalents(); } };
  $('talTree').onclick = e => { const b = e.target.closest('.tnode'); if (b) { talSel = b.dataset.id; openTalents(); } };
  if (!$('talents').open) $('talents').showModal();
}

// ---- System / Identity panel. Guest-first; binding is opt-in and feature-flagged.
let gmValid = false; const gmActive = () => gmValid;
async function openSystem() {
  const online = be.name === 'supabase', canBind = featureOn(FEATURES, 'bindIdentity', gmActive()), anon = online && be.isAnonymous();
  const uid = online && be.user?.id ? `<p class="sub">Tower ID: <code id="towerId">${esc(be.user.id)}</code> <button id="copyId">Copy</button></p>` : '';
  const status = !online ? 'Offline mode. Your progress lives in this browser only.' : (gmValid && !be.isGm()) ? 'Online · staff (local). Connected to the tower; your staff hero plays on this device only until the server role is granted.' : anon ? 'Guest identity. Bind it to keep your progress across devices.' : 'Identity bound. Your progress is stored in the tower.';
  const why = !online && be.fallback ? `<p class="sub" id="sysWhy">Reason: ${esc(be.fallback)}</p>${onlineConfigured() ? '<button id="retryOnline">Try online again</button>' : ''}` : '';
  $('sysBody').innerHTML = `<div class="sysnote"><p id="sysStatus">${esc(status)}</p>${why}${uid}<p class="sub">Build ${esc(BUILD)}</p>
    ${canBind ? `<div class="bind ${online ? '' : 'off'}"><h3>Bind your identity</h3>
      <button id="bindWallet" class="cta" ${online ? '' : 'disabled'}>Sign in with Solana (Phantom)</button>
      <p class="sub">Signature only. $LOGOUT asks your wallet to sign a short message. It never requests a transaction, never sees your keys and never touches your funds.</p>
      <div class="mail"><input id="bindEmail" type="email" placeholder="email for a magic link" ${online ? '' : 'disabled'} autocomplete="email"><button id="bindMail" ${online ? '' : 'disabled'}>Send link</button></div>
      ${online ? '' : `<p class="sub">${onlineConfigured() ? 'Binding needs the tower connection (see the reason above).' : 'Online mode is switched off on this server.'}</p>`}</div>` : ''}
    ${save?.holder ? '<div class="slot2"><b>Holder perk</b> · extra hero slot <span class="sub">(coming soon)</span><div class="emptyslot">+</div></div>' : ''}
    <button class="logout" disabled title="Unlocks on Floor 100">LOG OUT</button><p class="sub center">Log out unlocks on Floor 100.</p>
    <details class="settings"><summary>Settings</summary>${online ? '<button id="sever">Sever link (switch account)</button><p class="sub">Disconnects this browser from the bound identity. Your bound progress stays safe in the tower.</p>' : '<p class="sub">Nothing to sever: this browser is not linked to an online identity.</p>'}<div id="gmSlot"></div></details></div>`;
  const msg = m => { log(`System notice: ${m}`); notice(m); };
  if ($('retryOnline')) $('retryOnline').onclick = () => location.reload();
  if ($('bindWallet')) $('bindWallet').onclick = async () => { try { const s = await be.bindWallet(); if (s) save = migrateSave(s);
      const pk = window.phantom?.solana?.publicKey?.toString?.(); const hs = await holderStatus(pk, { rpc: SOLANA_RPC, mint: TOKEN_MINT, threshold: HOLDER_THRESHOLD }); if (hs.enabled) save.holder = hs.holder;
      await be.saveSave(save); msg('identity bound to your wallet'); render(); openSystem(); } catch (e) { msg(`binding failed: ${e.message || e}`); } };
  if ($('bindMail')) $('bindMail').onclick = async () => { const em = $('bindEmail').value.trim(); if (!/^\S+@\S+\.\S+$/.test(em)) return notice('Enter a valid email'); try { await be.bindEmail(em); msg('magic link sent, check your inbox'); } catch (e) { msg(`binding failed: ${e.message || e}`); } };
  if ($('copyId')) $('copyId').onclick = () => navigator.clipboard?.writeText(be.user.id).then(() => notice('Tower ID copied'), () => {});
  if ($('sever')) $('sever').onclick = async () => { if (!confirm('Sever the link to this identity on this browser?')) return; await be.sever(); location.reload(); };
  if (typeof renderGmSlot === 'function') renderGmSlot();
  if (!$('system').open) $('system').showModal();
}

// ---- Staff (gm): entrance notice, Eventide upkeep, hidden unlock field, sandbox.
let lastAnnSeen = 0, lastFloorSeen = 0;
function bigNotice(m) { const n = document.createElement('div'); n.className = 'notice bigsys'; n.innerHTML = `<small>◈ System notice</small><span>${esc(m)}</span>`; document.body.append(n); setTimeout(() => n.remove(), 4500); }
async function gmFloorChecks() {
  const h = save.heroes[0], f = floor.floor;
  if (gmValid) gmGear(save, f, legendaryWeaponDps(f), legendaryArmorPct(f)); // Eventide + Vesperveil: Legendary parity follows the floor (also migrates older GM saves)
  if (gmValid && h.cls === GM_CLASS && f !== lastFloorSeen) {
    const last = JSON.parse(localStorage.getItem('logout.v1.gmAnn') || 'null');
    if (shouldAnnounce(last, f, Date.now())) { localStorage.setItem('logout.v1.gmAnn', JSON.stringify({ floor: f, at: Date.now() })); const line = cx(h, 'cx-herald') && save.herald ? save.herald : `The Architect has entered Floor ${f}.`; bigNotice(line); log(`System notice: ${line}`, '#ffd76a'); be.gmAnnounce?.(f); if (line !== `The Architect has entered Floor ${f}.`) be.gmMark?.('herald', f, save.herald).catch(() => {}); }
  }
  lastFloorSeen = f;
  const a = floor.announce, at = a ? Date.parse(a.at) : 0; // online: everyone on the floor sees the entrance (polled with the floor)
  const hm = floor.marks?.herald, herald = hm && hm.floor === f && Math.abs(Date.parse(hm.at) - at) < 60e3 ? hm.text : null;
  if (!gmValid && a && a.floor === f && at > lastAnnSeen && Date.now() - at < 10 * 60e3) { lastAnnSeen = at; bigNotice(herald || `The Architect has entered Floor ${f}.`); }
  seenMarks();
}
let gmTaps = 0;
function renderGmSlot() {
  const el = $('gmSlot'); if (!el) return; const online = be.name === 'supabase', h = save.heroes[0];
  $('system').querySelector('.settings summary').onclick = () => { if (++gmTaps >= 5) { gmTaps = 0; el.dataset.show = '1'; renderGmSlot(); } };
  if (!gmValid && (!GM_PASS_HASH || el.dataset.show !== '1')) { el.innerHTML = ''; return; } // hidden unless revealed, and only while local mode has a hash set
  el.innerHTML = gmValid ? `<div class="staffbox"><b class="gmname">${GM_SIGIL} Staff access</b>
      ${h.cls === GM_CLASS ? `<button id="gmLeave">Return to ${esc(h.prevCls || 'Vanguard')}</button>` : '<button id="gmBecome" class="cta">Take the Architect\'s form</button>'}
      ${featureOn(FEATURES, 'sandbox', true) ? '<button id="gmSandbox">Sandbox</button>' : ''}${localStorage.getItem('logout.v1.gm') ? '<button id="gmLock">Lock staff access</button>' : ''}${online && !be.isGm() ? '<p class="sub">Local staff unlock: your damage stays on this device (never sent to the shared floor or ranked) until the server role is granted.</p>' : ''}</div>`
    : `<div class="staffbox"><input id="gmPass" type="password" autocomplete="off" placeholder="access phrase"><button id="gmTry">Verify</button></div>`;
  if ($('gmTry')) $('gmTry').onclick = async () => { const p = $('gmPass').value; if (staffActive({ localUnlock: await checkPass(p, GM_PASS_HASH) })) { localStorage.setItem('logout.v1.gm', p); gmValid = true; if (be.name === 'supabase' && !be.isGm()) be.holdUploads = true; save.heroes[0].hp = null; save.ctx.gm = true; notice('Staff access verified'); renderGmSlot(); render(); } else notice('Access denied'); };
  if ($('gmBecome')) $('gmBecome').onclick = async () => { becomeGm(save, legendaryWeaponDps(floor.floor), floor.floor, legendaryArmorPct(floor.floor)); lastFloorSeen = 0; gmFloorChecks(); await be.saveSave(save); render(); renderLb(); renderGmSlot(); };
  if ($('gmLeave')) $('gmLeave').onclick = async () => { leaveGm(save); save = migrateSave(save); await be.saveSave(save); render(); renderLb(); renderGmSlot(); };
  if ($('gmLock')) $('gmLock').onclick = async () => { localStorage.removeItem('logout.v1.gm'); gmValid = false; sanitizeSave(save, false); save = migrateSave(save); save.ctx = {}; await be.saveSave(save); render(); renderGmSlot(); };
  if ($('gmSandbox')) $('gmSandbox').onclick = openSandboxUi;
}
let sbx = null;
function openSandboxUi() {
  if (!gmValid) return; sbx = sbx || openSandbox(save);
  const d = $('sandbox'); sandboxFloor(sbx, sbx.floor);
  const draw = () => {
    $('sbBoss').style.backgroundImage = bossSprite(sbx.floor); $('sbName').textContent = `Floor ${sbx.floor} · ${bossInfoName(sbx.floor)}`;
    $('sbHp').textContent = `${fmt(sbx.hp)} HP`; $('sbItems').innerHTML = sbx.items.map(it => itemCard(it)).join('') || '<p class="sub">No test loot yet.</p>'; $('sbLog').textContent = sbx.log.slice(-3).join(' · '); };
  $('sbFloor').value = sbx.floor; $('sbFloor').oninput = () => { sandboxFloor(sbx, +$('sbFloor').value); $('sbNum').textContent = sbx.floor; draw(); }; $('sbNum').textContent = sbx.floor;
  $('sbFight').onclick = () => { sandboxFight(sbx, 10); draw(); }; $('sbLoot').onclick = () => { sandboxLoot(sbx, 3); draw(); }; $('sbUnique').onclick = () => { sandboxLoot(sbx, 1, [0, 0, 0, 0, 0, 1]); draw(); };
  let ed = $('sbEdit'); if (cx(save.heroes[0], 'cx-floorplan') && !ed) { ed = document.createElement('div'); ed.id = 'sbEdit'; ed.className = 'staffbox'; ed.innerHTML = `<b>Floorplan</b><label>HP × <input id="sbHpMul" type="number" min="0.1" max="10" step="0.1" value="1" style="max-width:80px"></label><select id="sbEl"><option value="">native element</option>${ELEMENTS.map(e => `<option>${e}</option>`).join('')}</select><button id="sbApply">Apply</button>`; $('sbLog').after(ed); }
  if ($('sbApply')) $('sbApply').onclick = () => { sandboxEdit(sbx, { hpMul: $('sbHpMul').value, element: $('sbEl').value || null }); sbx.log.push(`Floorplan: HP ×${sbx.edit.hpMul}${sbx.edit.element ? ', ' + sbx.edit.element : ''}`); draw(); };
  d.onclose = () => { sbx = closeSandbox(sbx); }; draw(); if (!d.open) d.showModal();
}
const bossInfoName = f => { const i = bossInfo(f); return `${i.name}${i.kind !== 'generated' ? ' · special' : ''}`; };

// A staff hero unlocked only by the local hash (no server role yet) never sends damage to the shared floor:
// the server would rank it as a normal player. Its damage stays on this device and shows on a local Tower Staff line.
let localStaffDmg = 0;
const localStaffOnly = () => gmValid && be.name === 'supabase' && !be.isGm();
async function submitDmg(name, amount, hero) {
  if (localStaffOnly()) { localStaffDmg += amount; const f = await be.getFloor(); return { ...f, advanced: false, accepted: 0, clears: [] }; }
  return be.submitDamage(name, amount, hero);
}

// ---- Guilds (flag: FEATURES.guilds). +2% XP/gold for members; staff never owns one and adds nothing to a guild total.
let myGuild = null, guildAll = false;
const meArg = () => ({ name: save.heroes[0].name, staff: gmValid });
let gv2Info = null; const gv2On = () => featureOn(FEATURES, 'guildsV2', gmValid) && !!be?.guildInfo;
let gTags = {}, gTagsAt = 0; const tagBanner = tag => Object.values(gTags).find(x => x.tag === tag)?.banner;
async function refreshTags() { if (!gv2On() || Date.now() - gTagsAt < 30000) return; gTagsAt = Date.now(); try { gTags = await be.guildTags(floor.floor) || {}; } catch {} }
async function openGuild() {
  if (gv2On() && !localStaffOnly()) { try { gv2Info = await be.guildInfo(); } catch (e) { gv2Info = null; } } guildSeen();
  if (gv2Info?.guild) { $('guildSub').textContent = `· [${gv2Info.guild.tag}] ${gv2Info.guild.name}`; renderGuildV2(gv2Info, { be, save, el: $('guildBody'), name: save.heroes[0].name, canPost: (be.canChat?.() ?? true) && !localStaffOnly(), staff: gmValid, log: m => log(`System notice: ${m}`), refresh: async () => { myGuild = await be.myGuild(); if (save.ctx) save.ctx.guild = !!myGuild; render(); await openGuild(); } }); if (!$('guild').open) $('guild').showModal(); return; }
  const blocked = localStaffOnly() ? '<p class="sub">Local staff unlock: guilds need the server role (nothing is sent from this device).</p>' : '';
  let board = []; try { board = await be.guildBoard(guildAll); } catch {}
  const rows = board.map(g => `<tr class="${myGuild?.id === g.id ? 'mine' : ''}"><td>${g.rank}</td><td>${gv2On() ? bannerBadge(g.banner, g.tag) : ''}[${esc(g.tag)}] ${esc(g.name)}${gv2On() && g.level ? ` <small class="sub">Lv ${g.level}${g.open === false ? ' · invite-only' : ''}</small>` : ''}</td><td>${g.members}/${gv2On() && g.level ? slotsOf(g.level) : GUILD_CAP}</td><td>${fmt(g.damage)}</td>${!myGuild && !blocked ? `<td><button data-join="${esc(g.tag)}">Join</button></td>` : '<td></td>'}</tr>`).join('');
  $('guildSub').textContent = myGuild ? `· [${myGuild.tag}] ${myGuild.name}` : '· none';
  $('guildBody').innerHTML = `${blocked}${myGuild ? `<p>You are in <b>[${esc(myGuild.tag)}] ${esc(myGuild.name)}</b>${myGuild.owner ? ' (founder)' : ''} · ${myGuild.members}/${GUILD_CAP} members.</p>
    <p class="sub">${myGuild.is_staff ? `${STAFF_MARK} Staff guild: no bonus · invite only.` : gmValid ? 'Staff: no guild bonus, and your damage never counts toward the guild.' : `Guild bonus: +${GUILD_BUFF * 100}% XP and gold. It never changes damage, ranks or rewards.`}</p><button id="gLeave">Leave guild</button>`
    : blocked ? '' : `<div class="grow"><input id="gName" maxlength="24" placeholder="Guild name"${gmValid ? ` value="${STAFF_GUILD.name}"` : ''}><input id="gTag" maxlength="4" placeholder="TAG" style="max-width:90px;text-transform:uppercase"${gmValid ? ` value="${STAFF_GUILD.tag}"` : ''}><button id="gCreate" class="cta">${gmValid ? 'Found staff guild' : 'Found guild'}</button></div><p class="sub" id="gMsg">${gmValid ? `${STAFF_MARK} Staff guild: no bonus · invite only. One per tower; hidden from the guild board.` : `Up to ${GUILD_CAP} members. Members get +${GUILD_BUFF * 100}% XP and gold.`}</p>`}
    <div class="grow tabs"><button id="gFloor" aria-pressed="${!guildAll}">This floor</button><button id="gAll" aria-pressed="${guildAll}">All floors</button></div>
    <table><tr><th>#</th><th>Guild</th><th>Members</th><th>Damage</th><th></th></tr>${rows || '<tr><td colspan="5" class="sub">No guilds yet.</td></tr>'}</table>`;
  const done = async (f, m) => { try { await f(); myGuild = await be.myGuild(); if (save.ctx) save.ctx.guild = !!myGuild && !myGuild.is_staff; log(`System notice: ${m}`); openGuild(); } catch (e) { const msg = guildError(e.message); const el = $('gMsg'); if (el) el.textContent = msg; else notice(msg); } };
  if ($('gCreate')) $('gCreate').onclick = () => { const c = checkGuild($('gName').value, $('gTag').value, gmValid); if (!c.ok) { $('gMsg').textContent = c.reason; return; } done(() => be.createGuild(c.name, c.tag, meArg()), `guild [${c.tag}] founded.`); };
  if ($('gLeave')) $('gLeave').onclick = () => done(() => be.leaveGuild(), 'you left the guild.');
  $('guildBody').querySelectorAll('[data-join]').forEach(b => b.onclick = () => done(async () => { const r = await be.joinGuild(b.dataset.join, meArg()); if (r?.requested) throw new Error(`[${b.dataset.join}] is invite-only: your request was sent to its officers.`); }, `joined [${b.dataset.join}].`));
  if (gv2On() && gv2Info && !blocked) { $('guildBody').insertAdjacentHTML('afterbegin', invitesHtml(gv2Info)); $('guildBody').querySelectorAll('[data-ainv]').forEach(b => b.onclick = () => done(() => be.guildAcceptInvite(+b.dataset.ainv), 'invite accepted.')); $('guildBody').querySelectorAll('[data-dinv]').forEach(b => b.onclick = () => done(() => be.guildDeclineInvite(+b.dataset.dinv), 'invite declined.')); }
  $('gFloor').onclick = () => { guildAll = false; openGuild(); }; $('gAll').onclick = () => { guildAll = true; openGuild(); };
  if (!$('guild').open) $('guild').showModal();
}
// ---- Floor chat (flag: FEATURES.chat). Polled every 4s only while open and visible; the server filters, the client mirrors it.
let chatLast = 0, chatFloor = null, chatTimer = null; const chatMsgs = [];
const muted = () => JSON.parse(localStorage.getItem('logout.v1.muted') || '[]');
function renderChat() {
  const mu = muted(), el = $('chatLog'), atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = chatMsgs.filter(m => !mu.includes(m.author)).map(m => `<div class="msg ${m.author === 'me' || m.name === save.heroes[0].name ? 'me' : ''} ${m.is_staff ? 'staff' : ''}"><span class="mod"><button data-mute="${esc(m.author)}" title="Mute">Mute</button><button data-rep="${m.id}" title="Report">Report</button></span>${m.guild_tag ? `${gv2On() && tagBanner(m.guild_tag) ? bannerBadge(tagBanner(m.guild_tag), m.guild_tag) : ''}<span class="tag">[${esc(m.guild_tag)}]</span>` : ''}<b>${m.is_staff ? GM_SIGIL + ' ' : ''}${esc(m.name)}</b><time>${new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><br>${esc(m.body)}</div>`).join('') || '<p class="sub">Quiet on this floor.</p>';
  if (atEnd) el.scrollTop = el.scrollHeight;
  el.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => { localStorage.setItem('logout.v1.muted', JSON.stringify([...new Set([...muted(), b.dataset.mute])])); renderChat(); });
  el.querySelectorAll('[data-rep]').forEach(b => b.onclick = async () => { const id = +b.dataset.rep; try { await be.chatReport(id, 'player report'); } catch {} const i = chatMsgs.findIndex(m => m.id === id); if (i >= 0) chatMsgs.splice(i, 1); renderChat(); $('chatNote').textContent = 'Reported. Thanks: it is hidden for you, and for everyone after a few reports.'; });
}
async function pollChat() {
  if (!$('chat').open || document.hidden) return;
  if (chatFloor !== floor.floor) { chatFloor = floor.floor; chatLast = 0; chatMsgs.length = 0; }
  try { const n = await be.chatFetch(chatLast); for (const m of n) { chatMsgs.push(m); chatLast = Math.max(chatLast, m.id); } if (chatMsgs.length > 100) chatMsgs.splice(0, chatMsgs.length - 100); if (n.length) renderChat(); } catch {}
}
// ---- Badge dots (polled every 30s while visible; guild info at most once a minute): floor chat, guild chat, finished quests, join requests.
let chatSeen = null, chatSeenFloor = null, gSeen = null, gSeenGuild = null, lastGPoll = 0; const gDots = { req: false, quest: false, chat: false };
const questKey = i => `${i.week}:${(i.quests || []).filter(q => q.done).map(q => q.idx).join(',')}`;
function syncMoreDot() { setDot('dotMore', !$('dotChat').hidden, 'New floor chat'); setDot('dotGuild', gDots.req || gDots.quest || gDots.chat, [gDots.req ? 'Join requests waiting' : '', gDots.quest ? 'Guild quest completed' : '', gDots.chat ? 'New guild chat' : ''].filter(Boolean).join(' · ')); }
async function badgePoll() {
  if (document.hidden || !save || !be || !floor) return; const me = save.heroes[0].name;
  if (featureOn(FEATURES, 'chat', gmValid) && !$('chat').open && be.chatFetch) {
    if (chatSeenFloor !== floor.floor) { chatSeenFloor = floor.floor; chatSeen = null; }
    try { const n = await be.chatFetch(chatSeen || 0); if (chatSeen !== null && n.some(m => m.name !== me)) setDot('dotChat', true); chatSeen = Math.max(chatSeen || 0, ...n.map(m => m.id)); } catch {}
  }
  if (gv2On() && myGuild && !localStaffOnly() && !$('guild').open && Date.now() - lastGPoll > 59e3) {
    lastGPoll = Date.now(); try { gv2Info = await be.guildInfo(); } catch {} const i = gv2Info;
    if (i?.guild) {
      if (gSeenGuild !== i.guild.id) { gSeenGuild = i.guild.id; gSeen = null; }
      gDots.req = ['leader', 'officer'].includes(i.me?.role) && (i.requests || []).length > 0;
      const qk = questKey(i), qs = localStorage.getItem('logout.v1.questSeen'); if (qs === null) localStorage.setItem('logout.v1.questSeen', qk); else gDots.quest = /:\d/.test(qk) && qk !== qs;
      try { const n = await be.guildChatFetch(gSeen || 0); if (gSeen !== null && n.some(m => m.name !== me)) gDots.chat = true; gSeen = Math.max(gSeen || 0, ...n.map(m => m.id)); } catch {}
    }
  }
  syncMoreDot();
}
function guildSeen() { gDots.chat = false; gDots.quest = false; if (gv2Info?.guild) localStorage.setItem('logout.v1.questSeen', questKey(gv2Info)); lastGPoll = 0; syncMoreDot(); }
async function openChat() {
  setDot('dotChat', false); syncMoreDot();
  $('chatSub').textContent = `· Floor ${floor.floor}`;
  const can = be.canChat() && !localStaffOnly();
  $('chatIn').disabled = $('chatSend').disabled = !can;
  $('chatNote').textContent = can ? `Max ${CHAT_MAX} characters, 1 message every 10 s. Links and addresses are blocked.` : localStaffOnly() ? 'Local staff unlock: chat needs the server role.' : 'Bind your identity (System) to post. You can still read.';
  $('chatForm').onsubmit = async e => { e.preventDefault(); const r = cleanChat($('chatIn').value); if (!r.ok) { $('chatNote').textContent = 'Not sent: ' + r.reason; return; }
    try { await be.chatPost(save.heroes[0].name, $('chatIn').value, meArg()); $('chatIn').value = ''; $('chatNote').textContent = ''; await pollChat(); } catch (err) { $('chatNote').textContent = 'Not sent: ' + err.message; } };
  if (!$('chat').open) $('chat').showModal(); renderChat(); await pollChat(); chatSeen = Math.max(chatSeen || 0, chatLast); chatSeenFloor = floor.floor;
  clearInterval(chatTimer); chatTimer = setInterval(() => { if (!$('chat').open) clearInterval(chatTimer); else pollChat(); }, 4000);
}

// ---- The Architect's Codex: live hooks (staff only; every cx() check needs the GameMaster class and the learned node)
let galaxy = null, lastEclipse = Date.now(), collapseUntil = 0, echoUntil = 0, lastFloorFor = null; const seenMark = {};
function decreePctNow() { const h = save?.heroes?.[0]; if (cx(h, 'cx-final') || Date.now() < collapseUntil) return 6; const d6 = floor?.marks?.decree6; return d6 && Date.parse(d6.until) > Date.now() ? 6 : 5; }
function renderCodexLook(h) {
  galaxy = galaxy || mountGalaxy($('arena'), $('hero'));
  galaxy.update({ on: gmValid && h.cls === GM_CLASS && h.look.aura === 'gm-aura', level: h.level, stars: cx(h, 'cx-constellation') ? Math.min(100, new Set(save.progress?.cleared || []).size) : 0, eyes: cx(h, 'cx-shape') });
  if (cx(h, 'cx-dusk')) $('hero').style.filter = `drop-shadow(0 0 ${(1 + Math.min(50, h.level) / 10).toFixed(1)}px #ffd76a) drop-shadow(0 0 3px #9a5cff88)`; // Dusk Edge
  const mine = gmValid && cx(h, 'cx-corner'), cm = floor.marks?.cornerstone, shown = mine || (cm && cm.floor === floor.floor);
  let rn = $('rune'); if (shown && !rn) { rn = document.createElement('div'); rn.id = 'rune'; rn.textContent = '◈'; rn.title = 'The Architect was here'; $('arena').append(rn); } else if (!shown && rn) rn.remove();
}
function codexTick(p) {
  const h = save.heroes[0]; if (!gmValid || !cx(h, 'cx-eclipse') || p.damage <= 0 || Date.now() - lastEclipse < 60000) return; lastEclipse = Date.now();
  const twice = cx(h, 'cx-collapse'), dps = p.damage / Math.max(1, p.secs); for (let i = 0; i < (twice ? 2 : 1); i++) setTimeout(() => hitFx(Math.round(dps * 3)), i * 250); // visual: Eclipse is averaged into DPS (offline parity)
  log(`Eclipse: a void strike for 300%${twice ? ', twice' : ''}.`, '#ffd76a');
  if (twice) { collapseUntil = Date.now() + 10000; be.gmMark?.('decree6', floor.floor, 'collapse').catch(() => {}); }
}
function supernova() { const n = document.createElement('div'); n.className = 'supernova'; $('arena').append(n); setTimeout(() => n.remove(), 1700); }
function codexFloorFell(f, next) {
  const h = save.heroes[0]; if (!gmValid) return;
  if (cx(h, 'cx-supernova')) { supernova(); be.gmMark?.('supernova', f).catch(() => {}); }
  if (cx(h, 'cx-shape')) { bigNotice(`The Architect has shaped Floor ${f}.`); be.gmMark?.('shaped', f).catch(() => {}); }
  if (cx(h, 'cx-echo')) echoUntil = Date.now() + 120000; // Decree lingers 2 min
}
function seenMarks() { // marks set by a server-role staff client; everyone on the floor sees them once
  const m = floor.marks || {}, h = save.heroes[0];
  for (const k of ['supernova', 'shaped']) { const x = m[k]; if (!x || seenMark[k] === x.at || Date.now() - Date.parse(x.at) > 120e3) continue; seenMark[k] = x.at; if (gmValid) continue; if (k === 'supernova') supernova(); else bigNotice(`The Architect has shaped Floor ${x.floor}.`); }
  if (gmValid && cx(h, 'cx-final')) be.gmMark?.('decree6', floor.floor, 'final').catch(() => {});
  if (gmValid && cx(h, 'cx-echo')) be.gmMark?.('echo', floor.floor).catch(() => {});
  if (gmValid && cx(h, 'cx-corner') && be.isGm?.()) be.gmMark?.('cornerstone', floor.floor).catch(() => {});
  if (lastFloorFor !== floor.floor) { if (lastFloorFor !== null && gmValid && cx(h, 'cx-prophecy')) { const nx = Math.min(floor.floor + 1, MAX_FLOOR); log(`Prophecy: the guardian of Floor ${nx} will be ${bossInfo(nx).lootElement}.`, '#ffd76a'); } lastFloorFor = floor.floor; }
}
function codexExtra(h, n) {
  if (!(h.talents?.[n.id] > 0)) return '';
  if (n.id === 'cx-herald') return `<div class="staffbox"><input id="cxHerald" maxlength="80" placeholder="Your entrance line" value="${esc(save.herald || '')}"><button id="cxHeraldSave">Save line</button></div>`;
  if (n.id === 'cx-destiny') { const left = save.destiny?.at ? DESTINY_MS - (Date.now() - save.destiny.at) : 0;
    return `<div class="staffbox">${left > 0 ? `<span class="sub">Next choice in ${Math.ceil(left / 3600e3)}h${save.destiny?.element ? ` · chosen: ${esc(save.destiny.element)}` : ''}</span>` : `<select id="cxDestiny">${ELEMENTS.map(e => `<option>${esc(e)}</option>`).join('')}</select><button id="cxDestinySet">Choose</button>`}</div>`; }
  if (n.id === 'cx-longnight') return `<div class="staffbox"><button id="cxSkin">${h.look.weaponColor === 'gm-unsheathed' ? 'Wear Eventide (void edge)' : 'Wear Eventide, Unsheathed'}</button></div>`;
  return '';
}
function wireCodexExtra(h, n) {
  if ($('cxSkin')) $('cxSkin').onclick = async () => { if (!gmValid) return; h.look.weaponColor = h.look.weaponColor === 'gm-unsheathed' ? 'gm-edge' : 'gm-unsheathed'; await be.saveSave(save); render(); openTalents(); };
  if ($('cxHeraldSave')) $('cxHeraldSave').onclick = async () => { const c = cleanChat($('cxHerald').value, 80); if (!c.ok) { notice('Not allowed: ' + c.reason); return; } save.herald = c.text; await be.saveSave(save); notice('Entrance line saved'); };
  if ($('cxDestinySet')) $('cxDestinySet').onclick = async () => { if (chooseDestiny(save, $('cxDestiny').value)) { log(`Shaper of Destiny: your next boss drop will be ${save.destiny.element}.`, '#ffd76a'); await be.saveSave(save); openTalents(); } };
}

// ---- Tower Map + progress (shared floor_state + floor_clears history online, local history offline)
async function openMap() {
  const [hist, heroes] = await Promise.all([be.floorHistory?.().catch(() => []) ?? [], be.floorHeroes?.(floor.floor).catch(() => null) ?? null]);
  const rows = towerRows({ current: floor.floor, maxFloor: MAX_FLOOR, history: hist }), pr = towerProgress({ current: floor.floor, hp: floor.hp, maxHp: floor.maxHp, maxFloor: MAX_FLOOR });
  const when = at => at ? new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  $('mapProg').innerHTML = `<div class="mprog"><b>Floor ${pr.floor} / ${pr.top}</b><span>${pr.cleared} cleared${heroes != null ? ` · ${heroes} hero${heroes === 1 ? '' : 'es'} on this floor` : ''}</span>
    <div class="bar"><i style="width:${pr.pct.toFixed(1)}%"></i></div><small>Tower ${pr.pct.toFixed(0)}% · guardian HP ${fmt(floor.hp)} / ${fmt(floor.maxHp)}</small>
    <div class="bar hp"><i style="width:${(pr.bossPct * 100).toFixed(1)}%"></i></div><p class="sub">Logout returns when Floor ${TOWER_TOP} falls.</p></div>`;
  $('mapTower').innerHTML = rows.map(r => `${r.f === TOWER_TOP ? '<div class="crown" aria-hidden="true">♛</div>' : ''}<button class="fl ${r.state}${r.crown ? ' top' : ''}${r.special ? ' sp' : ''}" data-f="${r.f}" ${r.state === 'cleared' ? '' : 'aria-disabled="true"'}>
    <span class="fn">${r.f}</span><span class="fname">${esc(r.name)}${r.milestone && r.state !== 'undiscovered' ? ' <em>★</em>' : r.special && r.state !== 'undiscovered' ? ' <em>✦</em>' : ''}</span>
    <span class="fmeta">${r.state === 'cleared' ? (r.at ? `fell ${esc(when(r.at))}` : 'cleared') : r.state === 'current' ? `<b class="you">◆ You</b> ${Math.round(pr.bossPct * 100)}% HP` : ''}</span></button>`).join('');
  $('mapTower').onclick = e => { const b = e.target.closest('button.fl.cleared'); if (!b) return; const r = rows.find(x => x.f === +b.dataset.f), d = $('mapDetail');
    d.hidden = false; d.innerHTML = `<i class="mthumb" style='background-image:${bossSprite(r.f).replace(/'/g, '%27')}'></i><div><b>Floor ${r.f} · ${esc(r.name)}</b><br>${r.at ? `Fell ${esc(when(r.at))}` : 'Cleared (time not recorded)'}<br>${r.top ? `Top damage: ${esc(r.top)}` : 'Top damage: not recorded'}</div>`; };
  $('mapDetail').hidden = true; if (!$('map').open) $('map').showModal();
  requestAnimationFrame(() => { const t = $('mapTower'), c = t.querySelector('.fl.current'); if (c) t.scrollTop = c.offsetTop - t.offsetTop - t.clientHeight / 2; $('map').scrollTop = 0; }); // scroll the tower only, keep the progress panel in view
}

// ---- Guild Hall (Town room, guildsV2): cosmetic, grows with guild level and hall upgrades
async function renderHall() {
  const card = $('hallCard'); if (!gv2On() || !myGuild || localStaffOnly()) { card.hidden = true; syncHall(); return; }
  try { gv2Info = await be.guildInfo(); } catch { gv2Info = null; } const g = gv2Info?.guild; if (!g) { card.hidden = true; syncHall(); return; }
  card.hidden = false; $('hallTitle').textContent = `[${g.tag}] ${g.name} · Guild Hall`; $('hallArt').style.backgroundImage = hallArt(g.level, g.hall, g.banner);
  syncHall(); $('hallInfo').textContent = `Guild level ${g.level} · hall upgrade ${g.hall}/5 · bonus +${g.bonus_pct}% XP & gold. Upgrades are bought with bank gold in the Guild panel.`;
}

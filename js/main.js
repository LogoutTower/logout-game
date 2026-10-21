import { countPoller, countText, clearPlayers } from './towercount.js';
import { effectsOf, CLASSES, newHero, heroDps, levelCost, gearCost, accrue, offlineProgress, applyXp, heroHp, heroMaxHp, isWorn, effectiveDps, buffsOf, bossName, fmt, fmtDur, xpToNext } from './game.js';
import { makeBackend, onlineConfigured } from './storage.js';
import { BUILD } from './build.js';
import { priceFor, innCost, rest, shopStock, buy as shopBuy, soldOut, npcGrid } from './town.js';
import { sprite } from './sprites.js';
import { isSpecialSlot, bossInfo, mechText } from './floors.js';
import { arcOf, arcIndex, sceneOf, sceneVars } from './arcs.js';
import { treeOf, nodeById, canLearn, learn, freePoints, totalPoints, spentIn, respec, respecCost } from './talents.js';
import { TRICKLE, trickleDrops, grantDrops, equipItem, salvageItem, salvageValue, rarityOf, statLabel, INV_SIZE, bagSize, GEAR_SLOTS } from './loot.js';
import { GM_PASS_HASH, OFFLINE_CAP_HOURS, MAX_FLOOR, FEATURES, SOLANA_RPC, TOKEN_MINT, HOLDER_THRESHOLD, GM_SOFTEN_MULT } from '../config.js';
import { featureOn } from './features.js';
import { checkGuild, GUILD_CAP, GUILD_BUFF, STAFF_GUILD, STAFF_MARK, guildError } from './guilds.js';
import { cleanChat, CHAT_MAX } from './chatfilter.js';
import { boardWithStaff, wouldRankLabel } from './ranks.js';
import { gmTier, gmGear, wearsVesperveil, STAFF_STAMP, VESPERVEIL, staffActive, GM_CLASS, GM_LUCK, GM_SIGIL, EVENTIDE, gmOn, checkPass, sanitizeSave, becomeGm, leaveGm, eventide, shouldAnnounce } from './gm.js';
import { initUI, go as goTab, townPane, syncHall, setDot, setHeroLabels, heroTab } from './ui.js';
import { openSandbox, sandboxFloor, sandboxFight, sandboxLoot, closeSandbox, sandboxEdit } from './sandbox.js';
import { softenGm, enforceOneUnique, legendaryArmorPct, legendaryWeaponDps, rerollItem, chooseDestiny, DESTINY_MS } from './loot.js';
import { cx, CODEX, isCodex } from './codex.js';
import { galaxyTier, mountGalaxy } from './galaxy.js';
import { unwrittenHour, levelCap, atCap, forgeCap } from './game.js';
import { TONICS, TONIC_MAX, tonicPrice, buyTonic, TAILOR, buyCosmetic, DONATE_STEPS } from './sinks.js';
import { claimReward, localDaily, calendarHtml, savesLeft } from './daily.js';
import { playCutscene } from './cutscene-player.js';
import { adoptQuests, questsToday, questsHtml, localQuest, claimLocal, claimServer, claimable, bankXp, DQ_GAP_S, RESET_DQ } from './quests.js';
import { cardFromSave, fakeCard, cardHtml, CardCache } from './idcard.js';
import { pendingCutscene, CUTSCENES } from './cutscenes.js';
import { towerRows, towerProgress, TOWER_TOP } from './towermap.js';
import { renderGuildV2, invitesHtml } from './guildpanel.js';
import { bannerBadge, hallArt } from './banner.js';
import { slotsOf, displayBanner, ZERO_BANNER, staffHall } from './guildsv2.js';
import { itemIcon } from './icons.js';
import { openDen } from './casinoui.js';
import { openForgeUp } from './forgeui.js';
import { showHelp } from './helpui.js';
import { gainMats, matName, farmFloor, setOf, lootKeyHtml } from './forge.js';
import { shopHtml, haloHtml, petHtml, decorHtml, wallHtml, eclipseOn } from './prestigeui.js';
import { SHOP, spiritStage } from './prestige.js';
import { SANCTUM, sanctumAllowed, inSanctum, newConstruct, hitConstruct, dpsMeters, constructSprite, towerModelSprite } from './sanctum.js';
import { sellPrice, sellable, toggleLock, sellItem, bulkPreview, sellBulk } from './town.js';
const shownRarity = it => it?.gm ? 'unique' : it?.rarity; // staff items display as Unique (see gm.js)
const ico = (it, cls = 'ico') => `<i class="${cls}${shownRarity(it) === 'unique' ? ' ushim' : ''}${it?.gm && it.tier >= 2 ? ` gmt${it.tier}` : ''}" style='background-image:${itemIcon(it).replace(/'/g, '%27')}' aria-hidden="true"></i>`;
import { ELEMENT_WORD } from './loot.js'; const ELEMENTS = Object.keys(ELEMENT_WORD);
import { classOf } from './game.js';
import { holderStatus } from './supabase.js';
import { loadTeam, isTeam, teamTag } from './teamstaff.js';
import { bossSprite, bossIsBig, heroSprite, bossPhase, AWAKEN_NAME, AWAKEN_TITLE } from './sprites.js';
import { SLOTS, CREATION_SLOTS, itemsFor, isUnlocked, unlockText, defaultLook, migrateSave, recordClear, equip, titleOf, nameColorOf, fakeProfile, byId, SAVE_VERSION } from './cosmetics.js';
const $ = id => document.getElementById(id);
// Write only when changed: avoids rebuilding nodes (and layout shifts that eat clicks) on every 1s tick.
const H = id => { const e = $(id); return { set innerHTML(v) { if (e._v !== v) { e._v = v; e.innerHTML = v; } }, set textContent(v) { if (e.textContent !== v) e.textContent = v; } }; };
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
let lootLines = [];
let counts = null, be, save, floor, pending = 0, recent = { dmg: 0, gold: 0, xp: 0 }, quietSync = true, cls = 'Vanguard', draftLook = defaultLook('Vanguard'), toastT;
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
  const sanc0 = inSanctum(save, sanctumOk()); // offline time accrues to the mode the staff hero was in
  if (!sanc0 && gmValid) p.damage = softenGm(p.damage, p.secs, (await be.getFloor()).floor, GM_SOFTEN_MULT); // raid softener
  save.gold += p.gold; const ups = applyXp(save.heroes, p.xp, levelCap((await be.getFloor()).floor, gmValid)); if (sanc0) construct().total += p.damage; else if (!farmFloor(save, (await be.getFloor()).floor)) pending += p.damage; else p.damage = 0;
  const offFloor = (await be.getFloor()).floor, farm0 = sanc0 ? 0 : farmFloor(save, offFloor), matsAway = sanc0 ? {} : gainMats(save, p.secs, farm0 || offFloor, !!farm0), trickled = sanc0 ? [] : trickleDrops(save, p.secs, offFloor, TRICKLE.offlineMax);
  if (p.secs > 30) {
    const r = sanc0 ? { clears: [] } : await submitDmg(h0.name, pending, h0); if (!sanc0) pending = 0;
    lootLines = []; const got = handleClears(r.clears, true);
    $('awaytxt').innerHTML = `Log out disabled. You fought on for ${fmtDur(p.secs)}${p.capped ? ` (capped at ${cap}h)` : ''}${p.vigilUsed ? ' · Scroll of Vigil burned' : ''}<br>HP: ${Math.round(heroHp(h0))} / ${heroMaxHp(h0)}${p.lowSecs > 0 ? ` · worn down for ${fmtDur(p.lowSecs)} (DPS halved). Rest at the inn.` : ''}<br>Damage: ${fmt(p.damage)}<br>Gold: +${fmt(p.gold)}<br>XP: +${fmt(p.xp)}${ups.length ? `<br>Level ups: ${ups.length}` : ''}${r.advanced ? `<br>Floors cleared: ${r.advanced}. Floor ${r.floor} is open.` : ''}${Object.keys(matsAway).length ? `<br>Materials: ${Object.entries(matsAway).map(([k, n]) => `${esc(matName(k))} ×${n}`).join(', ')}` : ''}${got.length ? `<br>Cosmetics unlocked: ${got.map(i => esc(i.label)).join(', ')}` : ''}${lootLines.length || trickled.length ? `<br>Loot: ${[...lootLines, ...trickled.map(it => `<span style="color:${rarityOf(it.rarity).color}">${esc(it.name)}</span>`)].join(', ')}` : ''}`;
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
    save = migrateSave({ version: 2, heroes: [h], gold: 0, lastTick: Date.now(), progress: { cleared: [], top3: [], rank1: 0 }, introDue: true, csV: 2, createdAt: Date.now() }); // fills v3 fields
    await be.saveSave(save); $('create').classList.add('hidden'); startGame(true);
  };
}
function handleClears(clears = [], quiet = false) {
  const me = save.heroes[0].name, all = [];
  for (const c of clears) {
    const got = recordClear(save, c.floor, gmValid ? 0 : (c.rank ?? c.ranking.indexOf(me) + 1), c.maxHp ? (c.dmg?.[me] || 0) / c.maxHp : 1); all.push(...got);
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
  $('wpreview').style.backgroundImage = heroSprite(h.look, h.cls); $('wpreview').innerHTML = gmValid && save.spirit ? haloHtml(spiritStage(h.level).n) : ''; // Solumbra halo on the portrait (staff only)
  $('wname').innerHTML = `<span style="color:${nameColorOf(h)}">${esc(h.name)}</span><br><span class="ttl">«${esc(titleOf(h))}»</span>` + (h.cls === GM_CLASS && h.look.outfitStyle === 'gm-coat' ? `<p class="sub" id="vesper"><b class="uniq" style="color:${rarityOf('unique').color}">${esc(VESPERVEIL.label)}</b> <small style="color:${rarityOf('unique').color}">Unique · coat · ${esc(STAFF_STAMP)}</small><br>${esc(VESPERVEIL.lore)}<br><span style="color:#cfd8ff">✦ ${esc(VESPERVEIL.ability)}</span></p>` : '');
  picker($('wpick'), SLOTS, h.look, h.cls, save.progress, async id => { if (equip(save, id)) { await be.saveSave(save); render(); openWardrobe(); } });
  if (!$('wardrobe').open) $('wardrobe').showModal();
}
async function startGame(fresh = false) {
  $('game').classList.remove('hidden');
  floor = await be.getFloor(); arcCheck(); csCheck(fresh); log(`${save.heroes[0].name} awoke on Floor ${floor.floor}. The guardian stirs.`); log('System notice: log out disabled.');
  if (fresh) { notice('Log out disabled'); setTimeout(() => notice(`Floor ${floor.floor} is open`), 900); } // no replayed notices on reload
  $('lvl').onclick = () => buy('level'); $('gear').onclick = () => buy('gear');
  initUI({ gear: () => $('gearSheet').showModal(), bag: openBag, talents: () => { talSel = null; openTalents(); }, wardrobe: openWardrobe, town: openTown, guild: openGuild });
  $('helpBtn').onclick = () => { $('more').close(); tourShow(0); }; $('sysBtn').onclick = openSystem; $('mapBtn').onclick = openMap; $('floorBtn').onclick = openMap; $('chatBtn').onclick = openChat;
  $('lbBtn').onclick = () => $('lbSheet').showModal(); $('top3').onclick = () => $('lbSheet').showModal(); $('logBtn').onclick = () => $('logSheet').showModal(); $('sbBtn').onclick = openSandboxUi;
  $('tabGuild').hidden = !featureOn(FEATURES, 'guilds', gmValid); $('chatBtn').hidden = !featureOn(FEATURES, 'chat', gmValid);
  $('topbar').classList.remove('hidden'); $('tabbar').classList.remove('hidden'); setInterval(badgePoll, 60000); setTimeout(badgePoll, 4000);
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, () => be?.touch?.(), { passive: true })); addEventListener('pagehide', () => { try { if (be?._dirty) be._push(be._dirty); } catch {} });
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('tabhidden', document.hidden)); // pauses CSS loops (Solumbra halo, pet bob)
  if (gmValid && save.equinox !== undefined) { if (save.spirit === undefined) save.spirit = save.equinox; delete save.equinox; } if (gmValid && save.spirit === undefined) save.spirit = true; loadShop();
  setInterval(tick, 1000); setInterval(sync, 5000); render(); renderLb();
  if (be.towerCounts) counts = countPoller({ fetchCounts: () => be.towerCounts(), render: c => { const t = countText(c), el = $('pcount'); el.textContent = t; el.hidden = !t; } });
  if (!save.tutorialSeen) startTour(); // right after creation, and once for older saves
}
function tick() {
  save.ctx = { gm: gmValid, gmPresent: (gmValid && (wearsVesperveil(save.heroes[0]) || save.heroes[0].cls === GM_CLASS)) || (floor.gmUntil || 0) > Date.now(), guild: !!myGuild && !myGuild.is_staff, guildPct: myGuild?.is_staff || gv2Info?.guild?.is_staff ? 0 : gv2Info?.guild?.bonus_pct ?? null, decreePct: decreePctNow(), decree: gmValid || (floor.gmUntil || 0) > Date.now() || echoUntil > Date.now(), bossPct: floor.maxHp ? floor.hp / floor.maxHp : 1, special: isSpecialSlot(floor.floor), element: bossInfo(floor.floor).lootElement, mech: bossInfo(floor.floor).mech, sessionSecs: (Date.now() - sessionStart) / 1000 };
  save.ctx.eclipse = gmValid && !!save.spirit && eclipseOn(); { const ec = save.ctx.eclipse, ar0 = $('arena'); if (ar0.classList.contains('eclipse') !== ec) ar0.classList.toggle('eclipse', ec); }
  { const uh = unwrittenHour(save.ctx), ar = $('arena'); if (ar.classList.contains('unwritten') !== uh) { ar.classList.toggle('unwritten', uh); ar.title = uh ? 'The Unwritten Hour: +5% damage until the guardian falls' : ''; } }
  const p = accrue(save, Date.now(), OFFLINE_CAP_HOURS), fx = effectsOf(save.heroes[0]);
  if (fx.has('whisper') && Date.now() - lastWhisper > 120000) { lastWhisper = Date.now(); log(WHISPERS[Math.floor(Math.random() * WHISPERS.length)], '#b9a8ff'); }
  if (p.damage > 0 && save.sheath && cx(save.heroes[0], 'cx-sheath')) { const extra = Math.round(p.damage * 0.5); p.damage += extra; save.sheath = false; log('Twilight Sheath: the first cut after rest lands +50%.', '#ffd76a'); } // Twilight Sheath
  codexTick(p);
  const sanc = inSanctum(save, sanctumOk()); if (!sanc && gmValid) p.damage = softenGm(p.damage, p.secs, floor.floor, GM_SOFTEN_MULT); // raid softener (shared boss only; server enforces too)
  save.gold += p.gold; recent.dmg += p.damage; recent.gold += p.gold; recent.xp += p.xp;
  const farm = sanc ? 0 : farmFloor(save, floor.floor); if (farm) p.damage = 0; // Farm mode: a boss echo, never the live guardian
  if (!sanc) gainMats(save, p.secs, farm || floor.floor, !!farm); // materials from every fight (js/forge.js)
  if (sanc) { const b = hitConstruct(construct(), p.damage, Date.now()); if (b) log(`Sanctum: the training construct broke and re-formed (×${construct().broken}).`, '#d9a93f'); } else { pending += p.damage; floor.hp = Math.max(0, floor.hp - p.damage); } // Sanctum: never the shared boss
  if (applyXp(save.heroes, p.xp, levelCap(floor?.floor, gmValid)).length) { log(`System notice: level ${save.heroes[0].level} reached.`); notice(`Level ${save.heroes[0].level} reached · +1 talent point`); }
  for (const it of sanc ? [] : trickleDrops(save, p.secs, floor.floor, p.secs > 2 ? TRICKLE.offlineMax : Infinity)) { const R = rarityOf(it.rarity); log(`Loot · ${R.label} ${it.name}${it.salvaged ? ' (bag full: salvaged)' : ''}`, R.color); notice(`${R.label} find — ${it.name}`, R.color, it); }
  if (p.damage > 0) { hits++; if (fx.has('tenth') && hits % 10 === 0) { hitFx(p.damage); log('The Tenth Bell rings — double hit.', '#7ff6ff'); } hitFx(p.damage); } $('boss').classList.add('hit'); setTimeout(() => $('boss').classList.remove('hit'), 120); render();
}
// Background tabs throttle timers: every tick measures real elapsed time (accrue = offline maths), and we catch up as soon as the tab is visible or focused.
let lastCatchUp = 0;
function catchUp() { if (!save || !floor || Date.now() - lastCatchUp < 500) return; lastCatchUp = Date.now(); tick(); be.resume?.(); sync(); } // tick() accrues the away time (12 h cap, same as offline); resume() makes sync() send it now
document.addEventListener('visibilitychange', () => { if (!document.hidden) catchUp(); });
addEventListener('focus', catchUp); addEventListener('pageshow', catchUp);
async function sync() {
  if (inSanctum(save, sanctumOk())) { if (recent.dmg > 0) { log(`Sanctum: ${fmt(recent.dmg)} to the construct · +${fmt(recent.gold)} gold · +${fmt(recent.xp)} XP`); recent = { dmg: 0, gold: 0, xp: 0 }; } await be.saveSave(save); render(); return; } // save pushes only: no damage ticks, no floor polls
  if (be.name === 'local') { be.decree = gmValid; be.decreePct = decreePctNow(); }
  const r = await submitDmg(save.heroes[0].name, pending, { ...save.heroes[0], staff: gmValid }); pending = 0;
  if (recent.dmg > 0) { log(`You strike for ${fmt(recent.dmg)} · +${fmt(recent.gold)} gold · +${fmt(recent.xp)} XP`); recent = { dmg: 0, gold: 0, xp: 0 }; }
  const quiet = quietSync; quietSync = false; // clears that happened before this session are logged, not re-toasted
  if (r.advanced) { const f = r.floor - 1; log(`${bossName(f)} fell beneath many blades. The stair to Floor ${r.floor} lies open.`); log(`System notice: Floor ${r.floor} is open.`); floorCleared(f); setTimeout(() => notice(`Floor ${r.floor} is open`), 2400); codexFloorFell(f, r.floor); }
  handleClears(r.clears, quiet);
  { const dl = r.daily || (be.name === 'local' ? localDaily(save) : null); if (dl) { const s = claimReward(save, dl.d, floor?.floor || r.floor || 1, { gm: gmValid, seq: save.lootSeq++ }); if (dl.d === 7) { if (be.name === 'local' && Math.random() < 0.5) be.petGrantLocal(Math.ceil((floor?.floor || 1) / 10), 'chest').then(loadShop); else setTimeout(loadShop, 3000); } // day-7 chest: 50% pet (server-rolled online)
      if (dl.sv && !dl.local) save.daily.saveMonth = new Date().toISOString().slice(0, 7);
      log(`System notice: daily reward, day ${dl.d} of 7 · ${s}.${dl.sv ? ' Streak save used.' : ''}`, '#ffd76a'); notice(`Day ${dl.d} reward · ${s}`, '#ffd76a'); setDot('dotMore', true, 'Daily reward claimed'); } }
  questSync(r);
  floor = await be.getFloor(); arcCheck(); csCheck(); gmFloorChecks(); await be.saveSave(save); render(); renderLb();
}
// ---- Daily quests (js/quests.js). Online: progress arrives inside tick() (no extra polling); offline: counted on this browser.
let dqLastSync = 0;
const dqCtx = () => ({ inGuild: !!myGuild && !myGuild.is_staff, gm: gmValid });
function dqLocal(kind, amt) { if (be.name !== 'local' || localStaffOnly()) return false; const done = localQuest(save, kind, amt, floor?.floor || 1, dqCtx()); if (done) questReady(); return done; }
function questReady() { notice('Daily quest complete · claim it in Town → Goods', '#ffd76a'); setDot('dotMore', true, 'Daily quest ready to claim'); }
function questSync(r) {
  if (be.name === 'local') { const now = Date.now(), gap = dqLastSync ? (now - dqLastSync) / 1000 : 0; dqLastSync = now; const me = save.heroes[0].name;
    dqLocal('dmg', r.accepted || 0); if (gap > 0 && gap <= DQ_GAP_S) dqLocal('online', Math.floor(gap)); for (const c of r.clears || []) if ((c.dmg?.[me] || 0) > 0) dqLocal('clear', 1); return; }
  if (r.quests && adoptQuests(save, r.quests)) questReady();
}
async function claimQuest(i) { const f = floor?.floor || 1; let out;
  if (be.name === 'local') out = claimLocal(save, i, f, gmValid);
  else { try { const r = await be.questClaim(i, save); out = claimServer(save, i, r, f, gmValid); } catch (e) { notice(`Not claimed: ${/quest_claim|function|schema/i.test(e.message) ? 'quests open soon' : e.message}`); return; } }
  if (out) { log(`System notice: daily quest reward · +${fmt(out.add)} gold and banked XP.`, '#ffd76a'); notice(`Quest reward · +${fmt(out.add)}g + XP`, '#ffd76a'); }
  await be.saveSave(save); render(); }
async function claimGuildQuest(week, idx) { const r = await be.guildQuestClaim(week, idx, save); bankXp(save, Number(r?.xp) || 0, floor?.floor || 1, gmValid); await be.saveSave(save);
  log(`System notice: weekly guild quest share · +${fmt(r?.add || 0)} gold and banked XP.`, '#ffd76a'); notice(`Guild quest share · +${fmt(r?.add || 0)}g + XP`, '#ffd76a'); render(); }
// ---- Player ID card: tap a name on the board, in chat or on the roster. One read-only fetch per card per 5 min (CardCache).
const cards = new CardCache();
async function openCard(name, author = null) {
  if (!name && !author) return; const me = save.heroes[0], d = $('idCard'), body = $('idCardBody'); body.innerHTML = '<p class="sub">Loading…</p>'; if (!d.open) d.showModal();
  let card = null, guild = null;
  if (name === me.name && !author) { const g = gv2Info?.guild || myGuild; guild = g ? { tag: g.tag, name: g.name, banner: g.banner, staff: !!g.is_staff } : null; card = cardFromSave(save, { guild, staff: gmValid }); }
  else if (be.name === 'local') { const gs = be._g?.(), m = gs?.members.find(x => x.name === name), gu = m && gs.guilds.find(x => x.id === m.guild_id); card = fakeCard(name, floor?.floor || 1, gu ? { tag: gu.tag, name: gu.name, banner: gu.banner, staff: !!gu.is_staff } : null); }
  else if (be.playerCard) card = await cards.get(author ? 'a:' + author : 'n:' + name, () => be.playerCard({ name: author ? null : name, author })).catch(() => null);
  $('idCardSub').textContent = card ? '· hero ID' : '';
  body.innerHTML = card ? cardHtml(card, { team: !card.st && isTeam(card.name || name, author), fmt, esc, sprite: heroSprite, guildBadge: g => gv2On() && g.banner ? bannerBadge(displayBanner(g.banner, g.staff), g.tag) : '' })
    : `<p class="sub">${be.playerCard && !be.noCard ? 'No ID card for this hero yet. They need to play and sync once.' : 'ID cards open soon.'}</p>`;
}
document.addEventListener('click', e => { const t = e.target.closest?.('[data-card]'); if (!t || !save) return; e.preventDefault(); e.stopPropagation(); openCard(t.dataset.card, t.dataset.author || null); }, true);
// ---- Arc scenes (js/arcs.js): one scene per 10 floors, per-floor tint toward the guardian's element.
let sceneFor = 0;
function applyScene(f) {
  if (sceneFor === f) return; sceneFor = f; const ar = $('arena'), bi = bossInfo(f), s = sceneOf(f, ELEMENT_GLOW[bi.lootElement]);
  for (const [k, v] of sceneVars(s)) ar.style.setProperty(k, v);
  Object.assign(ar.dataset, { arc: s.arc, props: s.props, particles: s.particles }); ar.classList.toggle('finale', !!bi.finale); ar.classList.toggle('special', isSpecialSlot(f));
  for (const c of ['gear l', 'gear r', 'icicles']) if (!ar.querySelector('.' + c.replace(' ', '.'))) { const d = document.createElement('div'); d.className = c; d.setAttribute('aria-hidden', 'true'); ar.prepend(d); }
  if (!$('amb')) { const d = document.createElement('div'); d.id = 'amb'; d.setAttribute('aria-hidden', 'true'); ar.prepend(d); }
}
const ELEMENT_GLOW = { fire: '#ff8a2e', frost: '#9fd8ff', void: '#9a5cff', storm: '#8aa8e8', venom: '#8ae04a', holy: '#f4e2a8', blood: '#e04a5a', shadow: '#5a5078' };
// "Entering <arc>": once per device when the shared floor first reaches a new arc (silent on the very first visit).
// Cutscenes: shown once per player (save.cutscenes), driven by the shared server floor; intro only for brand-new heroes.
let csBusy = false;
// Marked seen only after it was actually shown to the end (or skipped): a reload, deploy refresh or killed phone tab mid-cutscene replays it next load.
// csV 2: before this fix arc cutscenes were marked seen before playing and were unwatchable on phones, so arc 1 is re-queued once for everyone.
async function csCheck(fresh = false) { if (csBusy || !save || (navigator.webdriver && !localStorage.getItem('logout.v1.csTest'))) return; save.cutscenes = save.cutscenes || []; // automated runs opt in via logout.v1.csTest
  if ((save.csV || 0) < 2) { save.cutscenes = save.cutscenes.filter(k => k !== '1'); save.csV = 2; }
  const k = pendingCutscene(floor, MAX_FLOOR, save.cutscenes, { fresh: fresh || !!save.introDue }); if (!k) return;
  csBusy = true; const ok = await playCutscene(k).catch(() => false); csBusy = false;
  if (ok) { if (!save.cutscenes.includes(k)) save.cutscenes.push(k); if (k === 'intro') delete save.introDue; await be.saveSave(save).catch(() => {}); csCheck(); } }
function arcCheck() { const a = arcIndex(floor.floor), k = 'logout.v1.arcSeen', seen = +localStorage.getItem(k) || 0;
  if (seen && a > seen) { const n = arcOf(floor.floor).name; log(`System notice: Entering ${n}.`, '#9fd8ff'); setTimeout(() => notice(`Entering ${n}`, '#9fd8ff'), 3200); }
  if (a > seen) localStorage.setItem(k, String(a)); }
function buy(kind) {
  const h = save.heroes[0], c = kind === 'level' ? levelCost(h) : gearCost(h); if (save.gold < c) return;
  if (kind === 'gear' && h.gear >= forgeCap(floor?.floor, gmValid)) { notice(`Forge cap +${h.gear}: the next floor raises it`); return; }
  if (kind === 'level' && atCap(h, levelCap(floor?.floor, gmValid))) { notice(`Level cap ${h.level}: the next floor raises it`); return; }
  save.gold -= c; kind === 'level' ? h.level++ : h.gear++; log(kind === 'level' ? `${h.name} trained through the night and rose to level ${h.level}.` : `The forge rang out; ${h.name}'s gear was tempered to +${h.gear}.`);
  render(); be.saveSave(save);
}
// ---- Late-game shop state (server truth: shop_state); pets/perks are cached in the save, skins/titles only if owned.
let shopSt = null, lastPet = null;
async function loadShop() { const st = await be.shopState?.().catch(() => null); if (!st) return null; shopSt = st;
  save.pets = (st.pets || []).map(p => ({ ...p, id: Number(p.id), perk: { k: p.perk.k, v: Number(p.perk.v) } })); save.activePet = st.active != null ? Number(st.active) : null;
  const own = new Set(st.owned || []), lk = save.heroes[0].look; if (lk.skinSet && !own.has(lk.skinSet)) delete lk.skinSet; if (lk.ptitle && !own.has(lk.ptitle)) delete lk.ptitle;
  render(); return st; }
// ---- Staff Sanctum (js/sanctum.js): private training room outside the tower.
let constructSt = null; const construct = () => constructSt ||= newConstruct(save.sanctumCfg?.level || 30, save.sanctumCfg?.hpMul || 1);
function sanctumOk() { return sanctumAllowed({ gmValid, serverRole: !!be?.isGm?.(), local: be?.name === 'local' }); }
async function setSanctum(on) { if (!sanctumOk()) return; if (on && pending > 0) { await submitDmg(save.heroes[0].name, pending, { ...save.heroes[0], staff: gmValid }); await be.flush?.().catch(() => {}); pending = 0; } // tower damage so far goes out first
  try { await be.staffSanctum?.(on); } catch (e) { notice(String(e.message || e)); return; } save.sanctum = !!on; recent = { dmg: 0, gold: 0, xp: 0 }; await be.saveSave(save);
  log(on ? `You step through the portal into ${SANCTUM.name}. The tower fights on without you.` : 'You return to the tower. Your blows land on the guardian again.', '#d9a93f'); if (!on) await sync(); render(); }
function renderSanctum() { const ok = sanctumOk(), on = inSanctum(save, ok), ar = $('arena'), pb = $('portalBtn'); if (!ar || !pb) return;
  pb.hidden = !ok; pb.innerHTML = on ? '◈ Tower' : '◈ Sanctum'; pb.title = on ? 'Return to the tower (shared boss)' : `Enter ${SANCTUM.name} (private training)`; pb.onclick = () => setSanctum(!on);
  ar.classList.toggle('sanctum', on); $('sanctumDeco').hidden = !on; $('dpsMeter').hidden = !on; if (!on) return;
  $('sanctumDeco').querySelector('.tmodel').style.backgroundImage = towerModelSprite(); const c = construct(), m = dpsMeters(c, Date.now());
  const dm = $('dpsMeter'); if (!dm.querySelector('.mnum')) { dm.innerHTML = `<div class="mnum"></div><div class="cbar"><i></i></div><label>Lv <input id="cLv" type="number" min="1" max="200" value="${c.level}"></label><label>HP × <input id="cHp" type="number" min="0.1" max="1000" step="0.1" value="${c.hpMul}"></label><button id="cReset">Reset</button>${featureOn(FEATURES, 'sandbox', true) ? '<button id="cTools">GM tools</button>' : ''}`;
    dm.onchange = () => { save.sanctumCfg = { level: +$('cLv').value, hpMul: +$('cHp').value }; constructSt = null; render(); };
    dm.onclick = e => { if (e.target.id === 'cReset') { constructSt = null; render(); } if (e.target.id === 'cTools') openSandboxUi(); }; }
  dm.querySelector('.mnum').innerHTML = `<b>DPS</b> ${fmt(Math.round(m.live))} <small>live 10 s</small> · ${fmt(Math.round(m.avg))} <small>avg</small> · <small>total</small> ${fmt(Math.round(m.total))} · <small>broken</small> ${m.broken}`; dm.querySelector('.cbar i').style.width = `${(100 * c.hp / c.max).toFixed(1)}%`; }
// Floor 100 phase change: derived from the shared HP (same for everyone). Seen live, or first time after loading into phase 2: a short
// glitch transition on the arena plus a full-width banner (fixed, safe-area aware, tap to dismiss). Shown once per device (localStorage).
let lastPhase = null;
function awakenCheck(f, phase, won) {
  const ar = $('arena'); ar.classList.toggle('awakened', phase === 2 && !won);
  if (phase === 2 && !won && lastPhase !== 2) { const k = 'logout.v1.awakenSeen', seen = (localStorage.getItem(k) || '').split(',');
    if (!seen.includes(String(f))) { localStorage.setItem(k, [...seen.filter(Boolean), f].join(',')); playAwaken(); } }
  lastPhase = phase;
}
function playAwaken() {
  const ar = $('arena'), b = $('phaseBanner'); ar.classList.remove('awakening'); void ar.offsetWidth; ar.classList.add('awakening'); setTimeout(() => ar.classList.remove('awakening'), 2400);
  b.innerHTML = `<small>Phase 2 · System override</small><b>${esc(AWAKEN_NAME)}</b><span>${esc(AWAKEN_TITLE)}</span>`; b.hidden = false; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  const hide = () => { b.hidden = true; b.classList.remove('show'); }; b.onclick = hide; clearTimeout(playAwaken.t); playAwaken.t = setTimeout(hide, 4200);
  log(`${AWAKEN_NAME}: the Queen rewrites her own code. Phase 2 begins.`, '#ff2a6a');
}
function render() {
  const h = save.heroes[0]; renderSanctum();
  { const ph = petHtml(save, gmValid); if (ph !== lastPet) { $('pet').innerHTML = ph; lastPet = ph; } }
  if (gmValid && h.cls === GM_CLASS && floor?.floor) { const t = gmTier(h.level); gmGear(save, floor.floor, legendaryWeaponDps(floor.floor), legendaryArmorPct(floor.floor)); if ((save.gmTierSeen || 1) < t.n) { save.gmTierSeen = t.n; gearAwaken(t); } } // staff gear follows the level tier; banner once per tier
  if (gmValid && save.spirit) { const ss = spiritStage(save.heroes[0].level); if ((save.spiritSeen || 0) < ss.n) { save.spiritSeen = ss.n; spiritEvolve(ss); } } // staff only: first time each stage is reached
  $('hero').style.backgroundImage = heroSprite(h.look, h.cls); $('hero').classList.toggle('gmaura', false); renderCodexLook(h); const au = byId(h.look.aura || 'au-none')?.value; $('hero').style.filter = au ? `drop-shadow(0 0 1.5px ${au}) drop-shadow(0 0 3px ${au})` : ''; const phase = bossPhase(floor.floor, floor.hp, floor.maxHp); $('boss').style.backgroundImage = bossSprite(floor.floor, phase); $('boss').classList.toggle('big', bossIsBig(floor.floor));
  const won = floor.floor >= MAX_FLOOR && floor.hp <= 0, waiting = !won && floor.hp <= 0, bi = bossInfo(floor.floor), arc = arcOf(floor.floor); applyScene(floor.floor);
  // end of content after the last open floor; 'waiting' = the server has not opened the next floor yet (e.g. its floor cap is still lower)
  H('bname').textContent = won ? 'The spire falls silent' : bossName(floor.floor);
  H('floor').textContent = won ? `System notice · Floor ${MAX_FLOOR + 1} is sealed. The next arc has not opened.` : waiting ? `System notice · the stair to Floor ${floor.floor + 1} is opening soon · ${arc.name}` : `${bi.title} · Floor ${floor.floor} / ${MAX_FLOOR} · ${arc.name}`;
  if (!won && phase === 2 && !inSanctum(save, sanctumOk())) { H('bname').textContent = AWAKEN_NAME; H('floor').textContent = `${AWAKEN_TITLE} · Floor ${floor.floor} / ${MAX_FLOOR} · ${arc.name}`; }
  awakenCheck(floor.floor, inSanctum(save, sanctumOk()) ? 1 : phase, won);
  if (inSanctum(save, sanctumOk())) { $('boss').style.backgroundImage = constructSprite(); $('boss').classList.remove('big'); H('bname').textContent = `Training Construct · Lv ${construct().level}`; H('floor').textContent = `${SANCTUM.name} · ${SANCTUM.sub}`; }
  { const fm = inSanctum(save, sanctumOk()) ? 0 : farmFloor(save, floor.floor); $('boss').classList.toggle('echo', !!fm); $('arena').classList.toggle('farming', !!fm);
    if (fm) { $('boss').style.backgroundImage = bossSprite(fm); $('boss').classList.toggle('big', bossIsBig(fm)); H('bname').textContent = `Echo of ${bossName(fm)}`; H('floor').textContent = `Farming Floor ${fm} echo · no live-boss damage`; } }
  $('floor').title = bi.lore ? bi.lore.replace(/^System notice: /, '') : '';
  const pct = floor.hp / floor.maxHp, lay = Math.ceil(pct * LAYERS - 1e-9), inLayer = pct * LAYERS - (lay - 1);
  H('layers').innerHTML = Array.from({ length: LAYERS }, (_, i) => `<i class="${i < lay ? 'on' : ''}"></i>`).join('');
  const c = hpColor(pct); $('hpfill').style.width = (lay ? inLayer * 100 : 0) + '%'; $('hpfill').style.background = `linear-gradient(90deg, ${c}aa, ${c})`; $('hpfill').style.color = c;
  H('hptext').textContent = `${fmt(floor.hp)} / ${fmt(floor.maxHp)} HP · ${lay}× layers` + (cx(h, 'cx-eye') ? ` · layer ${lay}: ${fmt(Math.max(0, inLayer) * floor.maxHp / LAYERS)} / ${fmt(floor.maxHp / LAYERS)} · next: ${bossName(Math.min(floor.floor + 1, MAX_FLOOR))}` : ''); // Draftsman's Eye
  H('hname2').innerHTML = `<div ${h.cls === GM_CLASS ? `class="gmname${cx(h, 'cx-shape') ? ' shape' : ''}"` : `style="color:${nameColorOf(h)}"`}>${h.cls === GM_CLASS ? GM_SIGIL + ' ' : ''}${esc(h.name)}</div><div class="ttl">${esc(titleOf(h))}</div>`; { const c = levelCap(floor?.floor, gmValid), at = atCap(h, c); H('hlv').textContent = at ? `LV ${h.level} (cap)` : `LV ${h.level}`; if (at && capNoted !== c) { capNoted = c; notice(`Level cap ${c} reached · the next floor raises it`); } $('hlv').title = at ? `Level cap: clearing Floor ${floor.floor} raises it to ${c + 1}${h.xp >= xpToNext(h.level) ? ' (XP banked: you level up at once)' : ''}` : ''; }
  const hp = heroHp(h) / heroMaxHp(h), worn = isWorn(h); $('hhp').className = 'seg' + (worn ? ' worn' : hp < 0.6 ? ' mid' : ''); H('hhp').innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i / 20 < hp ? '' : 'off'}"></i>`).join('');
  $('hhp').title = `HP ${Math.round(heroHp(h))} / ${heroMaxHp(h)}`;
  const b = buffsOf(save), mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  H('buffs').innerHTML = [worn ? '<span class="buff bad" title="Below 30% HP: DPS halved">Worn down · DPS ½</span>' : '', b.rested > 0 ? `<span class="buff" title="+15% gold and XP">Well Rested ${mmss(b.rested)}</span>` : '',
    b.elixir > 0 ? `<span class="buff" title="+25% DPS">Fury ${mmss(b.elixir)}</span>` : '', b.vigil > 0 ? `<span class="buff" title="Offline cap raised once">Vigil +${b.vigil}h</span>` : '', (m => m ? `<span class="buff mech" title="${esc(m)}">${esc(m.split(':')[0])}</span>` : '')(mechText(bossInfo(floor.floor).mech)), unwrittenHour(save.ctx) ? '<span class="buff gold" title="Vesperveil: +5% damage for heroes on this floor until the guardian falls">The Unwritten Hour · +5%</span>' : '', h.cls === GM_CLASS && h.look.aura === 'gm-aura' ? (g => `<span class="buff gold" id="galaxyTier" title="${esc(g.desc)}">Galaxy · Tier ${g.tier} · ${esc(g.name)}</span>`)(galaxyTier(h.level)) : ''].join('');
  const xp = h.xp / xpToNext(h.level); H('hxp').innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i / 20 < xp ? '' : 'off'}"></i>`).join('');
  H('stats').innerHTML = `${classOf(h.cls).icon} <b>${h.cls}</b> · XP ${h.xp}/${xpToNext(h.level)}<br>Gear <b>+${h.gear}</b> · DPS <b>${effectiveDps(save).toFixed(1)}</b> · HP <b>${Math.round(heroHp(h))}/${heroMaxHp(h)}</b> · Gold <b>${fmt(save.gold)}</b>${gmValid ? ` · Luck <b>+${GM_LUCK}%</b>` : ''}`;
  const capNow = levelCap(floor?.floor, gmValid), capped = atCap(h, capNow);
  H('lvlL').textContent = capped ? 'Lv cap' : `Train ${fmt(levelCost(h))}g`; if (capped) { $('lvl').title = `Level cap ${capNow}: clearing Floor ${floor.floor} raises it to ${capNow + 1}`; } $('lvl').title = `Train: +1 level for ${fmt(levelCost(h))} gold`; $('lvl').disabled = capped || save.gold < levelCost(h); if (!capped) $('lvl').title = `Train: +1 level for ${fmt(levelCost(h))} gold`;
  H('equipped').innerHTML = GEAR_SLOTS.map(s => { const it = h.equip?.[s]; return `<span class="eq" style="${it ? `color:${rarityOf(shownRarity(it)).color}` : ''}">${s[0].toUpperCase() + s.slice(1)}: ${it ? esc(it.name) + (it.up ? ` +${it.up}` : '') : '—'}</span>`; }).join('');
  { const fp = treeOf(h.cls).length ? freePoints(h) : 0, bs = bagSize(save), full = save.inv.length >= bs - 2; setHeroLabels({ bag: `Bag ${save.inv.length}/${bs}`, talents: isCodex(h) ? 'Codex' : fp > 0 ? `Talents · ${fp}` : 'Talents', talentsDot: fp > 0, bagDot: full });
    setDot('dotHero', fp > 0 || full, [fp > 0 ? `${fp} talent point${fp > 1 ? 's' : ''} to spend` : '', full ? (save.inv.length >= bs ? 'Bag full' : 'Bag nearly full') : ''].filter(Boolean).join(' · '));
    H('hdps').textContent = `DPS ${effectiveDps(save).toFixed(1)}`; H('goldTop').textContent = `⛁ ${fmt(save.gold)}`; H('floorTxt').innerHTML = `Floor ${floor.floor}/<span id="maxf">${MAX_FLOOR}</span>`;
    $('ftick').style.width = `${Math.min(100, ((floor.floor - 1) + (1 - floor.hp / floor.maxHp)) / MAX_FLOOR * 100).toFixed(1)}%`; $('floorBtn').setAttribute('aria-label', `Floor ${floor.floor} of ${MAX_FLOOR}: open the tower map`);
    $('sbBtn').hidden = !(gmValid && featureOn(FEATURES, 'sandbox', true)); }
  $('gear').title = 'Forge: temper your weapon, +15% damage per tier';
  { const fc = forgeCap(floor?.floor, gmValid), fat = h.gear >= fc; H('gearL').textContent = fat ? `Forge cap +${fc}` : `Forge ${fmt(gearCost(h))}g`; $('gear').disabled = fat || save.gold < gearCost(h); $('gear').title = fat ? `Forge cap +${fc}: the next floor raises it` : ''; }
}
async function renderLb() {
  if (document.hidden && $('lb').innerHTML) return; // background tab: no board refetch (free-tier egress)
  const h = save.heroes[0];
  let rows = await be.leaderboard(h.name); if (localStaffOnly()) rows = boardWithStaff([{ name: h.name, damage: localStaffDmg, staff: true }, ...(rows.players || rows).filter(r => r.name !== h.name && !r.staff)], null, 10); // local-only staff: shown, never sent
  await refreshTags(); const badge = n => gv2On() && gTags[n] ? bannerBadge(displayBanner(gTags[n].banner, gTags[n].staff), gTags[n].tag) + (gTags[n].staff ? `<span class="smark" title="Staff guild">${STAFF_MARK}</span>` : '') : '';
  const top = (rows.players || rows).filter(r => !r.staff).slice(0, 3), mine = (rows.players || rows).find(r => r.name === h.name && !r.staff);
  $('top3').innerHTML = `<span class="t3h">Top damage</span>${top.map((r, i) => `<span class="t3 ${r.name === h.name ? 'me' : ''}"><b>${i + 1}</b>${badge(r.name)}${esc(r.name)} <small>${fmt(r.damage)}</small></span>`).join('') || '<span class="sub">No hits yet</span>'}${mine && mine.rank > 3 ? `<span class="t3 me"><b>${mine.rank}</b>you</span>` : ''}`;
  $('lb').innerHTML = $('lbSide').innerHTML = rows.map(r => {
    const me = r.name === h.name, pr = me ? { title: titleOf(h), color: nameColorOf(h) } : fakeProfile(r.name);
    if (r.staff) return `<li class="staff" value="0"><small>${esc(wouldRankLabel(r))}</small><span class="gmname cardlink" data-card="${esc(r.name)}" role="button" tabindex="0">${GM_SIGIL} ${esc(r.name)}</span> — ${fmt(r.damage)}<br><span class="ttl">${esc(me ? titleOf(h) : 'Tower Staff')}</span></li>`;
    return `<li class="${me ? 'me' : ''}" value="${r.rank}">${badge(r.name)}<span class="cardlink" data-card="${esc(r.name)}" role="button" tabindex="0" style="color:${pr.color}">${esc(r.name)}</span> — ${fmt(r.damage)}<br><span class="ttl">${esc(pr.title)}</span>${me && r.rank > 3 ? '<div class="climb">Climb: Train, Forge and equip loot to raise DPS. Top 3 on a kill earns rare rewards.</div>' : ''}</li>`;
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
  renderGoods(f);
  openForgeUp({ be, save: () => save, fmt, notice, log, ico, after: async () => { await be.saveSave(save); render(); $('townGold').textContent = `Gold ${fmt(save.gold)}`; } }); // weapon upgrades (js/forge.js)
  openDen({ be, save: () => save, floor: () => floor?.floor || 1, fmt, notice, after: async () => { await be.saveSave(save); render(); $('townGold').textContent = `Gold ${fmt(save.gold)}`; } }); // The Glitch Den (gold only)
  $('townGold').textContent = `Gold ${fmt(save.gold)}`;
  if (!$('town').open) $('town').showModal();
}

// ---- Goods: gold sinks with no combat power (js/sinks.js): tonics, Tailor cosmetics, guild bank.
async function shopClick(t, f) { const d = t.dataset, lk = save.heroes[0].look, done = async msg => { if (msg) notice(msg); await loadShop(); await be.saveSave(save); render(); openTown(); townPane?.('goods'); return true; };
  try {
    if (d.shop) { const it = SHOP.find(i => i.id === d.shop); const r = await be.shopBuy(d.shop, save); return done(r.pet ? `The egg hatched: ${r.pet.uname || r.pet.sp} (${r.pet.rarity})` : `Bought ${it.label} for ${fmt(r.price)}g`); }
    if (d.skin) { lk.skinSet = lk.skinSet === d.skin ? undefined : d.skin; return done(); }
    if (d.ptitle) { lk.ptitle = lk.ptitle === d.ptitle ? undefined : d.ptitle; return done(); }
    if (d.pet) { const id = +d.pet, on = save.activePet === id ? null : id; await be.petEquip(on); save.spirit = false; return done(on ? 'Your pet follows you' : 'Pet sent home'); }
    if (d.tok === 'tok-rename') { const n = prompt('New hero name (2-20 characters, chat filters apply):', save.heroes[0].name); if (!n) return true; const r = await be.tokenUse('tok-rename', n.trim(), save); return done(`Your hero is now ${r.name}`); }
    if (d.tok === 'tok-reroll') { await be.tokenUse('tok-reroll', null, save); const h = save.heroes[0];
      for (const slot of ['outfitColor', 'trim', 'hairColor', 'weaponColor']) { const opts = itemsFor(slot, h.cls).filter(i => isUnlocked(i, save.progress) && !/^gm|vesper/i.test(i.id)); if (opts.length) h.look[slot] = opts[Math.floor(Math.random() * opts.length)].id; } return done('Look re-rolled from your unlocked colours'); }
    if (d.spirit !== undefined) { save.spirit = !save.spirit; if (save.spirit && save.activePet != null) { await be.petEquip(null); } return done(save.spirit ? 'Solumbra circles you' : 'Solumbra rests'); }
    if (d.carve !== undefined) { const fl = +$('carveF').value, n = $('carveN').value; const r = await be.memorialCarve(fl, n, save); return done(`Carved “${r.name}” on Floor ${fl}'s wall`); }
  } catch (err) { notice(String(err.message || err)); return true; }
  return false; }
function renderGoods(f) {
  const own = save.progress?.drops || [], g = gv2Info?.guild;
  const row = (l, s, btn) => `<div class="srow"><div><b>${l}</b><small>${s}</small></div>${btn}</div>`;
  const ds = save.daily || {}, today = Math.floor(Date.now() / 864e5), open = ds.day == null ? !ds.lastClaim || Math.floor(ds.lastClaim / 864e5) < today : ds.day < today;
  const dq = questsToday(save); if (!dq && be.name !== 'local' && be.questState && Date.now() - (renderGoods.dqAt || 0) > 600000) { renderGoods.dqAt = Date.now(); be.questState(save.heroes[0]).then(q => { if (q && adoptQuests(save, q) !== null && questsToday(save) && $('town').open) renderGoods(f); }); }
  if (!dq && be.name === 'local') localQuest(save, 'dmg', 0, f, dqCtx());
  $('goodsBody').innerHTML = `<h3>Daily quests <small>· ${claimable(save)} ready</small></h3>${questsHtml(questsToday(save), fmt)}<p class="sub">${RESET_DQ}</p><h3>Daily streak <small>· day ${ds.streak || 0} of 7</small></h3>${calendarHtml(ds.streak || 0, open, savesLeft(save), f, fmt)}<h3>Apothecary</h3><p class="sub">30 min each, up to 2 h banked. XP still stops at the level cap.</p>` +
    TONICS.map(t => { const left = (save.buffs?.[t.id] || 0), p = gmValid ? 0 : tonicPrice(t, f); return row(esc(t.name), `${t.desc}${left ? ` · ${fmtDur(left)} left` : ''}`, `<button data-tonic="${t.id}" ${save.gold < p || left + 1800 > TONIC_MAX ? 'disabled' : ''}>${fmt(p)}g</button>`); }).join('') +
    `<h3>Tailor</h3>` + TAILOR.map(c => { const it = byId(c.id), has = own.includes(c.id); return row(esc(it.label), `${it.type === 'nameColor' ? 'Name tint' : it.type === 'title' ? 'Title' : 'Aura'}${has ? ' · owned (Wardrobe)' : ''}`, `<button data-tailor="${c.id}" ${has || save.gold < c.price ? 'disabled' : ''}>${has ? 'Owned' : `${fmt(c.price)}g`}</button>`); }).join('') +
    `<h3>Guild bank</h3>` + (g && !g.is_staff ? `<p class="sub">Gold for guild upgrades and banner unlocks (Guild → Bank).</p><div class="gdon">${DONATE_STEPS.map(s => `<button data-don="${s}" ${save.gold < 100 ? 'disabled' : ''}>${Math.round(s * 100)}% · ${fmt(Math.floor(save.gold * s))}g</button>`).join('')}</div>` : '<p class="sub">Join a guild to fund its bank and banner upgrades.</p>');
  $('goodsBody').insertAdjacentHTML('beforeend', `<div id="shopWing">${shopHtml(shopSt, save, f, { fmt, esc, gm: gmValid })}</div>`);
  if (!renderGoods.loading) { renderGoods.loading = true; loadShop().then(st => { renderGoods.loading = false; const w = $('shopWing'); if (st && w) w.innerHTML = shopHtml(st, save, f, { fmt, esc, gm: gmValid }); }); }
  $('goodsBody').onclick = async e => { const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.dq != null) { t.disabled = true; await claimQuest(+t.dataset.dq); renderGoods(f); return; }
    if (await shopClick(t, f)) return;
    if (t.dataset.tonic && buyTonic(save, f, t.dataset.tonic)) notice('Tonic active');
    else if (t.dataset.tailor && buyCosmetic(save, t.dataset.tailor)) notice(`Tailor · ${byId(t.dataset.tailor).label} added to your Wardrobe`);
    else if (t.dataset.don) { const n = Math.floor(save.gold * +t.dataset.don); if (n > 0 && confirm(`Donate ${fmt(n)} gold to the guild bank?`)) { try { await be.guildDonate(n, save); notice(`Donated ${fmt(n)}g to the guild bank`); } catch (err) { notice(`Not donated: ${err.message}`); } } }
    await be.saveSave(save); render(); openTown(); };
}

// ---- Bag: inventory grid, compare panel, equip and salvage
let bagSel = -1;
const DIVINE_R = { id: 'divine', label: 'Divine', color: '#f6d77a' };
const itemCard = (it, cls = '') => { const R = it?.gm && it.divine ? DIVINE_R : rarityOf(shownRarity(it)); return `<div class="item ${cls}" style="--rc:${R.color}">${ico(it)}${it.locked ? '<span class="lock" title="Locked">🔒</span>' : ''}<b class="${R.id === 'unique' ? 'uniq' : ''}" style="color:${R.color}">${esc(it.name)}</b><small${R.id === 'divine' ? ' class="divine"' : ''}>${R.label}${it.gm && it.tierLabel && it.tier < 4 ? ` · ${esc(it.tierLabel)}` : it.gm && it.tier === 4 ? ' · Awakened' : ''} · ${it.slot} · Floor ${it.floor} · ${it.element}</small>${Object.entries(it.stats).map(([k, v]) => `<div>${statLabel(k, v)}</div>`).join('')}${it.rarity === 'unique' ? `<div class="ab">✦ ${esc(it.ability.text)}</div><div class="db">▾ ${esc(it.drawback.text)}</div><div class="lore">${esc(it.lore)}</div><small>${esc(it.stamp)}</small>` : it.gm ? `${it.staffPower ? `<div class="ab">✦ ${esc(it.staffPower)}</div>` : ''}<div class="lore">${esc(it.lore || '')}</div><small>${esc(STAFF_STAMP)}</small>` : ''}</div>`; };
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
  { t: 'Arcs', x: `Every ten floors is an arc with its own scene: Floors 1–10 are ${arcOf(1).name}, 11–${MAX_FLOOR} climb ${arcOf(11).name}. Rimegear guardians each have a signature mechanic (the chip under your buffs) and 1–2 signature drops. Floor 15 is special; Floor 20 is the finale.`, el: () => $('floorBtn') },
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
    if (document.getElementById('cutscene')?.open) return; // never reload mid-cutscene; the next check (visibility / 5 min) picks it up
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
let gmValid = false, capNoted = null; const gmActive = () => gmValid;
async function openSystem() {
  const online = be.name === 'supabase', canBind = featureOn(FEATURES, 'bindIdentity', gmActive()), anon = online && be.isAnonymous();
  const uid = online && be.user?.id ? `<p class="sub">Tower ID: <code id="towerId">${esc(be.user.id)}</code> <button id="copyId">Copy</button></p>` : '';
  const status = !online ? 'Offline mode. Your progress lives in this browser only.' : (gmValid && !be.isGm()) ? 'Online · staff (local). Connected to the tower; your staff hero plays on this device only until the server role is granted.' : anon ? 'Guest identity. Bind it to keep your progress across devices.' : 'Identity bound. Your progress is stored in the tower.';
  const why = !online && be.fallback ? `<p class="sub" id="sysWhy">Reason: ${esc(be.fallback)}</p>${onlineConfigured() ? '<button id="retryOnline">Try online again</button>' : ''}` : '';
  $('sysBody').innerHTML = `<div class="sysnote"><p id="sysStatus">${esc(status)}</p>${why}${uid}<p class="sub">Build ${esc(BUILD)}</p>
    ${canBind ? `<div class="bind ${online ? '' : 'off'}"><h3>Bind your identity</h3>
      <button id="bindWallet" class="cta" ${online ? '' : 'disabled'}>${be.isWallet?.() ? 'Wallet connected · reconnect Phantom' : 'Connect Phantom wallet'}</button>
      <p class="sub">First device: connecting attaches this account (save, gear, title, role) to your wallet. Other devices: connect the same wallet to load that account; that device's guest progress is replaced.</p>
      <p class="sub">Signature only. $LOGOUT asks your wallet to sign a short message. It never requests a transaction, never sees your keys and never touches your funds.</p>
      <div class="mail"><input id="bindEmail" type="email" placeholder="email for a magic link" ${online ? '' : 'disabled'} autocomplete="email"><button id="bindMail" ${online ? '' : 'disabled'}>Send link</button></div>
      ${online ? '' : `<p class="sub">${onlineConfigured() ? 'Binding needs the tower connection (see the reason above).' : 'Online mode is switched off on this server.'}</p>`}</div>` : ''}
    ${save?.holder ? '<div class="slot2"><b>Holder perk</b> · extra hero slot <span class="sub">(coming soon)</span><div class="emptyslot">+</div></div>' : ''}
    <button class="logout" disabled title="Unlocks on Floor 100">LOG OUT</button><p class="sub center">Log out unlocks on Floor 100.</p>
    <details class="settings"><summary>Settings</summary>${online ? '<button id="sever">Sever link (switch account)</button><p class="sub">Disconnects this browser from the bound identity. Your bound progress stays safe in the tower.</p>' : '<p class="sub">Nothing to sever: this browser is not linked to an online identity.</p>'}<div id="gmSlot"></div></details></div>`;
  const msg = m => { log(`System notice: ${m}`); notice(m); };
  if ($('retryOnline')) $('retryOnline').onclick = () => location.reload();
  if ($('bindWallet')) $('bindWallet').onclick = async () => { try { const r = await be.bindWallet(); if (r?.save) save = migrateSave(r.save);
      const pk = window.phantom?.solana?.publicKey?.toString?.(); const hs = await holderStatus(pk, { rpc: SOLANA_RPC, mint: TOKEN_MINT, threshold: HOLDER_THRESHOLD }); if (hs.enabled) save.holder = hs.holder;
      await be.saveSave(save); msg(r?.mode === 'linked' ? 'wallet linked: sign in with it on any device' : 'signed in with your wallet'); render(); openSystem(); } catch (e) { msg(`binding failed: ${e.message || e}`); } };
  if ($('bindMail')) $('bindMail').onclick = async () => { const em = $('bindEmail').value.trim(); if (!/^\S+@\S+\.\S+$/.test(em)) return notice('Enter a valid email'); try { await be.bindEmail(em); msg('magic link sent, check your inbox'); } catch (e) { msg(`binding failed: ${e.message || e}`); } };
  if ($('copyId')) $('copyId').onclick = () => navigator.clipboard?.writeText(be.user.id).then(() => notice('Tower ID copied'), () => {});
  if ($('sever')) $('sever').onclick = async () => { if (!confirm('Sever the link to this identity on this browser?')) return; await be.sever(); location.reload(); };
  if (typeof renderGmSlot === 'function') renderGmSlot();
  if (!$('system').open) $('system').showModal();
}

// ---- Staff (gm): entrance notice, Eventide upkeep, hidden unlock field, sandbox.
let lastAnnSeen = 0, lastFloorSeen = 0;
function gearAwaken(t) { const h = save.heroes[0], n = document.createElement('div'); n.className = `notice bigsys evolve gearaw t${t.n}`; n.id = 'gearBanner';
  const w = h.equip?.weapon, a = h.equip?.armor; n.innerHTML = `<small>◈ ${t.n === 4 ? 'Divine Awakening' : 'Staff gear ascends'} · ${esc(t.label)}</small><div class="gearaw-icons">${w?.gm ? ico(w, 'ico big') : ''}${a?.gm ? ico(a, 'ico big') : ''}</div><span>${esc(t.n === 4 ? `${w?.name || 'Eventide'} · ${a?.name || 'Vesperveil'}` : `Eventide and Vesperveil reach ${t.label}`)}</span>`;
  document.querySelector('#gearBanner')?.remove(); document.body.append(n); setTimeout(() => n.remove(), 6000); log(`System notice: ${t.n === 4 ? 'Divine Awakening' : t.label} · your staff gear answers your level.`, '#f6d77a'); }
function spiritEvolve(st) { const n = document.createElement('div'); n.className = `notice bigsys evolve s${st.n}`; n.id = 'evolveBanner';
  n.innerHTML = `<small>◈ ${st.n === 1 ? 'Solumbra awakens' : 'Solumbra evolves'} · stage ${st.n} of 3</small>${haloHtml(st.n)}<span>${esc(st.name)}</span>`; document.querySelector('#evolveBanner')?.remove(); document.body.append(n); setTimeout(() => n.remove(), 6000);
  log(`System notice: ${st.n === 1 ? 'Solumbra awakens' : 'Solumbra evolves'} · ${st.name}.`, '#f6d77a'); }
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
  if ($('sbCs')) { $('sbCsSel').innerHTML = Object.keys(CUTSCENES).map(k => `<option value="${k}">${k === 'intro' ? 'Intro' : 'After arc ' + k}</option>`).join(''); $('sbCs').onclick = () => playCutscene($('sbCsSel').value); }
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
  const r = await be.submitDamage(name, amount, hero);
  if (r?.wiped) { notice('System notice: the tower was reset for release. Starting fresh.'); setTimeout(() => location.reload(), 1500); }
  return r;
}

// ---- Guilds (flag: FEATURES.guilds). +2% XP/gold for members; staff never owns one and adds nothing to a guild total.
let myGuild = null, guildAll = false;
const meArg = () => ({ name: save.heroes[0].name, staff: gmValid });
let gv2Info = null; const gv2On = () => featureOn(FEATURES, 'guildsV2', gmValid) && !!be?.guildInfo;
let gTags = {}, gTagsAt = 0; const tagBanner = tag => { const t = Object.values(gTags).find(x => x.tag === tag); return t ? displayBanner(t.banner, t.staff) : tag === STAFF_GUILD.tag ? ZERO_BANNER : undefined; }; // ZERO is reserved for the staff guild
async function refreshTags() { if (!gv2On() || Date.now() - gTagsAt < 300000) return; gTagsAt = Date.now(); try { gTags = await be.guildTags(floor.floor) || {}; } catch {} }
async function openGuild() {
  if (gv2On() && !localStaffOnly()) { try { gv2Info = await be.guildInfo(); } catch (e) { gv2Info = null; } } guildSeen();
  if (gv2Info?.guild) { $('guildSub').textContent = `· [${gv2Info.guild.tag}] ${gv2Info.guild.name}`; renderGuildV2(gv2Info, { be, save, claimQuest: claimGuildQuest, el: $('guildBody'), name: save.heroes[0].name, canPost: (be.canChat?.() ?? true) && !localStaffOnly(), staff: gmValid, log: m => log(`System notice: ${m}`), refresh: async () => { myGuild = await be.myGuild(); if (save.ctx) save.ctx.guild = !!myGuild; render(); await openGuild(); } }); if (!$('guild').open) $('guild').showModal(); return; }
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
  loadTeam(be).then(ok => ok && renderChat()).catch(() => {});
  const mu = muted(), el = $('chatLog'), atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = chatMsgs.filter(m => !mu.includes(m.author)).map(m => `<div class="msg ${m.author === 'me' || m.name === save.heroes[0].name ? 'me' : ''} ${m.is_staff ? 'staff' : ''}"><span class="mod"><button data-mute="${esc(m.author)}" title="Mute">Mute</button><button data-rep="${m.id}" title="Report">Report</button></span>${m.guild_tag ? `${gv2On() && tagBanner(m.guild_tag) ? bannerBadge(tagBanner(m.guild_tag), m.guild_tag) : ''}<span class="tag">[${esc(m.guild_tag)}]</span>` : ''}<b class="cardlink" data-card="${esc(m.name)}"${/^[0-9a-f]{12}$/.test(m.author || '') ? ` data-author="${esc(m.author)}"` : ''} role="button" tabindex="0">${m.is_staff ? GM_SIGIL + ' ' : ''}${esc(m.name)}${!m.is_staff && isTeam(m.name, m.author) ? ' ' + teamTag() : ''}</b><time>${new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><br>${esc(m.body)}</div>`).join('') || '<p class="sub">Quiet on this floor.</p>';
  if (atEnd) el.scrollTop = el.scrollHeight;
  el.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => { localStorage.setItem('logout.v1.muted', JSON.stringify([...new Set([...muted(), b.dataset.mute])])); renderChat(); });
  el.querySelectorAll('[data-rep]').forEach(b => b.onclick = async () => { const id = +b.dataset.rep; try { await be.chatReport(id, 'player report'); } catch {} const i = chatMsgs.findIndex(m => m.id === id); if (i >= 0) chatMsgs.splice(i, 1); renderChat(); $('chatNote').textContent = 'Reported. Thanks: it is hidden for you, and for everyone after a few reports.'; });
}
async function pollChat() {
  if (!$('chat').open || document.hidden) return;
  if (chatFloor !== floor.floor) { chatFloor = floor.floor; chatLast = 0; chatMsgs.length = 0; }
  try { const n = await be.chatFetch(chatLast); for (const m of n) { chatMsgs.push(m); chatLast = Math.max(chatLast, m.id); } if (chatMsgs.length > 100) chatMsgs.splice(0, chatMsgs.length - 100); if (n.length) renderChat(); } catch {}
}
// ---- Badge dots (polled every 60 s while visible; guild info at most every 10 min; chat dots come from tick heads): floor chat, guild chat, finished quests, join requests.
let chatSeen = null, chatSeenFloor = null, gSeen = null, gSeenGuild = null, lastGPoll = 0; const gDots = { req: false, quest: false, chat: false };
const questKey = i => `${i.week}:${(i.quests || []).filter(q => q.done).map(q => q.idx).join(',')}`;
function syncMoreDot() { setDot('dotMore', !$('dotChat').hidden, 'New floor chat'); setDot('dotGuild', gDots.req || gDots.quest || gDots.chat, [gDots.req ? 'Join requests waiting' : '', gDots.quest ? 'Guild quest completed' : '', gDots.chat ? 'New guild chat' : ''].filter(Boolean).join(' · ')); }
async function badgePoll() {
  if (document.hidden || !save || !be || !floor) return; const me = save.heroes[0].name;
  if (featureOn(FEATURES, 'chat', gmValid) && !$('chat').open && be.chatFetch) {
    if (chatSeenFloor !== floor.floor) { chatSeenFloor = floor.floor; chatSeen = null; }
    const head = be.heads?.chat; if (head != null) { if (chatSeen !== null && head > chatSeen && !be.mine?.has(head)) setDot('dotChat', true); chatSeen = Math.max(chatSeen || 0, head); } else // tick carries the newest id: no fetch at all
    try { const n = await be.chatFetch(chatSeen || 0); if (chatSeen !== null && n.some(m => m.name !== me)) setDot('dotChat', true); chatSeen = Math.max(chatSeen || 0, ...n.map(m => m.id)); } catch {}
  }
  if (gv2On() && myGuild && !localStaffOnly() && !$("guild").open && Date.now() - lastGPoll > 599e3) {
    lastGPoll = Date.now(); try { gv2Info = await be.guildInfo(); } catch {} const i = gv2Info;
    if (i?.guild) {
      if (gSeenGuild !== i.guild.id) { gSeenGuild = i.guild.id; gSeen = null; }
      gDots.req = ['leader', 'officer'].includes(i.me?.role) && (i.requests || []).length > 0;
      const qk = questKey(i), qs = localStorage.getItem('logout.v1.questSeen'); if (qs === null) localStorage.setItem('logout.v1.questSeen', qk); else gDots.quest = /:\d/.test(qk) && qk !== qs;
      const gh = be.heads?.guild; if (gh != null && be.heads?.chat != null) { if (gSeen !== null && gh > gSeen && !be.mine?.has(gh)) gDots.chat = true; gSeen = Math.max(gSeen || 0, gh); } else
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
  $('chatNote').textContent = can ? `Max ${CHAT_MAX} characters, 1 message every 10 s, 30 an hour. Links and addresses are blocked.${be.isAnonymous?.() ? ' Guests can post after a few minutes of climbing.' : ''}` : localStaffOnly() ? 'Local staff unlock: chat needs the server role.' : 'Chat is not available on this device right now.';
  $('chatForm').onsubmit = async e => { e.preventDefault(); const r = cleanChat($('chatIn').value); if (!r.ok) { $('chatNote').textContent = 'Not sent: ' + r.reason; return; }
    try { await be.chatPost(save.heroes[0].name, $('chatIn').value, meArg()); dqLocal('chat', 1); $('chatIn').value = ''; $('chatNote').textContent = ''; await pollChat(); } catch (err) { $('chatNote').textContent = 'Not sent: ' + err.message; } };
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
async function setFarm(f) { await sync(); save.farm = f || null; log(f ? `${save.heroes[0].name} turned back to Floor ${f}: farming its echo. The live guardian is left to the others.` : `${save.heroes[0].name} returned to the live guardian on Floor ${floor.floor}.`); notice(f ? `Farming Floor ${f} echo` : 'Back on the live guardian'); await be.saveSave(save); render(); openMap(); }
async function openMap() {
  const [hist, heroes] = await Promise.all([be.floorHistory?.().catch(() => []) ?? [], be.floorHeroes?.(floor.floor).catch(() => null) ?? null]);
  const pp = clearPlayers(counts?.last), rows = towerRows({ current: floor.floor, maxFloor: MAX_FLOOR, history: hist, players: pp }), pr = towerProgress({ current: floor.floor, hp: floor.hp, maxHp: floor.maxHp, maxFloor: MAX_FLOOR });
  const when = at => at ? new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  $('mapProg').innerHTML = `<div class="mprog"><b>Floor ${pr.floor} / ${pr.top}</b><span>${pr.cleared} cleared${heroes != null ? ` · ${heroes} hero${heroes === 1 ? '' : 'es'} on this floor` : ''}</span>
    <div class="bar"><i style="width:${pr.pct.toFixed(1)}%"></i></div><small>Tower ${pr.pct.toFixed(0)}% · guardian HP ${fmt(floor.hp)} / ${fmt(floor.maxHp)}</small>
    <div class="bar hp"><i style="width:${(pr.bossPct * 100).toFixed(1)}%"></i></div><p class="sub">Logout returns when Floor ${TOWER_TOP} falls.</p></div>`;
  $('mapTower').innerHTML = rows.map(r => `${r.f === TOWER_TOP ? '<div class="crown" aria-hidden="true">♛</div>' : ''}${r.f % 10 === 0 ? `<div class="band" style="--band:${r.band}"><span>${r.f - 9}–${r.f}</span> ${esc(r.arcName)}${CUTSCENES[r.arc] && (save.cutscenes || []).includes(String(r.arc)) ? ` <button class="replay" data-cs="${r.arc}" title="Replay the ${esc(r.arcName)} cutscene">▶ Replay</button>` : ''}</div>` : ''}<button class="fl ${r.state}${r.crown ? ' top' : ''}${r.special ? ' sp' : ''}${r.finale ? ' fin' : ''}" style="--band:${r.band}" data-f="${r.f}" ${r.state === 'cleared' ? '' : 'aria-disabled="true"'}>
    <span class="fn">${r.f}</span>${r.rival ? '<i class="shade" aria-hidden="true"></i>' : ''}<span class="fname">${esc(r.name)}${r.milestone && r.state !== 'undiscovered' ? ' <em>★</em>' : r.special && r.state !== 'undiscovered' ? ' <em>✦</em>' : ''}</span>
    <span class="fmeta">${r.state === 'cleared' ? (r.at ? `fell ${esc(when(r.at))}` : 'cleared') + (r.players ? `<span class="pp"> · ${r.players.toLocaleString('en-US')} present</span>` : '') : r.state === 'current' ? `<b class="you">◆ You</b> ${Math.round(pr.bossPct * 100)}% HP` : ''}</span></button>`).join('');
  $('mapTower').onclick = e => { const rp = e.target.closest('button.replay'); if (rp) { $('map').close(); playCutscene(rp.dataset.cs).then(() => openMap()); return; } const b = e.target.closest('button.fl.cleared'); if (!b) return; const r = rows.find(x => x.f === +b.dataset.f), d = $('mapDetail');
    d.hidden = false; d.innerHTML = `<i class="mthumb" style='background-image:${bossSprite(r.f).replace(/'/g, '%27')}'></i><div><b>Floor ${r.f} · ${esc(r.name)}</b><br>${r.at ? `Fell ${esc(when(r.at))}` : 'Cleared (time not recorded)'}<br>${r.top ? `Top damage: ${esc(r.top)}` : 'Top damage: not recorded'}${r.players ? `<br>${r.players.toLocaleString('en-US')} players trapped when it fell` : ''}</div><div class="farmbox">${farmFloor(save, floor.floor) === r.f ? `<button class="cta" data-farm="0">Stop farming · return to Floor ${floor.floor}</button>` : `<button class="cta" data-farm="${r.f}">Farm this echo</button>`} <button class="qhelp" data-farmhelp aria-label="Farm help">?</button><p class="sub">Farming fights this floor's echo for its materials. A farming hero deals no damage to the live guardian.</p>${lootKeyHtml(setOf(r.f), floor.floor - 1)}</div><div class="mwslot"></div>`; be.memorialWall?.(r.f).then(n => { const w = d.querySelector('.mwslot'); if (w) w.innerHTML = wallHtml(n || [], esc); }).catch(() => {}); };
  { const fm = farmFloor(save, floor.floor); if (fm) $('mapProg').insertAdjacentHTML('beforeend', `<div class="farmbox on">Farming the Floor ${fm} echo: materials only, no live-guardian damage. <button data-farm="0">Stop farming</button> <button class="qhelp" data-farmhelp aria-label="Farm help">?</button></div>`); }
  $('map').onclick = e => { const fb = e.target.closest('[data-farm]'); if (fb) { setFarm(+fb.dataset.farm); return; } if (e.target.closest('[data-farmhelp]')) showHelp('farm', { set: setOf(Math.max(1, farmFloor(save, floor.floor) || floor.floor - 1)), upTo: floor.floor - 1 }); };
  $('mapDetail').hidden = true; if (!$('map').open) $('map').showModal();
  requestAnimationFrame(() => { const t = $('mapTower'), c = t.querySelector('.fl.current'); if (c) t.scrollTop = c.offsetTop - t.offsetTop - t.clientHeight / 2; $('map').scrollTop = 0; }); // scroll the tower only, keep the progress panel in view
}

// ---- Guild Hall (Town room, guildsV2): cosmetic, grows with guild level and hall upgrades
async function renderDecor(g) { const el = $('hallDecor'); if (!el) return; const list = await be.decorList?.().catch(() => []) || [], role = gv2Info?.me?.role;
  el.innerHTML = decorHtml(list, { canBuy: role === 'leader' || role === 'officer', staff: !!g.is_staff, fmt, bank: Number(g.bank || 0) });
  el.onclick = async e => { const b = e.target.closest('button[data-decor]'); if (!b) return; try { await be.decorBuy(b.dataset.decor, save); await be.saveSave(save); notice('Decor added to the hall'); renderHall(); } catch (err) { notice(String(err.message || err)); } }; }
async function renderHall() {
  const card = $('hallCard'); if (!gv2On() || !myGuild || localStaffOnly()) { card.hidden = true; syncHall(); return; }
  try { gv2Info = await be.guildInfo(); } catch { gv2Info = null; } const g = gv2Info?.guild; if (!g) { card.hidden = true; syncHall(); return; }
  card.hidden = false; $('hallTitle').textContent = `[${g.tag}] ${g.name} · Guild Hall`; const hv = g.is_staff ? (g.hall_display ?? staffHall(g.level)) : g.hall; $('hallArt').style.backgroundImage = hallArt(g.level, hv, displayBanner(g.banner, g.is_staff));
  syncHall(); renderDecor(g); $('hallInfo').textContent = g.is_staff ? `Prestige level ${g.level} · ${hv}/5 cosmetic hall pieces · Prestige only, no rewards.` : `Guild level ${g.level} · hall upgrade ${g.hall}/5 · bonus +${g.bonus_pct}% XP & gold. Upgrades are bought with bank gold in the Guild panel.`;
}

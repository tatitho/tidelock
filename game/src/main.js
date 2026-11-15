// TIDELOCK — 5v5 plant/defuse FPS, blue-hour container terminal.
// Tide plants a charge on the lock gate (A, amber) or pump house (B, teal);
// Harbour holds both. Rounds: 15 s buy, 100 s live, 35 s bomb, first to 5,
// max 9. Buy economy, 4 primaries + pistol + HE, team-plan bots (10 Hz
// vision/hearing). main.js only wires modules: no game state lives here
// (see state.js). Fixed-step 60 Hz sim, render, deterministic ?shot=
// captures. Import order below is the dossier's reading order (spec §3.3).
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { state } from './state.js';
import { CONFIG } from './config.js';
import { WEAPONS, PRIMARIES } from './weapons.js';
import { MAP } from './map.js';
import { startMatch, updateRounds, setPlanPicker, defuseTimeFor } from './rounds.js';
import { buyItem } from './economy.js';
import { updateAI, pickPlan } from './ai.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createWeaponView } from './weapon.js';
import { createGrenades } from './grenade.js';
import { createPlayer } from './player.js';
import { createWorld } from './world.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createInput } from './input.js';
import { mulberry32, TMP_A } from './utils.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = parseInt(params.get('seed') || '7', 10) || 7;
state.seed = seed;
state.rng = mulberry32(seed);
const FIXED = CONFIG.tick || 1 / 60;
const PLANT_T = CONFIG.plantTime || 3.2; // defuse time is per-player (kit? 5 : 10)
const EMPTY_KEYS = new Set();
// Compat: ai.js reads CONFIG.botTiers, config.js ships `tiers`.
if (!CONFIG.botTiers) CONFIG.botTiers = CONFIG.tiers;

// --- boot (wiring only) ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);
const world = createWorld(state, scene);
const effects = createEffects(state, scene);
const bots = createBots(state, scene);
const combat = createCombat(state, world.shootables, effects);
state.combat = combat; // ai.js fires bot shots through state.combat.shoot
const weapon = createWeaponView(camera, state);
const grenades = createGrenades(state, scene, world.colliders, effects);
state.grenades = grenades; // ai.js reads smokeBlocks + throwGrenade via this
const player = createPlayer(state, world.colliders);
const me = state.players[0];
const audio = createAudio();
const hud = createHud(state, {
  onBuy(id) { if (state.phase === 'buy' && buyItem(state, me, id)) audio.buy(); },
  getSpread() { return weapon.spread(); },
});
const minimap = createMinimap(document.getElementById('minimap'));
const input = createInput(renderer.domElement, onLockChange);
setPlanPicker(pickPlan);

// --- DOM helpers (real index.html ids) ---
function el(id) { return document.getElementById(id); }
function setText(id, v) { const e = el(id); if (e) e.textContent = v; }
function setWidth(id, p) { const e = el(id); if (e) e.style.width = Math.max(0, Math.min(100, p)) + '%'; }
function setOverlay(id, show, d) { const e = el(id); if (e) e.style.display = show ? (d || 'flex') : 'none'; }
function onClick(id, fn) { const e = el(id); if (e) e.addEventListener('click', fn); }
onClick('playBtn', () => input.requestLock());
onClick('resumeBtn', () => input.requestLock());
onClick('againBtn', () => { newMatch(); input.requestLock(); });
onClick('closeBuyBtn', () => closeBuy());
function closeBuy() { hud.showBuy(false); setOverlay('overlayBuy', false); input.requestLock(); }
// Round start also clears bot death anims (bots.js keeps fall/fade state).
function newMatch() { specClear(); startMatch(state); bots.reset(); }
const buyItems = document.querySelectorAll('#buyGrid .buyItem');
for (let i = 0; i < buyItems.length; i++) {
  buyItems[i].addEventListener('click', () => {
    if (state.phase === 'buy' && buyItem(state, me, buyItems[i].dataset.item)) audio.buy();
  });
}

function onLockChange(locked) {
  if (locked) {
    setOverlay('overlayStart', false);
    setOverlay('overlayPause', false);
    hud.setPaused(false);
    if (state.phase === 'menu' || state.phase === 'matchEnd') newMatch();
    if (hud.isBuyOpen()) { hud.showBuy(false); setOverlay('overlayBuy', false); }
  } else if (!shotName) {
    if (state.phase === 'menu') setOverlay('overlayStart', true);
    else if (state.phase !== 'matchEnd' && !hud.isBuyOpen()) {
      setOverlay('overlayPause', true);
      hud.setPaused(true);
    }
  }
}

let acc = 0, last = performance.now(), hudT = 0, bannerUntil = 0;
let deathShown = false, prevQ = false, prevB = false, prevM = false, prevG = false, prevFire = false, prevSp = false, prevDigit = '';
let lastPrimary = PRIMARIES.indexOf(me.weapon) >= 0 ? me.weapon : 'p9';
let lastWeapon = me.weapon;

function switchWeapon(id) {
  if (!id || id === weapon.current || !WEAPONS[id]) return;
  lastWeapon = weapon.current;
  if (PRIMARIES.indexOf(weapon.current) >= 0) lastPrimary = weapon.current;
  weapon.switchTo(id);
  me.weapon = weapon.current;
}
function siteAt(x, z) {
  const A = MAP.sites.A, B = MAP.sites.B;
  if (Math.abs(x - A.cx) < A.w / 2 + 0.5 && Math.abs(z - A.cz) < A.d / 2 + 0.5) return 'A';
  if (Math.abs(x - B.cx) < B.w / 2 + 0.5 && Math.abs(z - B.cz) < B.d / 2 + 0.5) return 'B';
  return null;
}

function prompt(txt, pct) {
  setOverlay('prompt', !!txt, 'block');
  if (txt) setText('promptText', txt);
  const ring = el('plantRing');
  if (ring) ring.style.display = pct > 0 ? 'block' : 'none';
  setWidth('plantFill', (pct || 0) * 100);
}

function updateUseChannel(dt) {
  const held = !!(input.state && (input.state.useHeld ||
    (input.state.keys && input.state.keys.has('KeyE'))));
  let txt = null, pct = 0;
  if (!me.alive) { me.planting = 0; me.defusing = 0; }
  else if (state.phase === 'live' && me.isCarrier && state.bomb.status === 'carried' && siteAt(me.x, me.z)) {
    if (held && player.groundSpeed() < 0.5) {
      me.planting = Math.min(1, me.planting + dt / PLANT_T);
      txt = 'Hold E to plant — ' + Math.round(me.planting * 100) + '%'; pct = me.planting;
    } else { me.planting = 0; txt = 'Hold E to plant'; }
    me.defusing = 0;
  } else if (state.phase === 'planted' && state.bomb.status === 'planted' &&
      (me.x - state.bomb.x) ** 2 + (me.z - state.bomb.z) ** 2 < 9) {
    if (held) {
      me.defusing = Math.min(1, me.defusing + dt / defuseTimeFor(me));
      txt = 'Hold E to defuse — ' + Math.round(me.defusing * 100) + '%'; pct = me.defusing;
    } else { me.defusing = 0; txt = 'Hold E to defuse'; }
    me.planting = 0;
  } else { me.planting = 0; me.defusing = 0; }
  prompt(txt, pct);
}

function handleKeys(keys) {
  weapon.setAds(!!(input.state && input.state.ads) && me.alive);
  if (input.state && input.state.firing && me.alive) {
    if (weapon.current === 'he') grenades.throwGrenade(state, me);
    else {
      const sp = weapon.spread(); // read BEFORE fire(): first shot keeps x0.15
      const kick = weapon.fire();
      if (kick) {
        camera.getWorldDirection(TMP_A);
        const r = combat.shoot(state, me, TMP_A, sp, weapon.current);
        player.recoil(kick.pitch, kick.yaw);
        audio.shot(weapon.current);
        if (r.hit) {
          hud.hitmark(r.killed ? 'kill' : (r.headshot ? 'headshot' : 'hit'));
          if (r.killed) audio.kill();
          else if (r.headshot) audio.headshot();
          else audio.hit();
        }
      }
    }
  }
  if (keys.has('KeyR') && weapon.reload()) audio.reload();
  const g = keys.has('KeyG');
  if (g && !prevG && me.alive && (state.phase === 'live' || state.phase === 'planted')) {
    if (me.hasSmoke) grenades.throwGrenade(state, me, 'smoke');
    else if (me.flashCount > 0) grenades.throwGrenade(state, me, 'flash');
  }
  prevG = g;
  const b = keys.has('KeyB');
  if (b && !prevB && state.phase === 'buy' && me.alive) {
    if (hud.isBuyOpen()) closeBuy();
    else {
      hud.showBuy(true);
      setOverlay('overlayBuy', true);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  prevB = b;
  const m = keys.has('KeyM');
  if (m && !prevM) audio.toggleMute();
  prevM = m;
  if (!me.alive) {
    if (spec.on) {
      const fire = !!(input.state && input.state.firing);
      const q = keys.has('KeyQ');
      const sp = keys.has('Space');
      if ((fire && !prevFire) || (q && !prevQ) || (sp && !prevSp)) specCycle();
      prevFire = fire; prevQ = q; prevSp = sp;
    }
    return;
  }
  if (hud.isBuyOpen()) {
    const buyIds = ['vex9', 'ar77', 'longbow', 'breacher', 'he', 'plating', 'smoke', 'flash', 'kit', 'helmet'];
    if (prevDigit && !keys.has(prevDigit)) prevDigit = '';
    for (let i = 0; i < 10; i++) {
      const code = i === 9 ? 'Digit0' : 'Digit' + (i + 1);
      if (keys.has(code) && prevDigit !== code) { prevDigit = code; if (buyItem(state, me, buyIds[i])) audio.buy(); }
    }
    return;
  }
  if (keys.has('Digit1')) switchWeapon(lastPrimary);
  else if (keys.has('Digit2')) switchWeapon('p9');
  else if (keys.has('Digit4') && me.hasHE) switchWeapon('he');
  const q = keys.has('KeyQ');
  if (q && !prevQ) switchWeapon(lastWeapon);
  prevQ = q;
}

function onPhaseChange(prev, next) {
  if (next === 'planted') audio.startPlantedLoop();
  if (prev === 'planted') audio.stopPlantedLoop();
  if (next === 'roundEnd') {
    const w = state.roundWinner === 'tide' ? 'TIDE' : 'HARBOUR';
    const sub = state.roundReason + '  ·  ' + state.score.tide + ' — ' + state.score.harbour;
    hud.showBanner(w + ' TAKES THE ROUND', sub);
    setText('roundBannerText', w + ' TAKES THE ROUND');
    setText('bannerSub', sub);
    setOverlay('overlayRound', true);
    bannerUntil = performance.now() + 5000;
    if (state.roundWinner === 'tide') audio.roundWin();
    else audio.roundLoss();
  }
  if (next === 'matchEnd') {
    hud.showMatch(state.matchWinner);
    const w = state.matchWinner === 'tide' ? 'TIDE' : 'HARBOUR';
    setText('matchTitle', w + ' WINS THE MATCH');
    setText('matchText', w + ' wins ' + state.score.tide + ' — ' + state.score.harbour + '. Click to play again.');
    setOverlay('overlayMatch', true);
  }
  if (next === 'buy') {
    specClear();
    hud.hideDeath();
    deathShown = false;
    setOverlay('overlayRound', false);
  }
}

function stepSim(dt) {
  state.tick++;
  state.time += dt;
  const prevPhase = state.phase;
  updateRounds(state, dt);
  if (state.phase !== prevPhase) onPhaseChange(prevPhase, state.phase);
  if (prevPhase === 'roundEnd' && state.phase === 'buy') bots.reset();
  if (state.phase === 'menu' || state.phase === 'matchEnd') return;
  updateAI(state, dt);
  bots.update(dt);
  const keys = (input.state && input.state.keys) || EMPTY_KEYS;
  if (state.phase !== 'roundEnd') {
    if (me.alive) player.step(dt, keys); // a dead player must not walk the corpse
    updateUseChannel(dt);
    handleKeys(keys);
  }
  weapon.step(dt);
  grenades.update(dt);
  hudT += dt;
  if (hudT >= 0.1) {
    hudT = 0;
    hud.update();
    minimap.draw(state);
    if (hud.isBuyOpen()) {
      setText('buyMoney', '$' + me.money);
      setText('buyTimer', String(Math.max(0, Math.ceil(state.phaseTime))));
    }
  }
  if (!me.alive && !deathShown && (state.phase === 'live' || state.phase === 'planted')) {
    deathShown = true;
    if (!specStart()) { // no alive teammate: fall back to the death overlay
      hud.showDeath('You are down. Respawn next round.');
      setText('deathText', 'You are down. Respawn next round.');
      setOverlay('overlayDeath', true);
    }
  }
}

// Death spectate: camera follows the next alive Tide teammate (eye view).
// Click / Q / Space cycles; auto-advance when the target dies; no alive
// teammate left -> the death overlay (the round is lost for the player).
const spec = { on: false, target: -1, yo: 0, po: 0 };
function specShow(t) {
  hud.hideDeath();
  setOverlay('overlayDeath', false);
  hud.showSpectate(t);
}
function specStart() {
  for (let i = 1; i < 5; i++) {
    const p = state.players[i];
    if (!p.alive) continue;
    spec.on = true; spec.target = p.id; spec.yo = 0; spec.po = 0;
    specShow('SPECTATING — ' + p.name + ' · click / Q / Space to switch');
    return true;
  }
  return false;
}
function specCycle() {
  if (!spec.on) return;
  const start = spec.target > 0 ? spec.target : 0;
  for (let k = 1; k <= 4; k++) {
    const p = state.players[(start + k - 1) % 4 + 1];
    if (p.alive) {
      spec.target = p.id; spec.yo = 0; spec.po = 0;
      specShow('SPECTATING — ' + p.name + ' · click / Q / Space to switch');
      return;
    }
  }
  specClear();
  hud.showDeath('You are down. Respawn next round.');
  setText('deathText', 'You are down. Respawn next round.');
  setOverlay('overlayDeath', true);
}
function specClear() { spec.on = false; spec.target = -1; hud.hideSpectate(); }

function syncCamera() {
  if (spec.on && !me.alive) {
    const t = state.players[spec.target];
    if (!t || !t.alive) { specCycle(); return; }
    if (isFinite(t.x) && isFinite(t.y) && isFinite(t.z)) {
      camera.position.set(t.x, t.y + (t.crouch ? 1.02 : 1.6), t.z);
      camera.rotation.set(t.pitch + spec.po, t.yaw + spec.yo, 0);
      return;
    }
    specClear();
  }
  camera.position.set(me.x, me.y + player.eyeY, me.z);
  camera.rotation.set(me.pitch, me.yaw, 0);
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  const lk = input.takeLook();
  if (lk && (lk.dx || lk.dy)) {
    if (spec.on && !me.alive) { // look offsets ride on the spectated bot
      spec.yo -= lk.dx * 0.0022;
      spec.po = Math.max(-1.55, Math.min(1.55, spec.po - lk.dy * 0.0022));
    } else player.look(lk.dx, lk.dy);
  }
  if (state.phase !== 'menu' && state.phase !== 'matchEnd') {
    acc += dt;
    let steps = 0;
    while (acc >= FIXED && steps < 5) { stepSim(FIXED); acc -= FIXED; steps++; }
    if (steps === 5) acc = 0;
  }
  world.update(dt);
  syncCamera();
  effects.step(dt, camera);
  renderer.render(scene, camera);
  if (bannerUntil && performance.now() > bannerUntil) {
    bannerUntil = 0;
    setOverlay('overlayRound', false);
  }
}

// --- deterministic ?shot= captures (spec §4) ---
function stepN(n) { for (let i = 0; i < n; i++) stepSim(FIXED); }
function placeBot(i, x, z, y) {
  const p = state.players[i];
  p.x = x; p.z = z; p.y = y || 0; p.alive = true; p.hp = 100;
  if (p.ai) p.ai.wp = [];
  if (p.group) p.group.position.set(x, p.y, z);
}
function aimAt(t) {
  const dx = t.x - me.x, dy = (t.y + 1.2) - (me.y + 1.6), dz = t.z - me.z;
  me.yaw = Math.atan2(-dx, -dz);
  me.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}
function base(r, st, sh, ph, pt, money, mag) {
  state.round = r; state.score.tide = st; state.score.harbour = sh;
  state.phase = ph; state.phaseTime = pt;
  me.money = money; me.weapon = 'ar77'; me.mag = mag; me.reserve = 90;
  weapon.switchTo('ar77'); me.weapon = 'ar77';
}
// Mirror staged state onto the real index.html HUD ids (shot mode only).
function setHudMirror() {
  const wp = WEAPONS[me.weapon];
  const rows = [
    ['healthNum', Math.max(0, Math.ceil(me.hp))], ['ammoMag', me.mag],
    ['ammoReserve', ' / ' + me.reserve], ['weaponName', wp ? wp.name : me.weapon],
    ['scoreTide', state.score.tide], ['scoreHarbour', state.score.harbour],
    ['phaseLabel', state.phase === 'buy' ? 'BUY' : state.phase === 'live' ? 'LIVE' :
      state.phase === 'planted' ? 'BOMB PLANTED' : 'ROUND END'],
  ];
  for (let i = 0; i < rows.length; i++) setText(rows[i][0], String(rows[i][1]));
  setWidth('healthFill', Math.max(0, me.hp));
}

function stageShot(name) {
  newMatch();
  if (name === 'menu') {
    base(3, 2, 1, 'buy', 12, 4650, 30);
    me.x = -16; me.z = 13; me.yaw = 0; me.pitch = 0;
    state.players[1].weapon = 'ar77'; state.players[2].weapon = 'vex9';
    state.players[3].weapon = 'longbow'; state.players[4].weapon = 'breacher';
    const sp = [[1, -18, 11], [2, -14, 11], [3, -19, 12], [4, -13, 12]];
    for (let i = 0; i < 4; i++) placeBot(sp[i][0], sp[i][1], sp[i][2]);
    stepN(30);
    for (let i = 0; i < 4; i++) placeBot(sp[i][0], sp[i][1], sp[i][2]);
    hud.showBuy(true);
    setOverlay('overlayBuy', true);
    setText('buyMoney', '$4,650');
    setText('buyTimer', '12');
  } else if (name === 'fight') {
    base(3, 2, 1, 'live', 84, 4650, 25);
    me.x = 0; me.z = 8; me.yaw = 0; me.pitch = 0;
    placeBot(5, 0, -2, 0.9); placeBot(6, -2, 2); placeBot(1, -4, 4);
    stepN(30);
    me.hp = 100;
    placeBot(5, 0, -2, 0.9); placeBot(6, -2, 2); placeBot(1, -4, 4);
    weapon.setAds(true);
    aimAt(state.players[5]);
    syncCamera();
    scene.updateMatrixWorld(true); // hitbox matrices must be current to shoot
    const kick = weapon.fire(); // one real shot, spread 0 (see combat.shoot)
    if (kick) {
      camera.getWorldDirection(TMP_A);
      combat.shoot(state, me, TMP_A, 0, 'ar77');
      player.recoil(kick.pitch, kick.yaw);
    }
  } else if (name === 'plant') {
    base(3, 2, 1, 'live', 42, 4650, 30);
    me.x = -15; me.z = -7; me.yaw = 0.15; me.pitch = 0;
    for (let i = 0; i < state.players.length; i++) state.players[i].isCarrier = false;
    me.isCarrier = true;
    state.bomb.status = 'carried'; state.bomb.carrier = 0;
    state.bomb.x = me.x; state.bomb.z = me.z;
    placeBot(5, -17.5, -12); placeBot(1, -13, -10.5);
    me.planting = 0.6;
    prompt('Hold E to plant — 60%', 0.6);
  } else if (name === 'win') {
    base(7, 5, 2, 'roundEnd', 5, 4650, 18);
    state.roundWinner = 'tide'; state.roundReason = 'bomb detonated';
    me.x = -15; me.z = -6; me.yaw = 0; me.pitch = 0;
    placeBot(5, -13, -10); placeBot(6, -17, -9);
    placeBot(1, -12, -7); placeBot(2, -18, -6);
    state.players[5].alive = false; state.players[5].hp = 0;
    state.players[6].alive = false; state.players[6].hp = 0;
    stepN(30);
    setText('roundBannerText', 'TIDE TAKES THE ROUND');
    setText('bannerSub', 'bomb detonated  ·  5 — 2');
    setOverlay('overlayRound', true);
    effects.explosion(TMP_A.set(-15, 1, -11)); // smoke + amber glow at A
  }
  syncCamera();
  hud.update();
  minimap.draw(state);
  setHudMirror();
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shotName) stageShot(shotName);
else requestAnimationFrame(frame);

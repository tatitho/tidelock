import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

// View models + recoil/bloom/spread (spec 2.4). Stopping to aim pays:
// moving rifle spray at 20 m: spread ~0.028 rad ~ 0.56 m wide, wider
// than a torso; still + crouched + ADS first shot: ~0.0008 rad ~ 1.6 cm.
// LOOK: light gunmetal steel (0x4a5a66) so the gun reads against the dark
// scene; amber is a tiny sight post only, never a block. Each weapon is a
// distinct low-poly silhouette: receiver, barrel + muzzle, handguard/rail,
// angled magazine, stock, grip, sights. Muzzle flash sits at the muzzle
// (MUZZLE z per weapon), not mid-air.
const FLASH_COLORS = { ar77: 0xffc46b, vex9: 0xffd27a, longbow: 0xffe9a8, breacher: 0xff9a3d, p9: 0xffc46b, he: 0xff8c2e };
const ACCENTS = { ar77: 0xf0a830, vex9: 0x2e8f86, longbow: 0x8fa3ad, breacher: 0xa34a32, p9: 0x4a5a66, he: 0xc08a3e };
const MUZZLE = { ar77: -0.95, vex9: -0.58, longbow: -1.12, breacher: -0.82, p9: -0.28, he: -0.22 };
const STEEL = 0x4a5a66, DARK = 0x2a343e, MID = 0x3a4750;
const GLOVE = 0x1e2420, SLEEVE = 0x232c33; // viewmodel hands: dark glove +
// sleeve boxes, camera-attached only — they never touch hitbox geometry.

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.55 }));
  m.position.set(x, y, z); return m;
}
function buildModel(id) {
  const g = new THREE.Group();
  const accent = ACCENTS[id] || 0xf0a830;
  let mg;
  if (id === 'ar77') {
    g.add(box(0.055, 0.075, 0.42, STEEL, 0, 0, -0.28)); // receiver
    g.add(box(0.06, 0.06, 0.3, MID, 0, 0, -0.58)); // handguard
    g.add(box(0.02, 0.015, 0.3, 0x5a6a76, 0, 0.042, -0.58)); // top rail
    g.add(box(0.032, 0.032, 0.3, DARK, 0, 0.012, -0.8)); // barrel
    g.add(box(0.045, 0.045, 0.07, STEEL, 0, 0.012, -0.92)); // muzzle brake
    mg = box(0.04, 0.17, 0.07, DARK, 0, -0.11, -0.22); mg.rotation.x = 0.28; g.add(mg); // angled mag
    g.add(box(0.05, 0.08, 0.18, DARK, 0, -0.01, 0)); // stock
    mg = box(0.04, 0.09, 0.05, DARK, 0, -0.07, -0.04); mg.rotation.x = 0.25; g.add(mg); // grip
    g.add(box(0.014, 0.035, 0.014, accent, 0, 0.055, -0.14)); // rear sight post
    g.add(box(0.012, 0.028, 0.012, 0x8fa3ad, 0, 0.045, -0.72)); // front sight
    g.add(box(0.05, 0.07, 0.06, GLOVE, 0, -0.075, -0.04)); // glove on grip
    g.add(box(0.06, 0.045, 0.14, SLEEVE, 0, -0.045, -0.55)); // sleeve at forend
  } else if (id === 'vex9') {
    g.add(box(0.055, 0.07, 0.3, STEEL, 0, 0, -0.18));
    g.add(box(0.042, 0.042, 0.2, DARK, 0, 0.005, -0.45)); // suppressor
    mg = box(0.035, 0.19, 0.06, DARK, 0, -0.12, -0.08); mg.rotation.x = 0.2; g.add(mg);
    g.add(box(0.05, 0.07, 0.12, DARK, 0, -0.005, 0.02)); // stock
    mg = box(0.04, 0.08, 0.05, DARK, 0, -0.065, -0.02); mg.rotation.x = 0.25; g.add(mg);
    g.add(box(0.014, 0.03, 0.014, accent, 0, 0.05, -0.12)); // sight post
    g.add(box(0.05, 0.07, 0.06, GLOVE, 0, -0.07, -0.02)); // glove on grip
  } else if (id === 'longbow') {
    g.add(box(0.05, 0.07, 0.52, STEEL, 0, 0, -0.34));
    g.add(box(0.03, 0.03, 0.42, DARK, 0, 0.01, -0.88)); // long barrel
    g.add(box(0.04, 0.04, 0.06, STEEL, 0, 0.01, -1.08)); // muzzle brake
    g.add(box(0.042, 0.042, 0.26, DARK, 0, 0.062, -0.32)); // scope tube
    g.add(box(0.02, 0.02, 0.01, accent, 0, 0.062, -0.46)); // scope lens
    g.add(box(0.04, 0.13, 0.06, DARK, 0, -0.09, -0.28)); // mag
    g.add(box(0.05, 0.08, 0.2, DARK, 0, -0.01, 0.02)); // stock
    g.add(box(0.015, 0.015, 0.08, STEEL, 0.035, 0.01, -0.18)); // bolt
    g.add(box(0.05, 0.06, 0.08, GLOVE, 0, -0.05, -0.02)); // glove at stock
  } else if (id === 'breacher') {
    g.add(box(0.07, 0.08, 0.42, STEEL, 0, 0, -0.26));
    g.add(box(0.05, 0.05, 0.32, DARK, 0, 0.01, -0.62)); // barrel
    g.add(box(0.075, 0.05, 0.15, 0x3a2a20, 0, -0.025, -0.48)); // pump
    g.add(box(0.06, 0.09, 0.16, DARK, 0, -0.01, 0.02)); // stock
    g.add(box(0.014, 0.03, 0.014, accent, 0, 0.055, -0.2)); // sight post
    g.add(box(0.05, 0.06, 0.08, GLOVE, 0, -0.05, -0.02)); // glove at stock
  } else if (id === 'he') {
    g.add(box(0.08, 0.1, 0.08, 0x2e4a2a, 0, 0, -0.05)); // charge body
    g.add(box(0.015, 0.06, 0.02, STEEL, 0.045, 0.03, -0.05)); // lever
    g.add(box(0.015, 0.015, 0.03, accent, 0.05, 0.06, -0.05)); // pin
  } else {
    g.add(box(0.045, 0.06, 0.24, STEEL, 0, 0, -0.12)); // slide
    g.add(box(0.04, 0.05, 0.2, DARK, 0, -0.045, -0.1)); // frame
    mg = box(0.04, 0.11, 0.06, DARK, 0, -0.09, 0.02); mg.rotation.x = 0.25; g.add(mg); // grip
    g.add(box(0.012, 0.02, 0.012, accent, 0, 0.04, -0.2)); // sight
    g.add(box(0.05, 0.07, 0.07, GLOVE, 0, -0.09, 0.02)); // glove on grip
  }
  return g;
}

export function createWeaponView(camera, state) {
  const root = new THREE.Group();
  root.position.set(0.28, -0.26, -0.55);
  camera.add(root);
  const models = {};
  const ids = ['ar77', 'vex9', 'longbow', 'breacher', 'p9', 'he'];
  for (let i = 0; i < ids.length; i++) {
    models[ids[i]] = buildModel(ids[i]);
    models[ids[i]].visible = false;
    root.add(models[ids[i]]);
  }
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.position.set(0, 0.02, -0.75); root.add(flash);
  const flashLight = new THREE.PointLight(0xffc46b, 0, 6);
  flashLight.position.set(0, 0, -0.7); root.add(flashLight);
  const w = {
    current: (state.players[0] && state.players[0].weapon) || 'p9', ads: false, kickPitch: 0, kickYaw: 0,
    _switchT: 0, _reloadT: 0, _flashT: 0, _lastShot: -9, _burst: 0,
    _bloom: 0, _kick: 0, _fov: 74, _adsT: 0,
  };
  models[w.current].visible = true;
  flash.position.z = MUZZLE[w.current] || -0.75;
  flashLight.position.z = (MUZZLE[w.current] || -0.75) + 0.03;
  function weapon() { return WEAPONS[w.current] || WEAPONS.p9; }
  function canFire() {
    const p = state.players[0];
    return w._switchT <= 0 && w._reloadT <= 0 && p && p.alive && p.mag > 0;
  }
  w.switchTo = function (id) {
    if (!WEAPONS[id] || id === w.current) return;
    for (let i = 0; i < ids.length; i++) models[ids[i]].visible = false;
    models[id].visible = true;
    w.current = id; w._switchT = 0.35; w._burst = 0; w._bloom = 0; w._kick = 0;
    w.ads = false; state.playerAds = false;
    flash.position.z = MUZZLE[id] || -0.75;
    flashLight.position.z = (MUZZLE[id] || -0.75) + 0.03;
  };
  w.fire = function () {
    if (!canFire()) return null;
    const wp = weapon();
    const now = state.time;
    if (now < w._lastShot) w._lastShot = now - 1; // match restart rewinds time: never block the first shot of a new match
    if (now - w._lastShot < wp.gap) return null;
    // Recoil: deterministic pattern pitch + yaw (CSGO-style, learnable),
    // plus a tiny random yaw +-0.1x kick; the bloom cone stays random.
    const gap = now - w._lastShot;
    if (gap >= 0.36) { w._burst = 0; w._bloom = 0; w._kick = 0; }
    else if (gap >= 0.24 && w._burst <= 3) { w._burst = 0; w._bloom = 0; w._kick = 0; }
    w._lastShot = now; w._burst++;
    w._bloom = Math.min(0.02, w._bloom + 0.0015);
    const pat = wp.pattern || [];
    const off = pat[Math.min(w._burst - 1, pat.length - 1)] || [0, 0];
    const kick = (wp.recoil + off[0]) * Math.PI / 180;
    w._kick = Math.min(wp.recoilCap * Math.PI / 180, w._kick + kick);
    const yaw = off[1] * Math.PI / 180 + (state.rng() * 2 - 1) * 0.1 * kick;
    w.kickPitch = w._kick; w.kickYaw = yaw;
    flash.material.color.setHex(FLASH_COLORS[w.current] || 0xffc46b);
    flash.material.opacity = 0.8; flash.rotation.z = state.rng() * Math.PI;
    flashLight.color.setHex(FLASH_COLORS[w.current] || 0xffc46b);
    flashLight.intensity = 6; w._flashT = 0.05;
    state.players[0].mag--;
    return { pitch: w._kick, yaw };
  };
  // Staged ?shot= captures render without stepping the weapon, so the
  // 50 ms flash would freeze at full opacity as a pale card on the muzzle.
  w.clearFlash = function () { flash.material.opacity = 0; flashLight.intensity = 0; w._flashT = 0; };
  w.reload = function () {
    const p = state.players[0];
    if (!p || w._reloadT > 0 || w._switchT > 0 || p.mag >= weapon().mag || p.reserve <= 0) return false;
    w._reloadT = weapon().reload; w.ads = false; state.playerAds = false;
    return true;
  };
  w.setAds = function (on) {
    const wp = weapon();
    if (!wp.ads) on = false;
    if (w._reloadT > 0 || w._switchT > 0) on = false;
    w.ads = on; state.playerAds = on;
  };
  w.spread = function () {
    const wp = weapon(), p = state.players[0];
    if (!p) return wp.spreadStill;
    const speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    let s = wp.spreadStill + Math.min(1, speed / 5.2) * wp.spreadMove;
    if (!p.onGround) s *= 2;
    if (p.crouch) s *= 0.75;
    if (w.ads) s *= 0.5;
    s += w._bloom;
    if (w._burst === 0) s *= 0.15;
    return s;
  };
  w.finishReload = function () {
    const p = state.players[0], wp = weapon();
    const need = wp.mag - p.mag, take = Math.min(need, p.reserve);
    p.mag += take; p.reserve -= take;
  };
  w.step = function (dt) {
    if (w._switchT > 0) w._switchT -= dt;
    if (w._reloadT > 0) {
      w._reloadT -= dt;
      if (w._reloadT <= 0) w.finishReload();
    }
    if (w._flashT > 0) {
      w._flashT -= dt;
      if (w._flashT <= 0) { flash.material.opacity = 0; flashLight.intensity = 0; }
    }
    if (state.time - w._lastShot > 0.36) { w._bloom = Math.max(0, w._bloom - 0.010 * dt); w._kick *= Math.pow(0.02, dt); }
    const targetFov = w.ads ? 52 : 74;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
    const lowered = (w._switchT > 0 ? 0.12 : 0) + (w._reloadT > 0 ? 0.18 : 0);
    const adsX = w.ads ? -0.28 : 0, adsY = w.ads ? 0.1 : 0;
    root.position.x += ((0.28 + adsX) - root.position.x) * Math.min(1, dt * 14);
    root.position.y += ((-0.26 + adsY - lowered) - root.position.y) * Math.min(1, dt * 10);
    root.position.z = -0.55 + w._kick * 0.4;
    root.rotation.x = w._kick * 0.6;
    root.rotation.y = w.kickYaw * 0.5;
    w.kickYaw *= Math.pow(0.001, dt);
  };
  return w;
}

// player.js — human movement. Starter accel/friction/gravity core, extended
// with ADS slow (state.playerAds x0.65, set by weapon.js), a walk key, eye
// height lerp and a noise output bots can hear: running 8 m, walking 3 m,
// crouched 0 m. Axis-separated AABB collision vs Box3 colliders. No
// allocation in step(): one module temp Box3, plain numbers otherwise.
// Position/velocity live on state.players[0] (feet y, yaw 0 faces -z).
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { WEAPONS } from './weapons.js';

const C = CONFIG || {};
const WALK = C.walk || 5.2, CROUCH = C.crouch || 2.4, WALK_KEY = 2.6;
const ACCEL_G = C.accelGround || 42, ACCEL_A = C.accelAir || 9;
const FRICTION = C.friction || 9, GRAVITY = C.gravity || 20, JUMP = C.jump || 6.2;
const EYE_STAND = C.eyeStand || 1.6, EYE_CROUCH = C.eyeCrouch || 1.02;
const ADS_SLOW = C.adsSlow || 0.65;
const HALF = 0.36, HEIGHT = 1.7, HEIGHT_CROUCH = 1.15;
const EPS = 0.002; // overlap test inset: edge-touching is not a collision
const tmpBox = new THREE.Box3();

function approach(v, target, maxDelta) {
  if (v < target) return Math.min(v + maxDelta, target);
  if (v > target) return Math.max(v - maxDelta, target);
  return v;
}

export function createPlayer(state, colliders) {
  const p = state.players[0];
  let eyeY = EYE_STAND, moving = false, walking = false;

  function overlaps() {
    const h = p.crouch ? HEIGHT_CROUCH : HEIGHT;
    tmpBox.min.set(p.x - HALF + EPS, p.y + EPS, p.z - HALF + EPS);
    tmpBox.max.set(p.x + HALF - EPS, p.y + h - EPS, p.z + HALF - EPS);
    for (let i = 0; i < colliders.length; i++) {
      if (tmpBox.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  // Spawn safety: a spawn point may sit a few cm inside a crate/wall (map
  // data). If already penetrating, push out along the smallest axis so the
  // player is never wedged on the first step. Only fires on real overlap.
  function depenetrate() {
    const hit = overlaps();
    if (!hit) return;
    const h = p.crouch ? HEIGHT_CROUCH : HEIGHT;
    let m = hit.max.x - (p.x - HALF), axis = 0, sign = 1; // exit +x
    const dxl = (p.x + HALF) - hit.min.x;
    if (dxl < m) { m = dxl; axis = 0; sign = -1; }
    const dzr = hit.max.z - (p.z - HALF);
    if (dzr < m) { m = dzr; axis = 1; sign = 1; }
    const dzl = (p.z + HALF) - hit.min.z;
    if (dzl < m) { m = dzl; axis = 1; sign = -1; }
    const dyr = hit.max.y - p.y;
    if (dyr < m) { m = dyr; axis = 2; sign = 1; }
    const dyl = (p.y + h) - hit.min.y;
    if (dyl < m) { m = dyl; axis = 2; sign = -1; }
    m += 0.01;
    if (axis === 0) { p.x += sign * m; p.vx = 0; }
    else if (axis === 1) { p.z += sign * m; p.vz = 0; }
    else { p.y += sign * m; p.vy = 0; if (sign > 0) p.onGround = true; }
  }

  function step(dt, keys) {
    depenetrate();
    // Aim punch: a landed hit kicks the view up once, then clears.
    if (p.punchDeg) {
      p.pitch += p.punchDeg * Math.PI / 180;
      p.punchDeg = 0;
      if (p.pitch > 1.55) p.pitch = 1.55;
      if (p.pitch < -1.55) p.pitch = -1.55;
    }
    p.crouch = keys.has('KeyC') || keys.has('ControlLeft');
    walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    let ix = 0, iz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    moving = ix !== 0 || iz !== 0;
    // Wish direction: forward (-sin yaw, -cos yaw), right (cos yaw, -sin yaw).
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    let wx = -sy * -iz + cy * ix;
    let wz = -cy * -iz + -sy * ix;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }
    let speed = p.crouch ? CROUCH : (walking ? WALK_KEY : WALK);
    speed *= (WEAPONS[p.weapon] && WEAPONS[p.weapon].speedMult) || 1;
    if (state.time < p.tagUntil) speed *= 0.7; // tagged: slowed briefly
    if (state.playerAds) speed *= ADS_SLOW;
    wx *= speed; wz *= speed;
    if (p.onGround && !moving) { // friction when idle on the ground
      const f = Math.max(0, 1 - FRICTION * dt);
      p.vx *= f; p.vz *= f;
      if (p.vx * p.vx + p.vz * p.vz < 0.0001) { p.vx = 0; p.vz = 0; }
    } else {
      const a = (p.onGround ? ACCEL_G : ACCEL_A) * dt;
      p.vx = approach(p.vx, wx, a);
      p.vz = approach(p.vz, wz, a);
    }
    if (keys.has('Space') && p.onGround) { p.vy = JUMP; p.onGround = false; }
    p.vy -= GRAVITY * dt;
    if (p.vy < -30) p.vy = -30;
    // Axis-separated AABB: move one axis, clamp out of any collider, stop.
    p.x += p.vx * dt;
    let hit = overlaps();
    if (hit) {
      p.x = p.vx > 0 ? hit.min.x - HALF : hit.max.x + HALF;
      p.vx = 0;
    }
    p.z += p.vz * dt;
    hit = overlaps();
    if (hit) {
      p.z = p.vz > 0 ? hit.min.z - HALF : hit.max.z + HALF;
      p.vz = 0;
    }
    p.y += p.vy * dt;
    p.onGround = false;
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
    else {
      hit = overlaps();
      if (hit) {
        if (p.vy <= 0) { p.y = hit.max.y; p.vy = 0; p.onGround = true; }
        else { p.y = hit.min.y - (p.crouch ? HEIGHT_CROUCH : HEIGHT); p.vy = 0; }
      }
    }
    const targetEye = p.crouch ? EYE_CROUCH : EYE_STAND;
    eyeY += (targetEye - eyeY) * Math.min(1, 12 * dt);
  }

  function look(dx, dy) {
    p.yaw -= dx * 0.0022;
    p.pitch -= dy * 0.0022;
    if (p.pitch > 1.55) p.pitch = 1.55;
    if (p.pitch < -1.55) p.pitch = -1.55;
  }

  function recoil(pitchKick, yawKick) {
    p.pitch += pitchKick;
    p.yaw += yawKick;
    if (p.pitch > 1.55) p.pitch = 1.55;
    if (p.pitch < -1.55) p.pitch = -1.55;
  }

  function groundSpeed() { return Math.hypot(p.vx, p.vz); }

  function noiseLevel() {
    if (!p.onGround || !moving) return 0;
    if (p.crouch) return 0;
    return walking ? 3 : 8;
  }

  return {
    state, step, look, recoil, groundSpeed, noiseLevel,
    get eyeY() { return eyeY; },
  };
}

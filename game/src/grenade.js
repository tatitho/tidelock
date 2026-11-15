// grenade.js — HE/smoke/flash: arced throw, bounce, fuse, pool of 4.
// HE: 1.5 s fuse, 5 m blast (110 -> 15), friendly fire OFF. Smoke: 15 s
// volume (r 2.4) on first bounce or 1.2 s fuse, blocks LOS. Flash: 1.2 s
// fuse, blinds in 25 m with LOS (1.5 s facing, 0.5 s away). No alloc in update().
import * as THREE from 'three';
import { addEvent } from './state.js';
import { CONFIG } from './config.js';
import { WEAPONS } from './weapons.js';
import { applyDamage, hasLOS } from './combat.js';

const G = (CONFIG && CONFIG.grenade) || {};
const FUSE = G.fuse || 1.5, GRAV = G.gravity || 12, BOUNCE = G.bounce || 0.45;
const MAX_BOUNCE = G.maxBounces || 3, UP = G.upVel || 8;
const DMG_MAX = (WEAPONS.he && WEAPONS.he.dmg) || 110;
const DMG_MIN = G.minDmg || 15, RADIUS = (WEAPONS.he && WEAPONS.he.radius) || 5;
const THROW_SPEED = 18, POOL = 4;
const SMOKE_T = 15, SMOKE_R = 2.4, SMOKE_MAX = 2;
const FLASH_R = 25;
const tmpV = new THREE.Vector3();
const smokes = [];

export function createGrenades(state, scene, colliders, effects) {
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x2e8f86 }));
    mesh.visible = false;
    scene.add(mesh);
    pool.push({
      active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      bounces: 0, fuse: 0, kind: 'he', thrower: null, mesh,
    });
  }

  function inside(g) {
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (g.x > b.min.x - 0.09 && g.x < b.max.x + 0.09 &&
          g.y > b.min.y - 0.09 && g.y < b.max.y + 0.09 &&
          g.z > b.min.z - 0.09 && g.z < b.max.z + 0.09) return true;
    }
    return false;
  }

  function impact(g, axis, prev) {
    if (axis === 'x') { g.x = prev; g.vx = g.bounces >= MAX_BOUNCE ? 0 : -g.vx * BOUNCE; }
    else if (axis === 'z') { g.z = prev; g.vz = g.bounces >= MAX_BOUNCE ? 0 : -g.vz * BOUNCE; }
    else { g.y = prev; g.vy = g.bounces >= MAX_BOUNCE ? 0 : -g.vy * BOUNCE; }
    g.bounces++;
  }

  function explode(g) {
    g.active = false;
    g.mesh.visible = false;
    const t = g.thrower;
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      if (!p.alive || (t && p.team === t.team)) continue;
      const dx = p.x - g.x, dy = (p.y + 0.9) - g.y, dz = p.z - g.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > RADIUS) continue;
      applyDamage(state, p, DMG_MAX - (DMG_MAX - DMG_MIN) * (d / RADIUS), t, 'blast');
    }
    const nz = state.noise || (state.noise = []);
    nz.push({ x: g.x, z: g.z, radius: 60, t: state.time });
    if (nz.length > 32) nz.shift();
    addEvent(state, 'explode', 'HE detonated');
    if (effects && effects.explosion) {
      tmpV.set(g.x, g.y, g.z);
      effects.explosion(tmpV);
    }
  }

  function deploySmoke(g) {
    g.active = false;
    g.mesh.visible = false;
    if (smokes.length >= SMOKE_MAX) smokes.shift();
    smokes.push({ x: g.x, y: 1.2, z: g.z, until: state.time + SMOKE_T, r: SMOKE_R });
    if (effects && effects.smokeCloud) effects.smokeCloud(g.x, 1.2, g.z);
  }

  function detonateFlash(g) {
    g.active = false;
    g.mesh.visible = false;
    const ps = state.players;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.alive) continue;
      const dx = g.x - p.x, dy = g.y - (p.y + 1.5), dz = g.z - p.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > FLASH_R) continue;
      if (!hasLOS(state, p.x, p.y + 1.5, p.z, g.x, g.y, g.z)) continue;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const facing = d < 0.001 || (fx * dx + fz * dz) / d > 0.5;
      const dur = facing ? 1.5 : 0.5;
      p.blindUntil = state.time + dur;
      if (p === ps[0]) state.flashBlind = { until: state.time + dur, strength: facing ? 1 : 0.35, start: state.time };
    }
  }

  function throwGrenade(st, thrower, kind, tx, ty, tz) {
    if (!thrower || !thrower.alive) return false;
    if (!kind) kind = thrower.weapon === 'smoke' ? 'smoke' : thrower.weapon === 'flash' ? 'flash' : 'he';
    if (kind === 'he' && !thrower.hasHE) return false;
    if (kind === 'smoke' && !thrower.hasSmoke) return false;
    if (kind === 'flash' && !(thrower.flashCount > 0)) return false;
    let g = null;
    for (let i = 0; i < POOL; i++) {
      if (!pool[i].active) { g = pool[i]; break; }
    }
    if (!g) return false;
    g.x = thrower.x; g.y = thrower.y + 1.45; g.z = thrower.z;
    if (tx !== undefined) {
      const dx = tx - g.x, dz = tz - g.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.01) { g.vx = dx / d * 14; g.vz = dz / d * 14; g.vy = 6; }
      else { g.vx = 0; g.vy = 6; g.vz = 0; }
    } else {
      const sy = Math.sin(thrower.yaw), cy = Math.cos(thrower.yaw);
      const cp = Math.cos(thrower.pitch), sp = Math.sin(thrower.pitch);
      g.vx = -sy * cp * THROW_SPEED;
      g.vy = sp * THROW_SPEED + UP;
      g.vz = -cy * cp * THROW_SPEED;
    }
    g.bounces = 0; g.fuse = kind === 'he' ? FUSE : 1.2;
    g.kind = kind; g.active = true; g.thrower = thrower;
    g.mesh.visible = true;
    if (kind === 'he') thrower.hasHE = false;
    else if (kind === 'smoke') thrower.hasSmoke = false;
    else thrower.flashCount--;
    addEvent(st, 'callout', thrower.name + ': Fire in the hole!');
    return true;
  }

  // Segment vs smoke spheres: blocked if closest approach < r. No alloc.
  function smokeBlocks(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len2 = dx * dx + dy * dy + dz * dz;
    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i];
      if (s.until <= state.time) continue;
      const cx = s.x - x1, cy = s.y - y1, cz = s.z - z1;
      let tt = len2 > 0 ? (cx * dx + cy * dy + cz * dz) / len2 : 0;
      if (tt < 0) tt = 0; else if (tt > 1) tt = 1;
      const px = x1 + dx * tt - s.x, py = y1 + dy * tt - s.y, pz = z1 + dz * tt - s.z;
      if (px * px + py * py + pz * pz < s.r * s.r) return true;
    }
    return false;
  }

  function update(dt) {
    for (let i = smokes.length - 1; i >= 0; i--) {
      if (smokes[i].until <= state.time) smokes.splice(i, 1);
    }
    for (let i = 0; i < POOL; i++) {
      const g = pool[i];
      if (!g.active) continue;
      g.fuse -= dt;
      g.vy -= GRAV * dt;
      const px = g.x, py = g.y, pz = g.z;
      g.x += g.vx * dt;
      if (inside(g)) impact(g, 'x', px);
      g.z += g.vz * dt;
      if (inside(g)) impact(g, 'z', pz);
      g.y += g.vy * dt;
      if (g.y <= 0.09) {
        g.y = 0.09;
        if (g.vy < 0) impact(g, 'y', 0.09);
      } else if (inside(g)) impact(g, 'y', py);
      g.mesh.position.set(g.x, g.y, g.z);
      if (g.kind === 'smoke' && g.bounces > 0) { deploySmoke(g); continue; }
      if (g.fuse <= 0) {
        if (g.kind === 'smoke') deploySmoke(g);
        else if (g.kind === 'flash') detonateFlash(g);
        else explode(g);
      }
    }
  }

  return { throwGrenade, update, smokeBlocks };
}

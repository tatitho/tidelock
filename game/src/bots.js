// bots.js — TIDELOCK bot bodies: meshes, hitboxes, movement, death anim.
// NO decisions here: ai.js decides (mode, route, aim, fire, crouch); this
// file EXECUTES. Bots walk ai.wp at 4.6 m/s, step up <=0.9 m boxes, yaw
// slews to ai.aimYaw at the 240 deg/s cap; death falls 0.4 s, fades after 8 s.
// Colliders are built from MAP.boxes — the same data world.js builds from.
// LOOK: team-coloured torsos (amber Tide / teal Harbour), bright trim,
// glowing visor, helmet, pads, backpack, long steel gun — teams read at a glance.
// HITBOXES: head/torso/legs meshes keep their exact geometry and y
// positions (combat.js raycasts them); helmet/pads/pack/knees are
// visual-only and hug the hitbox silhouette.
import { Group, Mesh, BoxGeometry, SphereGeometry, ConeGeometry, MeshStandardMaterial, Sprite, SpriteMaterial, CanvasTexture } from 'three';
import { MAP } from './map.js';
import { CONFIG } from './config.js';
import { clamp, dist2 } from './utils.js';

const PI = Math.PI;
const BOT_SPEED = 4.6; // spec 2.5: bots walk 4.6 m/s
const CROUCH_SPEED = 2.4;
const HALF_W = 0.35; // bot collision half-width

const GEO_LEGS = new BoxGeometry(0.34, 0.78, 0.22);
const GEO_TORSO = new BoxGeometry(0.52, 0.6, 0.3);
const GEO_TRIM = new BoxGeometry(0.54, 0.14, 0.32); // wide bright team stripe
const GEO_HEAD = new SphereGeometry(0.16, 12, 10); // head hit sphere r 0.16
const GEO_HELMET = new SphereGeometry(0.17, 12, 8, 0, 2 * PI, 0, 1.45); // cap hugging head
const GEO_VISOR = new BoxGeometry(0.24, 0.06, 0.03); // wide glowing visor slit
const GEO_ARM = new BoxGeometry(0.09, 0.09, 0.44);
const GEO_GUN = new BoxGeometry(0.07, 0.1, 0.98); // long rifle, steel
const GEO_TIP = new BoxGeometry(0.05, 0.06, 0.08); // team-coloured muzzle tip
const GEO_PAD = new BoxGeometry(0.16, 0.07, 0.24); // shoulder pad
const GEO_PACK = new BoxGeometry(0.34, 0.4, 0.12); // backpack
const GEO_KNEE = new BoxGeometry(0.12, 0.14, 0.05); // knee pad
const GEO_CHEVRON = new ConeGeometry(0.09, 0.18, 4);

function wrapAng(a) {
  a %= 2 * PI;
  if (a > PI) a -= 2 * PI;
  if (a < -PI) a += 2 * PI;
  return a;
}

function buildColliders() {
  const out = [];
  const boxes = MAP.boxes || [];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    out.push({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2,
      y0: b.y - b.h / 2, y1: b.y + b.h / 2 });
  }
  return out;
}

function hitsWall(cols, x, z, y) {
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (c.y1 <= 0.95) continue;
    if (y >= c.y1 || y + 1.7 <= c.y0) continue;
    if (x + HALF_W > c.x0 && x - HALF_W < c.x1 && z + HALF_W > c.z0 && z - HALF_W < c.z1) return true;
  }
  return false;
}

function groundAt(cols, x, z) {
  let g = 0;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (c.y1 <= 0.95 && c.y1 > g && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) g = c.y1;
  }
  return g;
}

function setOp(rec, o) {
  const m = rec.mats;
  m.body.opacity = o; m.trim.opacity = o; m.visor.opacity = o; m.dark.opacity = o;
  m.team.opacity = o; m.steel.opacity = o;
}

function spawnFor(p) {
  const s = MAP.spawns || {};
  if (p.team === 'tide') {
    const a = s.tide || [];
    return a[Math.min(p.id, a.length - 1)] || [p.x, p.z];
  }
  const a = s.harbour || [];
  return a[Math.min(p.id - 5, a.length - 1)] || [p.x, p.z];
}

export function createBots(state, scene) {
  const cols = buildColliders();
  const recs = [];
  const hitMeshes = [];
  const turnCap = ((CONFIG && CONFIG.botTurnCap) || 240) * PI / 180;

  for (let id = 1; id <= 9; id++) {
    const p = state.players[id];
    if (!p) continue;
    const trim = p.team === 'tide' ? 0xf0a830 : 0x2e8f86; // Tide amber / Harbour teal
    const tint = p.team === 'tide' ? 0x8f6428 : 0x1e6b62; // team-coloured torso
    const mats = {
      body: new MeshStandardMaterial({ color: tint, roughness: 0.8, transparent: true }),
      trim: new MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: 0.45, roughness: 0.55, transparent: true }),
      visor: new MeshStandardMaterial({ color: 0x111111, emissive: trim, emissiveIntensity: 2.2, transparent: true }),
      dark: new MeshStandardMaterial({ color: 0x20262c, roughness: 0.9, transparent: true }),
      team: new MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: 0.35, roughness: 0.55, transparent: true }),
      steel: new MeshStandardMaterial({ color: 0x4a5a66, metalness: 0.5, roughness: 0.45, transparent: true }),
    };
    const group = new Group();
    const body = new Group(); // crouch lowers this sub-group; legs stay planted
    const legs = new Mesh(GEO_LEGS, mats.dark);
    legs.position.y = 0.39;
    legs.userData.player = p; legs.userData.part = 'legs';
    const torso = new Mesh(GEO_TORSO, mats.body);
    torso.position.y = 1.08;
    torso.userData.player = p; torso.userData.part = 'torso';
    const stripe = new Mesh(GEO_TRIM, mats.trim);
    stripe.position.y = 1.28;
    const head = new Mesh(GEO_HEAD, mats.body);
    head.position.y = 1.52;
    head.userData.player = p; head.userData.part = 'head';
    const helmet = new Mesh(GEO_HELMET, mats.team);
    helmet.position.y = 1.53;
    const visor = new Mesh(GEO_VISOR, mats.visor);
    visor.position.set(0, 1.53, -0.145);
    const armL = new Mesh(GEO_ARM, mats.body);
    armL.position.set(-0.2, 1.18, -0.16);
    const armR = new Mesh(GEO_ARM, mats.body);
    armR.position.set(0.2, 1.18, -0.16);
    const gun = new Mesh(GEO_GUN, mats.steel);
    gun.position.set(0.1, 1.16, -0.5);
    const tip = new Mesh(GEO_TIP, mats.team);
    tip.position.set(0.1, 1.16, -0.96);
    const padL = new Mesh(GEO_PAD, mats.team);
    padL.position.set(-0.3, 1.37, 0);
    const padR = new Mesh(GEO_PAD, mats.team);
    padR.position.set(0.3, 1.37, 0);
    const pack = new Mesh(GEO_PACK, mats.dark);
    pack.position.set(0, 1.08, 0.22);
    const kneeL = new Mesh(GEO_KNEE, mats.team);
    kneeL.position.set(-0.09, 0.42, -0.13);
    const kneeR = new Mesh(GEO_KNEE, mats.team);
    kneeR.position.set(0.09, 0.42, -0.13);
    body.add(torso, stripe, head, helmet, visor, armL, armR, gun, tip, padL, padR, pack);
    group.add(legs, body, kneeL, kneeR);
    let chevron = null;
    if (p.team === 'tide') { // small chevron above TEAMMATES only, <25 m
      chevron = new Mesh(GEO_CHEVRON, mats.trim);
      chevron.position.y = 1.95;
      chevron.rotation.x = PI;
      group.add(chevron);
    }
    scene.add(group);
    const tc = document.createElement('canvas'); tc.width = 128; tc.height = 32;
    const tg = tc.getContext('2d'); tg.font = 'bold 20px system-ui'; tg.textAlign = 'center';
    tg.fillStyle = p.team === 'tide' ? '#f0a830' : '#2e8f86'; tg.fillText(p.name, 64, 22);
    const tag = new Sprite(new SpriteMaterial({ map: new CanvasTexture(tc), transparent: true, depthWrite: false }));
    tag.scale.set(1.3, 0.33, 1); tag.position.y = 2.05; group.add(tag);
    p.group = group;
    p.hitMeshes = [head, torso, legs];
    hitMeshes.push(head, torso, legs);
    recs.push({ player: p, group, body, mats, chevron, tag, fallT: 0, deathT: 0, peekT: 0,
      avoidT: 0, avoidSign: 1, fallSide: id % 2 === 0 ? 1 : -1 });
  }

  function stepBot(rec, dt) {
    const p = rec.player, a = p.ai, g = rec.group;
    if (!p.alive) { // death: fall over 0.4 s, fade after 8 s
      if (rec.chevron) rec.chevron.visible = false;
      if (rec.tag) rec.tag.visible = false;
      if (rec.fallT < 0.4) {
        rec.fallT += dt;
        g.rotation.x = -1.5 * Math.min(1, rec.fallT / 0.4) * rec.fallSide;
      }
      rec.deathT += dt;
      if (rec.deathT > 8) {
        const f = Math.min(1, rec.deathT - 8);
        setOp(rec, 1 - f);
        if (f >= 1) g.visible = false;
      }
      p.vx = 0; p.vz = 0;
      return;
    }
    const human = state.players[0];
    if (rec.chevron) rec.chevron.visible = !!human && dist2(p.x, p.z, human.x, human.z) < 625;
    if (rec.tag) rec.tag.visible = !!human && dist2(p.x, p.z, human.x, human.z) < 900;
    const wantCrouch = !!(a && a.wantCrouch);
    p.crouch = wantCrouch;
    rec.body.position.y = wantCrouch ? -0.42 : 0;
    let mx = 0, mz = 0, moving = false;
    if (a) {
      if (a.mode === 'engage' && a.strafeT > 0) {
        const dx = a.strafeX - p.x, dz = a.strafeZ - p.z;
        if (dx * dx + dz * dz < 0.09) a.strafeT = 0;
        else { mx = dx; mz = dz; moving = true; }
      } else if (a.mode === 'move' || a.mode === 'investigate' || a.mode === 'retreat') {
        if (rec.peekT > 0) rec.peekT -= dt; // 0.4 s corner peek
        else if (a.wp && a.wpIndex < a.wp.length) {
          const w = MAP.waypoints[a.wp[a.wpIndex]];
          if (!w) a.wpIndex++;
          else {
            const dx = w.x - p.x, dz = w.z - p.z;
            if (dx * dx + dz * dz < 0.64) {
              a.wpIndex++;
              if (a.wpIndex < a.wp.length) rec.peekT = 0.4;
            } else { mx = dx; mz = dz; moving = true; }
          }
        }
      }
    }
    const speed = (wantCrouch || (a && a.walkOnly) ? CROUCH_SPEED : BOT_SPEED) * (state.time < p.tagUntil ? 0.7 : 1);
    if (rec.avoidT > 0 && a && (a.mode === 'move' || a.mode === 'investigate' || a.mode === 'retreat')) {
      rec.avoidT -= dt; // sidestep around it, then resume the route
      const len = Math.sqrt(mx * mx + mz * mz) || 1;
      const ux = mx / len, uz = mz / len;
      mx = -uz * rec.avoidSign; mz = ux * rec.avoidSign;
      moving = true;
    }
    if (moving || (a && a.mode === 'engage')) { // separation: never stack on a mate
      const ps = state.players;
      for (let j = 0; j < ps.length; j++) { const q = ps[j];
        if (q === p || !q.alive || q.team !== p.team) continue;
        const dx = p.x - q.x, dz = p.z - q.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.81 && d2 > 0.0001) { const d = Math.sqrt(d2), f = (0.9 - d) * 1.5 / d; mx += dx * f; mz += dz * f; } }
    }
    if (moving) {
      const len = Math.sqrt(mx * mx + mz * mz) || 1;
      p.vx = mx / len * speed; p.vz = mz / len * speed;
    } else { p.vx = 0; p.vz = 0; }
    const ox = p.x, oz = p.z;
    const nx = p.x + p.vx * dt;
    if (!hitsWall(cols, nx, p.z, p.y)) p.x = nx; else p.vx = 0;
    const nz = p.z + p.vz * dt;
    if (!hitsWall(cols, p.x, nz, p.y)) p.z = nz; else p.vz = 0;
    if (moving && Math.abs(p.x - ox) + Math.abs(p.z - oz) < 0.02 && rec.avoidT <= 0) {
      rec.avoidT = 0.7; rec.avoidSign *= -1; // stuck: sidestep, flip side
    }
    if (p.x > 21.6) p.x = 21.6; else if (p.x < -21.6) p.x = -21.6;
    if (p.z > 16.6) p.z = 16.6; else if (p.z < -16.6) p.z = -16.6;
    const gy = groundAt(cols, p.x, p.z);
    p.y += (gy - p.y) * Math.min(1, dt * 10);
    if (Math.abs(gy - p.y) < 0.02) p.y = gy;
    p.onGround = p.y <= gy + 0.02;
    let targetYaw = p.yaw;
    if (a && (a.mode === 'engage' || a.mode === 'hold' || a.mode === 'plant' || a.mode === 'defuse')) {
      targetYaw = a.aimYaw || p.yaw;
    } else if (moving) targetYaw = Math.atan2(-p.vx, -p.vz);
    p.yaw += clamp(wrapAng(targetYaw - p.yaw), -turnCap * dt, turnCap * dt);
    p.pitch = a && (a.mode === 'engage' || a.mode === 'hold') ? (a.aimPitch || 0) : 0;
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.yaw;
    g.rotation.x = 0;
  }

  function reset() {
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i], p = rec.player;
      const s = spawnFor(p);
      p.x = s[0]; p.z = s[1]; p.y = 0;
      p.vx = 0; p.vy = 0; p.vz = 0;
      p.alive = true; p.hp = 100; p.planting = 0; p.defusing = 0;
      p.yaw = p.team === 'tide' ? 0 : PI; p.pitch = 0;
      p.crouch = false; p.onGround = true;
      if (p.ai) {
        p.ai.mode = 'buy'; p.ai.wp.length = 0; p.ai.wpIndex = 0;
        p.ai.targetId = -1; p.ai.firing = false; p.ai.strafeT = 0; p.ai.burstLeft = 0;
      }
      rec.fallT = 0; rec.deathT = 0; rec.peekT = 0; rec.avoidT = 0; rec.avoidSign = 1;
      rec.group.visible = true;
      rec.group.rotation.set(0, p.yaw, 0);
      rec.group.position.set(p.x, 0, p.z);
      setOp(rec, 1);
    }
  }

  function update(dt) {
    for (let i = 0; i < recs.length; i++) stepBot(recs[i], dt);
  }

  reset();
  return { update, reset, hitMeshes };
}

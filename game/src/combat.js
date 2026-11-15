// combat.js — hitscan for player + bots (state.combat.shoot) + grenades
// (applyDamage). One reused Raycaster; hitboxes are bots.js meshes
// (userData.player + userData.part). Damage = base x part x falloff x
// armour (50% to armour). No allocation in shoot(). Friendly fire OFF.
import * as THREE from 'three';
import { addEvent } from './state.js';
import { WEAPONS } from './weapons.js';
import { awardKill } from './economy.js';

const ray = new THREE.Raycaster();
const origin = new THREE.Vector3(), dir = new THREE.Vector3();
const hitP = new THREE.Vector3(), tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
const MAX_HITS = 30; // 27 bot parts + 3 human hitboxes
const hitList = new Array(MAX_HITS);
let world = [];

function falloff(w, d) {
  if (d <= w.falloffNear) return 1;
  if (d >= w.falloffFar) return w.falloffMult;
  return 1 - (1 - w.falloffMult) * (d - w.falloffNear) / (w.falloffFar - w.falloffNear);
}

export function applyDamage(st, target, amount, attacker, part) {
  if (!target || !target.alive) return false;
  // CSGO-shaped armour: ap of the damage goes straight to HP; the rest is
  // split 50/50 between armour and HP. Blast is halved by armour (ap 0.5).
  // With no armour the full amount hits HP.
  const wAp = (WEAPONS[attacker && attacker.weapon] || {}).ap;
  const ap = part === 'blast' ? 0.5 : (wAp ?? 0.5);
  let hpDmg = amount;
  if (target.armor > 0) {
    const armourDmg = amount * (1 - ap) * 0.5;
    const absorbed = Math.min(target.armor, armourDmg);
    target.armor -= absorbed;
    hpDmg = amount * ap + (armourDmg - absorbed);
  }
  target.hp -= hpDmg;
  // Tagging: the victim is slowed briefly; the human also takes aim punch.
  target.tagUntil = st.time + 0.3;
  if (target.id === 0) target.punchDeg = 1.5;
  if (target.hp > 0) return false;
  target.hp = 0;
  target.alive = false;
  target.deaths++;
  target.planting = 0;
  target.defusing = 0;
  if (attacker && attacker !== target) {
    attacker.kills++;
    awardKill(st, attacker);
    const wName = part === 'blast' ? 'HE Charge' :
      (WEAPONS[attacker.weapon] ? WEAPONS[attacker.weapon].name : attacker.weapon);
    addEvent(st, 'kill', attacker.name + ' ⌖ ' + target.name + ' — ' + wName +
      (part === 'head' ? ' (headshot)' : ''));
  } else {
    addEvent(st, 'kill', target.name + ' is down');
  }
  return true;
}

// Line of sight vs world colliders only (ai.js vision).
export function hasLOS(st, x1, y1, z1, x2, y2, z2) {
  origin.set(x1, y1, z1);
  dir.set(x2 - x1, y2 - y1, z2 - z1);
  const d = dir.length();
  if (d < 0.001) return true;
  dir.multiplyScalar(1 / d);
  ray.set(origin, dir);
  ray.far = d;
  return ray.intersectObjects(world, false).length === 0;
}

export function createCombat(state, shootables, effects) {
  world = shootables || [];
  // Human hitboxes: players[0] has no bots.js body; combat owns 3 detached
  // meshes tracking the player (same sizes as bots.js; crouch -0.42).
  const humanHits = [];
  const hm = new THREE.MeshBasicMaterial();
  const me0 = state.players[0];
  const hd = [[new THREE.SphereGeometry(0.16, 8, 6), 'head', 1.52], [new THREE.BoxGeometry(0.52, 0.6, 0.3), 'torso', 1.08], [new THREE.BoxGeometry(0.34, 0.78, 0.22), 'legs', 0.39]];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(hd[i][0], hm);
    m.userData.player = me0;
    m.userData.part = hd[i][1];
    m.userData.baseY = hd[i][2];
    humanHits.push(m);
  }

  function collectHits(shooter) {
    let n = 0;
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      if (p === shooter || !p.alive || !p.hitMeshes) continue;
      for (let j = 0; j < p.hitMeshes.length && n < MAX_HITS; j++) hitList[n++] = p.hitMeshes[j];
    }
    const me = me0;
    if (shooter !== me && me.alive) {
      const drop = me.crouch ? 0.42 : 0;
      for (let i = 0; i < 3 && n < MAX_HITS; i++) {
        const m = humanHits[i];
        m.position.set(me.x, me.y + m.userData.baseY - (i === 2 ? 0 : drop), me.z);
        m.updateMatrixWorld();
        hitList[n++] = m;
      }
    }
    hitList.length = n;
    return n;
  }

  function shoot(st, shooter, dirVec, spread, weaponId) {
    const w = WEAPONS[weaponId] || WEAPONS.p9;
    const pellets = w.pellets || 1;
    const res = { hit: false, killed: false, headshot: false, part: '', hx: 0, hy: 0, hz: 0 };
    collectHits(shooter);
    origin.set(shooter.x, shooter.y + (shooter.crouch ? 1.02 : 1.6), shooter.z);
    for (let k = 0; k < pellets; k++) {
      dir.copy(dirVec);
      if (spread > 0) {
        const a = st.rng() * 6.283185307179586, r = spread * Math.sqrt(st.rng());
        tmpA.set(0, 1, 0);
        if (Math.abs(dir.y) > 0.9) tmpA.set(1, 0, 0);
        tmpB.crossVectors(dir, tmpA).normalize();
        tmpC.crossVectors(tmpB, dir).normalize();
        dir.addScaledVector(tmpB, Math.cos(a) * r).addScaledVector(tmpC, Math.sin(a) * r).normalize();
      }
      ray.set(origin, dir);
      ray.far = 120;
      const bh = ray.intersectObjects(hitList, false);
      const wh = ray.intersectObjects(world, false);
      const bHit = bh.length > 0 ? bh[0] : null;
      const wHit = wh.length > 0 ? wh[0] : null;
      let end = null, endD = 120;
      if (bHit && (!wHit || bHit.distance < wHit.distance)) { end = bHit; endD = bHit.distance; }
      else if (wHit) { end = wHit; endD = wHit.distance; }
      if (k === 0) {
        if (end) hitP.copy(end.point);
        else hitP.copy(origin).addScaledVector(dir, 120);
        res.hx = hitP.x; res.hy = hitP.y; res.hz = hitP.z;
        if (effects && effects.tracer) effects.tracer(origin, hitP);
        if (effects && effects.impact && wHit && (!bHit || wHit.distance < bHit.distance)) effects.impact(hitP);
      }
      if (!bHit || (wHit && wHit.distance < bHit.distance)) continue;
      const target = bHit.object.userData.player;
      const part = bHit.object.userData.part || 'torso';
      if (!target || target.team === shooter.team) continue;
      // Helmet caps the head mult at x2 vs low-AP guns; low torso = stomach.
      let mult = part === 'head' ? w.headMult : (part === 'legs' ? 0.75 : 1);
      if (part === 'head' && target.helmet && (w.ap || 0.5) < 0.9) mult = Math.min(mult, 2);
      else if (part === 'torso' && bHit.point.y < target.y + 0.95) mult = 1.25;
      const dmg = w.dmg * mult * falloff(w, bHit.distance);
      if (applyDamage(st, target, dmg, shooter, part)) res.killed = true;
      res.hit = true;
      res.part = part;
      if (part === 'head') res.headshot = true;
    }
    const nz = st.noise || (st.noise = []);
    nz.push({ x: shooter.x, z: shooter.z, radius: w.noise || 30, t: st.time });
    if (nz.length > 32) nz.shift();
    return res;
  }

  return { shoot, hasLOS };
}

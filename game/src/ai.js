// ai.js — TIDELOCK bot brains: 10 Hz staggered think, state machine, team
// plans, hearing, plant/defuse. FAIRNESS: bots never know an enemy position
// without vision (100 deg cone, 40 m, LOS vs world only) or hearing (+/-4 m,
// 6 s memory). No instant headshots: tier reaction, aim error decays 40%/s
// only while visible, 3-5 round bursts, torso aim, turn rate capped 240 deg/s.
// ai.js DECIDES, bots.js EXECUTES. Routes: all-pairs next-hop over MAP.edges.
import { Vector3 } from 'three';
import { CONFIG } from './config.js';
import { MAP } from './map.js';
import { WEAPONS } from './weapons.js';
import { addEvent } from './state.js';
import { hasLOS } from './combat.js';
import { dist2 } from './utils.js';
import * as rounds from './rounds.js'; // defuseTimeFor lands with Agent C

const PI = Math.PI, DEG = PI / 180;
const TMP_DIR = new Vector3();

function wrapAng(a) {
  a %= 2 * PI;
  if (a > PI) a -= 2 * PI;
  if (a < -PI) a += 2 * PI;
  return a;
}

function ensureAI(p) {
  if (p.ai) return p.ai;
  p.ai = { mode: 'buy', wp: [], wpIndex: 0, holdUntil: 0, targetId: -1, reactUntil: 0,
    burstLeft: 0, burstPause: 0, investX: 0, investZ: 0, memoryT: 0, aimErr: 3,
    aimYaw: 0, aimPitch: 0, wantCrouch: false, firing: false, fireCd: 0,
    visible: false, lastNoiseT: 0, stimT: 0, strafeX: 0, strafeZ: 0,
    strafeT: 0, followWp: '', aimH: 1.05 };
  return p.ai;
}

// Waypoint graph: Floyd-Warshall next-hop table (24 nodes, computed once).
const WP_NAMES = Object.keys(MAP.waypoints);
const WP_IDX = {};
for (let i = 0; i < WP_NAMES.length; i++) WP_IDX[WP_NAMES[i]] = i;
const N = WP_NAMES.length;
const NX = new Int16Array(N * N);
const DS = new Float32Array(N * N);
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  DS[i * N + j] = i === j ? 0 : 1e9;
  NX[i * N + j] = j;
}
const EDGES = MAP.edges || [];
for (let e = 0; e < EDGES.length; e++) {
  const a = WP_IDX[EDGES[e][0]], b = WP_IDX[EDGES[e][1]];
  if (a === undefined || b === undefined) continue;
  DS[a * N + b] = 1; DS[b * N + a] = 1;
}
for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
  const dik = DS[i * N + k];
  if (dik >= 1e9) continue;
  for (let j = 0; j < N; j++) {
    const nd = dik + DS[k * N + j];
    if (nd < DS[i * N + j]) { DS[i * N + j] = nd; NX[i * N + j] = NX[i * N + k]; }
  }
}

function nearestWp(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < N; i++) {
    const w = MAP.waypoints[WP_NAMES[i]];
    const d = dist2(x, z, w.x, w.z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function appendPath(list, from, to) {
  let c = from, guard = 0;
  for (;;) {
    const nm = WP_NAMES[c];
    if (!list.length || list[list.length - 1] !== nm) list.push(nm);
    if (c === to || guard++ > N) break;
    c = NX[c * N + to];
  }
}

function routeTo(p, x, z) {
  const a = p.ai;
  a.wp.length = 0;
  appendPath(a.wp, nearestWp(p.x, p.z), nearestWp(x, z));
  a.wpIndex = 0;
}

function routeVia(p, via, goal) {
  const a = p.ai;
  a.wp.length = 0;
  appendPath(a.wp, nearestWp(p.x, p.z), WP_IDX[via]);
  appendPath(a.wp, WP_IDX[via], WP_IDX[goal]);
  a.wpIndex = 0;
}

function routeDone(a) { return !a.wp.length || a.wpIndex >= a.wp.length; }

function go(p, x, z) {
  routeTo(p, x, z);
  p.ai.mode = 'move'; p.ai.wantCrouch = false;
}

function siteAt(x, z) {
  const A = MAP.sites.A, B = MAP.sites.B;
  if (Math.abs(x - A.cx) < A.w / 2 + 0.5 && Math.abs(z - A.cz) < A.d / 2 + 0.5) return 'A';
  if (Math.abs(x - B.cx) < B.w / 2 + 0.5 && Math.abs(z - B.cz) < B.d / 2 + 0.5) return 'B';
  return null;
}

function nearestMate(state, team, x, z) {
  let nd = Infinity, nq = null;
  const ps = state.players;
  for (let i = 0; i < ps.length; i++) {
    const q = ps[i];
    if (q.team !== team || !q.alive) continue;
    const d2 = dist2(q.x, q.z, x, z);
    if (d2 < nd) { nd = d2; nq = q; }
  }
  return nq;
}

// Plan lanes per team slot, 'via>goal' (single name = hold there). Tide has
// 4 bots; the human is the 5th attacker.
const LANES = {
  tide: {
    'a-main': ['aLong2>aSite', 'aShort2>aSite', 'aLong2>aSite', 'midDoors>bSite'],
    'b-main': ['bLong2>bSite', 'bShort2>bSite', 'bLong2>bSite', 'midDoors>aSite'],
    'mid-split': ['aLong2>aSite', 'bLong2>bSite', 'midDoors>aSite', 'aShort2>aSite'],
    'a-rush': ['aLong2>aSite', 'aShort2>aSite', 'aLong2>aSite', 'midDoors>aSite'],
  },
  harbour: {
    '2-1-2': ['aSite', 'aHold', 'midN', 'bSite', 'bHold'],
    '3-1-1': ['aSite', 'aHold', 'aEntry', 'midN', 'bSite'],
    '1-2-2': ['aSite', 'midN', 'gantry', 'bSite', 'bHold'],
  },
};

// Weighted random plan. After a lost round the just-failed plan is excluded,
// so a failed plan is never repeated twice in a row.
export function pickPlan(state, team) {
  const list = team === 'tide'
    ? ['a-main', 3, 'b-main', 3, 'mid-split', 2, 'a-rush', 2]
    : ['2-1-2', 3, '3-1-1', 2, '1-2-2', 2];
  if (!state.plans) state.plans = {};
  const failed = state.roundWinner && state.roundWinner !== team ? state.plans[team] : null;
  let total = 0;
  for (let i = 0; i < list.length; i += 2) if (list[i] !== failed) total += list[i + 1];
  let r = state.rng() * total, pick = list[0];
  for (let i = 0; i < list.length; i += 2) {
    if (list[i] === failed) continue;
    r -= list[i + 1];
    if (r <= 0) { pick = list[i]; break; }
  }
  state.plans[team] = pick;
  return pick;
}

function assignRoutes(state) {
  const ps = state.players;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (!p.bot || !p.alive) continue;
    const a = ensureAI(p);
    if (!state.plans) state.plans = {};
    if (!state.plans[p.team]) pickPlan(state, p.team);
    const ti = p.team === 'tide' ? p.id - 1 : p.id - 5;
    if (p.id === 1) routeTo(p, state.players[0].x, state.players[0].z); // buddy shadows the human, no lane
    else {
      const lanes = LANES[p.team][state.plans[p.team]];
      const L = lanes[Math.min(ti, lanes.length - 1)].split('>');
      routeVia(p, L[0], L[1] || L[0]);
    }
    a.targetId = -1; a.visible = false; a.firing = false; a.burstLeft = 0;
    a.burstPause = 0; a.memoryT = 0; a.stimT = 0; a.strafeT = 0;
    a.smokeUsed = false; a.flashUsed = false;
    a.followWp = ''; a.holdUntil = 0;
    p.planting = 0; p.defusing = 0;
    a.mode = 'buy';
    a.aimYaw = p.team === 'tide' ? 0 : PI;
    a.aimPitch = 0; a.wantCrouch = false;
  }
}

function retreatTo(p) {
  let hx, hz;
  if (MAP.holds) {
    const A = MAP.holds.aHold, B = MAP.holds.bHold;
    if (dist2(p.x, p.z, A.x, A.z) < dist2(p.x, p.z, B.x, B.z)) { hx = A.x; hz = A.z; }
    else { hx = B.x; hz = B.z; }
  } else { hx = p.team === 'tide' ? -16 : 16; hz = p.team === 'tide' ? 13 : -14; }
  routeTo(p, hx, hz);
}

function toHold(a, t, dur) {
  a.mode = 'hold'; a.holdUntil = t + dur; a.wantCrouch = true;
}

// Death: radio callout + defender-rotation trigger (state.lastDeath).
function recordDeath(state, q) {
  state.lastDeath = { x: q.x, z: q.z, t: state.time, team: q.team, name: q.name, called: false };
  const ps = state.players;
  for (let j = 0; j < ps.length; j++) {
    const m = ps[j];
    if (m.bot && m.team === q.team && m.alive) {
      addEvent(state, 'callout', m.name + ': ' + q.name + ' down at ' + WP_NAMES[nearestWp(q.x, q.z)]);
      break;
    }
  }
}

// 10 Hz think (one bot). Bot i thinks when (state.tick + i) % 6 === 0.
function think(state, p) {
  const a = p.ai, t = state.time, ps = state.players, gr = state.grenades;
  const tier = CONFIG.botTiers[p.tier] || CONFIG.botTiers[1];
  // Blind: no vision, no target, aim error back to tier max.
  const blind = t < (p.blindUntil || 0);
  // Vision: 100 deg cone, 40 m, LOS vs world only, never through smoke.
  let best = null, bestD = 1e9;
  if (blind) { a.visible = false; a.targetId = -1; a.aimErr = tier.aimErr; }
  else for (let i = 0; i < ps.length; i++) {
    const e = ps[i];
    if (e.team === p.team || !e.alive) continue;
    const d2 = dist2(p.x, p.z, e.x, e.z);
    if (d2 > 1600) continue;
    if (Math.abs(wrapAng(Math.atan2(-(e.x - p.x), -(e.z - p.z)) - p.yaw)) > 0.873) continue;
    if (!hasLOS(state, p.x, 1.5, p.z, e.x, 1.5, e.z)) continue;
    if (gr && gr.smokeBlocks && gr.smokeBlocks(p.x, 1.5, p.z, e.x, 1.5, e.z)) continue;
    const d = Math.sqrt(d2);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) {
    p.lastSeen = t; p.lastKnownX = best.x; p.lastKnownZ = best.z; a.memoryT = t + 4;
    if (a.targetId !== best.id) {
      a.targetId = best.id; a.reactUntil = t + tier.reaction;
      a.aimErr = tier.aimErr;
      a.burstLeft = 3 + Math.floor(state.rng() * 3);
      a.burstPause = 0; a.fireCd = 0;
      a.aimH = state.rng() < 0.2 ? 1.5 : 1.05;
    }
    a.visible = true;
    if (a.aimErr > 0.15) a.aimErr *= 0.96;
    a.aimYaw = Math.atan2(-(best.x - p.x), -(best.z - p.z));
    a.aimPitch = Math.atan2(a.aimH - (p.crouch ? 1 : 1.5), Math.max(1, bestD));
  } else {
    a.visible = false;
    if (a.targetId >= 0 && t - p.lastSeen > 2) a.targetId = -1;
  }
  // Hearing: newest noise only, +/-4 m error, 6 s memory, never own shots.
  const nz = state.noise;
  if (nz && nz.length) {
    const n = nz[nz.length - 1];
    if (n.t > a.lastNoiseT) {
      a.lastNoiseT = n.t;
      if (t - n.t <= 6) {
        const d2 = dist2(p.x, p.z, n.x, n.z);
        if (d2 < n.radius * n.radius && d2 > 25) {
          a.investX = n.x + (state.rng() * 2 - 1) * 4;
          a.investZ = n.z + (state.rng() * 2 - 1) * 4;
          a.stimT = t + 6;
        }
      }
    }
  }
  // Running channel: validate, else cancel. Damage never cancels; moving does.
  if (a.mode === 'plant' || a.mode === 'defuse') {
    let bad = false;
    if (a.mode === 'plant') bad = !p.isCarrier || state.bomb.status !== 'carried' || !siteAt(p.x, p.z);
    else bad = state.bomb.status !== 'planted' || dist2(p.x, p.z, state.bomb.x, state.bomb.z) > 9;
    if (bad) {
      if (a.mode === 'plant') { p.planting = 0; state.bomb.plantT = 0; }
      else { p.defusing = 0; state.bomb.defuseT = 0; }
      a.mode = 'move';
    } else { a.wantCrouch = true; return; }
  }
  // Visible enemy: engage, or retreat to cover at low HP.
  if (a.visible) {
    if (p.hp < 30 && !(a.mode === 'retreat' && routeDone(a))) {
      if (a.mode !== 'retreat') {
        a.mode = 'retreat'; retreatTo(p);
        addEvent(state, 'callout', p.name + ': falling back');
      }
      a.wantCrouch = false;
    } else { a.mode = 'engage'; a.wantCrouch = true; }
    return;
  }
  if (a.mode === 'retreat' && !routeDone(a)) return;
  // Bomb planted: nearest defender defuses, everyone else holds the site.
  const bomb = state.bomb;
  if (bomb.status === 'planted') {
    const bd2 = dist2(p.x, p.z, bomb.x, bomb.z);
    if (p.team === 'harbour' && nearestMate(state, 'harbour', bomb.x, bomb.z) === p
      && bd2 < 9 && t - p.lastSeen > 3) {
      if (a.mode !== 'defuse') {
        a.mode = 'defuse'; p.defusing = 0; bomb.defuseT = 0;
        addEvent(state, 'callout', p.name + ': defusing');
      }
      a.wantCrouch = true;
      return;
    }
    if (bd2 > 16) go(p, bomb.x, bomb.z);
    else toHold(a, t, 4);
    return;
  }
  // Carrier at a clear site: plant (3.2 s, standing still, crouched).
  if (p.isCarrier && bomb.status === 'carried') {
    const s = siteAt(p.x, p.z);
    if (s && t - p.lastSeen > 3) {
      a.mode = 'plant'; a.wp.length = 0; p.planting = 0; bomb.plantT = 0;
      a.wantCrouch = true;
      addEvent(state, 'callout', p.name + ': planting at ' + s);
      return;
    }
  }
  // Death callout: nearest defender rotates to the death site (BFS routes
  // via the CT connector when that is the shortest path).
  const ld = state.lastDeath;
  if (ld && p.team === 'harbour' && !ld.called && t - ld.t < 10 && ld.team === 'harbour'
    && nearestMate(state, 'harbour', ld.x, ld.z) === p
    && dist2(p.x, p.z, ld.x, ld.z) > 100) {
    ld.called = true;
    go(p, ld.x, ld.z);
    addEvent(state, 'callout', p.name + ': rotating to ' + (siteAt(ld.x, ld.z) || WP_NAMES[nearestWp(ld.x, ld.z)]));
    return;
  }
  // Buddy: Rook (players[1]) follows the human, re-routing past 15 m.
  if (p.id === 1) {
    const h = ps[0];
    if (h.alive && dist2(p.x, p.z, h.x, h.z) > 225) {
      const wn = WP_NAMES[nearestWp(h.x, h.z)];
      if (a.followWp !== wn || routeDone(a)) { a.followWp = wn; routeTo(p, h.x, h.z); }
      a.mode = 'move'; a.wantCrouch = false;
      return;
    }
  }
  // Investigate a heard stimulus; hold 3 s on arrival.
  if (t < a.stimT) {
    if (a.mode !== 'investigate') {
      a.mode = 'investigate'; routeTo(p, a.investX, a.investZ);
      addEvent(state, 'callout', p.name + ': checking noise');
    } else if (routeDone(a)) toHold(a, t, 3);
    return;
  }
  // Memory: move to the last known enemy position (kept 4 s), then hold.
  if (t < a.memoryT) {
    if (a.mode !== 'move' || routeDone(a)) routeTo(p, p.lastKnownX, p.lastKnownZ);
    a.mode = 'move'; a.wantCrouch = false;
    return;
  }
  // Utility: Tide bots smoke the entry (~12 m) then flash the site (~10 m).
  if (p.team === 'tide' && a.mode === 'move' && gr && a.wp.length) {
    const goal = a.wp[a.wp.length - 1];
    if (goal === 'aSite' || goal === 'bSite') {
      const A = goal === 'aSite';
      const E = MAP.waypoints[A ? 'aEntry' : 'bEntry'];
      const S = MAP.sites[A ? 'A' : 'B'];
      if (!a.smokeUsed && p.hasSmoke && dist2(p.x, p.z, E.x, E.z) < 144) {
        if (gr.throwGrenade(state, p, 'smoke', E.x, 1.2, E.z)) {
          a.smokeUsed = true;
          addEvent(state, 'callout', p.name + ': smoking ' + (A ? 'A' : 'B') + ' entry');
        }
      } else if (!a.flashUsed && p.flashCount > 0 && dist2(p.x, p.z, S.cx, S.cz) < 100) {
        if (gr.throwGrenade(state, p, 'flash', S.cx, 2.5, S.cz)) a.flashUsed = true;
      }
    }
  }
  // Follow the team plan; hold at the destination until a stimulus arrives.
  if (a.mode === 'hold') {
    if (t >= a.holdUntil) a.holdUntil = t + 6;
    a.aimYaw += 0.05; a.aimPitch = 0; // slow 360 deg scan while holding
    return;
  }
  if (routeDone(a)) { toHold(a, t, 1e9); return; }
  a.mode = 'move'; a.wantCrouch = false;
}

// Per-tick work: plant/defuse channels + burst fire.
function tickBot(state, p, dt) {
  const a = p.ai, t = state.time;
  if (a.strafeT > 0) a.strafeT -= dt;
  if (a.mode === 'plant') {
    p.planting = Math.min(1, p.planting + dt / 3.2);
    state.bomb.plantT = p.planting * 3.2;
    if (p.planting >= 1) {
      const s = siteAt(p.x, p.z) || 'A';
      state.bomb.planterId = p.id;
      Object.assign(state.bomb, { status: 'planted', site: s, timer: 35, x: p.x, z: p.z, carrier: null });
      p.isCarrier = false; p.planting = 0;
      addEvent(state, 'plant', 'Bomb planted at ' + s);
      addEvent(state, 'callout', p.name + ': bomb planted at ' + s);
      toHold(a, t, 8);
    }
    return;
  }
  if (a.mode === 'defuse') {
    const dT = rounds.defuseTimeFor ? rounds.defuseTimeFor(p) : (p.hasKit ? 5 : 10);
    p.defusing = Math.min(1, p.defusing + dt / dT);
    state.bomb.defuseT = p.defusing * dT;
    if (p.defusing >= 1) {
      state.bomb.status = 'defused'; state.bomb.defuserId = p.id; p.defusing = 0;
      state.roundWinner = 'harbour'; state.roundReason = 'bomb defused';
      addEvent(state, 'defuse', 'Bomb defused');
      addEvent(state, 'callout', p.name + ': bomb defused');
      toHold(a, t, 8);
    }
    return;
  }
  // Blind: channels above already ran; no firing, no purposeful action.
  if (t < (p.blindUntil || 0)) { a.firing = false; return; }  // Burst fire: engaging a visible target, past reaction, turned onto it.
  a.firing = false;
  if (a.mode !== 'engage' || !a.visible || a.targetId < 0) return;
  if (t < a.reactUntil) return;
  const tgt = state.players[a.targetId];
  if (!tgt || !tgt.alive) return;
  if (Math.abs(wrapAng(a.aimYaw - p.yaw)) > 0.06) return; // still turning
  if (a.burstPause > 0) {
    a.burstPause -= dt;
    if (a.burstPause <= 0) {
      a.burstLeft = 3 + Math.floor(state.rng() * 3);
      a.aimH = state.rng() < 0.2 ? 1.5 : 1.05;
    }
    return;
  }
  a.fireCd -= dt;
  if (a.fireCd > 0 || a.burstLeft <= 0) return;
  const w = WEAPONS[p.weapon] || WEAPONS.ar77;
  a.fireCd = w.gap || 0.1;
  const err = a.aimErr * DEG;
  const yaw = a.aimYaw + (state.rng() * 2 - 1) * err;
  let pit = a.aimPitch + (state.rng() * 2 - 1) * err;
  pit = pit > 1.2 ? 1.2 : pit < -1.2 ? -1.2 : pit;
  const cp = Math.cos(pit);
  TMP_DIR.set(-Math.sin(yaw) * cp, Math.sin(pit), -Math.cos(yaw) * cp);
  const c = state.combat;
  if (c && typeof c.shoot === 'function') c.shoot(state, p, TMP_DIR, w.spreadStill || 0.003, p.weapon);
  else a.firing = true; // one-tick intent for the combat loop
  a.burstLeft--;
  if (a.burstLeft <= 0) {
    a.burstPause = 0.35 + state.rng() * 0.25;
    const s = 1 + state.rng(); // strafe 1-2 m sideways between bursts
    const sd = state.rng() < 0.5 ? 1 : -1;
    a.strafeX = p.x + Math.cos(a.aimYaw) * sd * s;
    a.strafeZ = p.z - Math.sin(a.aimYaw) * sd * s;
    a.strafeT = 0.6;
  }
}

export function updateAI(state, dt) {
  if (!state.noise) state.noise = []; // ring pushed by combat/main; create lazily
  const ps = state.players;
  if (state.phase !== 'live' && state.phase !== 'planted') {
    if (state.phase === 'buy' && state.aiRound !== state.round) {
      state.aiRound = state.round; assignRoutes(state);
    }
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.bot) continue;
      const a = ensureAI(p);
      a.firing = false;
      if (!p.alive) { if (a.mode !== 'dead') { a.mode = 'dead'; recordDeath(state, p); } }
      else if (state.phase === 'buy') a.mode = 'buy';
    }
    return;
  }
  if (state.aiRound !== state.round) { state.aiRound = state.round; assignRoutes(state); }
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (!p.bot) continue;
    const a = ensureAI(p);
    if (!p.alive) { if (a.mode !== 'dead') { a.mode = 'dead'; a.firing = false; recordDeath(state, p); } continue; }
    if ((state.tick + p.id) % 6 === 0) think(state, p);
    tickBot(state, p, dt);
  }
}

// ai.js — TIDELOCK bot brains: 10 Hz staggered think, state machine, team
// plans, hearing, plant/defuse. FAIRNESS: bots never know an enemy position
// without vision (100 deg cone, 40 m, LOS) or hearing (+/-4 m, 6 s).
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

const POST = { A: [[-18, -13, 'ctConn1'], [-12, -13, 'aEntry']], B: [[18, -13, 'ctConn2'], [12, -13, 'bEntry']] };
function postPlant(state, p) {
  const a = p.ai;
  const spots = POST[state.bomb.site || 'A'];
  const sp = spots[(p.id - 1) % spots.length];
  const lw = MAP.waypoints[sp[2]];
  if (dist2(p.x, p.z, sp[0], sp[1]) > 4) {
    if (a.postSpot !== sp || a.mode !== 'move') { routeTo(p, sp[0], sp[1]); a.mode = 'move'; a.wantCrouch = false; a.postSpot = sp; }
  } else { a.postSpot = sp; toHold(a, state.time, 4, p, lw ? lw.x : state.bomb.x, lw ? lw.z : state.bomb.z); }
}

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

// Plan lanes per team slot, 'via>goal' (single name = hold there).
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

// Weighted random plan; a failed plan is never repeated twice in a row.
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
  state.intel = { site: null, count: 0, t: 0 };
  state.exec = { executing: false, execAt: 30 + state.rng() * 10, lurkerId: -1, rotated: false, liveStartT: null };
  const ps = state.players;
  if (!state.plans) state.plans = {};
  if (!state.plans.tide) pickPlan(state, 'tide');
  if (!state.plans.harbour) pickPlan(state, 'harbour');
  const mainSite = state.plans.tide === 'b-main' ? 'B' : 'A';
  const otherSite = mainSite === 'A' ? 'B' : 'A';
  let lurkerId = -1;
  for (let i = 0; i < ps.length; i++) { const p = ps[i]; if (p.bot && p.team === 'tide' && p.alive && !p.isCarrier && lurkerId < 0) lurkerId = p.id; }
  state.exec.lurkerId = lurkerId;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (!p.bot || !p.alive) continue;
    const a = ensureAI(p);
    a.staged = false; a.staging = false; a.lurker = false; a.walkOnly = false; a.heUsed = false; a.postSpot = null;
    if (p.team === 'tide') {
      if (p.id === lurkerId) {
        a.lurker = true; a.walkOnly = true; // quiet walk to the other site via mid
        routeVia(p, 'midDoors', otherSite === 'A' ? 'aSite' : 'bSite');
      } else {
        a.staging = true; a.stageSite = mainSite;
        const E = MAP.waypoints[mainSite === 'A' ? 'aEntry' : 'bEntry'];
        routeTo(p, E.x, E.z);
      }
    } else {
      const lanes = LANES.harbour[state.plans.harbour];
      const L = lanes[Math.min(p.id - 5, lanes.length - 1)].split('>');
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

function toHold(a, t, dur, p, lookX, lookZ) {
  a.mode = 'hold'; a.holdUntil = t + dur; a.wantCrouch = true;
  a.lookYaw = lookX === undefined ? a.aimYaw : Math.atan2(-(lookX - p.x), -(lookZ - p.z));
}

// Death: radio callout + intel for the rotation discipline.
function recordDeath(state, q) {
  if (q.team === 'harbour' && state.intel) { const it = state.intel; it.count++; it.t = state.time; it.site = dist2(q.x, q.z, MAP.sites.A.cx, MAP.sites.A.cz) < dist2(q.x, q.z, MAP.sites.B.cx, MAP.sites.B.cz) ? 'A' : 'B'; }
  const ps = state.players;
  for (let j = 0; j < ps.length; j++) {
    const m = ps[j];
    if (m.bot && m.team === q.team && m.alive) {
      addEvent(state, 'callout', m.name + ': ' + q.name + ' down at ' + WP_NAMES[nearestWp(q.x, q.z)]);
      break;
    }
  }
}

function think(state, p) {
  const a = p.ai, t = state.time, ps = state.players, gr = state.grenades;
  const tier = CONFIG.botTiers[p.tier] || CONFIG.botTiers[1];
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
      const fresh = a.targetId === -1;
      a.targetId = best.id; a.reactUntil = t + tier.reaction;
      a.aimErr = tier.aimErr;
      a.burstLeft = 3 + Math.floor(state.rng() * 3);
      a.burstPause = 0; a.fireCd = 0;
      a.aimH = state.rng() < 0.2 ? 1.5 : 1.05;
      if (fresh && p.team === 'harbour' && state.intel) { const it = state.intel; it.count++; it.t = t; it.site = dist2(best.x, best.z, MAP.sites.A.cx, MAP.sites.A.cz) < dist2(best.x, best.z, MAP.sites.B.cx, MAP.sites.B.cz) ? 'A' : 'B'; }
    }
    a.visible = true;
    if (a.aimErr > 0.15) a.aimErr *= 0.96;
    a.aimYaw = Math.atan2(-(best.x - p.x), -(best.z - p.z));
    a.aimPitch = Math.atan2(a.aimH - (p.crouch ? 1 : 1.5), Math.max(1, bestD));
  } else {
    a.visible = false;
    if (a.targetId >= 0 && t - p.lastSeen > 2) a.targetId = -1;
  }
  // HE at a target that just ducked out of sight (A5): flush the last known spot.
  if (p.team === 'tide' && p.hasHE && !a.heUsed && !a.visible) {
    const dtSeen = t - p.lastSeen;
    const d2 = dist2(p.x, p.z, p.lastKnownX, p.lastKnownZ);
    if (dtSeen >= 0.6 && dtSeen <= 2.5 && d2 >= 49 && d2 <= 576 && state.rng() < 0.35) {
      if (gr.throwGrenade(state, p, 'he', p.lastKnownX, 1.0, p.lastKnownZ)) { a.heUsed = true; addEvent(state, 'callout', p.name + ': frag out'); }
    }
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
  if (a.visible) {
    if (p.hp < 30 && !(a.mode === 'retreat' && routeDone(a))) {
      if (a.mode !== 'retreat') {
        a.mode = 'retreat'; retreatTo(p);
        addEvent(state, 'callout', p.name + ': falling back');
      }
      a.wantCrouch = false;
      return;
    }
    // Staging/lurking bot ignores a distant contact (>15 m): keep walking
    // to the stage point (or the other site) instead of duelling from spawn.
    if (!((a.staging && !a.staged) || a.lurker) || bestD <= 15) { a.mode = 'engage'; a.wantCrouch = true; return; }
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
    if (p.team === 'tide') { postPlant(state, p); return; }
    if (bd2 > 100) go(p, bomb.x, bomb.z); // hold the defuse approach 6-10 m out, eyes on the bomb
    else toHold(a, t, 4, p, bomb.x, bomb.z);
    return;
  }
  if (bomb.status === 'carried') state.bomb.pickupId = undefined;
  if (bomb.status === 'dropped' && p.team === 'tide') {
    let nearest = null, nd = Infinity;
    for (let i = 0; i < ps.length; i++) { const q = ps[i]; if (!q.bot || q.team !== 'tide' || !q.alive) continue; const d2 = dist2(q.x, q.z, bomb.x, bomb.z); if (d2 < nd) { nd = d2; nearest = q; } }
    const pid = state.bomb.pickupId;
    if (nearest === p && (pid === undefined || pid === p.id || !state.players[pid] || !state.players[pid].alive)) {
      state.bomb.pickupId = p.id;
      routeTo(p, bomb.x, bomb.z); a.mode = 'move'; a.wantCrouch = false;
      addEvent(state, 'callout', p.name + ': picking up bomb');
      return;
    }
  }
  if (p.isCarrier && bomb.status === 'carried' && !(a.staging && !a.staged)) {
    const s = siteAt(p.x, p.z);
    if (s && t - p.lastSeen > 3) {
      a.mode = 'plant'; a.wp.length = 0; p.planting = 0; bomb.plantT = 0;
      a.wantCrouch = true;
      addEvent(state, 'callout', p.name + ': planting at ' + s);
      return;
    }
  }
  const it = state.intel;
  if (it && p.team === 'harbour' && it.count >= 2 && t - it.t < 3 && state.exec && !state.exec.rotated
    && nearestMate(state, 'harbour', 0, 0) === p) {
    state.exec.rotated = true;
    const S = MAP.sites[it.site];
    go(p, S.cx, S.cz);
    addEvent(state, 'callout', p.name + ': rotating to ' + it.site);
    return;
  }
  if (p.id === 1 && !(a.staging && !a.staged) && !a.lurker) {
    const h = ps[0];
    if (h.alive && dist2(p.x, p.z, h.x, h.z) > 225) {
      const wn = WP_NAMES[nearestWp(h.x, h.z)];
      if (a.followWp !== wn || routeDone(a)) { a.followWp = wn; routeTo(p, h.x, h.z); }
      a.mode = 'move'; a.wantCrouch = false;
      return;
    }
  }
  if (t < a.stimT && !(a.staging && !a.staged) && !a.lurker) {
    if (a.mode !== 'investigate') {
      a.mode = 'investigate'; routeTo(p, a.investX, a.investZ);
      addEvent(state, 'callout', p.name + ': checking noise');
    } else if (routeDone(a)) toHold(a, t, 3, p, a.investX, a.investZ);
    return;
  }
  if (t < a.memoryT && !(a.staging && !a.staged) && !a.lurker) {
    if (a.mode !== 'move' || routeDone(a)) routeTo(p, p.lastKnownX, p.lastKnownZ);
    a.mode = 'move'; a.wantCrouch = false;
    return;
  }
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
  if (a.mode === 'hold') {
    if (t >= a.holdUntil) a.holdUntil = t + 6;
    a.aimYaw = a.lookYaw + Math.sin(t * 0.9 + p.id) * 0.18; a.aimPitch = 0; // small idle sweep, not a spin
    return;
  }
  if (routeDone(a)) {
    if (a.staging && !a.staged) { a.staged = true; const S = MAP.sites[a.stageSite || 'A']; toHold(a, t, 1e9, p, S.cx, S.cz); return; }
    const li = Math.max(0, a.wpIndex - 2); const lw = MAP.waypoints[a.wp[li]]; toHold(a, t, 1e9, p, lw ? lw.x : undefined, lw ? lw.z : undefined); return;
  }
  a.mode = 'move'; a.wantCrouch = false;
}

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
      for (let i = 0; i < state.players.length; i++) { const q = state.players[i]; if (q.bot && q.team === 'tide' && q.alive) postPlant(state, q); }
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
      toHold(a, t, 8, p);
    }
    return;
  }
  if (t < (p.blindUntil || 0)) { a.firing = false; return; }  // Burst fire: engaging a visible target, past reaction, turned onto it.
  a.firing = false;
  if (a.mode !== 'engage' || !a.visible || a.targetId < 0) return;
  if (t < a.reactUntil) return;
  const tgt = state.players[a.targetId];
  if (!tgt || !tgt.alive) return;
  if (Math.abs(wrapAng(a.aimYaw - p.yaw)) > 0.06) return; // still turning
  if (p.vx * p.vx + p.vz * p.vz > 0.25) return; // counter-strafe: shoot only from a dead stop
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
  const moving = p.vx * p.vx + p.vz * p.vz > 0.25;
  if (c && typeof c.shoot === 'function') c.shoot(state, p, TMP_DIR, moving ? (w.spreadMove || 0.02) : (w.spreadStill || 0.003), p.weapon);
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
  const ex = state.exec;
  if (state.phase === 'live' && ex && !ex.executing) {
    if (ex.liveStartT == null) ex.liveStartT = state.time;
    let staged = 0, nonLurker = 0, lurker = null, caller = null;
    for (let i = 0; i < ps.length; i++) { const p = ps[i]; if (!p.bot || p.team !== 'tide' || !p.alive) continue; if (p.ai.lurker) lurker = p; else { nonLurker++; if (p.ai.staged) { staged++; if (!caller) caller = p; } } }
    if ((nonLurker > 0 && staged === nonLurker) || state.time - ex.liveStartT > ex.execAt) {
      ex.executing = true;
      const site = state.plans.tide === 'b-main' ? 'B' : 'A';
      const cn = caller ? caller.name : (lurker ? lurker.name : null);
      if (cn) addEvent(state, 'callout', cn + ': go go, executing ' + site);
      for (let i = 0; i < ps.length; i++) { const p = ps[i]; if (!p.bot || p.team !== 'tide' || !p.alive) continue;
        if (p.ai.lurker) { p.ai.walkOnly = false; const S = MAP.sites[site === 'A' ? 'B' : 'A']; routeTo(p, S.cx, S.cz); p.ai.mode = 'move'; p.ai.wantCrouch = false; }
        else { p.ai.staged = false; p.ai.staging = false; routeVia(p, site === 'A' ? 'aEntry' : 'bEntry', site === 'A' ? 'aSite' : 'bSite'); p.ai.mode = 'move'; p.ai.wantCrouch = false; } }
    }
  }
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (!p.bot) continue;
    const a = ensureAI(p);
    if (!p.alive) { if (a.mode !== 'dead') { a.mode = 'dead'; a.firing = false; recordDeath(state, p); } continue; }
    if ((state.tick + p.id) % 6 === 0) think(state, p);
    tickBot(state, p, dt);
  }
}

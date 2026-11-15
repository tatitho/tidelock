// rounds.js — phase machine: buy -> live -> planted -> roundEnd -> next.
import { addEvent, resetRound } from './state.js';
import { CONFIG } from './config.js';
import { MAP } from './map.js';
import { awardRound, awardPlant, awardDefuse, botBuy } from './economy.js';

const C = CONFIG || {};
const LIVE = C.live || 100, PLANTED = C.planted || 35;
const FIRST_TO = C.firstTo || 5, MAX_ROUNDS = C.maxRounds || 9;
const ATTACK = ['a-main', 'b-main', 'mid-split', 'a-rush'];
const DEFENCE = ['2-1-2', '3-1-1', '1-2-2'];

let planPicker = null;
export function setPlanPicker(fn) { planPicker = fn; }
export function defuseTimeFor(p) { return p && p.hasKit ? 5 : 10; }

function pickPlans(s) {
  if (planPicker) { planPicker(s, 'tide'); planPicker(s, 'harbour'); return; }
  const r = s.rng, roll = (a) => a[Math.floor(r() * a.length)];
  s.plans = { tide: roll(ATTACK), harbour: roll(DEFENCE) };
}

function aliveCount(s, team) {
  let n = 0;
  for (let i = 0; i < s.players.length; i++) if (s.players[i].team === team && s.players[i].alive) n++;
  return n;
}

function siteOf(p) {
  for (const k of ['A', 'B']) {
    const s = MAP.sites[k];
    if (Math.abs(p.x - s.cx) < s.w / 2 && Math.abs(p.z - s.cz) < s.d / 2) return k;
  }
  return null;
}

export function startMatch(s) {
  // In-place reset: resetMatch() rebuilds players, breaking captured refs.
  s.tick = 0; s.time = 0;
  s.score.tide = 0; s.score.harbour = 0; s.round = 1;
  s.matchWinner = null;
  s.roundResults = []; s.lastMvp = -1;
  s.lossStreak.tide = 0; s.lossStreak.harbour = 0;
  s.plans = { tide: 'a-main', harbour: '2-1-2' };
  s.events.length = 0; s.noise.length = 0;
  s.playerAds = false;
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i];
    p.money = 800; p.kills = 0; p.deaths = 0;
  }
  startRound(s);
}

export function startRound(s) {
  resetRound(s);
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i];
    if (p.bot) botBuy(s, p);
    if (p.ai) { p.ai.mode = 'buy'; p.ai.wp = []; p.ai.wpIndex = 0; p.ai.targetId = -1; }
  }
  pickPlans(s);
  addEvent(s, 'round', 'Round ' + s.round + ' buy');
}

export function checkWin(s) {
  if (s.score.tide >= FIRST_TO) return 'tide';
  if (s.score.harbour >= FIRST_TO) return 'harbour';
  if (s.round >= MAX_ROUNDS) {
    if (s.score.tide > s.score.harbour) return 'tide';
    if (s.score.harbour > s.score.tide) return 'harbour';
  }
  return null;
}

export function endRound(s, winner, reason) {
  s.roundWinner = winner; s.roundReason = reason;
  s.score[winner]++;
  awardRound(s, winner, reason === 'bomb detonated' ? 'detonation' : reason === 'bomb defused' ? 'defuse' : 'elimination');
  s.roundResults.push({ round: s.round, winner });
  let m = -1, k = 0;
  for (let i = 0; i < s.players.length; i++) { const p = s.players[i]; if (p.roundKills > k) { k = p.roundKills; m = p.id; } }
  s.lastMvp = m;
  s.phase = 'roundEnd'; s.phaseTime = 5;
  addEvent(s, 'round', 'Round ' + s.round + ': ' + (winner === 'tide' ? 'TIDE' : 'HARBOUR') + ' wins — ' + reason);
}

export function updateRounds(s, dt) {
  s.phaseTime -= dt;
  if (s.phase === 'buy') {
    if (s.phaseTime <= 0) {
      s.phase = 'live'; s.phaseTime = LIVE;
      addEvent(s, 'round', 'Round ' + s.round + ' live');
    }
    return;
  }
  if (s.phase === 'roundEnd') {
    if (s.phaseTime <= 0) {
      const w = checkWin(s);
      if (w) {
        s.matchWinner = w; s.phase = 'matchEnd';
        addEvent(s, 'round', w === 'tide' ? 'TIDE wins the match' : 'HARBOUR wins the match');
      } else if (s.round >= MAX_ROUNDS) {
        s.matchWinner = s.roundWinner; s.phase = 'matchEnd';
      } else { s.round++; startRound(s); }
    }
    return;
  }
  if (s.phase !== 'live' && s.phase !== 'planted') return;
  const b = s.bomb; // dead carrier drops it; Tide walking over it picks it up
  if (b.status === 'carried') {
    const c = s.players[b.carrier];
    if (!c || !c.alive) {
      b.status = 'dropped'; b.x = c ? c.x : 0; b.z = c ? c.z : 0;
      addEvent(s, 'round', 'Bomb dropped');
    } else { b.x = c.x; b.z = c.z; }
  } else if (b.status === 'dropped') {
    for (let i = 0; i < 5; i++) {
      const p = s.players[i];
      if (p.alive && (p.x - b.x) * (p.x - b.x) + (p.z - b.z) * (p.z - b.z) < 1.44) {
        b.status = 'carried'; b.carrier = i; p.isCarrier = true;
        addEvent(s, 'round', p.name + ' picked up the bomb');
        break;
      }
    }
  }
  if (s.phase === 'live') {
    let planted = false;
    for (let i = 0; i < s.players.length; i++) {
      const p = s.players[i]; // human plant channel
      if (p.alive && p.team === 'tide' && p.isCarrier && p.planting >= 1) {
        const site = siteOf(p);
        if (!site) continue;
        b.status = 'planted'; b.site = site; b.timer = PLANTED;
        b.x = p.x; b.z = p.z; p.planting = 0;
        s.phase = 'planted'; s.phaseTime = PLANTED;
        awardPlant(s, 'tide', p);
        addEvent(s, 'plant', 'Bomb planted at ' + site);
        planted = true;
        break;
      }
    }
    if (!planted && b.status === 'planted') { // bot plant, done by ai.js
      s.phase = 'planted'; s.phaseTime = PLANTED;
      awardPlant(s, 'tide', s.players[s.bomb.planterId]);
    }
    if (aliveCount(s, 'tide') === 0) return endRound(s, 'harbour', 'Tide eliminated');
    if (aliveCount(s, 'harbour') === 0) return endRound(s, 'tide', 'Harbour eliminated');
    if (s.phaseTime <= 0) return endRound(s, 'harbour', 'time expired');
  } else if (s.phase === 'planted') {
    let defused = false;
    for (let i = 0; i < s.players.length; i++) {
      const p = s.players[i]; // human defuse channel
      if (p.alive && p.team === 'harbour' && p.defusing >= 1) {
        b.status = 'defused'; p.defusing = 0;
        awardDefuse(s, 'harbour', p);
        defused = true;
        break;
      }
    }
    if (defused || b.status === 'defused') { // bot defuse, done by ai.js
      if (!defused) awardDefuse(s, 'harbour', s.players[s.bomb.defuserId]);
      return endRound(s, 'harbour', 'bomb defused');
    }
    if (aliveCount(s, 'harbour') === 0) return endRound(s, 'tide', 'Harbour eliminated');
    if (s.phaseTime <= 0) return endRound(s, 'tide', 'bomb detonated');
  }
}

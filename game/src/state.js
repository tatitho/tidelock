// state.js — THE single state object; players[0] is the human.
import { mulberry32 } from './utils.js';

const TIDE_NAMES = ['You', 'Rook', 'Sable', 'Ivo', 'Marek'];
const HARBOUR_NAMES = ['Kess', 'Brann', 'Yara', 'Doss', 'Pike'];
// Bot tiers (§2.5): 1 elite, 2 good, 2 average per team.
const TIDE_TIERS = [0, 0, 1, 1, 2];
const HARBOUR_TIERS = [0, 1, 1, 2, 2];
const TIDE_SPAWNS = [[-17.8, 13], [-16, 14], [-14.2, 13], [-18, 14], [-14, 14]];
const HARBOUR_SPAWNS = [[13, -12], [15, -12], [17, -12], [13.5, -10], [18, -10]];

function makePlayer(id, team, name, bot, tier, sx, sz) {
  return {
    id, team, name, bot, alive: true, hp: 100, armor: 0, money: 800,
    kills: 0, deaths: 0, x: sx, y: 0, z: sz, yaw: team === 'tide' ? 0 : Math.PI,
    pitch: 0, crouch: false, onGround: true, weapon: 'p9', mag: 12,
    reserve: 36, hasHE: false, isCarrier: false, planting: 0, defusing: 0,
    hasSmoke: false, flashCount: 0, hasKit: false, helmet: false,
    tagUntil: 0, punchDeg: 0, blindUntil: 0, roundKills: 0,
    tier, ai: null, group: null, hitMeshes: [],
    vx: 0, vy: 0, vz: 0, lastSeen: 0, lastKnownX: 0, lastKnownZ: 0,
  };
}
function buildPlayers() {
  const ps = [];
  for (let i = 0; i < 5; i++) ps.push(makePlayer(i, 'tide', TIDE_NAMES[i], i !== 0, TIDE_TIERS[i], TIDE_SPAWNS[i][0], TIDE_SPAWNS[i][1]));
  for (let i = 0; i < 5; i++) ps.push(makePlayer(5 + i, 'harbour', HARBOUR_NAMES[i], true, HARBOUR_TIERS[i], HARBOUR_SPAWNS[i][0], HARBOUR_SPAWNS[i][1]));
  return ps;
}

export const state = {
  tick: 0, time: 0, seed: 7, rng: mulberry32(7),
  phase: 'menu', phaseTime: 0, round: 1,
  score: { tide: 0, harbour: 0 },
  lossStreak: { tide: 0, harbour: 0 },
  matchWinner: null, roundWinner: null, roundReason: '',
  roundResults: [], lastMvp: -1,
  players: buildPlayers(),
  bomb: { status: 'carried', carrier: 1, site: null, x: 0, z: 0, plantT: 0, defuseT: 0, timer: 35 },
  events: [], noise: [], // noise: {x, z, radius, t} ring, read by ai.js
  plans: { tide: 'a-main', harbour: '2-1-2' },
  playerId: 0, playerAds: false,
};

// Ring buffer, max 32 entries; kind: kill|plant|defuse|callout|buy|round|explode.
export function addEvent(st, kind, text) {
  st.events.push({ t: st.time, kind, text });
  if (st.events.length > 32) st.events.shift();
}

export function resetMatch(st) {
  // In-place reset: rebuilding players would break objects captured at boot
  // by player.js / bots.js / main.js (same rule as resetRound / startMatch).
  st.tick = 0; st.time = 0; st.rng = mulberry32(st.seed);
  st.phase = 'menu'; st.phaseTime = 0; st.round = 1;
  st.score.tide = 0; st.score.harbour = 0;
  st.lossStreak.tide = 0;
  st.lossStreak.harbour = 0;
  st.matchWinner = null; st.roundWinner = null; st.roundReason = '';
  st.roundResults = []; st.lastMvp = -1;
  for (let i = 0; i < st.players.length; i++) {
    const p = st.players[i];
    const s = p.team === 'tide' ? TIDE_SPAWNS[p.id] : HARBOUR_SPAWNS[p.id - 5];
    p.alive = true; p.hp = 100; p.armor = 0; p.money = 800;
    p.kills = 0; p.deaths = 0; p.x = s[0]; p.y = 0; p.z = s[1];
    p.yaw = p.team === 'tide' ? 0 : Math.PI; p.pitch = 0;
    p.vx = 0; p.vy = 0; p.vz = 0; p.crouch = false; p.onGround = true;
    p.weapon = 'p9'; p.mag = 12; p.reserve = 36; p.hasHE = false;
    p.hasSmoke = false; p.flashCount = 0; p.hasKit = false; p.helmet = false;
    p.tagUntil = 0; p.punchDeg = 0; p.blindUntil = 0; p.roundKills = 0;
    p.isCarrier = false; p.planting = 0; p.defusing = 0;
    p.lastSeen = 0; p.lastKnownX = 0; p.lastKnownZ = 0;
    // p.ai / p.group / p.hitMeshes are owned by ai.js / bots.js — untouched.
  }
  st.bomb = { status: 'carried', carrier: 1, site: null, x: 0, z: 0, plantT: 0, defuseT: 0, timer: 35 };
  st.events.length = 0; st.noise.length = 0;
  st.plans = { tide: 'a-main', harbour: '2-1-2' };
  st.playerAds = false;
}

// Round reset (§2.2): respawn at team spawns, full HP, weapons/ammo kept,
// grenade NOT kept, bomb to a random Tide bot (default carrier).
export function resetRound(st) {
  for (let i = 0; i < st.players.length; i++) {
    const p = st.players[i];
    const s = p.team === 'tide' ? TIDE_SPAWNS[p.id] : HARBOUR_SPAWNS[p.id - 5];
    p.alive = true; p.hp = 100; p.x = s[0]; p.y = 0; p.z = s[1];
    p.yaw = p.team === 'tide' ? 0 : Math.PI; p.pitch = 0;
    p.vx = 0; p.vy = 0; p.vz = 0; p.crouch = false; p.onGround = true;
    p.hasHE = false; p.isCarrier = false; p.planting = 0; p.defusing = 0;
    p.hasSmoke = false; p.flashCount = 0; p.roundKills = 0;
    p.lastSeen = 0; p.lastKnownX = 0; p.lastKnownZ = 0;
  }
  const carrier = 1 + Math.floor(st.rng() * 4); // random Tide bot 1..4
  st.players[carrier].isCarrier = true;
  st.bomb = { status: 'carried', carrier, site: null, x: 0, z: 0, plantT: 0, defuseT: 0, timer: 35 };
  st.phase = 'buy'; st.phaseTime = 15; // freeze/buy, CONFIG.freeze
  st.roundWinner = null; st.roundReason = '';
  st.playerAds = false;
}
export default state;

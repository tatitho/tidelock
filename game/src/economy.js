import { addEvent } from './state.js';
import { CONFIG } from './config.js';
import { WEAPONS, WEAPON_LIST } from './weapons.js';
import { MAP } from './map.js';

const E = (CONFIG && CONFIG.econ) || {};
const KILL = E.kill || 300, WIN = E.win || 3250, LOSS = E.loss || 1400;
const STREAK = E.lossStreak || 500, STREAK_CAP = E.lossCap || 3400;
const PLANT_BONUS = E.plant || 300, DEFUSE_BONUS = E.defuse || 300;
const ARMOR_PRICE = E.plating || 650, ARMOR_HP = E.armorHp || 100;
const CAP = E.moneyCap || 16000, WINDET = E.winDet || 3500;
const KIT = E.kit || 400, HELMET = E.helmet || 350;
const SMOKE = 300, FLASH = 200;

function cap(p) { if (p.money > CAP) p.money = CAP; }

export function awardKill(state, killer) {
  if (!killer) return;
  const w = WEAPONS[killer.weapon];
  killer.money += (w && w.killReward) || KILL;
  killer.roundKills = (killer.roundKills || 0) + 1;
  cap(killer);
}

export function awardRound(state, winner, reason) {
  if (!state.lossStreak) state.lossStreak = { tide: 0, harbour: 0 };
  const loser = winner === 'tide' ? 'harbour' : 'tide';
  state.lossStreak[loser] += 1;
  state.lossStreak[winner] = Math.max(0, state.lossStreak[winner] - 1);
  const lossPay = Math.min(LOSS + STREAK * (state.lossStreak[loser] - 1), STREAK_CAP);
  const winPay = reason === 'detonation' || reason === 'defuse' ? WINDET : WIN;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    p.money += p.team === winner ? winPay : lossPay;
    cap(p);
  }
}

function payTeam(state, team, amount) {
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    if (p.team === team) { p.money += amount; cap(p); }
  }
}

export function awardPlant(state, team, planter) {
  if (planter) { planter.money += PLANT_BONUS; cap(planter); }
  payTeam(state, team, 800);
}
export function awardDefuse(state, team, defuser) {
  if (defuser) { defuser.money += DEFUSE_BONUS; cap(defuser); }
  payTeam(state, team, 250);
}

function util(state, p, price, ok, key, val, label) {
  if (!ok || p.money < price) return false;
  p.money -= price; p[key] = val;
  addEvent(state, 'buy', p.name + ' bought ' + label);
  return true;
}

export function buyItem(state, player, itemId) {
  if (!player || !player.alive) return false;
  if (itemId === 'plating' || itemId === 'armor') {
    if (player.armor >= ARMOR_HP || player.money < ARMOR_PRICE) return false;
    player.money -= ARMOR_PRICE;
    player.armor = ARMOR_HP;
    addEvent(state, 'buy', player.name + ' bought Plating');
    return true;
  }
  if (itemId === 'smoke') return util(state, player, SMOKE, !player.hasSmoke, 'hasSmoke', true, 'Smoke');
  if (itemId === 'flash') return util(state, player, FLASH, player.flashCount < 2, 'flashCount', player.flashCount + 1, 'Flash');
  if (itemId === 'kit') return util(state, player, KIT, player.team === 'harbour' && !player.hasKit, 'hasKit', true, 'Defuse Kit');
  if (itemId === 'helmet') return util(state, player, HELMET, player.armor >= ARMOR_HP && !player.helmet, 'helmet', true, 'Helmet');
  const w = WEAPONS[itemId];
  if (!w || (WEAPON_LIST.indexOf(itemId) < 0 && itemId !== 'p9')) return false;
  if (player.money < w.price) return false;
  player.money -= w.price;
  if (itemId === 'he') {
    if (player.hasHE) { player.money += w.price; return false; }
    player.hasHE = true;
  } else {
    player.weapon = itemId;
    player.mag = w.mag;
    player.reserve = w.reserve;
  }
  addEvent(state, 'buy', player.name + ' bought ' + w.name);
  return true;
}

// Bots buy by the same economy: rifle if affordable, else SMG, else the
// free P9. Then at most one utility item per round (else-if chain).
export function botBuy(state, bot) {
  if (!bot || !bot.alive) return;
  if (bot.weapon === 'vex9' && bot.money >= WEAPONS.ar77.price) buyItem(state, bot, 'ar77');
  else if (bot.weapon === 'p9') {
    if (bot.money >= WEAPONS.ar77.price) buyItem(state, bot, 'ar77');
    else if (bot.money >= WEAPONS.vex9.price) buyItem(state, bot, 'vex9');
  }
  if (bot.armor < 100 && bot.money >= ARMOR_PRICE) buyItem(state, bot, 'plating');
  else if (bot.team === 'harbour' && !bot.hasKit && bot.money >= KIT) buyItem(state, bot, 'kit');
  else if (!bot.hasSmoke && bot.money >= SMOKE) buyItem(state, bot, 'smoke');
  else if (bot.flashCount < 2 && bot.money >= FLASH) buyItem(state, bot, 'flash');
  if (bot.armor >= 100 && !bot.helmet && bot.money >= HELMET) buyItem(state, bot, 'helmet');
  if (bot.team === 'tide' && !bot.hasHE && bot.money >= 300) buyItem(state, bot, 'he');
}

// Buy window: the 15 s freeze, plus the first 18 s of live while the player is still inside their own spawn (within 4 m).
export function canBuy(s, p) {
  if (s.phase === 'buy') return true;
  if (s.phase !== 'live' || s.phaseTime <= 82) return false;
  const sp = (MAP.spawns[p.team] || [])[p.id % 5] || [p.x, p.z];
  return (p.x - sp[0]) ** 2 + (p.z - sp[1]) ** 2 < 16;
}

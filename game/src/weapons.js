// weapons.js — TIDELOCK weapon data table, pure data. Damage model (§2.4):
// head x4 (shotgun pellets x1.5), torso x1, legs x0.75, stomach x1.25.
// Armour (CSGO shape): hp takes ap of the damage, the rest is split 50/50
// between armour and hp; helmet caps the head mult at x2 vs low-AP guns.
// Falloff multiplies base damage between falloffNear and falloffFar.
// gap = seconds between shots (1 / rpm). spread in radians.
// pattern = deterministic per-shot recoil offsets [pitchDeg, yawDeg]:
// a learnable spray (CSGO-style) on top of the random bloom cone.
export const WEAPONS = {
  // AR-77 pattern: straight climb shots 1-3, then pulls left 4-7.
  // Shots 8+ weave side to side; pull down-left to compensate.
  ar77: { id: 'ar77', name: 'AR-77 Kestrel', slot: 1, price: 2700, dmg: 33, headMult: 4, rpm: 600, gap: 0.100, mag: 30, reserve: 90, reload: 2.5, spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.32, recoilCap: 3.6, falloffNear: 25, falloffFar: 50, falloffMult: 0.7, pellets: 1, auto: true, ads: true, noise: 35, ap: 0.775, killReward: 300, speedMult: 0.92, pattern: [[0.10,0],[0.14,0.02],[0.18,-0.02],[0.16,-0.12],[0.14,-0.18],[0.12,-0.22],[0.10,-0.16],[0.12,0.10],[0.10,0.18],[0.08,-0.12],[0.10,0.14],[0.08,-0.08]] },
  // Vex-9 pattern: gentle climb for 3 shots, then a wide horizontal weave.
  // Weave amplitude grows with the burst; tap-fire stays tight.
  vex9: { id: 'vex9', name: 'Vex-9 SMG', slot: 1, price: 1500, dmg: 26, headMult: 4, rpm: 750, gap: 0.080, mag: 32, reserve: 96, reload: 2.2, spreadStill: 0.0040, spreadMove: 0.022, recoil: 0.22, recoilCap: 2.8, falloffNear: 12, falloffFar: 24, falloffMult: 0.6, pellets: 1, auto: true, ads: false, noise: 28, ap: 0.5, killReward: 600, speedMult: 1.0, pattern: [[0.06,0],[0.08,0.04],[0.06,-0.05],[0.05,0.16],[0.05,-0.18],[0.04,0.22],[0.04,-0.20],[0.05,0.18],[0.04,-0.16],[0.05,0.20],[0.04,-0.14],[0.05,0.12]] },
  // Longbow pattern: one big vertical kick on the first shot.
  // Follow-ups settle fast; the scope re-centres between shots.
  longbow: { id: 'longbow', name: 'Longbow-50 DMR', slot: 1, price: 4750, dmg: 115, headMult: 4, rpm: 46, gap: 1.30, mag: 5, reserve: 15, reload: 3.7, spreadStill: 0.0005, spreadMove: 0.020, recoil: 2.2, recoilCap: 2.2, falloffNear: 0, falloffFar: 9999, falloffMult: 1, pellets: 1, auto: false, ads: true, noise: 40, ap: 0.975, killReward: 100, speedMult: 0.85, pattern: [[1.20,0],[0.20,0.03],[0.15,-0.02],[0.10,0],[0.10,0.02],[0.08,0],[0.08,-0.02],[0.06,0],[0.06,0.01],[0.05,0]] },
  // Breacher pattern: almost straight up, barely any sideways drift.
  // Pump between shots; the climb resets with each pump.
  breacher: { id: 'breacher', name: 'Breacher-12', slot: 1, price: 2100, dmg: 8, headMult: 1.5, rpm: 70, gap: 0.86, mag: 6, reserve: 24, reload: 0.5, spreadStill: 0.060, spreadMove: 0.060, recoil: 1.1, recoilCap: 3.0, falloffNear: 8, falloffFar: 16, falloffMult: 0.2, pellets: 12, auto: false, ads: false, noise: 32, ap: 0.5, killReward: 900, speedMult: 0.95, pattern: [[0.50,0],[0.45,0.04],[0.40,-0.03],[0.35,0.02],[0.30,0],[0.28,-0.02],[0.25,0.03],[0.22,0],[0.20,-0.02],[0.18,0]] },
  // P9 pattern: small climb, tiny sway; easy to control one-handed.
  // Stays near the first-shot point even through a full mag.
  p9: { id: 'p9', name: 'P9 Sidearm', slot: 2, price: 0, dmg: 34, headMult: 4, rpm: 350, gap: 0.17, mag: 12, reserve: 36, reload: 1.6, spreadStill: 0.0030, spreadMove: 0.020, recoil: 0.25, recoilCap: 2.0, falloffNear: 15, falloffFar: 40, falloffMult: 0.7, pellets: 1, auto: false, ads: false, noise: 20, ap: 0.5, killReward: 300, speedMult: 1.0, pattern: [[0.08,0],[0.10,0.02],[0.09,-0.02],[0.08,0.03],[0.07,0],[0.07,-0.02],[0.06,0.02],[0.06,0],[0.05,-0.01],[0.05,0]] },
  he: { id: 'he', name: 'HE Charge', slot: 4, price: 300, dmg: 110, headMult: 1, rpm: 0, gap: 0, mag: 1, reserve: 0, reload: 0, spreadStill: 0, spreadMove: 0, recoil: 0, recoilCap: 0, falloffNear: 0, falloffFar: 5, falloffMult: 0, pellets: 1, auto: false, ads: false, noise: 60, radius: 5 },
  smoke: { id: 'smoke', name: 'Smoke Charge', price: 300, slot: 4 },
  flash: { id: 'flash', name: 'Flash Charge', price: 200, slot: 4 },
};
// Buy-menu order (keys 1-6 in hud.js; 6 is Plating, priced in CONFIG.econ).
export const WEAPON_LIST = ['vex9', 'ar77', 'longbow', 'breacher', 'he'];
export const PRIMARIES = ['ar77', 'vex9', 'longbow', 'breacher'];
export const PLATING_PRICE = 650;
export default WEAPONS;

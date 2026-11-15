// map.js — TIDELOCK "Tidelock Basin" map data, pure data, no THREE imports.
// 44x34 m flat yard (x east +, z south +, origin centre, yaw 0 faces -z).
// Walls 4.5 m. Cover heights are deliberate: 0.9 m crates jumpable
// (jump 6.2 m/s, g 20 -> 0.96 m), 1.1 m crouch-cover, 2.4 m blocks sight,
// 3.3 m double-stacks block everything. Box: centre + size, y = centre h.
export const MAP = {
  size: { x: 44, z: 34 }, wallH: 4.5,
  boxes: [
    // Perimeter walls (thickness 1).
    { x: 0, y: 2.25, z: -17.5, w: 45, h: 4.5, d: 1, mat: 'concrete' },
    { x: 0, y: 2.25, z: 17.5, w: 45, h: 4.5, d: 1, mat: 'concrete' },
    { x: -22.5, y: 2.25, z: 0, w: 1, h: 4.5, d: 35, mat: 'concrete' },
    { x: 22.5, y: 2.25, z: 0, w: 1, h: 4.5, d: 35, mat: 'concrete' },
    // A site — Lock Gate: two 3.3 m piers + beam, amber hazard striping.
    { x: -18, y: 1.65, z: -13, w: 1.2, h: 3.3, d: 1.2, mat: 'steel' },
    { x: -12, y: 1.65, z: -13, w: 1.2, h: 3.3, d: 1.2, mat: 'steel' },
    { x: -15, y: 3.6, z: -13, w: 7.2, h: 0.6, d: 1.2, mat: 'amber' },
    { x: -15, y: 0.55, z: -11, w: 1.6, h: 1.1, d: 1.0, mat: 'amber' },
    // B site — Pump House: 2.4 m block, teal door face, pump skid.
    { x: 15, y: 1.2, z: -14.5, w: 6, h: 2.4, d: 2.5, mat: 'tealDark' },
    { x: 15, y: 0.45, z: -11, w: 1.8, h: 0.9, d: 1.2, mat: 'teal' },
    // Mid container canyon: flanking 2.4 m stacks, 3 m doors gap at (0,0).
    { x: -3.5, y: 1.2, z: 0, w: 2.4, h: 2.4, d: 6, mat: 'rust' },
    { x: 3.5, y: 1.2, z: 0, w: 2.4, h: 2.4, d: 6, mat: 'slate' },
    { x: 0, y: 1.65, z: -6, w: 6, h: 3.3, d: 2.4, mat: 'ochre' },
    // Gantry deck (0,-2): 0.9 m platform, the map's one high ground.
    { x: 0, y: 0.45, z: -2, w: 3, h: 0.9, d: 2, mat: 'steel' },
    { x: 0, y: 0.225, z: 0.2, w: 1.2, h: 0.45, d: 0.8, mat: 'concrete' },
    // A-long / B-long lane cover.
    { x: -19, y: 0.55, z: -4, w: 1.4, h: 1.1, d: 1.4, mat: 'ochre' },
    { x: 19, y: 1.2, z: 4, w: 2.4, h: 2.4, d: 2.4, mat: 'rust' },
    // A-short / B-short alleys.
    { x: -8, y: 0.45, z: 4, w: 1.4, h: 0.9, d: 1.4, mat: 'slate' },
    { x: -11, y: 0.45, z: -2, w: 1.4, h: 0.9, d: 1.4, mat: 'rust' },
    { x: 8, y: 0.55, z: 4, w: 1.4, h: 1.1, d: 1.4, mat: 'ochre' },
    { x: 11, y: 0.45, z: -2, w: 1.4, h: 0.9, d: 1.4, mat: 'slate' },
    // CT connector rotation cover.
    { x: -6, y: 1.2, z: -14, w: 2.4, h: 2.4, d: 2.4, mat: 'tealDark' },
    { x: 6, y: 1.2, z: -14, w: 2.4, h: 2.4, d: 2.4, mat: 'rust' },
    // Spawn yards: container wall behind Tide, control-house frontage.
    { x: -16, y: 1.2, z: 15.5, w: 6, h: 2.4, d: 1.2, mat: 'slate' },
    { x: -19, y: 0.45, z: 12, w: 1.4, h: 0.9, d: 1.4, mat: 'rust' },
    { x: -13, y: 0.45, z: 12, w: 1.4, h: 0.9, d: 1.4, mat: 'ochre' },
    { x: 18, y: 1.2, z: -15.5, w: 4, h: 2.4, d: 1.2, mat: 'steel' },
  ],
  spawns: {
    tide: [[-17.8, 13], [-16, 14], [-14.2, 13], [-18, 14], [-14, 14]],
    harbour: [[13, -12], [15, -12], [17, -12], [13.5, -10], [18, -10]],
  },
  sites: {
    A: { cx: -15, cz: -11, w: 6, d: 5 },
    B: { cx: 15, cz: -11, w: 6, d: 5 },
  },
  waypoints: {
    aSpawn: { x: -16, z: 13 }, aLong1: { x: -19, z: 6 }, aLong2: { x: -19, z: -6 },
    aShort1: { x: -8, z: 6 }, aShort2: { x: -11, z: -4 }, aSite: { x: -15, z: -9 },
    aHold: { x: -16.5, z: -13 }, midS: { x: 0, z: 10 }, midDoors: { x: 0, z: 1.2 },
    midN: { x: 0, z: -8 }, gantry: { x: 0, z: -2 }, bShort1: { x: 8, z: 6 },
    bShort2: { x: 11, z: -4 }, bSite: { x: 15, z: -9 }, bHold: { x: 15, z: -12.8 },
    bLong1: { x: 19, z: 6 }, bLong2: { x: 19, z: -6 }, ctConn1: { x: -8, z: -14 },
    ctConn2: { x: 8, z: -14 }, dSpawn: { x: 16, z: -12.5 }, aEntry: { x: -12, z: -6 },
    bEntry: { x: 12, z: -6 }, midLow: { x: 0, z: 4 }, yard: { x: -12, z: 10 },
  },
  // Bidirectional adjacency for BFS pathing (precomputed, no runtime alloc).
  edges: [
    ['aSpawn', 'yard'], ['aSpawn', 'aLong1'], ['yard', 'aShort1'], ['yard', 'midS'],
    ['aLong1', 'aLong2'], ['aLong2', 'aSite'], ['aLong2', 'aEntry'],
    ['aShort1', 'aShort2'], ['aShort2', 'aEntry'], ['aEntry', 'aSite'],
    ['aSite', 'aHold'], ['aSite', 'ctConn1'],
    ['midS', 'midLow'], ['midLow', 'midDoors'], ['midDoors', 'gantry'],
    ['midDoors', 'midN'], ['midN', 'ctConn1'], ['midN', 'ctConn2'],
    ['midN', 'aEntry'], ['midN', 'bEntry'], ['gantry', 'midN'],
    ['bShort1', 'bShort2'], ['bShort2', 'bEntry'], ['bEntry', 'bSite'],
    ['bSite', 'bHold'], ['bSite', 'ctConn2'], ['bSite', 'bLong2'],
    ['bLong1', 'bLong2'], ['bLong1', 'midS'], ['bLong1', 'bShort1'],
    ['ctConn1', 'ctConn2'], ['ctConn2', 'dSpawn'], ['ctConn1', 'dSpawn'],
    ['aShort1', 'midS'], ['bShort1', 'midS'],
  ],
  holds: { aHold: { x: -16.5, z: -13 }, bHold: { x: 15, z: -12.8 } },
  gantry: { x: 0, z: -2 },
};
export default MAP;

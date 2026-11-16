// utils.js — shared helpers. No per-frame allocation: callers reuse TMP_A
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function dist2(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  return dx * dx + dz * dz;
}
export const TMP_A = new THREE.Vector3();

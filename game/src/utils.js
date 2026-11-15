// utils.js — shared helpers. No per-frame allocation: callers reuse TMP_A/B/C
// and makePool pools. All randomness flows from mulberry32 via state.rng.
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
export function lerp(a, b, t) { return a + (b - a) * t; }
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
export function dist2(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  return dx * dx + dz * dz;
}
export const TMP_A = new THREE.Vector3();
export const TMP_B = new THREE.Vector3();
export const TMP_C = new THREE.Vector3();
export function makePool(n, factory) {
  const all = new Array(n);
  for (let i = 0; i < n; i++) all[i] = factory(i);
  return { all, i: 0, next() { const o = all[this.i]; this.i = (this.i + 1) % n; return o; } };
}

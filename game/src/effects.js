import * as THREE from 'three';
// effects.js — pooled tracers, impacts, muzzle flash, explosion, shake.
// All pooled; no `new` in step() or in the effect triggers. Tracers and
// sparks use additive blending so they glow; every bullet impact also
// kicks up a small grey dust puff from the shared smoke-sprite pool
// (short life, small scale) next to the scorch mark.
export function createEffects(state, scene) {
  const bm = (c, o, add) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
  const tr = [], sc = [], sm = [], sk = [];
  const tg = new THREE.BoxGeometry(0.04, 0.04, 1); // slightly thicker tracer core
  for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(tg, bm(0xffc46b, 0, true));
    m.visible = false; scene.add(m); tr.push({ m, life: 0 }); }
  const N = 64, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sp = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffd27a, size: 0.16,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.visible = false; scene.add(sp);
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), bm(0, 0.55));
    m.visible = false; m.rotation.x = -Math.PI / 2; m.position.y = 0.02; scene.add(m); sc.push({ m, life: 0 });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x9aa0a0, transparent: true, opacity: 0 }));
    s.visible = false; scene.add(s); sm.push({ s, life: 0, ml: 1, sz: 6, op: 0.7 }); }
  // Smoke pool: 12 large soft grey sprites, 15 s life; a cloud takes 5.
  // Separate from the short-lived impact pool above.
  for (let i = 0; i < 12; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x9aa0a0, transparent: true, opacity: 0 }));
    s.visible = false; scene.add(s); sk.push({ s, life: 0 }); }
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), bm(0xffc46b, 0, true));
  fl.visible = false; scene.add(fl);  const flL = new THREE.PointLight(0xffc46b, 0, 8); scene.add(flL);
  let tN = 0, sN = 0, cN = 0, mN = 0, kN = 0, shA = 0, shT = 0;
  const tmp = new THREE.Vector3();
  const fx = {
    tracer(a, b, col) {
      const t = tr[tN]; tN = (tN + 1) % 16;
      tmp.copy(b).sub(a);
      t.m.position.copy(a).addScaledVector(tmp, 0.5); t.m.lookAt(b); t.m.scale.set(1, 1, tmp.length());
      t.m.material.color.setHex(col || 0xffc46b); t.m.material.opacity = 0.9; t.m.visible = true; t.life = 0.06;
    },
    impact(p) {
      for (let k = 0; k < 8; k++) { const i = sN; sN = (sN + 1) % N; const j = i * 3;
        pos[j] = p.x; pos[j + 1] = p.y; pos[j + 2] = p.z;
        vel[j] = (state.rng() * 2 - 1) * 3; vel[j + 1] = state.rng() * 3; vel[j + 2] = (state.rng() * 2 - 1) * 3; life[i] = 0.35; }
      sg.attributes.position.needsUpdate = true;
      const s = sc[cN]; cN = (cN + 1) % 8;
      s.m.position.set(p.x, 0.02, p.z); s.m.material.opacity = 0.55; s.m.visible = true; s.life = 6;
      // Dust puff: grey, short life, small — reuses the smoke pool.
      const d = sm[mN]; mN = (mN + 1) % 8;
      d.s.position.set(p.x, p.y + 0.15, p.z); d.s.scale.set(0.7, 0.7, 1);
      d.s.material.opacity = 0.45; d.s.visible = true; d.life = 0.6; d.ml = 0.6; d.sz = 1.4; d.op = 0.45;
    },
    muzzle(p, col) {
      fl.position.copy(p); fl.material.color.setHex(col || 0xffc46b); fl.material.opacity = 0.9; fl.visible = true;
      flL.position.copy(p); flL.color.setHex(col || 0xffc46b); flL.intensity = 5;
    },
    explosion(p) {
      fx.muzzle(p, 0xff8c2e); flL.intensity = 30;
      const s = sm[mN]; mN = (mN + 1) % 8;
      s.s.position.copy(p); s.s.scale.set(3, 3, 1); s.s.material.opacity = 0.7; s.s.visible = true;
      s.life = 1.5; s.ml = 1.5; s.sz = 6; s.op = 0.7;
      fx.shake(0.5);
    },
    smokeCloud(x, y, z) {
      for (let k = 0; k < 5; k++) {
        const s = sk[kN]; kN = (kN + 1) % 12;
        s.s.position.set(x + (state.rng() * 2 - 1) * 1.2, y + (state.rng() * 2 - 1) * 0.3,
          z + (state.rng() * 2 - 1) * 1.2);
        s.s.scale.set(2, 2, 1); s.s.material.opacity = 0.55; s.s.visible = true; s.life = 15;
      }
    },
    shake(a) { shA = Math.max(shA, a); shT = 0.4; },
    step(dt, cam) {
      for (let i = 0; i < 16; i++) { const t = tr[i]; if (t.life > 0 && (t.life -= dt) <= 0) t.m.visible = false; }
      let any = false;
      for (let i = 0; i < N; i++) if (life[i] > 0) { life[i] -= dt; any = true; const j = i * 3;
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt; vel[j + 1] -= 9 * dt; }
      sg.attributes.position.needsUpdate = true; sp.visible = any;
      for (let i = 0; i < 8; i++) {
        const s = sc[i];
        if (s.life > 0) { s.life -= dt; s.m.material.opacity = Math.max(0, s.life * 0.0917); if (s.life <= 0) s.m.visible = false; }
        const k = sm[i];
        if (k.life > 0) { k.life -= dt; const f = 1 - Math.max(0, k.life) / k.ml;
          const q = k.sz * (0.5 + 0.5 * f); k.s.scale.set(q, q, 1);
          k.s.material.opacity = k.op * Math.max(0, k.life) / k.ml; if (k.life <= 0) k.s.visible = false; }
      }
      // Smoke: grow 2 -> 5 over 15 s, hold 0.55, fade in last 3 s.
      for (let i = 0; i < 12; i++) {
        const k = sk[i];
        if (k.life > 0) { k.life -= dt; const f = 1 - Math.max(0, k.life) / 15;
          const q = 2 + 3 * f; k.s.scale.set(q, q, 1);
          k.s.material.opacity = 0.55 * Math.min(1, Math.max(0, k.life) / 3);
          if (k.life <= 0) k.s.visible = false; }
      }
      if (fl.visible) { fl.material.opacity -= dt * 12; if (fl.material.opacity <= 0) fl.visible = false; }
      flL.intensity = Math.max(0, flL.intensity - dt * 120);
      if (cam && shT > 0) { shT -= dt; const a = shA * (shT / 0.4);
        cam.rotation.x += (state.rng() * 2 - 1) * a * 0.02; cam.rotation.y += (state.rng() * 2 - 1) * a * 0.02; }
    },
  };
  return fx;
}

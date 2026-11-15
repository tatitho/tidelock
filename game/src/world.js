import * as THREE from 'three';
import { MAP } from './map.js';
import { PALETTE as P } from './palette.js';

// world.js — TIDELOCK visuals only: lights, dusk sky, canvas textures
// (corrugation / asphalt / hazard / water) + vendored AI container photos.
// Deterministic, no randomness or wall-clock time anywhere in this file.

function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- Sky: procedural dusk gradient on a 512 canvas (top = zenith).
const SKY = canvasTex(512, (g, s) => {
  const gr = g.createLinearGradient(0, 0, 0, s);
  gr.addColorStop(0, P.skyTop); gr.addColorStop(0.40, '#16283e');
  gr.addColorStop(0.50, P.skyHorizon); gr.addColorStop(0.58, '#54371f');
  gr.addColorStop(1, '#0a0f16');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  const sg = g.createRadialGradient(440, 250, 4, 440, 250, 120);
  sg.addColorStop(0, P.sunGlow); sg.addColorStop(0.35, 'rgba(240,140,60,0.4)');
  sg.addColorStop(1, 'rgba(240,140,60,0)');
  g.fillStyle = sg; g.fillRect(300, 130, 280, 240);
  g.fillStyle = 'rgba(220,235,255,0.7)';
  for (let i = 0; i < 42; i++) g.fillRect((i * 173) % s, (i * 61) % 150, 1.5, 1.5);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = 'rgba(6,12,22,' + (0.2 + (i % 3) * 0.07) + ')';
    g.beginPath(); g.ellipse((i * 197 + 30) % s, 62 + (i * 53) % 168, 90 + (i * 47) % 130, 5 + (i % 4) * 2, 0, 0, 6.283); g.fill();
  }
});
const MOON = canvasTex(128, (g, s) => {
  const mg = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  mg.addColorStop(0, '#ebf2ff'); mg.addColorStop(0.28, 'rgba(215,228,255,0.95)');
  mg.addColorStop(0.45, 'rgba(160,190,230,0.25)'); mg.addColorStop(1, 'rgba(160,190,230,0)');
  g.fillStyle = mg; g.fillRect(0, 0, s, s);
});
const HAZARD = canvasTex(128, (g, s) => {
  g.fillStyle = '#151515'; g.fillRect(0, 0, s, s);
  g.fillStyle = P.amber;
  for (let x = -s; x < s * 2; x += 32) {
    g.beginPath(); g.moveTo(x, s); g.lineTo(x + 16, s); g.lineTo(x + 80, 0); g.lineTo(x + 64, 0); g.closePath(); g.fill();
  }
});
const NOISE = canvasTex(128, (g, s) => {
  g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    const v = 110 + (i * 37 % 60);
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    g.fillRect((i * 53) % s, (i * 91) % s, 2, 2);
  }
}, 8);
const WATER_TEX = canvasTex(128, (g, s) => {
  g.fillStyle = '#0d2b30'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#1d4a52'; g.lineWidth = 2;
  for (let y = 8; y < s; y += 16) {
    g.beginPath();
    for (let x = 0; x <= s; x += 8) g.lineTo(x, y + Math.sin(x * 0.3 + y) * 2);
    g.stroke();
  }
}, 6);

// --- Container corrugation: one 128 px tile per colour, 8 ribs per tile.
const CORR_LABEL = { rust: 'TDL-07', ochre: 'TDL-12', tealDark: 'TDL-03', slate: 'TDL-21' };
const CORR_TEX = {};
function corrTex(name) {
  if (CORR_TEX[name]) return CORR_TEX[name];
  const t = canvasTex(128, (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      g.fillStyle = '#8f8f8f'; g.fillRect(x, 0, 5, s);
      g.fillStyle = '#ffffff'; g.fillRect(x + 5, 0, 4, s);
      g.fillStyle = '#d8d8d8'; g.fillRect(x + 9, 0, 7, s);
    }
    for (let i = 0; i < 6; i++) {
      const sx = (i * 41 + name.length * 17) % 128;
      g.fillStyle = 'rgba(122,62,32,0.30)';
      g.fillRect(sx, (i * 29) % 48, 3, 44 + (i * 37) % 60);
    }
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = 'bold 13px monospace';
    g.fillText(CORR_LABEL[name], 8, 26);
    g.font = '9px monospace'; g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillText('TIDELOCK', 8, 112);
  });
  CORR_TEX[name] = t; return t;
}
const CONTAINER = { rust: 1, ochre: 1, tealDark: 1, slate: 1 };
const MATS = {};
function matFor(name, w, h, d, ai) {
  if (CONTAINER[name]) {
    const key = name + '|' + w + '|' + h + '|' + d;
    if (!MATS[key]) {
      // AI photo replaces the tinted tile, re-tiled every 2.4 m.
      const tex = (name === 'rust' || name === 'ochre') ? (ai && ai.amber) : (ai && ai.teal);
      if (tex) {
        const t = tex.clone(); t.needsUpdate = true;
        t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
        t.repeat.set(Math.max(w, d) / 2.4, h / 2.4);
        MATS[key] = new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.8, metalness: 0.25 });
      } else {
        const t = corrTex(name).clone();
        t.repeat.set(Math.max(w, d) / 2.4, h / 2.4); t.needsUpdate = true;
        MATS[key] = new THREE.MeshStandardMaterial({ color: P[name], map: t, roughness: 0.8, metalness: 0.25 });
      }
    }
    return MATS[key];
  }
  if (MATS[name]) return MATS[name];
  const m = new THREE.MeshStandardMaterial({ color: P[name] || P.concrete, roughness: 0.85, metalness: 0.15 });
  if (name === 'concrete') m.map = NOISE;
  MATS[name] = m; return m;
}
const AI_FILES = { amber: 'container-amber.jpg', teal: 'container-teal.jpg' };
// Load the vendored AI container photos; each resolves to null on failure.
async function loadAI(renderer) {
  const loader = new THREE.TextureLoader();
  const aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  const one = (name) => loader.loadAsync('./textures/' + AI_FILES[name]).then(t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }).catch(() => null);
  const [amber, teal] = await Promise.all([one('amber'), one('teal')]);
  return { amber, teal };
}
const GEO = new THREE.BoxGeometry(1, 1, 1);

export async function createWorld(state, scene, renderer) {
  const ai = await loadAI(renderer);
  scene.fog = new THREE.Fog(0x0e1622, 30, 95);
  scene.background = new THREE.Color(0x0e1622);
  const colliders = [];
  const shootables = [];
  const addBox = (x, y, z, w, h, d, matName, collide) => {
    const mesh = new THREE.Mesh(GEO, matFor(matName, w, h, d, ai));
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); shootables.push(mesh);
    if (collide !== false) colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)));
    return mesh;
  };
  const groundTex = canvasTex(256, (g, s) => {
    g.fillStyle = '#1d2226'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 300; i++) { const v = 22 + (i * 29 % 18); g.fillStyle = 'rgb(' + v + ',' + (v + 4) + ',' + (v + 7) + ')'; g.fillRect((i * 47) % s, (i * 83) % s, 3, 3); }
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(10,14,17,0.35)';
      g.beginPath(); g.ellipse((i * 97 + 30) % s, (i * 61 + 50) % s, 26 + (i * 13) % 22, 14 + (i * 7) % 12, 0, 0, 6.283); g.fill();
    }
    g.fillStyle = 'rgba(200,168,58,0.55)';
    for (let y = 0; y < s; y += 32) g.fillRect(s * 0.5 - 1, y, 2, 18);
    g.fillStyle = 'rgba(200,210,215,0.22)';
    g.fillRect(0, s * 0.08, s, 2); g.fillRect(0, s * 0.92, s, 2);
  });
  groundTex.repeat.set(4, 3);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP.size.x + 4, MAP.size.z + 4),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0.05 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  for (let i = 0; i < MAP.boxes.length; i++) {
    const b = MAP.boxes[i];
    addBox(b.x, b.y, b.z, b.w, b.h, b.d, b.mat || 'concrete', true);
  }
  const hazMat = new THREE.MeshStandardMaterial({ map: HAZARD, roughness: 0.7, metalness: 0.1 });
  const hazSpots = [[-12, -6.5, 2.6], [12, -6.5, 2.6], [-15, -8.3, 3.6]];
  for (let i = 0; i < 3; i++) {
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(hazSpots[i][2], 0.6), hazMat);
    hz.rotation.x = -Math.PI / 2; hz.position.set(hazSpots[i][0], 0.02, hazSpots[i][1]);
    hz.receiveShadow = true; scene.add(hz);
  }
  const a = MAP.sites.A;
  const lampA = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xf0a830, emissive: 0xf0a830, emissiveIntensity: 2 }));
  lampA.position.set(a.cx, 3.9, a.cz - 2.2); scene.add(lampA);
  const b = MAP.sites.B;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2),
    new THREE.MeshStandardMaterial({ color: 0x2e8f86, roughness: 0.5, metalness: 0.4 }));
  door.position.set(b.cx, 1.0, b.cz - 2.05); scene.add(door);
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a4750, roughness: 0.4, metalness: 0.7 }));
    pipe.rotation.z = Math.PI / 2; pipe.position.set(b.cx, 0.6 + i * 0.35, b.cz - 2.0);
    scene.add(pipe); shootables.push(pipe);
  }
  const lampB = lampA.clone();
  lampB.material = new THREE.MeshStandardMaterial({ color: 0x2e8f86, emissive: 0x2e8f86, emissiveIntensity: 2 });
  lampB.position.set(b.cx, 2.6, b.cz - 2.0); scene.add(lampB);
  const textPlane = (txt, w, h, color) => {
    const t = canvasTex(256, (g) => {
      g.fillStyle = 'rgba(10,16,26,0.85)'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = color; g.font = 'bold 84px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 128, 128);
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
  };
  const sA = textPlane('A', 2.4, 1.2, '#f0a830'); sA.position.set(a.cx, 4.0, -12.35); scene.add(sA);
  const sB = textPlane('B', 1.8, 0.9, '#2e8f86'); sB.position.set(b.cx, 1.6, -13.2); scene.add(sB);
  const rA = textPlane('A-LONG →', 2.4, 0.6, '#e9e6df'); rA.position.set(-19, 2.2, 6); scene.add(rA);
  const rM = textPlane('MID →', 1.8, 0.6, '#e9e6df'); rM.position.set(0, 2.2, 10); scene.add(rM);
  const s1 = textPlane('01', 0.9, 0.45, '#e9e6df'); s1.position.set(-3.5, 1.8, 3.06); scene.add(s1);
  const s2 = textPlane('02', 0.9, 0.45, '#e9e6df'); s2.position.set(3.5, 1.8, 3.06); scene.add(s2);
  const craneMat = new THREE.MeshBasicMaterial({ color: 0x0a1018 });
  const cranes = [[-26, -22], [8, -24], [28, -18]];
  for (let i = 0; i < 3; i++) {
    const grp = new THREE.Group();
    const leg = new THREE.Mesh(GEO, craneMat); leg.scale.set(1, 14, 1); leg.position.y = 7; grp.add(leg);
    const arm = new THREE.Mesh(GEO, craneMat); arm.scale.set(12, 0.8, 0.8); arm.position.set(4, 13.5, 0); grp.add(arm);
    grp.position.set(cranes[i][0], 0, cranes[i][1]); scene.add(grp);
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: WATER_TEX, color: 0x1d4a52, roughness: 0.25, metalness: 0.6 }));
  water.rotation.x = -Math.PI / 2; water.position.set(10, -0.5, -10); scene.add(water);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 24, 16),
    new THREE.MeshBasicMaterial({ map: SKY, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(16, 16),
    new THREE.MeshBasicMaterial({ map: MOON, transparent: true, fog: false, depthWrite: false }));
  moon.position.set(55, 68, -75); moon.lookAt(0, 0, 0); scene.add(moon);
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x1a2e38, roughness: 0.08, metalness: 0.95 });
  const puddles = [[-8, 6], [6, -6], [-2, 10], [12, 8]];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), puddleMat);
    p.rotation.x = -Math.PI / 2; p.position.set(puddles[i][0], 0.01, puddles[i][1]); scene.add(p);
  }
  scene.add(new THREE.HemisphereLight(0x9fc0e0, 0x141c20, 1.5));
  const key = new THREE.DirectionalLight(0xcfe4ff, 2.8);
  key.position.set(-18, 30, -12); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -24; sc.right = 24; sc.top = 20; sc.bottom = -20; sc.far = 80;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffd9a8, 0.55);
  fill.position.set(18, 22, 16); scene.add(fill);
  const lightA = new THREE.PointLight(0xf0a830, 20, 16); lightA.position.set(a.cx, 3.6, a.cz); scene.add(lightA);
  const lightB = new THREE.PointLight(0x2e8f86, 20, 16); lightB.position.set(b.cx, 2.6, b.cz); scene.add(lightB);
  const lightAin = new THREE.PointLight(0xffb347, 18, 12); lightAin.position.set(a.cx, 2.0, a.cz + 0.5); scene.add(lightAin);
  const lightBin = new THREE.PointLight(0x35b5a8, 14, 9); lightBin.position.set(b.cx, 2.0, b.cz + 0.5); scene.add(lightBin);
  let t = 0;
  return {
    colliders, shootables,
    update(dt) {
      t += dt;
      WATER_TEX.offset.x = t * 0.02; WATER_TEX.offset.y = t * 0.013;
    },
  };
}

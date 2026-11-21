// Solmara: a sun-soaked coastal city, 640x640 m, four districts on a street grid.
// Ground is one canvas texture (roads, sidewalks, sand, docks, terraces); buildings are
// instanced boxes with a shared lit-window texture; props are instanced too.
import * as THREE from 'three';
import { mulberry, clamp, pick } from './util.js';

export const HALF = 320;
export const STREETS = [-280, -200, -120, -40, 40, 120, 200, 280];
export const BLOCKS = [-240, -160, -80, 0, 80, 160, 240];

export function districtAt(x, z) {
  if (z > 200) return 'beach';
  if (x < -200) return 'docks';
  if (z < -200) return 'hills';
  if (Math.abs(x) < 140 && Math.abs(z) < 140) return 'downtown';
  return 'midtown';
}

function groundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  const S = 1024 / 640; // px per metre, city spans -320..320
  const X = (x) => (x + 320) * S, Z = (z) => (z + 320) * S;
  g.fillStyle = '#3d3a38'; g.fillRect(0, 0, 1024, 1024); // asphalt base
  // district ground
  g.fillStyle = '#e8c98f'; g.fillRect(0, Z(200), 1024, 1024 - Z(200)); // beach sand
  g.fillStyle = '#7a8a5a'; g.fillRect(0, 0, 1024, Z(-200)); // hills grass
  g.fillStyle = '#6b6f72'; g.fillRect(0, 0, X(-200), 1024); // docks concrete
  // blocks: sidewalks
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    if (bz > 200 || bx < -200 || bz < -200) continue;
    g.fillStyle = districtAt(bx, bz) === 'downtown' ? '#8d8578' : '#7d7468';
    g.fillRect(X(bx - 33), Z(bz - 33), 66 * S, 66 * S);
  }
  // roads
  g.fillStyle = '#2e2c2e';
  for (const s of STREETS) { g.fillRect(X(s - 7), 0, 14 * S, 1024); g.fillRect(0, Z(s - 7), 1024, 14 * S); }
  // lane dashes
  g.fillStyle = '#c8b25a';
  for (const s of STREETS) for (let d = -300; d < 300; d += 24) {
    g.fillRect(X(d), Z(s) - 1, 10 * S, 2); g.fillRect(X(s) - 1, Z(d), 2, 10 * S);
  }
  // boardwalk + plaza
  g.fillStyle = '#a9805a'; g.fillRect(0, Z(196), 1024, 8 * S);
  g.fillStyle = '#9a8a6a'; g.fillRect(X(-33), Z(-33), 66 * S, 66 * S);
  g.strokeStyle = '#c8b25a'; g.lineWidth = 2; g.beginPath(); g.arc(X(0), Z(0), 18 * S, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function windowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#20242e'; g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 14) for (let x = 6; x < 58; x += 12) {
    g.fillStyle = Math.random() < 0.45 ? '#ffd27a' : '#2e3a4a';
    g.fillRect(x, y, 8, 9);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWorld(scene, seed) {
  const rng = mulberry(seed);
  const W = { rng, medallions: [], ramps: [], props: [], districtAt };
  scene.background = new THREE.Color(0xff9e5e);
  scene.fog = new THREE.Fog(0xff9e5e, 180, 620);
  const hemi = new THREE.HemisphereLight(0xffc98a, 0x3a2a3a, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.9);
  sun.position.set(-140, 180, 120); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.far = 600;
  scene.add(sun); W.sun = sun;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(640, 640), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // ocean south + harbour west
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x1a6f9e, roughness: 0.25, metalness: 0.35 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 260), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.4, 450); scene.add(sea);
  const har = new THREE.Mesh(new THREE.PlaneGeometry(260, 900), seaMat);
  har.rotation.x = -Math.PI / 2; har.position.set(-450, -0.4, 0); scene.add(har);

  // ---- buildings (instanced) ----
  const spots = [];
  // spawn spots, mission sites and the player car must stay clear of buildings
  const CLEAR = [[120, 200], [-80, -240], [40, 40], [-240, 40], [0, 260], [80, -240], [-40, 120], [0, 196], [-240, 240]];
  const palette = {
    downtown: [0x8a7f8d, 0x6f7d8a, 0x9a8a7a, 0x7a6a72, 0x5f6a7a],
    midtown: [0xb08a6a, 0x9a7a6a, 0x8a9a8a, 0xa8907a, 0x7a8a9a],
    beach: [0xe8b48a, 0xf0d0a0, 0xd8a0a0, 0xa0c8d8],
    hills: [0xc8a080, 0xb89a7a, 0xd0b090, 0xa89080],
    docks: [0x7a7a72, 0x8a7a6a, 0x6a6a62],
  };
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    const d = districtAt(bx, bz);
    if (d === 'beach' || (bx === 0 && bz === 0)) continue; // boardwalk + plaza stay open
    const n = d === 'downtown' ? 1 : d === 'docks' ? 2 : d === 'hills' ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const ox = (rng() - 0.5) * 44, oz = (rng() - 0.5) * 44;
      const w = d === 'downtown' ? 26 + rng() * 14 : d === 'docks' ? 34 : 12 + rng() * 14;
      const dep = d === 'downtown' ? 26 + rng() * 14 : d === 'docks' ? 18 : 12 + rng() * 12;
      const h = d === 'downtown' ? 42 + rng() * 58 : d === 'midtown' ? 12 + rng() * 22 : d === 'hills' ? 5 + rng() * 5 : d === 'docks' ? 9 : 8 + rng() * 8;
      const x = bx + ox, z = bz + oz;
      if (CLEAR.some(([cx, cz]) => Math.abs(x - cx) < w / 2 + 5 && Math.abs(z - cz) < dep / 2 + 5)) continue;
      spots.push({ x, z, w, d: dep, h, c: pick(rng, palette[d]), dist: d });
    }
  }
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const bMat = new THREE.MeshStandardMaterial({ map: windowTexture(), roughness: 0.85 });
  const inst = new THREE.InstancedMesh(bGeo, bMat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
  spots.forEach((s, i) => {
    pos.set(s.x, s.h / 2, s.z); sc.set(s.w, s.h, s.d);
    m4.compose(pos, q, sc); inst.setMatrixAt(i, m4);
    col.setHex(s.c); inst.setColorAt(i, col);
  });
  inst.castShadow = true; inst.receiveShadow = true; scene.add(inst);
  W.buildings = spots;

  // ---- props: palms, lights, containers, cranes ----
  const palmTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.45, 7, 5), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 }), 60);
  const palmTop = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2, 4.5, 6), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 }), 60);
  let pi = 0;
  for (let i = 0; i < 60; i++) {
    const x = -300 + rng() * 600, z = 205 + rng() * 90;
    pos.set(x, 3.5, z); sc.set(1, 1, 1); m4.compose(pos, q, sc);
    palmTrunk.setMatrixAt(pi, m4);
    pos.set(x, 8.2, z); m4.compose(pos, q, sc); palmTop.setMatrixAt(pi, m4);
    pi++;
  }
  scene.add(palmTrunk); scene.add(palmTop);
  const lightGeo = new THREE.CylinderGeometry(0.12, 0.12, 7, 5);
  const lights = new THREE.InstancedMesh(lightGeo, new THREE.MeshStandardMaterial({ color: 0x3a3a3a }), 48);
  const lampGeo = new THREE.SphereGeometry(0.5, 6, 5);
  const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 1.4 }), 48);
  let li = 0;
  for (const s of STREETS) for (const t of [-260, -100, 60, 220]) {
    if (li >= 48) break;
    pos.set(s + 8, 3.5, t); sc.set(1, 1, 1); m4.compose(pos, q, sc); lights.setMatrixAt(li, m4);
    pos.set(s + 8, 7.1, t); m4.compose(pos, q, sc); lamps.setMatrixAt(li, m4);
    li++;
  }
  scene.add(lights); scene.add(lamps);
  // docks containers + cranes
  const cont = new THREE.InstancedMesh(new THREE.BoxGeometry(12, 2.6, 2.6), new THREE.MeshStandardMaterial({ roughness: 0.9 }), 40);
  const contCols = [0xc25a3a, 0x3a7a5a, 0x3a5a8a, 0xc2a03a, 0x7a4a8a];
  for (let i = 0; i < 40; i++) {
    const x = -290 + rng() * 80, z = -280 + rng() * 560;
    pos.set(x, 1.3 + Math.floor(rng() * 2) * 2.6, z); sc.set(1, 1, 1);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() < 0.5 ? 0 : Math.PI / 2);
    m4.compose(pos, q, sc); cont.setMatrixAt(i, m4);
    col.setHex(pick(rng, contCols)); cont.setColorAt(i, col);
  }
  q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
  cont.castShadow = true; scene.add(cont);
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xd8a03a, roughness: 0.7 });
  for (const cz of [-120, 80]) {
    const cr = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2, 34, 2), craneMat);
    leg.position.set(0, 17, 0); cr.add(leg);
    const leg2 = leg.clone(); leg2.position.x = 12; cr.add(leg2);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(30, 2, 2), craneMat);
    arm.position.set(6, 33, 0); cr.add(arm);
    cr.position.set(-265, 0, cz); cr.castShadow = true; scene.add(cr);
  }
  // downtown billboard
  const bc = document.createElement('canvas'); bc.width = 256; bc.height = 128;
  const bg = bc.getContext('2d');
  bg.fillStyle = '#181028'; bg.fillRect(0, 0, 256, 128);
  bg.fillStyle = '#ffcf3d'; bg.font = 'bold 44px system-ui'; bg.textAlign = 'center'; bg.fillText('SOLMARA', 128, 58);
  bg.fillStyle = '#ff6b4a'; bg.font = 'bold 24px system-ui'; bg.fillText('HEAT • EST. 2026', 128, 96);
  const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace;
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), new THREE.MeshStandardMaterial({ map: bt, emissive: 0xffffff, emissiveMap: bt, emissiveIntensity: 0.5 }));
  bb.position.set(40, 26, -46); bb.rotation.y = Math.PI / 4; scene.add(bb);

  // ---- medallions (10) + stunt ramps (3) ----
  const medGeo = new THREE.TorusGeometry(1.1, 0.28, 8, 20);
  const medMat = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb300, emissiveIntensity: 1.2, metalness: 0.7, roughness: 0.3 });
  const medSpots = [[-240, 240], [200, 240], [-240, -240], [240, -240], [0, 0], [-120, 120], [160, -80], [-80, -160], [240, 80], [-280, 40]];
  for (const [x, z] of medSpots) {
    const m = new THREE.Mesh(medGeo, medMat);
    m.position.set(x, 2.2, z); m.rotation.y = rng() * 3; scene.add(m);
    W.medallions.push({ mesh: m, x, z, taken: false });
  }
  const rampMat = new THREE.MeshStandardMaterial({ color: 0xe86a2a, roughness: 0.8 });
  for (const [x, z, ry] of [[-40, 120, 0], [120, -40, Math.PI / 2], [0, 240, Math.PI]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 10), rampMat);
    r.position.set(x, 1.2, z); r.rotation.set(-0.42, ry, 0); r.castShadow = true; scene.add(r);
    W.ramps.push({ mesh: r, x, z, ry });
  }
  // garage + safehouse + bank markers (positions, meshes added by missions)
  W.spots = {
    garage: { x: 120, z: 200 }, safehouse: { x: -80, z: -240 }, bank: { x: 40, z: 40 },
    docks: { x: -240, z: 40 }, beach: { x: 0, z: 260 }, plaza: { x: 0, z: 0 },
    hills: { x: 80, z: -240 }, taxi: { x: -40, z: 120 },
  };
  W.step = function (dt, t) {
    for (const m of W.medallions) if (!m.taken) { m.mesh.rotation.y += dt * 1.5; m.mesh.position.y = 2.2 + Math.sin(t * 2 + m.x) * 0.3; }
  };
  return W;
}

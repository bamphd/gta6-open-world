// People: sidewalk pedestrians who flee danger, police officers on foot at roadblocks,
// and the police helicopter with its searchlight. All built from boxes.
import * as THREE from 'three';
import { mulberry, clamp, pick, dist2 } from './util.js';
import { STREETS } from './world.js';

function makePersonMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const sm = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), sm(pants));
  legs.position.y = 0.38; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34), sm(shirt));
  torso.position.y = 1.1; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), sm(skin));
  head.position.y = 1.66; g.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), sm(shirt));
  armL.position.set(-0.4, 1.1, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
  g.userData = { armL, armR, legs };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export { makePersonMesh };

export function createPeople(scene, seed) {
  const rng = mulberry(seed + 31);
  const P = { peds: [], officers: [], heli: null };
  const shirts = [0xd84a4a, 0x4a7ad8, 0xe8c23a, 0x4ad88a, 0xd88a4a, 0x9a5ad8, 0xd8d8d8, 0x3a3a3a];
  const skins = [0xe8b88a, 0xc08a5a, 0x8a5a3a, 0xf0c8a0];
  for (let i = 0; i < 26; i++) {
    const s = pick(rng, STREETS);
    const along = -280 + rng() * 560;
    const horiz = rng() < 0.5;
    const x = horiz ? along : s + (rng() < 0.5 ? 9 : -9);
    const z = horiz ? s + (rng() < 0.5 ? 9 : -9) : along;
    const mesh = makePersonMesh(pick(rng, shirts), 0x2a2a3a, pick(rng, skins));
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    P.peds.push({ mesh, x, z, heading: rng() * Math.PI * 2, speed: 1 + rng() * 0.9, state: 'walk', panic: 0, tx: x, tz: z });
  }
  P.step = function (dt, danger, player) {
    for (const p of P.peds) {
      const d = dist2(p.x, p.z, danger.x, danger.z);
      if (d < 900) p.panic = 1; // 30 m
      if (p.panic > 0) {
        p.panic = Math.max(0, p.panic - dt * 0.12);
        const away = Math.atan2(p.x - danger.x, p.z - danger.z);
        p.heading = away;
        p.speed = 4.2;
      } else {
        p.speed = 1.4;
        if (Math.hypot(p.tx - p.x, p.tz - p.z) < 2 || rng() < dt * 0.02) {
          const s = pick(rng, STREETS);
          const along = -280 + rng() * 560;
          const horiz = rng() < 0.5;
          p.tx = horiz ? along : s + 9; p.tz = horiz ? s + 9 : along;
        }
        p.heading = Math.atan2(p.tx - p.x, p.tz - p.z);
      }
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      p.x = clamp(p.x, -305, 305); p.z = clamp(p.z, -305, 305);
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      const swing = Math.sin(performance.now() * 0.008 * p.speed) * 0.5;
      p.mesh.userData.armL.rotation.x = swing;
      p.mesh.userData.armR.rotation.x = -swing;
    }
  };
  P.spawnOfficer = function (x, z) {
    const mesh = makePersonMesh(0x1a2a4a, 0x1a1a2a, pick(rng, skins));
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), new THREE.MeshStandardMaterial({ color: 0x101a2a }));
    cap.position.y = 1.86; mesh.add(cap);
    mesh.position.set(x, 0, z); scene.add(mesh);
    const o = { mesh, x, z, heading: 0, hp: 50 };
    P.officers.push(o);
    return o;
  };
  P.removeOfficer = function (o) {
    scene.remove(o.mesh);
    P.officers.splice(P.officers.indexOf(o), 1);
  };
  // helicopter
  const hg = new THREE.Group();
  const hbody = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 6.5), new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.4, metalness: 0.5 }));
  hbody.castShadow = true; hg.add(hbody);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  rotor.position.y = 1.1; hg.add(rotor);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.5), new THREE.MeshStandardMaterial({ color: 0x1a2a4a }));
  tail.position.set(0, 0.3, -5); hg.add(tail);
  const spot = new THREE.SpotLight(0xfff2b0, 0, 120, 0.35, 0.5);
  spot.position.set(0, -0.5, 1); hg.add(spot); hg.add(spot.target);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = -20; beam.rotation.x = Math.PI; hg.add(beam);
  hg.visible = false; scene.add(hg);
  P.heli = { mesh: hg, rotor, spot, beam, x: 0, z: 0, y: 55, state: 'off', tx: 0, tz: 0 };
  P.stepHeli = function (dt, t, target, active) {
    const h = P.heli;
    if (!active) { h.mesh.visible = false; h.state = 'off'; return; }
    h.mesh.visible = true;
    h.state = 'pursuit';
    h.tx = target.x; h.tz = target.z;
    const d = Math.hypot(h.tx - h.x, h.tz - h.z);
    const sp = d > 30 ? 26 : 12;
    if (d > 2) {
      h.x += ((h.tx - h.x) / d) * sp * dt;
      h.z += ((h.tz - h.z) / d) * sp * dt;
    }
    h.y = 55 + Math.sin(t * 0.7) * 4;
    h.mesh.position.set(h.x, h.y, h.z);
    h.mesh.rotation.y = Math.atan2(h.tx - h.x, h.tz - h.z);
    h.rotor.rotation.y += dt * 22;
    h.spot.target.position.set(h.tx - h.x, -h.y, h.tz - h.z);
    h.spot.intensity = 60;
    h.beam.material.opacity = 0.09 + Math.sin(t * 3) * 0.02;
  };
  return P;
}

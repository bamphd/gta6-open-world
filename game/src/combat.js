// Combat: three weapons, raycast shooting with tracers and muzzle flash, hit reactions,
// health/armor pickups, and enemy Gulls who shoot back.
import * as THREE from 'three';
import { clamp, dist2 } from './util.js';

export const WEAPONS = {
  pistol: { name: 'Pistol', dmg: 26, rate: 0.32, mag: 12, range: 90, spread: 0.012, auto: false, price: 0 },
  smg: { name: 'SMG', dmg: 15, rate: 0.09, mag: 30, range: 70, spread: 0.03, auto: true, price: 800 },
  shotgun: { name: 'Shotgun', dmg: 14, rate: 0.85, mag: 6, range: 42, spread: 0.075, auto: false, pellets: 7, price: 1500 },
};

export function createCombat(scene, audio) {
  const C = { enemies: [], pickups: [], tracers: [], flashes: [] };
  const tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
  function makeEnemyMesh() {
    const g = new THREE.Group();
    const sm = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), sm(0x2a2a2a)); legs.position.y = 0.38; g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34), sm(0x3a5a2a)); torso.position.y = 1.1; g.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.38), sm(0x1a1a1a)); vest.position.y = 1.15; g.add(vest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), sm(0xc08a5a)); head.position.y = 1.66; g.add(head);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), sm(0x111111)); gun.position.set(0.3, 1.25, 0.4); g.add(gun);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  C.spawnEnemy = function (x, z, hp) {
    const mesh = makeEnemyMesh();
    mesh.position.set(x, 0, z); scene.add(mesh);
    const e = { mesh, x, z, hp: hp || 60, maxHp: hp || 60, cooldown: 1 + Math.random(), flash: 0, dead: false };
    C.enemies.push(e);
    return e;
  };
  C.removeEnemy = function (e) { scene.remove(e.mesh); C.enemies.splice(C.enemies.indexOf(e), 1); };
  C.spawnPickup = function (kind, x, z) {
    const color = kind === 'health' ? 0x4ade80 : kind === 'armor' ? 0x60a5fa : 0xffd34d;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.4 }));
    mesh.position.set(x, 0.7, z); mesh.rotation.y = Math.PI / 4; scene.add(mesh);
    const p = { mesh, kind, x, z, taken: false };
    C.pickups.push(p);
    return p;
  };
  C.clearPickups = function () { for (const p of C.pickups) scene.remove(p.mesh); C.pickups = []; };
  function tracer(from, to) {
    const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    m.scale.z = len;
    m.lookAt(to.x, to.y, to.z);
    scene.add(m);
    C.tracers.push({ mesh: m, life: 0.07 });
  }
  function muzzle(pos) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), flashMat);
    f.position.copy(pos); scene.add(f);
    C.flashes.push({ mesh: f, life: 0.05 });
  }
  // Shoot one trigger pull. Returns {hit: enemy|car|'world'|null, point}.
  C.shoot = function (origin, dir, weapon, cars) {
    const pellets = weapon.pellets || 1;
    let best = null;
    for (let p = 0; p < pellets; p++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * weapon.spread * 2;
      d.y += (Math.random() - 0.5) * weapon.spread * 2;
      d.z += (Math.random() - 0.5) * weapon.spread * 2;
      d.normalize();
      const end = origin.clone().addScaledVector(d, weapon.range);
      let hitT = weapon.range, hitObj = null, hitPoint = end;
      for (const e of C.enemies) {
        if (e.dead) continue;
        const toE = new THREE.Vector3(e.x - origin.x, 1.2 - origin.y, e.z - origin.z);
        const along = toE.dot(d);
        if (along < 0 || along > hitT) continue;
        const perp = toE.clone().addScaledVector(d, -along).length();
        if (perp < 0.9) { hitT = along; hitObj = e; hitPoint = origin.clone().addScaledVector(d, along); }
      }
      for (const c of cars) {
        if (c.burning) continue;
        const toC = new THREE.Vector3(c.x - origin.x, 0.9 - origin.y, c.z - origin.z);
        const along = toC.dot(d);
        if (along < 0 || along > hitT) continue;
        const perp = toC.clone().addScaledVector(d, -along);
        const lx = Math.abs(perp.x * Math.cos(c.heading) - perp.z * Math.sin(c.heading));
        const lz = Math.abs(perp.x * Math.sin(c.heading) + perp.z * Math.cos(c.heading));
        if (lx < 1.3 && lz < 2.5) { hitT = along; hitObj = c; hitPoint = origin.clone().addScaledVector(d, along); }
      }
      tracer(origin, hitPoint);
      muzzle(origin.clone().addScaledVector(d, 1.2));
      if (hitObj) {
        hitObj.hp -= weapon.dmg;
        if (hitObj.flash !== undefined) hitObj.flash = 0.12;
        if (hitObj.hp <= 0) {
          if (hitObj.mesh.userData.wheels) { if (C.onCarDown) C.onCarDown(hitObj); }
          else hitObj.dead = true;
        }
        best = { hit: hitObj, point: hitPoint };
      }
    }
    audio.shot();
    return best;
  };
  C.step = function (dt, player, onEnemyShot) {
    for (const t of C.tracers) { t.life -= dt; if (t.life <= 0) { scene.remove(t.mesh); C.tracers.splice(C.tracers.indexOf(t), 1); } }
    for (const f of C.flashes) { f.life -= dt; if (f.life <= 0) { scene.remove(f.mesh); C.flashes.splice(C.flashes.indexOf(f), 1); } }
    for (const e of C.enemies) {
      if (e.dead) {
        e.mesh.rotation.x = Math.min(e.mesh.rotation.x + dt * 4, -Math.PI / 2);
        e.mesh.position.y = Math.max(e.mesh.position.y - dt * 0.2, 0.15);
        continue;
      }
      if (e.flash > 0) {
        e.flash -= dt;
        e.mesh.traverse((o) => { if (o.isMesh) o.material.emissive = new THREE.Color(0x881111); });
      } else {
        e.mesh.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissive = new THREE.Color(0x000000); });
      }
      // enemies shoot at the player when close and in the open
      e.cooldown -= dt;
      const d = Math.hypot(player.x - e.x, player.z - e.z);
      if (d < 55 && e.cooldown <= 0) {
        e.cooldown = 1.1 + Math.random() * 0.7;
        if (Math.random() < 0.55) onEnemyShot(e, d);
      }
      // face the player
      e.mesh.rotation.y = Math.atan2(player.x - e.x, player.z - e.z);
    }
    for (const p of C.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 0.7 + Math.sin(performance.now() * 0.004 + p.x) * 0.15;
      const d = dist2(p.x, p.z, player.x, player.z);
      if (d < 4) { p.taken = true; scene.remove(p.mesh); p.got = true; }
    }
  };
  return C;
}

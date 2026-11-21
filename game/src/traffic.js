// Vehicles: arcade driving, traffic AI on the street grid, parked cars, damage and wrecks.
// A car is a group of boxes; physics is heading + speed with steering, drift and ramps.
import * as THREE from 'three';
import { mulberry, clamp, pick, dist2 } from './util.js';
import { STREETS } from './world.js';

const CAR_COLORS = [0xc23a2e, 0x2e6fc2, 0xd8c23a, 0x3a8a5a, 0x8a4a9a, 0xd8d8d8, 0x2a2a2e, 0xe88a2a, 0x5a8a8a];

export function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.15, metalness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), body);
  base.position.y = 0.55; base.castShadow = true; g.add(base);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2), glass);
  cab.position.set(0, 1.2, -0.2); cab.castShadow = true; g.add(cab);
  if (kind === 'cop') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.62, -0.2); g.add(bar);
    g.userData.lightL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 }));
    g.userData.lightL.position.set(-0.35, 1.62, -0.2); g.add(g.userData.lightL);
    g.userData.lightR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), new THREE.MeshStandardMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 2 }));
    g.userData.lightR.position.set(0.35, 1.62, -0.2); g.add(g.userData.lightR);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 4.42), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    stripe.position.y = 0.55; g.add(stripe);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  g.userData.wheels = [];
  for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w); g.userData.wheels.push(w);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.1), new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffedb0, emissiveIntensity: 1.2 }));
  hl.position.set(0, 0.62, 2.22); g.add(hl);
  return g;
}

export function createTraffic(scene, seed, world) {
  const rng = mulberry(seed + 7);
  const T = { cars: [], parked: [], rng };
  const kinds = ['sedan', 'sedan', 'taxi', 'truck', 'sport'];
  function spawnCar(x, z, heading, kind, color, parked) {
    const mesh = makeCarMesh(color !== undefined ? color : pick(rng, CAR_COLORS), kind === 'cop' ? 'cop' : 'car');
    mesh.position.set(x, 0, z); mesh.rotation.y = heading;
    scene.add(mesh);
    const car = { mesh, x, z, heading, speed: 0, kind: kind || 'sedan', hp: 100, maxHp: 100, parked: !!parked, burning: false, smoke: 0, driver: null, target: null, stuck: 0 };
    (parked ? T.parked : T.cars).push(car);
    return car;
  }
  // traffic on the grid
  for (let i = 0; i < 14; i++) {
    const s = pick(rng, STREETS);
    const along = -280 + rng() * 560;
    const horiz = rng() < 0.5;
    spawnCar(horiz ? along : s, horiz ? s : along, horiz ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2), pick(rng, kinds));
  }
  // parked cars along curbs (stealable)
  for (let i = 0; i < 10; i++) {
    const s = pick(rng, STREETS);
    const along = -260 + rng() * 520;
    const horiz = rng() < 0.5;
    spawnCar(horiz ? along : s + 9, horiz ? s + 9 : along, horiz ? 0 : Math.PI / 2, pick(rng, kinds), undefined, true);
  }
  // the player's ride: orange muscle car by the garage
  T.playerCar = spawnCar(world.spots.garage.x - 6, world.spots.garage.z + 8, Math.PI / 2, 'sport', 0xe86a1a, true);
  T.playerCar.owned = true;

  // a Gull sedan looping downtown (tail job)
  T.spawnTail = function () {
    const c = spawnCar(40, -40, 0, 'sedan', 0x2a4a2a);
    c.route = [[40, -40], [120, -40], [120, 40], [40, 40]];
    c.top = 13;
    return c;
  };
  // a Gulls convoy patrolling the coast road (convoy job)
  T.spawnConvoy = function () {
    const lead = spawnCar(280, 200, Math.PI, 'truck', 0x3a3a3a);
    lead.route = [[280, 200], [-280, 200]];
    lead.top = 12; lead.hp = 160; lead.maxHp = 160;
    lead.mesh.scale.set(1.25, 1.25, 1.4);
    const e1 = spawnCar(292, 200, Math.PI, 'sedan', 0x2a4a2a);
    e1.route = [[280, 200], [-280, 200]]; e1.top = 12;
    const e2 = spawnCar(304, 200, Math.PI, 'sedan', 0x2a4a2a);
    e2.route = [[280, 200], [-280, 200]]; e2.top = 12;
    return lead;
  };

  function nearestStreet(v) {
    let best = STREETS[0], bd = 1e9;
    for (const s of STREETS) { const d = Math.abs(v - s); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  function onRoad(x, z) {
    return STREETS.some((s) => Math.abs(x - s) < 8) || STREETS.some((s) => Math.abs(z - s) < 8);
  }
  T.step = function (dt, player, police) {
    for (const c of T.cars) {
      if (c.burning) { c.speed = 0; continue; }
      if (c.route) {
        const wp = c.route[c.ri || 0];
        const dx = wp[0] - c.x, dz = wp[1] - c.z;
        if (Math.hypot(dx, dz) < 8) c.ri = ((c.ri || 0) + 1) % c.route.length;
        const wantH = Math.atan2(dx, dz);
        let dh = wantH - c.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        driveCar(c, dt, 1, clamp(dh * 1.5, -1, 1), false, c.top || 13);
        continue;
      }
      // simple grid driver: keep to its street, turn at intersections, avoid the car ahead
      let tx = c.x + Math.sin(c.heading) * 30, tz = c.z + Math.cos(c.heading) * 30;
      let blocked = false;
      for (const o of T.cars) {
        if (o === c || o.burning) continue;
        const d = dist2(c.x, c.z, o.x, o.z);
        if (d < 64 && Math.abs(Math.atan2(o.x - c.x, o.z - c.z) - c.heading) < 0.6) { blocked = true; break; }
      }
      const want = blocked ? 0 : 9 + rng() * 3;
      c.speed = clamp(c.speed + (want - c.speed) * dt * 0.8, 0, 16);
      // turn at intersections sometimes
      const nearX = nearestStreet(c.x), nearZ = nearestStreet(c.z);
      if (Math.abs(c.x - nearX) < 2 && Math.abs(c.z - nearZ) < 2 && rng() < dt * 0.5) {
        c.heading += (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      if (c.x < -305) c.x = -305; if (c.x > 305) c.x = 305;
      if (c.z < -305) c.z = -305; if (c.z > 305) c.z = 305;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      for (const w of c.mesh.userData.wheels) w.rotation.x += c.speed * dt * 2;
    }
    // wreck smoke
    for (const c of [...T.cars, ...T.parked]) {
      if (c.burning) {
        c.smoke += dt;
        c.mesh.position.y = Math.sin(c.smoke * 9) * 0.03;
      }
    }
  };
  T.damage = function (car, amount) {
    car.hp -= amount;
    if (car.hp <= 0 && !car.burning) {
      car.burning = true; car.speed = 0;
      const fire = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 4.6), new THREE.MeshStandardMaterial({ color: 0x331a08, emissive: 0xff5a00, emissiveIntensity: 0.9, transparent: true, opacity: 0.85 }));
      fire.position.y = 1.2; car.mesh.add(fire); car.fire = fire;
      return true;
    }
    return false;
  };
  T.nearestParked = function (x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const c of T.parked) {
      if (c.burning) continue;
      const d = dist2(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  T.nearestCar = function (x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const c of T.cars) {
      if (c.burning) continue;
      const d = dist2(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  return T;
}

// Arcade car control shared by the player and police cruisers.
export function driveCar(car, dt, throttle, steer, handbrake, topSpeed) {
  const accel = 22, brake = 34, drag = 0.6;
  if (throttle > 0) car.speed += accel * throttle * dt;
  else if (throttle < 0) car.speed += (car.speed > 0.5 ? -brake : -9) * dt;
  else car.speed -= car.speed * drag * dt;
  if (handbrake) car.speed -= car.speed * 2.4 * dt;
  car.speed = clamp(car.speed, -9, topSpeed);
  const grip = handbrake ? 1.6 : 1;
  car.heading += steer * clamp(Math.abs(car.speed) / 9, 0, 1) * 1.9 * grip * dt * (car.speed < 0 ? -1 : 1);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  car.x = clamp(car.x, -308, 308); car.z = clamp(car.z, -308, 308);
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2;
  return Math.abs(car.speed);
}

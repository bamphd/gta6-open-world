// Wanted: 0-5 stars. Crimes raise heat; cruisers pursue and ram; at 3+ roadblocks appear
// ahead of the player; at 4+ the helicopter joins. Break line of sight to enter the search
// phase, then the heat cools. On foot, a close cop can bust you.
import { makeCarMesh, driveCar } from './traffic.js';
import { clamp, dist2 } from './util.js';
import { STREETS } from './world.js';

const LEVEL_HEAT = [0, 25, 50, 75, 105, 140];
const COPS_AT = [0, 1, 2, 3, 4, 5];

export function createPolice(scene, traffic, people) {
  const P = { level: 0, heat: 0, cruisers: [], blocks: [], lastSeen: { x: 0, z: 0 }, unseen: 0, searching: false, searchT: 0, dispatch: '', dispatchT: 0, bustT: 0 };
  function spawnCruiser(x, z) {
    const mesh = makeCarMesh(0x1a1a1a, 'cop');
    mesh.position.set(x, 0, z); scene.add(mesh);
    const c = { mesh, x, z, heading: 0, speed: 0, hp: 120, maxHp: 120, kind: 'cop', burning: false, smoke: 0, parked: false };
    P.cruisers.push(c);
    traffic.cars.push(c);
    return c;
  }
  function spawnRoadblock(x, z, heading) {
    const grp = { cars: [], officers: [], x, z };
    for (const off of [-5, 0, 5]) {
      const cx = x + Math.cos(heading) * off, cz = z - Math.sin(heading) * off;
      const mesh = makeCarMesh(0x1a1a1a, 'cop');
      mesh.position.set(cx, 0, cz); mesh.rotation.y = heading + Math.PI / 2; scene.add(mesh);
      const c = { mesh, x: cx, z: cz, heading: heading + Math.PI / 2, speed: 0, hp: 120, maxHp: 120, kind: 'cop', burning: false, smoke: 0, parked: true };
      grp.cars.push(c);
      traffic.cars.push(c);
    }
    grp.officers.push(people.spawnOfficer(x + 8, z + 4));
    grp.officers.push(people.spawnOfficer(x - 8, z - 4));
    P.blocks.push(grp);
    return grp;
  }
  function clearBlocks() {
    for (const b of P.blocks) {
      for (const c of b.cars) { scene.remove(c.mesh); const i = traffic.cars.indexOf(c); if (i >= 0) traffic.cars.splice(i, 1); }
      for (const o of b.officers) people.removeOfficer(o);
    }
    P.blocks = [];
  }
  P.addHeat = function (n, px, pz) {
    P.heat = clamp(P.heat + n, 0, 170);
    P.lastSeen.x = px; P.lastSeen.z = pz;
    P.unseen = 0; P.searching = false;
  };
  P.say = function (msg) { P.dispatch = msg; P.dispatchT = 4; };
  P.step = function (dt, t, player, inCar) {
    // level from heat
    let lv = 0;
    for (let i = 5; i >= 1; i--) if (P.heat >= LEVEL_HEAT[i]) { lv = i; break; }
    if (lv !== P.level) {
      P.level = lv;
      if (lv > 0) P.say(lv >= 4 ? `Dispatch: AIR SUPPORT over Solmara. All units converge.` : lv >= 3 ? `Dispatch: roadblocks on the ${lv}-star suspect.` : `Dispatch: units responding, ${lv} star${lv > 1 ? 's' : ''}.`);
    }
    if (P.dispatchT > 0) P.dispatchT -= dt;
    // spawn / despawn cruisers
    const want = COPS_AT[P.level];
    while (P.cruisers.length < want) {
      const a = Math.random() * Math.PI * 2;
      spawnCruiser(player.x + Math.sin(a) * 130, player.z + Math.cos(a) * 130);
    }
    while (P.cruisers.length > want) {
      const c = P.cruisers.pop();
      scene.remove(c.mesh);
      const i = traffic.cars.indexOf(c); if (i >= 0) traffic.cars.splice(i, 1);
    }
    // roadblocks at 3+
    if (P.level >= 3 && P.blocks.length === 0) {
      const ahead = player.heading;
      spawnRoadblock(player.x + Math.sin(ahead) * 90, player.z + Math.cos(ahead) * 90, ahead);
      P.say('Dispatch: roadblock ahead. Stop the suspect.');
    }
    if (P.level < 3 && P.blocks.length > 0) clearBlocks();
    // pursuit
    const seen = P.level > 0 && dist2(player.x, player.z, P.lastSeen.x, P.lastSeen.z) < 40000;
    for (const c of P.cruisers) {
      if (c.burning) continue;
      const tx = P.searching ? P.lastSeen.x : player.x;
      const tz = P.searching ? P.lastSeen.z : player.z;
      const d = Math.hypot(tx - c.x, tz - c.z);
      const wantHeading = Math.atan2(tx - c.x, tz - c.z);
      let dh = wantHeading - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = clamp(dh * 1.4, -1, 1);
      const top = P.level >= 4 ? 30 : 26;
      driveCar(c, dt, d > 6 ? 1 : 0, steer, false, top);
      // ram the player
      if (dist2(c.x, c.z, player.x, player.z) < 16 && inCar) {
        player.carDamage = (player.carDamage || 0) + 8 * dt;
      }
      // cop lights
      const blink = Math.floor(t * 6) % 2 === 0;
      if (c.mesh.userData.lightL) c.mesh.userData.lightL.material.emissiveIntensity = blink ? 3 : 0.2;
      if (c.mesh.userData.lightR) c.mesh.userData.lightR.material.emissiveIntensity = blink ? 0.2 : 3;
    }
    // line of sight / escape
    if (P.level > 0) {
      const nearest = P.cruisers.length ? Math.min(...P.cruisers.map((c) => Math.hypot(c.x - player.x, c.z - player.z))) : 999;
      const heliNear = people.heli.state !== 'off';
      if (nearest > 70 && !heliNear) {
        P.unseen += dt;
        if (P.unseen > 4 && !P.searching) { P.searching = true; P.searchT = 10; P.say('Dispatch: suspect lost. Searching last known position.'); }
      } else {
        P.unseen = 0; P.searching = false;
        P.lastSeen.x = player.x; P.lastSeen.z = player.z;
      }
      if (P.searching) {
        P.searchT -= dt;
        P.heat -= dt * 3.2;
        if (P.searchT <= 0) { P.searching = false; P.heat = Math.max(0, P.heat - 20); P.say('Dispatch: search called off. Stay sharp.'); }
      } else {
        P.heat -= dt * 0.35;
      }
    } else {
      P.heat = Math.max(0, P.heat - dt * 2);
    }
    // bust: on foot, a cruiser or officer very close while slow
    P.bustT = 0;
    if (P.level > 0 && !inCar) {
      for (const c of P.cruisers) {
        if (dist2(c.x, c.z, player.x, player.z) < 9 && Math.abs(player.speed || 0) < 1) P.bustT += dt;
      }
      for (const b of P.blocks) for (const o of b.officers) {
        if (dist2(o.x, o.z, player.x, player.z) < 9) P.bustT += dt;
      }
    }
    return P.bustT > 1.6;
  };
  // Staged placement (screenshots / tests): a cruiser or a roadblock at exact coordinates.
  P.placeCruiser = function (x, z, heading) {
    const c = spawnCruiser(x, z);
    c.heading = heading; c.mesh.rotation.y = heading;
    return c;
  };
  P.placeBlock = function (x, z, heading) { return spawnRoadblock(x, z, heading); };
  P.reset = function () {    P.level = 0; P.heat = 0; P.searching = false; P.unseen = 0;
    for (const c of P.cruisers) { scene.remove(c.mesh); const i = traffic.cars.indexOf(c); if (i >= 0) traffic.cars.splice(i, 1); }
    P.cruisers = [];
    clearBlocks();
  };
  return P;
}

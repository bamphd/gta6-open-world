// Screenshot scenes (?shot=cover|combat|chase|finale&seed=N). Each stages a real frame of the
// game — actors placed, a few sim steps run, camera set — then the page paints it twice and
// sets window.__shotReady. Same seed, same frame.
import * as THREE from 'three';
import { clamp } from './util.js';

function reset(G) {
  for (const e of [...G.combat.enemies]) G.combat.removeEnemy(e);
  G.combat.clearPickups();
  G.police.reset();
  G.people.heli.state = 'off';
  G.people.heli.mesh.visible = false;
  const P = G.player;
  P.health = 100; P.armor = 50; P.weapon = 'pistol'; P.ammo = 12; P.reloading = false;
  P.onFoot = true; P.car = null; P.speed = 0; P.aiming = false;
  G.save.cash = 1250;
  G.missions.current = null; G.missions.markerPos = null;
  G.shotObjective = null;
}

function sim(G, seconds) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds / dt; i++) {
    G.traffic.step(dt, G.player, G.police);
    G.people.step(dt, G.player, G.player);
    G.world.step(dt, i * dt);
  }
}

export function stageShot(G, name) {
  reset(G);
  const P = G.player;
  if (name === 'combat') {
    // Docks warehouse shootout: Rook on foot by a stolen car, Gulls ahead, one down.
    P.x = -232; P.z = 132; P.heading = Math.PI * 0.7; P.aiming = true;
    const car = G.traffic.nearestParked(P.x, P.z, 40);
    if (car) { car.x = -228; car.z = 138; car.heading = Math.PI / 2; car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.heading; }
    const e1 = G.combat.spawnEnemy(-244, 118, 60);
    const e2 = G.combat.spawnEnemy(-236, 108, 60);
    const e3 = G.combat.spawnEnemy(-248, 128, 60);
    e3.dead = true; e3.mesh.rotation.x = -Math.PI / 2; e3.mesh.position.y = 0.15;
    G.police.addHeat(40, P.x, P.z);
    G.police.level = 1; // level is derived in police.step, which never runs in shot mode
    G.shotObjective = 'Dockside: clear the warehouse guards (1/4)';
    G.shotCam = { pos: [-216, 9, 148], look: [-242, 1.5, 118] };
    sim(G, 1.2);
  } else if (name === 'chase') {
    // Coast-road chase, camera low behind Rook's car looking west: hero car centre,
    // an interceptor in the oncoming lane, roadblock ahead, heli above it.
    const car = G.traffic.playerCar;
    car.x = 60; car.z = 200; car.heading = -Math.PI / 2; car.speed = 24;
    car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.heading;
    P.car = car; P.onFoot = false; P.x = car.x; P.z = car.z; P.heading = car.heading;
    G.police.addHeat(120, P.x, P.z);
    G.police.level = 4; // level is derived in police.step, which never runs in shot mode
    G.police.placeCruiser(80, 196, -Math.PI / 2);
    G.police.placeCruiser(88, 204, -Math.PI / 2);
    G.police.placeCruiser(30, 206, Math.PI / 2);
    G.police.placeBlock(0, 200, Math.PI);
    G.people.heli.x = -10; G.people.heli.z = 195;
    G.people.stepHeli(0.1, 1.5, P, true);
    G.shotObjective = 'The Getaway: survive the dragnet — 41s';
    G.shotCam = { pos: [85, 7, 205], look: [-10, 12, 198] };
    sim(G, 0.8);
    P.car = car; P.x = car.x; P.z = car.z;
  } else if (name === 'finale') {
    // Bank of Solmara heist: crew on the steps, Gulls falling, cruisers closing, cash on the ground.
    P.x = 34; P.z = 52; P.heading = -Math.PI * 0.25; P.aiming = true;
    const e1 = G.combat.spawnEnemy(48, 32, 60);
    const e2 = G.combat.spawnEnemy(30, 28, 60);
    const e3 = G.combat.spawnEnemy(56, 44, 60);
    e2.dead = true; e2.mesh.rotation.x = -Math.PI / 2; e2.mesh.position.y = 0.15;
    G.combat.spawnPickup('health', 38, 46);
    G.combat.spawnPickup('armor', 44, 50);
    G.police.addHeat(80, P.x, P.z);
    G.police.level = 3; // level is derived in police.step, which never runs in shot mode
    G.police.placeCruiser(70, 60, Math.PI * 0.75);
    G.police.placeCruiser(20, 64, Math.PI * 0.25);
    G.shotObjective = 'Bank of Solmara: hold the steps (2/8 down)';
    G.shotCam = { pos: [18, 10, 68], look: [42, 1.5, 36] };
    sim(G, 1.0);
  } else {
    // cover: coastal intersection at the boardwalk — player, traffic, pedestrians, towers.
    P.x = 2; P.z = 196; P.heading = -0.4; P.aiming = false;
    const car = G.traffic.playerCar;
    car.x = 10; car.z = 192; car.heading = -0.3;
    car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.heading;
    G.shotObjective = 'Next job: Hotwire — follow the gold V';
    G.beaconPos = { x: 60, z: 200 };
    G.shotCam = { pos: [-22, 15, 224], look: [16, 2, 168] };
    sim(G, 2.0);
  }
  G.shot = name;
  G.playerMesh.position.set(P.x, 0, P.z);
  G.playerMesh.rotation.y = P.heading;
  G.playerMesh.visible = P.onFoot;
  if (G.beaconPos) { G.beacon.position.set(G.beaconPos.x, 30, G.beaconPos.z); G.beaconRing.position.set(G.beaconPos.x, 0.3, G.beaconPos.z); }
  else { G.beacon.visible = false; G.beaconRing.visible = false; }
  return { screen: 'play' };
}

// SOLMARA HEAT v2 — boot, input, camera, player, screens and the fixed-step loop.
// The game object G is shared by every module. ?shot=name stages a screenshot scene.
import * as THREE from 'three';
import { mulberry, clamp, lerp, loadSave, storeSave, dist2 } from './util.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createTraffic, driveCar } from './traffic.js';
import { createPeople, makePersonMesh } from './people.js';
import { createCombat, WEAPONS } from './combat.js';
import { createPolice } from './police.js';
import { createMissions, SAVE_KEY, UPGRADES } from './missions.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') || '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const audio = createAudio();
const world = createWorld(scene, seed);
const traffic = createTraffic(scene, seed, world);
const people = createPeople(scene, seed);
const combat = createCombat(scene, audio);
combat.onCarDown = (car) => traffic.damage(car, 1);
const police = createPolice(scene, traffic, people);
const hud = createHud();

const save = loadSave(SAVE_KEY) || { cash: 250, rep: { beach: 0, downtown: 0, docks: 0, hills: 0, midtown: 0 }, upgrades: [], done: [], medallions: [], best: 0 };
save.rep = Object.assign({ beach: 0, downtown: 0, docks: 0, hills: 0, midtown: 0 }, save.rep);
save.upgrades = save.upgrades || []; save.done = save.done || []; save.medallions = save.medallions || [];

const G = {
  scene, camera, renderer, world, traffic, people, combat, police, hud, audio, save,
  weapons: WEAPONS, sayText: '', hint: '', shot: null, shotCam: null, shotObjective: null, farePos: null,
  persist() { storeSave(SAVE_KEY, save); },
  say(text, secs) { G.sayText = text; setTimeout(() => { if (G.sayText === text) G.sayText = ''; }, (secs || 4) * 1000); },
  showMissionEnd(title, text) {
    document.getElementById('mis-title').textContent = title;
    document.getElementById('mis-text').textContent = text;
    showScreen('mission');
  },
};
const missions = createMissions(G);
G.missions = missions;
G.player = {
  x: 2, z: 196, y: 0, heading: 0, speed: 0, onFoot: true, car: null, vy: 0, air: 0,
  health: 100, armor: 0, weapon: 'pistol', ammo: 12, reloading: false, reloadT: 0, fireT: 0, aiming: false,
};
const P = G.player;
const pMesh = makePersonMesh(0xe86a1a, 0x2a2a3a, 0xe8b88a);
pMesh.position.set(P.x, 0, P.z);
scene.add(pMesh);
G.playerMesh = pMesh;
// medallions already taken
for (const i of save.medallions) if (world.medallions[i]) { world.medallions[i].taken = true; scene.remove(world.medallions[i].mesh); }

// mission start marker (gold V beacon) + garage/safehouse beacons
const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.85 });
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 60, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
beacon.position.y = 30;
const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.25, 8, 24), beaconMat);
beaconRing.rotation.x = Math.PI / 2; beaconRing.position.y = 0.3;
scene.add(beacon); scene.add(beaconRing);
G.beacon = beacon; G.beaconRing = beaconRing;

// ---- input ----
const keys = {};
const pressed = {}; // one-shot action keys, consumed by step() so quick taps are never lost
let camYaw = 0.6, camPitch = 0.32, camDist = 10, mouseDown = false, aiming = false, clickQueued = false;
let dragX = 0, dragY = 0, dragging = false;
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  keys[e.code] = true; pressed[e.code] = true;
  if (e.code === 'KeyM') { const m = audio.toggleMute(); hud.toast(m ? 'Muted' : 'Sound on'); }
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (e.button === 2) aiming = true;
  else if (e.button === 0) { mouseDown = true; clickQueued = true; dragging = true; dragX = e.clientX; dragY = e.clientY; }
});
window.addEventListener('pointerup', (e) => {
  if (e.button === 2) aiming = false;
  if (e.button === 0) { mouseDown = false; dragging = false; }
});
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  camYaw -= (e.clientX - dragX) * 0.004 * G.sen;
  camPitch = clamp(camPitch + (e.clientY - dragY) * 0.003 * G.sen, 0.05, 1.1);
  dragX = e.clientX; dragY = e.clientY;
});
window.addEventListener('wheel', (e) => { camDist = clamp(camDist + Math.sign(e.deltaY), 5, 18); }, { passive: true });
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
G.sen = 1;

// ---- screens ----
let screen = 'title';
const screens = ['title', 'how', 'set', 'pause', 'over', 'mission', 'career'];
function showScreen(name) {
  screen = name;
  for (const k in pressed) pressed[k] = false; clickQueued = false; // stale taps never fire later
  for (const s of screens) document.getElementById('scr-' + s).classList.toggle('on', s === name);
  hud.show(name === 'play' || name === 'pause');
  status.textContent = name === 'play' ? 'Playing SOLMARA HEAT.' : name;
}
function bind(id, fn) { document.getElementById(id).addEventListener('click', () => { audio.unlock(); fn(); }); }
bind('btn-play', () => { showScreen('play'); });
bind('btn-how', () => showScreen('how'));
bind('btn-how-back', () => showScreen('title'));
bind('btn-set', () => showScreen('set'));
bind('btn-set-back', () => showScreen('title'));
bind('btn-resume', () => showScreen('play'));
bind('btn-quit', () => { resetRun(); showScreen('title'); });
bind('btn-again', () => { resetRun(); showScreen('play'); });
bind('btn-mis-ok', () => showScreen('play'));
bind('btn-career-ok', () => showScreen('play'));
document.getElementById('set-vol').addEventListener('input', (e) => { audio.setVolume(e.target.value / 100); document.getElementById('set-vol-v').textContent = e.target.value; });
document.getElementById('set-sen').addEventListener('input', (e) => { G.sen = e.target.value / 100; document.getElementById('set-sen-v').textContent = e.target.value; });
document.getElementById('set-q').addEventListener('change', (e) => {
  const low = e.target.value === 'low';
  renderer.shadowMap.enabled = !low;
  renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 2));
});

function resetRun() {
  P.x = 2; P.z = 196; P.heading = 0; P.health = 100; P.armor = save.upgrades.includes('safehouse') ? 50 : 0;
  P.onFoot = true; P.car = null; P.weapon = 'pistol'; P.ammo = 12;
  police.reset();
  missions.current = null;
  pMesh.position.set(P.x, 0, P.z);
}

// ---- career screen ----
function openCareer() {
  const done = save.done.length;
  const rep = missions.totalRep();
  document.getElementById('career-text').textContent = `Cash $${save.cash} · Jobs done ${done}/9 · Reputation ${rep} (beach ${save.rep.beach}, downtown ${save.rep.downtown}, docks ${save.rep.docks}, hills ${save.rep.hills}) · Medallions ${save.medallions.length}/10`;
  const shop = document.getElementById('career-shop');
  shop.innerHTML = '';
  for (const u of UPGRADES) {
    const owned = save.upgrades.includes(u.id);
    const locked = u.need && !save.upgrades.includes(u.need);
    const row = document.createElement('div');
    row.innerHTML = `<b>${u.name} — $${u.price}</b><span>${owned ? 'OWNED' : locked ? 'Needs ' + u.need : u.desc} ${!owned && !locked ? '<button data-u="' + u.id + '">BUY</button>' : ''}</span>`;
    shop.appendChild(row);
  }
  shop.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    if (missions.buy(b.dataset.u)) { audio.cash(); openCareer(); }
    else hud.toast('Not enough cash or missing requirement.');
  }));
  showScreen('career');
}

// ---- helpers ----
function buildingHit(x, z, pad) {
  for (const b of world.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad) return b;
  }
  return null;
}
function damagePlayer(n) {
  const absorbed = Math.min(P.armor, n * 0.6);
  P.armor -= absorbed;
  P.health -= (n - absorbed);
  if (P.health <= 0) {
    P.health = 0;
    audio.fail();
    document.getElementById('over-title').textContent = 'WASTED';
    document.getElementById('over-text').textContent = 'Rook went down in Solmara. The city keeps your cash — minus $200 in hospital bills.';
    save.cash = Math.max(0, save.cash - 200); G.persist();
    showScreen('over');
  }
}
function useKey() {
  // enter car FIRST: the garage car parks inside the garage trigger radius,
  // so the garage check must not shadow it (career also opens with C)
  const dGar = Math.hypot(P.x - 120, P.z - 200);
  const dSafe = Math.hypot(P.x + 80, P.z + 240);
  if (P.onFoot) {
    let c = null;
    const pc = traffic.playerCar;
    if (pc && !pc.burning && dist2(P.x, P.z, pc.x, pc.z) < 4.5 * 4.5) c = pc;
    else c = traffic.nearestParked(P.x, P.z, 4.5);
    if (c) {
      P.car = c; P.onFoot = false;
      pMesh.visible = false;
      const pi = traffic.parked.indexOf(c);
      if (pi >= 0) traffic.parked.splice(pi, 1);
      c.hp = missions.carHp(); c.maxHp = missions.carHp();
      if (missions.current && missions.current.stages[missions.stageIdx] && missions.current.stages[missions.stageIdx].type === 'steal' && c === missions.stealTarget) {
        police.addHeat(10, P.x, P.z);
      }
      hud.toast('Car jacked. Drive!');
      return;
    }
  }
  if (P.onFoot && dGar < 12) {
    const n = missions.next();
    if (n) { missions.start(n.id); return; } // gold V at the garage starts the next job
    openCareer(); return;
  }
  if (P.onFoot && dSafe < 12) {
    P.health = 100; P.armor = 50; G.persist();
    hud.toast('Safehouse: healed and saved.'); audio.pickup();
    return;
  }
  if (!P.onFoot) {
    // exit car
    const c = P.car;
    P.car = null; P.onFoot = true;
    pMesh.visible = true;
    P.x = c.x + Math.sin(c.heading + Math.PI / 2) * 3;
    P.z = c.z + Math.cos(c.heading + Math.PI / 2) * 3;
    c.speed = 0;
    traffic.parked.push(c);
  }
}

// taxi fares
const fare = { state: 'idle', t: 15, x: 0, z: 0, dx: 0, dz: 0, ped: null };
function stepFare(dt) {
  if (!P.car || screen !== 'play') { if (fare.state !== 'idle') { fare.state = 'idle'; G.farePos = null; } return; }
  if (fare.state === 'idle') {
    fare.t -= dt;
    if (fare.t <= 0) {
      const s = [-280, -200, -120, -40, 40, 120, 200, 280][Math.floor(Math.random() * 8)];
      fare.x = clamp(P.x + (Math.random() - 0.5) * 160, -280, 280);
      fare.z = s;
      fare.state = 'pickup'; G.farePos = { x: fare.x, z: fare.z };
      hud.toast('Taxi fare waiting — follow the green $.');
    }
    return;
  }
  if (fare.state === 'pickup') {
    if (Math.hypot(P.x - fare.x, P.z - fare.z) < 9) {
      fare.dx = clamp(P.x + (Math.random() - 0.5) * 300, -280, 280);
      fare.dz = clamp(P.z + (Math.random() - 0.5) * 300, -280, 280);
      fare.state = 'drop'; G.farePos = { x: fare.dx, z: fare.dz };
      hud.toast('Passenger in. Drive to the drop-off.');
    }
  } else if (fare.state === 'drop') {
    if (Math.hypot(P.x - fare.dx, P.z - fare.dz) < 10) {
      const pay = 50 + Math.floor(Math.random() * 100);
      save.cash += pay; G.persist(); audio.cash();
      hud.toast(`Fare complete: +$${pay}`);
      fare.state = 'idle'; fare.t = 18 + Math.random() * 20; G.farePos = null;
    }
  }
}

// ---- per-step update ----
function step(dt, t) {
  let inCar = !P.onFoot && P.car;
  // pause / career toggles (queued presses so quick taps are never lost)
  if (pressed['KeyP'] || pressed['Escape']) { if (screen === 'play') showScreen('pause'); else if (screen === 'pause') showScreen('play'); }
  pressed['KeyP'] = pressed['Escape'] = false;
  if (pressed['KeyC'] && screen === 'play') openCareer();
  pressed['KeyC'] = false;
  if (screen !== 'play') { pressed['KeyQ'] = pressed['KeyR'] = pressed['KeyE'] = false; return; }
  P.aiming = aiming && P.onFoot;
  // weapons
  if (keys['Digit1']) P.weapon = 'pistol';
  if (keys['Digit2'] && missions.hasWeapon('smg')) P.weapon = 'smg';
  if (keys['Digit3'] && missions.hasWeapon('shotgun')) P.weapon = 'shotgun';
  if (pressed['KeyQ']) {
    const order = ['pistol', 'smg', 'shotgun'].filter((w) => missions.hasWeapon(w));
    P.weapon = order[(order.indexOf(P.weapon) + 1) % order.length];
    P.ammo = WEAPONS[P.weapon].mag;
  }
  pressed['KeyQ'] = false;
  const w = WEAPONS[P.weapon];
  if (P.ammo > w.mag) P.ammo = w.mag;
  if (pressed['KeyR'] && !P.reloading && P.ammo < w.mag) { P.reloading = true; P.reloadT = 1.1; }
  pressed['KeyR'] = false;
  if (P.reloading) {
    P.reloadT -= dt;
    if (P.reloadT <= 0) { P.reloading = false; P.ammo = w.mag; }
  }
  if (P.fireT > 0) P.fireT -= dt;
  // use key
  if (pressed['KeyE']) useKey();
  pressed['KeyE'] = false;
  inCar = !P.onFoot && P.car; // useKey may enter/exit a car; recompute before driving

  const fwd = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
  const strafe = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
  if (inCar) {
    const car = P.car;
    const top = missions.topSpeed();
    driveCar(car, dt, fwd, strafe, !!keys['Space'], top);
    P.x = car.x; P.z = car.z; P.heading = car.heading; P.speed = car.speed;
    // ramps
    if (car.air > 0) {
      car.vy -= 24 * dt; car.y += car.vy * dt;
      if (car.y <= 0) { car.y = 0; car.air = 0; car.vy = 0; audio.crash(); }
      car.mesh.position.y = car.y;
    } else {
      for (const r of world.ramps) {
        if (dist2(car.x, car.z, r.x, r.z) < 16 && Math.abs(car.speed) > 11) {
          car.air = 1; car.vy = 9; car.y = 0.4;
          hud.toast('STUNT JUMP! +$100');
          save.cash += 100; G.persist();
          break;
        }
      }
    }
    // building collision
    const b = buildingHit(car.x, car.z, 1.2);
    if (b) {
      car.speed *= -0.25; car.hp -= 6;
      car.x -= Math.sin(car.heading) * 2; car.z -= Math.cos(car.heading) * 2;
      audio.crash();
      if (car.hp <= 0) traffic.damage(car, 999);
    }
    // traffic collision
    for (const o of traffic.cars) {
      if (o === car || o.burning) continue;
      if (dist2(car.x, car.z, o.x, o.z) < 12) {
        o.speed = Math.max(0, o.speed - 4);
        car.speed *= 0.7; car.hp -= 2;
        if (car.hp <= 0) traffic.damage(car, 999);
      }
    }
    // medallions from the car
    for (let i = 0; i < world.medallions.length; i++) {
      const m = world.medallions[i];
      if (!m.taken && dist2(car.x, car.z, m.x, m.z) < 9) {
        m.taken = true; scene.remove(m.mesh);
        save.medallions.push(i); save.cash += 150; G.persist();
        audio.pickup(); hud.toast('Sun medallion found! +$150');
        if (save.medallions.length === 10) { save.cash += 1000; hud.toast('ALL 10 MEDALLIONS! +$1000'); }
      }
    }
    audio.engine(Math.abs(car.speed) / top, true);
    audio.siren(police.level >= 2, t);
  } else {
    // on foot
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
    const sp = sprint ? 8.5 : 5;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let mx = fx * fwd + rx * strafe, mz = fz * fwd + rz * strafe;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) {
      mx /= ml; mz /= ml;
      P.heading = Math.atan2(mx, mz);
      const nx = P.x + mx * sp * dt, nz = P.z + mz * sp * dt;
      if (!buildingHit(nx, P.z, 0.8)) P.x = nx;
      if (!buildingHit(P.x, nz, 0.8)) P.z = nz;
      P.speed = sp;
    } else P.speed = 0;
    P.x = clamp(P.x, -308, 308); P.z = clamp(P.z, -308, 308);
    pMesh.position.set(P.x, 0, P.z);
    pMesh.rotation.y = P.heading;
    const swing = Math.sin(t * 9) * (P.speed > 0 ? 0.5 : 0);
    pMesh.userData.armL.rotation.x = swing;
    pMesh.userData.armR.rotation.x = -swing;
    // medallions on foot
    for (let i = 0; i < world.medallions.length; i++) {
      const m = world.medallions[i];
      if (!m.taken && dist2(P.x, P.z, m.x, m.z) < 4) {
        m.taken = true; scene.remove(m.mesh);
        save.medallions.push(i); save.cash += 150; G.persist();
        audio.pickup(); hud.toast('Sun medallion found! +$150');
      }
    }
    // shooting (held fire, or one queued click so quick taps are never lost)
    if ((mouseDown || clickQueued) && P.fireT <= 0 && !P.reloading && P.ammo > 0) {
      const origin = camera.position.clone();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      combat.shoot(origin, dir, w, [...traffic.cars, ...traffic.parked]);
      P.ammo--; P.fireT = w.rate;
      police.addHeat(2, P.x, P.z);
    } else if (P.ammo === 0 && !P.reloading) { P.reloading = true; P.reloadT = 1.1; }
    clickQueued = false;
    audio.engine(0, false);
    audio.siren(police.level >= 2, t);
  }
  // hints
  const dGar = Math.hypot(P.x - 120, P.z - 200);
  const dSafe = Math.hypot(P.x + 80, P.z + 240);
  if (P.onFoot && (traffic.nearestParked(P.x, P.z, 4.5) || (traffic.playerCar && dist2(P.x, P.z, traffic.playerCar.x, traffic.playerCar.z) < 4.5 * 4.5))) G.hint = 'Press E — Steal car';
  else if (P.onFoot && dGar < 12 && missions.next()) G.hint = 'Press E — Start job: ' + missions.next().name;
  else if (P.onFoot && dGar < 12) G.hint = 'Press E — Garage & Career';
  else if (P.onFoot && dSafe < 12) G.hint = 'Press E — Safehouse (heal & save)';
  else G.hint = '';

  traffic.step(dt, P, police);
  people.step(dt, P, P);
  people.stepHeli(dt, t, P, police.level >= 4);
  combat.step(dt, P, (e, d) => {
    // enemy shot lands
    damagePlayer(6 + Math.random() * 6);
    police.addHeat(1, P.x, P.z);
  });
  const busted = police.step(dt, t, P, !!inCar);
  if (busted) {
    audio.busted();
    document.getElementById('over-title').textContent = 'BUSTED';
    document.getElementById('over-text').textContent = 'The Solmara PD caught up with Rook. Bail cost $300 — and the job is blown.';
    save.cash = Math.max(0, save.cash - 300); G.persist();
    if (missions.current) missions.fail('Busted by the police.');
    showScreen('over');
  }
  missions.step(dt);
  stepFare(dt);
  world.step(dt, t);
  // mission marker beacon
  const mp = missions.markerPos || (missions.next() ? { x: 120, z: 200 } : null);
  if (mp) {
    beacon.visible = true; beaconRing.visible = true;
    beacon.position.set(mp.x, 30, mp.z);
    beaconRing.position.set(mp.x, 0.3, mp.z);
    beaconRing.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
  } else { beacon.visible = false; beaconRing.visible = false; }
  // sun follows the player for shadows
  world.sun.position.set(P.x - 140, 180, P.z + 120);
  world.sun.target.position.set(P.x, 0, P.z);
  world.sun.target.updateMatrixWorld();
  audio.waves(clamp(1 - Math.abs(P.z - 320) / 200, 0, 1) * 0.5);
}

// ---- camera ----
function updateCamera(dt) {
  if (G.shotCam) {
    camera.position.set(...G.shotCam.pos);
    camera.lookAt(...G.shotCam.look);
    return;
  }
  const target = P.car ? { x: P.car.x, z: P.car.z, h: P.car.heading } : P;
  const dist = P.aiming ? 6 : camDist;
  let yaw = camYaw;
  if (P.car) {
    // chase cam eases toward the car's heading
    const want = P.car.heading + Math.PI;
    let d = want - yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    yaw = camYaw = yaw + d * Math.min(1, dt * 1.2);
  }
  const px = target.x + Math.sin(yaw) * dist;
  const pz = target.z + Math.cos(yaw) * dist;
  const py = (P.car ? 4.5 : 3.2) + Math.sin(camPitch) * dist * 0.55;
  camera.position.set(px, py, pz);
  camera.lookAt(target.x, (P.car ? 1.6 : 1.5), target.z);
}

// ---- loop ----
let last = performance.now(), acc = 0, elapsed = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  elapsed += dt;
  if (screen === 'play') {
    acc += dt;
    while (acc >= STEP) { step(STEP, elapsed); acc -= STEP; if (screen !== 'play') break; }
  } else if (screen === 'pause' && (pressed['KeyP'] || pressed['Escape'])) {
    showScreen('play'); // P / Esc resumes (step() does not run while paused)
  } else if (screen === 'title') {
    // slow orbit over the city behind the title
    const a = elapsed * 0.03;
    camera.position.set(Math.sin(a) * 260, 120, Math.cos(a) * 260);
    camera.lookAt(0, 10, 0);
    world.step(dt, elapsed);
    traffic.step(dt, P, police);
    people.step(dt, P, P);
  }
  updateCamera(dt);
  if (screen === 'play' || screen === 'pause') hud.update(G, dt);
  renderer.render(scene, camera);
}

// ---- shot mode / normal boot ----
if (shotName) {
  showScreen('play');
  hud.show(true);
  stageShot(G, shotName);
  if (shotName === 'chase') G.sayText = 'Dispatch: AIR SUPPORT over Solmara. All units converge.';
  if (shotName === 'finale') G.sayText = 'Dispatch: shots fired at the Bank of Solmara.';
  hud.update(G, 0);
  let painted = 0;
  (function paint() {
    updateCamera(0);
    renderer.render(scene, camera);
    painted++;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  })();
} else {
  showScreen('title');
  requestAnimationFrame(frame);
}

// debug hooks for the playtest (and nothing else)
window.__game = G;
window.__debug = {
  teleport(x, z) { P.x = x; P.z = z; if (P.car) { P.car.x = x; P.car.z = z; } pMesh.position.set(x, 0, z); },
  startMission(id) { return missions.start(id); },
  setCash(n) { save.cash = n; G.persist(); },
  setRep(n) { for (const k in save.rep) save.rep[k] = n; G.persist(); },
  completeMission() { if (missions.current) { missions.stageIdx = missions.current.stages.length; missions.complete(); } },
  state() {
    return { x: P.x, z: P.z, health: P.health, cash: save.cash, wanted: police.level, mission: missions.current ? missions.current.id : null, stage: missions.stageIdx, done: save.done.slice(), cars: traffic.cars.length, parked: traffic.parked.length, enemies: combat.enemies.length };
  },
};

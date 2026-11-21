// Story: Rook Calloway, fixer Vera Quinn, the Gulls crew run by Silas Crowe. Nine jobs, each a
// chain of stages (goto / steal / tail / kill / pickup / deliver / survive / damage). Cash buys
// garage upgrades and weapons; reputation unlocks later jobs; everything saves to localStorage.
import { clamp, dist2 } from './util.js';
import { WEAPONS } from './combat.js';

export const SAVE_KEY = 'solmara-heat-v2';
const VERA = 'Vera';

export const UPGRADES = [
  { id: 'engine1', name: 'Engine tune I', price: 600, desc: '+top speed' },
  { id: 'engine2', name: 'Engine tune II', price: 1400, desc: '+top speed', need: 'engine1' },
  { id: 'engine3', name: 'Engine tune III', price: 2600, desc: '+top speed', need: 'engine2' },
  { id: 'armor1', name: 'Car armor I', price: 500, desc: '+car HP' },
  { id: 'armor2', name: 'Car armor II', price: 1200, desc: '+car HP', need: 'armor1' },
  { id: 'armor3', name: 'Car armor III', price: 2200, desc: '+car HP', need: 'armor2' },
  { id: 'smg', name: 'SMG unlock', price: 800, desc: 'new weapon' },
  { id: 'shotgun', name: 'Shotgun unlock', price: 1500, desc: 'new weapon' },
  { id: 'safehouse', name: 'Safehouse', price: 1000, desc: 'heal + cool off faster' },
];

const MISSIONS = [
  { id: 1, name: 'Hotwire', district: 'docks', pay: 400, rep: 15,
    brief: `${VERA}: "A Gulls coupe is parked at the docks, keys in it. Take it, bring it to my garage. Quiet."`,
    stages: [
      { type: 'goto', x: -240, z: 40, r: 12, text: 'Get to the docks' },
      { type: 'steal', text: 'Steal the marked coupe' },
      { type: 'deliver', x: 120, z: 200, r: 12, text: 'Deliver the coupe to Vera\'s garage' },
    ] },
  { id: 2, name: 'Sunset Run', district: 'hills', pay: 500, rep: 15,
    brief: `${VERA}: "Package on the boardwalk. Hillside buyer, 150 seconds. Don't scratch the paint."`,
    stages: [
      { type: 'goto', x: 0, z: 260, r: 10, text: 'Pick up the package on the boardwalk' },
      { type: 'deliver', x: 80, z: -240, r: 12, time: 150, text: 'Deliver to the hillside buyer' },
    ] },
  { id: 3, name: 'Tail the Gull', district: 'downtown', pay: 550, rep: 15,
    brief: `${VERA}: "A Gull lieutenant is driving downtown. Follow him. Close enough to see, far enough to stay invisible."`,
    stages: [
      { type: 'goto', x: 40, z: -40, r: 14, text: 'Find the Gull sedan downtown' },
      { type: 'tail', time: 45, text: 'Tail the sedan — stay 12 to 45 m back' },
    ] },
  { id: 4, name: 'Dockside', district: 'docks', pay: 800, rep: 15, needRep: 30,
    brief: `${VERA}: "The Gulls keep a manifest in the dock warehouse. Four guards. Get in, grab it, get out."`,
    stages: [
      { type: 'goto', x: -240, z: 120, r: 14, text: 'Reach the dock warehouse' },
      { type: 'kill', count: 4, spawn: [[-248, 110], [-232, 128], [-252, 132], [-228, 112]], text: 'Clear the warehouse guards (0/4)' },
      { type: 'pickup', x: -240, z: 120, text: 'Grab the manifest' },
      { type: 'deliver', x: 120, z: 200, r: 12, text: 'Bring the manifest to the garage' },
    ] },
  { id: 5, name: 'Convoy Hit', district: 'midtown', pay: 950, rep: 15, needRep: 30,
    brief: `${VERA}: "A Gulls convoy is rolling the coast road with a case of cash. Stop the lead truck, take the case."`,
    stages: [
      { type: 'goto', x: 200, z: 200, r: 16, text: 'Intercept the convoy on the coast road' },
      { type: 'damage', text: 'Stop the lead truck — ram it or shoot it' },
      { type: 'pickup', x: 0, z: 0, text: 'Grab the cash case' },
      { type: 'deliver', x: -80, z: -240, r: 12, text: 'Stash the case at the safehouse' },
    ] },
  { id: 6, name: 'The Getaway', district: 'beach', pay: 900, rep: 15, needRep: 30,
    brief: `${VERA}: "You tripped a 4-star dragnet. Lose them, then get to the safehouse. Do not get caught."`,
    stages: [
      { type: 'survive', time: 60, wanted: 4, text: 'Survive the dragnet — 60 s' },
      { type: 'deliver', x: -80, z: -240, r: 12, text: 'Reach the safehouse' },
    ] },
  { id: 7, name: 'Bank of Solmara', district: 'downtown', pay: 1500, rep: 15, needRep: 60,
    brief: `${VERA}: "The Bank of Solmara, noon. Hold the steps for 90 seconds while I crack the vault. Then run."`,
    stages: [
      { type: 'goto', x: 40, z: 40, r: 14, text: 'Get to the bank' },
      { type: 'hold', time: 90, count: 8, spawn: [[30, 30], [50, 30], [30, 50], [50, 50], [20, 40], [60, 40], [40, 20], [40, 60]], text: 'Hold the bank steps (0/8 down)' },
      { type: 'deliver', x: 120, z: 200, r: 12, text: 'Escape to the garage with the money' },
    ] },
  { id: 8, name: 'Harbor Lights', district: 'docks', pay: 1600, rep: 15, needRep: 60,
    brief: `${VERA}: "They have me pinned at the pier. Five Gulls. Come get me, Rook — and bring the car."`,
    stages: [
      { type: 'goto', x: -280, z: 200, r: 14, text: 'Reach the pier' },
      { type: 'kill', count: 5, spawn: [[-286, 190], [-272, 208], [-288, 214], [-268, 194], [-280, 220]], text: 'Clear the pier (0/5)' },
      { type: 'deliver', x: -80, z: -240, r: 12, text: 'Drive Vera to the safehouse' },
    ] },
  { id: 9, name: 'King of the Hill', district: 'hills', pay: 3000, rep: 20, needRep: 60,
    brief: `${VERA}: "Silas Crowe is at his hillside mansion. End this. Take the hill, take the crown."`,
    stages: [
      { type: 'goto', x: 80, z: -240, r: 14, text: 'Storm the hillside mansion' },
      { type: 'kill', count: 7, spawn: [[70, -250], [90, -250], [70, -230], [90, -230], [80, -260], [60, -240], [100, -240]], boss: true, text: 'Take down Silas Crowe and his guards (0/7)' },
      { type: 'deliver', x: 0, z: 260, r: 14, text: 'Escape to the beach — Solmara is yours' },
    ] },
];

export function createMissions(G) {
  const M = { list: MISSIONS, current: null, stageIdx: 0, stageT: 0, kills: 0, marker: null, tailTarget: null, convoy: null, failed: null };
  const save = G.save;
  M.totalRep = () => Object.values(save.rep).reduce((a, b) => a + b, 0);
  M.available = () => MISSIONS.filter((m) => !save.done.includes(m.id) && (!m.needRep || M.totalRep() >= m.needRep));
  M.next = () => M.available()[0] || null;
  M.cash = () => save.cash;
  M.addCash = (n) => { save.cash += n; G.persist(); };
  M.buy = function (id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u || save.upgrades.includes(id) || save.cash < u.price) return false;
    if (u.need && !save.upgrades.includes(u.need)) return false;
    save.cash -= u.price; save.upgrades.push(id); G.persist();
    return true;
  };
  M.topSpeed = () => 26 + (save.upgrades.includes('engine1') ? 3 : 0) + (save.upgrades.includes('engine2') ? 3 : 0) + (save.upgrades.includes('engine3') ? 4 : 0);
  M.carHp = () => 100 + (save.upgrades.includes('armor1') ? 40 : 0) + (save.upgrades.includes('armor2') ? 40 : 0) + (save.upgrades.includes('armor3') ? 60 : 0);
  M.hasWeapon = (id) => id === 'pistol' || save.upgrades.includes(id);

  // marker is a beacon built in main (three import there); here we keep only the position
  M.markerPos = null;
  function stage() { return M.current ? M.current.stages[M.stageIdx] : null; }
  M.objective = function () {
    if (!M.current) {
      const n = M.next();
      return n ? `Next job: ${n.name} — follow the gold V` : 'All jobs done. Solmara is yours.';
    }
    const s = stage();
    if (!s) return '';
    let t = s.text;
    if (s.type === 'kill' || s.type === 'hold') t = t.replace(/0\/\d+/, `${M.kills}/${s.count}`);
    if ((s.type === 'deliver' || s.type === 'survive' || s.type === 'hold') && s.time) t += ` — ${Math.ceil(M.stageT)}s`;
    return `${M.current.name}: ${t}`;
  };
  M.start = function (id) {
    const m = MISSIONS.find((x) => x.id === id);
    if (!m) return false;
    M.current = m; M.stageIdx = 0; M.kills = 0; M.failed = null;
    M.stageT = stage().time || 0;
    G.audio.jingle();
    G.say(m.brief, 7);
    M.enterStage();
    return true;
  };
  M.enterStage = function () {
    const s = stage();
    if (!s) { M.complete(); return; }
    M.stageT = s.time || 0;
    M.markerPos = (s.x !== undefined) ? { x: s.x, z: s.z } : null;
    if (s.type === 'steal') {
      const c = G.traffic.nearestParked(-240, 40, 60) || G.traffic.playerCar;
      M.stealTarget = c;
      M.markerPos = { x: c.x, z: c.z };
      G.say('The marked coupe — get in and drive.', 4);
    }
    if (s.type === 'tail') {
      const c = G.traffic.spawnTail ? G.traffic.spawnTail() : null;
      M.tailTarget = c;
      G.say('Tail him. Not too close, not too far.', 4);
    }
    if (s.type === 'damage') {
      M.convoy = G.traffic.spawnConvoy ? G.traffic.spawnConvoy() : null;
      if (M.convoy) M.markerPos = { x: M.convoy.x, z: M.convoy.z };
    }
    if (s.type === 'kill' || s.type === 'hold') {
      M.kills = 0;
      M.spawned = [];
      for (const [x, z] of (s.spawn || [])) {
        const e = G.combat.spawnEnemy(x, z, s.boss && M.spawned.length === (s.spawn.length - 1) ? 220 : 60);
        M.spawned.push(e);
      }
    }
    if (s.type === 'survive' && s.wanted) G.police.addHeat(140, G.player.x, G.player.z);
    if (s.type === 'pickup' && M.convoy) { M.markerPos = { x: M.convoy.x, z: M.convoy.z }; }
  };
  M.nextStage = function () {
    M.stageIdx++;
    const s = stage();
    if (!s) { M.complete(); return; }
    M.enterStage();
    G.say(s.text, 4);
  };
  M.complete = function () {
    const m = M.current;
    save.cash += m.pay;
    save.rep[m.district] = (save.rep[m.district] || 0) + m.rep;
    if (!save.done.includes(m.id)) save.done.push(m.id);
    G.persist();
    G.audio.cash();
    G.showMissionEnd(m.name, `Payday: $${m.pay}. ${m.district} reputation +${m.rep}. ${M.next() ? 'Next job: ' + M.next().name : 'That was the last job — Solmara is yours, Rook.'}`);
    M.current = null; M.markerPos = null; M.tailTarget = null; M.convoy = null;
  };
  M.fail = function (why) {
    M.failed = why;
    G.audio.fail();
    G.showMissionEnd('JOB FAILED', why + ' — drive back to the gold V to retry.');
    if (M.spawned) for (const e of M.spawned) if (!e.dead) G.combat.removeEnemy(e);
    M.current = null; M.markerPos = null; M.tailTarget = null; M.convoy = null;
  };
  M.step = function (dt) {
    if (!M.current) return;
    const s = stage();
    if (!s) return;
    const P = G.player;
    if (s.time) {
      M.stageT -= dt;
      if (M.stageT <= 0) {
        if (s.type === 'survive' || s.type === 'hold' || s.type === 'tail') { M.nextStage(); return; }
        M.fail('Out of time.');
        return;
      }
    }
    if (s.type === 'goto' || s.type === 'deliver') {
      if (dist2(P.x, P.z, s.x, s.z) < s.r * s.r) { M.nextStage(); return; }
    } else if (s.type === 'steal') {
      if (P.car === M.stealTarget) { M.nextStage(); return; }
    } else if (s.type === 'pickup') {
      const d = M.convoy ? dist2(P.x, P.z, M.convoy.x, M.convoy.z) : dist2(P.x, P.z, s.x, s.z);
      if (d < 36) {
        if (M.convoy) { G.combat.spawnPickup('health', M.convoy.x, M.convoy.z); }
        G.audio.pickup();
        M.addCash(0);
        M.nextStage(); return;
      }
    } else if (s.type === 'tail' && M.tailTarget) {
      const d = Math.hypot(P.x - M.tailTarget.x, P.z - M.tailTarget.z);
      M.markerPos = { x: M.tailTarget.x, z: M.tailTarget.z };
      if (d > 60) { M.tailT = (M.tailT || 0) + dt; if (M.tailT > 3) { M.fail('You lost the tail.'); return; } }
      else if (d < 8) { M.tailT2 = (M.tailT2 || 0) + dt; if (M.tailT2 > 2) { M.fail('Spotted. The Gull made you.'); return; } }
      else { M.tailT = 0; M.tailT2 = 0; }
    } else if (s.type === 'damage' && M.convoy) {
      M.markerPos = { x: M.convoy.x, z: M.convoy.z };
      if (M.convoy.burning || M.convoy.hp <= 0) {
        G.combat.spawnPickup('health', M.convoy.x + 4, M.convoy.z);
        M.nextStage(); return;
      }
    } else if (s.type === 'kill' || s.type === 'hold') {
      const dead = (M.spawned || []).filter((e) => e.dead).length;
      M.kills = dead;
      if (dead >= s.count) { M.nextStage(); return; }
    }
  };
  return M;
}

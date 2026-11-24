// Neon Bay — bootstrap, game loop, input, camera, wanted system, combat and story flow.
import * as THREE from 'three';
import { CITY, buildCity } from './city.js';
import { makeCar, spawnTrafficCar, updateTraffic, driveCar, spawnPoliceCar, updatePoliceCar } from './vehicles.js';
import { makePlayer, walkPlayer, spawnPed, updatePed, spawnFootPolice, updateFootPolice } from './people.js';
import { MISSIONS, makeMarker, moveMarker, hideMarker, animateMarker, makeMissionState, startMission, updateMission } from './missions.js';
import { makeHud, showToast, updateHud } from './hud.js';
import { initAudio, setMuted, updateAudio, playSfx } from './audio.js';
import { saveGame, loadGame, hasSave } from './save.js';

window.addEventListener('error', (e) => { window.__neonbay_error = String(e.message || e.error); });

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // city | drive | chase | mission — screenshot poses, skips the menu
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- state
const G = {
  mode: 'menu', // menu | playing | over
  time: 0,
  wanted: 0,
  lastCrimeT: -100,
  wantedTickT: 0,
  player: null,
  traffic: [],
  parked: [],
  policeCars: [],
  footPolice: [],
  buildings: [],
  mission: makeMissionState(),
  missionDefs: MISSIONS,
  markerVisible: false,
  markerPos: { x: 0, z: 0 },
  camHeading: Math.PI,
  camYawOffset: 0,
  tailTarget: null,
  tailGem: null,
  shakeT: 0,
  overKind: null,
};
G.setWanted = (n) => { G.wanted = Math.max(0, Math.min(5, n)); syncPolice(); };
G.toast = (t, s) => showToast(hud, t, s);
G.sfx = (n) => playSfx(n);
G.moveMarker = (x, z) => { moveMarker(marker, x, z); G.markerVisible = true; G.markerPos = { x, z }; };
G.hideMarker = () => { hideMarker(marker); G.markerVisible = false; };

// ---------------------------------------------------------------- renderer / scene
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const city = buildCity(scene);
G.buildings = city.buildings;
const marker = makeMarker(scene);

// A blue diamond that floats over the tail-job target car.
const tailGem = new THREE.Mesh(
  new THREE.OctahedronGeometry(1),
  new THREE.MeshLambertMaterial({ color: 0x7ac4ff, emissive: 0x2277ff, emissiveIntensity: 1.8 }),
);
tailGem.visible = false;
scene.add(tailGem);
G.tailGem = tailGem;

// ---------------------------------------------------------------- actors
G.player = makePlayer(scene);
for (let i = 0; i < 10; i++) G.traffic.push(spawnTrafficCar(scene));
const peds = [];
for (let i = 0; i < 14; i++) peds.push(spawnPed(scene));
G.peds = peds;
const hud = makeHud();
if (hasSave()) document.getElementById('btn-continue').style.display = 'inline-block';

// ---------------------------------------------------------------- input
const keys = {};
let dragging = false;
let lastMX = 0;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM') setMuted(!mutedState());
  if (e.code === 'KeyP' && G.mode === 'playing') {
    if (saveGame(G)) showToast(hud, 'Game saved.');
  }
  if (e.code === 'KeyE' && G.mode === 'playing') toggleCar();
  if (e.code === 'KeyF' && G.mode === 'playing') punch();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastMX = e.clientX;
  if (G.mode === 'playing' && !G.player.inCar) shoot();
});
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  G.camYawOffset -= (e.clientX - lastMX) * 0.005;
  lastMX = e.clientX;
});
addEventListener('pointerup', () => { dragging = false; });
let mutedFlag = false;
function mutedState() { mutedFlag = !mutedFlag; return mutedFlag; }

function moveInput() {
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  return { f, s };
}

// ---------------------------------------------------------------- wanted + police
function commitCrime(level) {
  G.wanted = Math.min(5, G.wanted + level);
  G.lastCrimeT = G.time;
  syncPolice();
}

function syncPolice() {
  const wantCars = G.wanted === 0 ? 0 : Math.min(3, 1 + Math.floor((G.wanted - 1) / 2) + (G.wanted >= 4 ? 1 : 0));
  const wantFoot = G.wanted >= 3 ? Math.min(3, G.wanted - 2) : 0;
  while (G.policeCars.length < wantCars) {
    G.policeCars.push(spawnPoliceCar(scene, G.player.x, G.player.z));
  }
  while (G.policeCars.length > wantCars) {
    const c = G.policeCars.pop();
    scene.remove(c.mesh);
  }
  while (G.footPolice.length < wantFoot) {
    const a = Math.random() * Math.PI * 2;
    G.footPolice.push(spawnFootPolice(scene, G.player.x + Math.cos(a) * 18, G.player.z + Math.sin(a) * 18));
  }
  while (G.footPolice.length > wantFoot) {
    const c = G.footPolice.pop();
    scene.remove(c.mesh);
  }
}

function updateWanted(dt) {
  if (G.wanted === 0) return;
  // No fresh crime for a while and no cop close by: the heat cools off.
  let copNear = false;
  for (const c of G.policeCars) if (Math.hypot(c.x - G.player.x, c.z - G.player.z) < 42) copNear = true;
  for (const c of G.footPolice) if (Math.hypot(c.x - G.player.x, c.z - G.player.z) < 30) copNear = true;
  if (G.time - G.lastCrimeT > 20 && !copNear) {
    G.wantedTickT += dt;
    if (G.wantedTickT > 8) {
      G.wantedTickT = 0;
      G.wanted--;
      syncPolice();
      if (G.wanted === 0) showToast(hud, 'You lost them. The heat is off.');
    }
  } else {
    G.wantedTickT = 0;
  }
}

// ---------------------------------------------------------------- cars: steal / exit
function nearestCar(maxD) {
  const p = G.player;
  let best = null;
  let bestD = maxD;
  for (const c of [...G.traffic, ...G.parked]) {
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function toggleCar() {
  const p = G.player;
  if (p.inCar) {
    const car = p.inCar;
    p.inCar = null;
    car.isPlayer = false;
    G.parked.push(car);
    // Step out to the side of the car.
    p.x = car.x - Math.cos(car.heading) * 2.4;
    p.z = car.z + Math.sin(car.heading) * 2.4;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0, p.z);
    return;
  }
  const car = nearestCar(4.5);
  if (!car) return;
  const wasTraffic = G.traffic.includes(car);
  if (wasTraffic) {
    G.traffic.splice(G.traffic.indexOf(car), 1);
    commitCrime(1);
    playSfx('steal');
    showToast(hud, 'Stolen! The cops noticed that.');
  } else {
    G.parked.splice(G.parked.indexOf(car), 1);
  }
  p.inCar = car;
  car.isPlayer = true;
  car.isTraffic = false;
  p.mesh.visible = false;
  p.x = car.x;
  p.z = car.z;
}

// ---------------------------------------------------------------- combat
const tracerGeo = new THREE.BufferGeometry();
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe97a, transparent: true, opacity: 0.9 });
let tracer = null;
let tracerT = 0;

function shoot() {
  const p = G.player;
  if (p.shootT > 0 || p.inCar) return;
  p.shootT = 0.28;
  playSfx('shot');
  const dir = { x: Math.sin(G.camHeading), z: Math.cos(G.camHeading) };
  const ox = camera.position.x;
  const oy = camera.position.y;
  const oz = camera.position.z;
  let best = null;
  let bestD = 46;
  const consider = (x, z, obj) => {
    const dx = x - ox;
    const dz = z - oz;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 1) return;
    const dot = (dx * dir.x + dz * dir.z) / d;
    if (dot > 0.985) { bestD = d; best = { x, z, obj, d }; }
  };
  for (const ped of peds) if (!ped.dead) consider(ped.x, ped.z, { kind: 'ped', ref: ped });
  for (const cop of G.footPolice) consider(cop.x, cop.z, { kind: 'cop', ref: cop });
  const end = best
    ? { x: best.x, y: 1.2, z: best.z }
    : { x: ox + dir.x * 40, y: oy - 0.4, z: oz + dir.z * 40 };
  if (tracer) scene.remove(tracer);
  tracerGeo.setFromPoints([new THREE.Vector3(ox, oy - 0.25, oz), new THREE.Vector3(end.x, end.y, end.z)]);
  tracer = new THREE.Line(tracerGeo, tracerMat);
  scene.add(tracer);
  tracerT = 0.09;
  if (best) {
    const o = best.obj;
    o.ref.hp = (o.ref.hp ?? 100) - 34;
    if (o.kind === 'ped') {
      if (o.ref.hp <= 0) {
        o.ref.dead = true;
        o.ref.mesh.rotation.x = -Math.PI / 2;
        o.ref.mesh.position.y = 0.3;
      }
      commitCrime(1);
    } else {
      commitCrime(1);
      if (o.ref.hp <= 0) {
        const i = G.footPolice.indexOf(o.ref);
        if (i >= 0) G.footPolice.splice(i, 1);
        scene.remove(o.ref.mesh);
        showToast(hud, 'Officer down. That will not help your wanted level.');
      }
    }
  }
}

function punch() {
  const p = G.player;
  if (p.punchT > 0 || p.inCar) return;
  p.punchT = 0.4;
  playSfx('punch');
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const hit = (x, z, obj) => {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.4) return false;
    if ((dx * fx + dz * fz) / (d || 1) < 0.3) return false;
    obj.hp = (obj.hp ?? 50) - 25;
    obj.x += (dx / (d || 1)) * 1.6;
    obj.z += (dz / (d || 1)) * 1.6;
    obj.mesh.position.set(obj.x, 0, obj.z);
    return true;
  };
  for (const ped of peds) {
    if (!ped.dead && hit(ped.x, ped.z, ped)) {
      commitCrime(1);
      if (ped.hp <= 0) { ped.dead = true; ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.3; }
      return;
    }
  }
  for (const cop of G.footPolice) {
    if (hit(cop.x, cop.z, cop)) {
      commitCrime(1);
      cop.stunT = 1.2;
      return;
    }
  }
}

// ---------------------------------------------------------------- missions
function beginMission(index) {
  const m = MISSIONS[index];
  if (!m) { G.mission.index = 5; G.mission.active = false; hideMarker(marker); G.markerVisible = false; return; }
  if (m.id === 'tail-job') {
    // Pick a traffic car near the player to tail.
    let best = null;
    let bestD = Infinity;
    for (const c of G.traffic) {
      const d = Math.hypot(c.x - G.player.x, c.z - G.player.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    G.tailTarget = best || spawnTrafficCar(scene);
    tailGem.visible = true;
  } else {
    tailGem.visible = false;
  }
  const brief = startMission(G.mission, index, G.player.x, G.player.z, marker, G);
  G.markerVisible = marker.visible;
  G.markerPos = { x: marker.position.x, z: marker.position.z };
  showToast(hud, `${m.title} — ${brief}`, 5);
  playSfx('mission');
}

function missionTick(dt) {
  if (!G.mission.active) return;
  const res = updateMission(G.mission, dt, G);
  if (res.done) {
    showToast(hud, `${MISSIONS[G.mission.index].title}: ${res.message}`, 4.5);
    saveGame(G);
    const next = G.mission.index + 1;
    setTimeout(() => { if (G.mode === 'playing') beginMission(next); }, 1600);
  } else if (res.failed) {
    showToast(hud, res.message, 4);
    const idx = G.mission.index;
    setTimeout(() => { if (G.mode === 'playing') beginMission(idx); }, 1600);
  }
}

// ---------------------------------------------------------------- game over / menu
function gameOver(kind) {
  if (G.mode !== 'playing') return;
  G.mode = 'over';
  G.overKind = kind;
  playSfx('busted');
  document.getElementById('gameover-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  document.getElementById('gameover-text').textContent = kind === 'busted'
    ? 'The Neon Bay PD finally caught Rico. The crew will post bail — this time.'
    : 'Rico is down. Neon Bay is not done with him yet.';
  document.getElementById('gameover').style.display = 'flex';
}

function resetWorld() {
  const p = G.player;
  p.hp = 100;
  p.money = 0;
  p.x = 0;
  p.z = 6;
  p.heading = Math.PI;
  p.inCar = null;
  p.mesh.visible = true;
  p.mesh.position.set(0, 0, 6);
  p.bustedT = 0;
  G.wanted = 0;
  G.lastCrimeT = -100;
  G.mission = makeMissionState();
  for (const c of [...G.policeCars, ...G.footPolice]) scene.remove(c.mesh);
  G.policeCars = [];
  G.footPolice = [];
  for (const c of G.parked) scene.remove(c.mesh);
  G.parked = [];
  for (const ped of peds) {
    ped.dead = false;
    ped.hp = 50;
    ped.mesh.rotation.x = 0;
    ped.mesh.position.y = 0;
  }
}

function startGame(fromSave) {
  initAudio();
  resetWorld();
  document.getElementById('menu').style.display = 'none';
  document.getElementById('gameover').style.display = 'none';
  G.mode = 'playing';
  if (fromSave) {
    const s = loadGame();
    if (s) {
      G.player.money = s.money;
      G.player.hp = s.hp;
      G.player.x = s.x;
      G.player.z = s.z;
      G.wanted = s.wanted;
      syncPolice();
      beginMission(Math.min(s.missionIndex, 4));
      showToast(hud, 'Welcome back to Neon Bay.');
      return;
    }
  }
  beginMission(0);
}

document.getElementById('btn-new').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-retry').addEventListener('click', () => {
  const p = G.player;
  p.hp = 100;
  p.x = -100;
  p.z = 100;
  p.heading = 0;
  p.bustedT = 0;
  G.wanted = 0;
  syncPolice();
  document.getElementById('gameover').style.display = 'none';
  G.mode = 'playing';
  showToast(hud, 'Back on the streets. Lay low for a while.');
});
document.getElementById('btn-menu').addEventListener('click', () => {
  document.getElementById('gameover').style.display = 'none';
  document.getElementById('menu').style.display = 'flex';
  G.mode = 'menu';
});

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  const p = G.player;
  const inCar = !!p.inCar;
  const dist = inCar ? 12 : 8.5;
  const height = inCar ? 4.6 : 3.6;
  // Camera yaw eases toward behind-the-player when moving, plus the mouse offset.
  const targetYaw = (inCar ? p.inCar.heading : p.heading) + Math.PI;
  let dy = targetYaw - G.camHeading;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  const moving = inCar ? Math.abs(p.inCar.speed) > 1 : keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
  if (moving) G.camHeading += dy * Math.min(1, dt * 1.6);
  const yaw = G.camHeading + G.camYawOffset;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const tx = inCar ? p.inCar.x : p.x;
  const tz = inCar ? p.inCar.z : p.z;
  const cx = tx - fx * dist;
  const cz = tz - fz * dist;
  camera.position.set(cx, height, cz);
  camera.lookAt(tx + fx * 2, 1.6, tz + fz * 2);
  if (G.shakeT > 0) {
    G.shakeT -= dt;
    camera.position.x += rand(-0.25, 0.25) * G.shakeT;
    camera.position.y += rand(-0.2, 0.2) * G.shakeT;
  }
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let readyFlagged = false;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  const p = G.player;

  if (G.mode === 'menu') {
    // Slow orbit over the city behind the title screen.
    const a = G.time * 0.05;
    camera.position.set(Math.cos(a) * 90, 42, Math.sin(a) * 90);
    camera.lookAt(0, 0, 0);
    for (const c of G.traffic) updateTraffic(c, dt, G.traffic);
    for (const ped of peds) updatePed(ped, dt);
    animateMarker(marker, G.time);
    renderer.render(scene, camera);
    return;
  }
  if (G.mode !== 'playing') {
    renderer.render(scene, camera);
    return;
  }

  p.punchT = Math.max(0, p.punchT - dt);
  p.shootT = Math.max(0, p.shootT - dt);
  if (tracerT > 0) {
    tracerT -= dt;
    if (tracerT <= 0 && tracer) { scene.remove(tracer); tracer = null; }
  }

  // Movement.
  const mv = moveInput();
  if (p.inCar) {
    const hit = driveCar(p.inCar, { up: mv.f > 0, down: mv.f < 0, left: mv.s < 0, right: mv.s > 0 }, dt, G.buildings, [...G.traffic, ...G.policeCars]);
    if (hit) { p.hp -= 2; G.shakeT = 0.5; playSfx('crash'); }
    p.x = p.inCar.x;
    p.z = p.inCar.z;
    p.heading = p.inCar.heading;
  } else {
    const yaw = G.camHeading + G.camYawOffset;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -fz;
    const rz = fx;
    let mx = fx * mv.f + rx * mv.s;
    let mz = fz * mv.f + rz * mv.s;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const run = keys.ShiftLeft || keys.ShiftRight;
    walkPlayer(p, { x: mx * (run ? 1.45 : 1), z: mz * (run ? 1.45 : 1) }, dt, G.buildings);
  }

  // Traffic, pedestrians, police.
  for (const c of G.traffic) updateTraffic(c, dt, G.traffic);
  for (const ped of peds) updatePed(ped, dt);
  updateWanted(dt);
  for (const c of [...G.policeCars]) {
    const ram = updatePoliceCar(c, p.x, p.z, !!p.inCar, dt, G.buildings);
    if (ram && (c.ramT || 0) <= 0) {
      c.ramT = 1.1;
      p.hp -= p.inCar ? 4 : 9;
      G.shakeT = 0.7;
      playSfx('crash');
      showToast(hud, p.inCar ? 'Police rammed you!' : 'An officer is dragging you down!');
    }
    c.ramT = Math.max(0, (c.ramT || 0) - dt);
  }
  for (const cop of [...G.footPolice]) {
    if (cop.stunT > 0) { cop.stunT -= dt; continue; }
    if (updateFootPolice(cop, p.x, p.z, dt) && !p.inCar) {
      p.bustedT += dt;
      if (p.bustedT > 0.6) showToast(hud, 'They are grabbing you — break free!', 1);
      if (p.bustedT > 1.6) { gameOver('busted'); }
    } else {
      p.bustedT = Math.max(0, p.bustedT - dt * 2);
    }
  }

  // Tail-job marker follows its car.
  if (G.mission.active && G.mission.index === 2 && G.tailTarget) {
    tailGem.visible = true;
    tailGem.position.set(G.tailTarget.x, 3.4, G.tailTarget.z);
    tailGem.rotation.y = G.time * 3;
  } else {
    tailGem.visible = false;
  }

  // Slow health regen while clean.
  if (G.wanted === 0 && p.hp < 100) p.hp = Math.min(100, p.hp + 1.5 * dt);
  if (p.hp <= 0) { gameOver('wasted'); }

  missionTick(dt);
  animateMarker(marker, G.time);
  updateCamera(dt);
  updateHud(hud, G, dt);
  updateAudio(p.inCar ? Math.abs(p.inCar.speed) / 30 : 0, G.wanted, !!p.inCar, G.time);
  renderer.render(scene, camera);

  if (SHOT && !readyFlagged) {
    readyFlagged = true;
    setTimeout(() => { window.__neonbay_ready = true; }, 700);
  }
}

// ---------------------------------------------------------------- screenshot poses
function applyShotPose() {
  document.getElementById('menu').style.display = 'none';
  G.mode = 'playing';
  initAudio();
  if (SHOT === 'drive') {
    const car = makeCar(scene, 0, 40, 0, 0xc23b2e);
    G.player.inCar = car;
    car.isPlayer = true;
    car.speed = 14;
    G.player.mesh.visible = false;
    G.player.x = car.x;
    G.player.z = car.z;
    G.camHeading = Math.PI;
    beginMission(0);
  } else if (SHOT === 'chase') {
    const car = makeCar(scene, 0, 20, 0, 0x2e6fc2);
    G.player.inCar = car;
    car.isPlayer = true;
    car.speed = 18;
    G.player.mesh.visible = false;
    G.player.x = car.x;
    G.player.z = car.z;
    G.camHeading = Math.PI;
    G.setWanted(3);
    beginMission(3);
  } else if (SHOT === 'mission') {
    G.player.x = 0;
    G.player.z = 30;
    G.player.heading = 0;
    G.camHeading = Math.PI;
    beginMission(1);
  } else {
    // city: on foot downtown, first job active.
    G.player.x = 0;
    G.player.z = 24;
    G.player.heading = Math.PI;
    G.camHeading = Math.PI;
    beginMission(0);
  }
}

if (SHOT) applyShotPose();
frame();

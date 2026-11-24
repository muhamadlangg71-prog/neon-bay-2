// Neon Bay — people: the player on foot, pedestrians and foot police.
import * as THREE from 'three';
import { CITY, hitsBuilding, pushOutOfBuilding } from './city.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const SHIRTS = [0xd94f4f, 0x4f7dd9, 0x4fd97a, 0xe8d44f, 0x9e4fd9, 0xe8e6df, 0xd97b2e, 0x3fb8af];

/** A blocky person: torso, head, arms and legs that swing while walking. */
export function makePersonMesh(shirt, pants = 0x2b2e35, skin = 0xe8b98a) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.06;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
  head.position.y = 1.62;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.42), new THREE.MeshLambertMaterial({ color: 0x1c1712 }));
  hair.position.y = 1.86;
  g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.26), pantsMat);
  legL.position.set(-0.17, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.17;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirtMat);
  armL.position.set(-0.42, 1.08, 0);
  const armR = armL.clone();
  armR.position.x = 0.42;
  g.add(legL, legR, armL, armR);
  g.userData.limbs = { legL, legR, armL, armR };
  return g;
}

/** Swing the limbs for a walking cycle. */
export function animateWalk(mesh, phase, amount) {
  const l = mesh.userData.limbs;
  if (!l) return;
  const s = Math.sin(phase) * amount;
  l.legL.rotation.x = s;
  l.legR.rotation.x = -s;
  l.armL.rotation.x = -s * 0.8;
  l.armR.rotation.x = s * 0.8;
}

/** The player: position, heading, health, money and whether they are in a car. */
export function makePlayer(scene) {
  const mesh = makePersonMesh(0x2e6fc2, 0x23262e);
  mesh.position.set(0, 0, 6);
  scene.add(mesh);
  return {
    mesh, x: 0, z: 6, heading: Math.PI,
    hp: 100, money: 0, walkPhase: 0,
    inCar: null, // the car object when driving, else null
    punchT: 0, shootT: 0, bustedT: 0,
  };
}

/**
 * Move the player on foot. `move` is {x, z} in world space, already camera-relative.
 * Returns true when the player bumped a building hard.
 */
export function walkPlayer(player, move, dt, buildings) {
  const speed = 6.2;
  const nx = player.x + move.x * speed * dt;
  const nz = player.z + move.z * speed * dt;
  const b = hitsBuilding(buildings, nx, nz, 0.55);
  if (b) {
    const p = pushOutOfBuilding(b, nx, nz, 0.55);
    player.x = p.x;
    player.z = p.z;
  } else {
    player.x = nx;
    player.z = nz;
  }
  player.x = Math.max(-CITY.half + 2, Math.min(CITY.half - 2, player.x));
  player.z = Math.max(-CITY.half + 2, Math.min(CITY.half - 2, player.z));
  const moving = Math.hypot(move.x, move.z) > 0.05;
  if (moving) {
    player.heading = Math.atan2(move.x, move.z);
    player.walkPhase += dt * 11;
  }
  animateWalk(player.mesh, player.walkPhase, moving ? 0.55 : 0);
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.heading;
  return moving;
}

/** Spawn one pedestrian strolling on a sidewalk. */
export function spawnPed(scene) {
  const road = pick(CITY.roads);
  const along = rand(-CITY.half + 8, CITY.half - 8);
  const side = Math.random() < 0.5 ? -1 : 1;
  const axis = Math.random() < 0.5 ? 'x' : 'z';
  const x = axis === 'x' ? along : road + side * (CITY.roadW / 2 + 2);
  const z = axis === 'x' ? road + side * (CITY.roadW / 2 + 2) : along;
  const mesh = makePersonMesh(pick(SHIRTS));
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return {
    mesh, x, z, axis, dir: Math.random() < 0.5 ? 1 : -1,
    speed: rand(1.2, 2.2), phase: rand(0, 6), dead: false, hp: 50,
  };
}

/** Pedestrians wander the sidewalks and turn at intersections. */
export function updatePed(ped, dt) {
  if (ped.dead) return;
  const step = ped.speed * dt;
  if (ped.axis === 'x') ped.x += ped.dir * step;
  else ped.z += ped.dir * step;
  const nearRoad = (v) => {
    for (const r of CITY.roads) if (Math.abs(v - r) < 1) return r;
    return null;
  };
  const cross = ped.axis === 'x' ? nearRoad(ped.x) : nearRoad(ped.z);
  if (cross !== null && Math.random() < 0.25) {
    if (ped.axis === 'x') { ped.axis = 'z'; ped.dir = Math.random() < 0.5 ? 1 : -1; }
    else { ped.axis = 'z' === ped.axis ? 'x' : 'x'; ped.axis = 'x'; ped.dir = Math.random() < 0.5 ? 1 : -1; }
  }
  if (ped.x > CITY.half - 2) { ped.x = CITY.half - 2; ped.dir = -1; }
  if (ped.x < -CITY.half + 2) { ped.x = -CITY.half + 2; ped.dir = 1; }
  if (ped.z > CITY.half - 2) { ped.z = CITY.half - 2; ped.dir = -1; }
  if (ped.z < -CITY.half + 2) { ped.z = -CITY.half + 2; ped.dir = 1; }
  ped.phase += dt * 7;
  animateWalk(ped.mesh, ped.phase, 0.45);
  ped.mesh.position.set(ped.x, 0, ped.z);
  ped.mesh.rotation.y = ped.axis === 'x' ? (ped.dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir === 1 ? 0 : Math.PI);
}

/** A foot officer: dark uniform, runs at the player and tries to bust them. */
export function spawnFootPolice(scene, x, z) {
  const mesh = makePersonMesh(0x1d2b4a, 0x14161c);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), new THREE.MeshLambertMaterial({ color: 0x1d2b4a }));
  cap.position.y = 1.9;
  mesh.add(cap);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return { mesh, x, z, phase: 0, speed: 6.8 };
}

/** Chase the player on foot. Returns true when the officer reaches the player. */
export function updateFootPolice(cop, px, pz, dt) {
  const dx = px - cop.x;
  const dz = pz - cop.z;
  const d = Math.hypot(dx, dz) || 1;
  cop.x += (dx / d) * cop.speed * dt;
  cop.z += (dz / d) * cop.speed * dt;
  cop.phase += dt * 12;
  animateWalk(cop.mesh, cop.phase, 0.6);
  cop.mesh.position.set(cop.x, 0, cop.z);
  cop.mesh.rotation.y = Math.atan2(dx, dz);
  return d < 1.6;
}

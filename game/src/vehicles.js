// Neon Bay — cars: the factory, city traffic, police pursuit and arcade driving.
import * as THREE from 'three';
import { CITY, hitsBuilding, pushOutOfBuilding, nearestRoadPoint } from './city.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8b93c, 0x3aa655, 0xe8e6df, 0x22242a, 0x7a4a9e, 0xd97b2e, 0x3fb8af];

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141518 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.4 });
const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0xcc1111, emissiveIntensity: 1.2 });

/** Build one car mesh. `police` gets a black-and-white paint job and a light bar. */
export function makeCarMesh(color, police = false) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0xf2f2f2 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), paint);
  body.position.y = 0.62;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.58, 2.1), glassMat);
  cabin.position.set(0, 1.18, -0.25);
  g.add(cabin);
  if (police) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.3, 4.42), new THREE.MeshLambertMaterial({ color: 0x14161c }));
    skirt.position.y = 0.42;
    g.add(skirt);
  }
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    g.add(w);
  }
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
    h.position.set(x, 0.72, 2.22);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    t.position.set(x, 0.72, -2.22);
    g.add(t);
  }
  if (police) {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 2 }));
    blue.position.x = 0.35;
    bar.add(red, blue);
    bar.position.set(0, 1.55, -0.25);
    bar.userData.red = red;
    bar.userData.blue = blue;
    g.add(bar);
    g.userData.lightBar = bar;
  }
  return g;
}

/** A car in the world: mesh + arcade driving state. */
export function makeCar(scene, x, z, heading, color, police = false) {
  const mesh = makeCarMesh(color, police);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    mesh, x, z, heading,
    speed: 0, maxSpeed: police ? 31 : 26,
    accel: 16, brake: 26, steer: 0,
    police, isPlayer: false, isTraffic: !police,
    turnAt: null, // traffic: next intersection distance where it may turn
    flashT: 0,
  };
}

/** Spawn a traffic car on a random road, moving along it. */
export function spawnTrafficCar(scene) {
  const axis = Math.random() < 0.5 ? 'x' : 'z';
  const road = pick(CITY.roads);
  const along = rand(-CITY.half + 10, CITY.half - 10);
  const heading = Math.random() < 0.5 ? 0 : Math.PI;
  const lane = (Math.random() < 0.5 ? -1 : 1) * 2.6;
  const x = axis === 'x' ? along : road + lane;
  const z = axis === 'x' ? road + lane : along;
  const car = makeCar(scene, x, z, axis === 'x' ? (heading === 0 ? Math.PI / 2 : -Math.PI / 2) : heading, pick(CAR_COLORS));
  car.speed = rand(8, 13);
  car.axis = axis;
  car.dir = heading === 0 ? 1 : -1;
  return car;
}

/** One traffic step: cruise along its road, turn at intersections, wrap at the edge. */
export function updateTraffic(car, dt, cars) {
  const step = car.speed * dt;
  if (car.axis === 'x') car.x += car.dir * step;
  else car.z += car.dir * step;
  // Slow down for the car ahead on the same road.
  for (const o of cars) {
    if (o === car || !o.isTraffic) continue;
    if (o.axis !== car.axis) continue;
    const along = car.axis === 'x' ? o.x - car.x : o.z - car.z;
    const across = car.axis === 'x' ? Math.abs(o.z - car.z) : Math.abs(o.x - car.x);
    if (across < 3 && along * car.dir > 0 && along * car.dir < 9) car.speed = Math.max(4, o.speed - 2);
  }
  // At an intersection, sometimes turn onto the crossing road.
  const nearRoad = (v) => {
    for (const r of CITY.roads) if (Math.abs(v - r) < 1.2) return r;
    return null;
  };
  const cross = car.axis === 'x' ? nearRoad(car.x) : nearRoad(car.z);
  if (cross !== null && Math.random() < 0.35) {
    const turnLeft = Math.random() < 0.5;
    if (car.axis === 'x') {
      car.axis = 'z';
      car.dir = turnLeft ? -1 : 1;
      car.z = cross + (turnLeft ? -2.6 : 2.6);
      car.heading = car.dir === 1 ? 0 : Math.PI;
    } else {
      car.axis = 'x';
      car.dir = turnLeft ? 1 : -1;
      car.x = cross + (turnLeft ? 2.6 : -2.6);
      car.heading = car.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.speed = rand(8, 13);
  }
  // Wrap around the far edge so traffic never runs out.
  if (car.x > CITY.half) { car.x = -CITY.half + 4; }
  if (car.x < -CITY.half) { car.x = CITY.half - 4; }
  if (car.z > CITY.half) { car.z = -CITY.half + 4; }
  if (car.z < -CITY.half) { car.z = CITY.half - 4; }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Wheels spin with speed.
  car.mesh.children.forEach((c) => { if (c.geometry === wheelGeo) c.rotation.x += car.speed * dt * 2; });
}

/** Arcade driving for the player's car. `input` is {up, down, left, right}. Returns true on a hard hit. */
export function driveCar(car, input, dt, buildings, cars) {
  const forward = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
  if (input.up) car.speed += car.accel * dt;
  else if (input.down) car.speed -= (car.speed > 0.5 ? car.brake : car.accel * 0.6) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  car.speed = Math.max(-10, Math.min(car.maxSpeed, car.speed));
  const steerAmt = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const spd = Math.abs(car.speed);
  if (spd > 0.2) {
    car.heading += steerAmt * 1.9 * dt * Math.min(1, spd / 8) * Math.sign(car.speed);
  }
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  let hit = false;
  const b = hitsBuilding(buildings, nx, nz, 2.2);
  if (b) {
    const p = pushOutOfBuilding(b, nx, nz, 2.2);
    car.x = p.x;
    car.z = p.z;
    if (Math.abs(car.speed) > 12) hit = true;
    car.speed *= 0.45;
  } else {
    car.x = nx;
    car.z = nz;
  }
  car.x = Math.max(-CITY.half + 3, Math.min(CITY.half - 3, car.x));
  car.z = Math.max(-CITY.half + 3, Math.min(CITY.half - 3, car.z));
  // Bump into other cars: slow down and shove them a little.
  for (const o of cars) {
    if (o === car) continue;
    const dx = o.x - car.x;
    const dz = o.z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 4.4 && d > 0.01) {
      const push = (4.4 - d) / 2;
      const ux = dx / d;
      const uz = dz / d;
      car.x -= ux * push;
      car.z -= uz * push;
      o.x += ux * push;
      o.z += uz * push;
      if (Math.abs(car.speed) > 10) hit = true;
      car.speed *= 0.7;
      if (o.isTraffic) o.speed = Math.max(0, o.speed - 4);
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.mesh.children.forEach((c) => { if (c.geometry === wheelGeo) c.rotation.x += car.speed * dt * 2; });
  return hit;
}

/** Spawn a police car at the city edge, on a road, aimed at the player. */
export function spawnPoliceCar(scene, px, pz) {
  const edge = pick([
    { x: -CITY.half + 6, z: rand(-80, 80) },
    { x: CITY.half - 6, z: rand(-80, 80) },
    { x: rand(-80, 80), z: -CITY.half + 6 },
    { x: rand(-80, 80), z: CITY.half - 6 },
  ]);
  const p = nearestRoadPoint(edge.x, edge.z);
  const car = makeCar(scene, p.x, p.z, Math.atan2(px - p.x, pz - p.z), 0xffffff, true);
  car.speed = 14;
  return car;
}

/** Police pursuit: steer toward the player, ram on contact. Returns 'ram' when it hits the player. */
export function updatePoliceCar(car, px, pz, playerInCar, dt, buildings) {
  const want = Math.atan2(px - car.x, pz - car.z);
  let dh = want - car.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
  car.speed = Math.min(car.maxSpeed, car.speed + 10 * dt);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const b = hitsBuilding(buildings, nx, nz, 2.2);
  if (b) {
    const p = pushOutOfBuilding(b, nx, nz, 2.2);
    car.x = p.x;
    car.z = p.z;
    car.speed *= 0.5;
    car.heading += 0.6; // scrape along the wall instead of sticking
  } else {
    car.x = nx;
    car.z = nz;
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.mesh.children.forEach((c) => { if (c.geometry === wheelGeo) c.rotation.x += car.speed * dt * 2; });
  // Flash the light bar.
  car.flashT += dt;
  const bar = car.mesh.userData.lightBar;
  if (bar) {
    const on = Math.floor(car.flashT * 6) % 2 === 0;
    bar.userData.red.material.emissiveIntensity = on ? 2.5 : 0.2;
    bar.userData.blue.material.emissiveIntensity = on ? 0.2 : 2.5;
  }
  const d = Math.hypot(px - car.x, pz - car.z);
  return d < (playerInCar ? 4.6 : 3.4) ? 'ram' : null;
}

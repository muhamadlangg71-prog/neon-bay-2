// Neon Bay — the city itself: ground, roads, buildings, lamps, trees and light.
// All art is procedural: canvas textures drawn at load, no outside assets.
import * as THREE from 'three';

export const CITY = {
  half: 125, // city extends -125..125 on x and z
  block: 50, // distance between road centre lines
  roadW: 12, // road width
  roads: [-100, -50, 0, 50, 100], // road centre lines on both axes
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** A canvas texture of a lit office facade: dark glass with warm windows. */
function facadeTexture(base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const lit = Math.random() < litRatio;
      g.fillStyle = lit ? pick(['#ffd27a', '#ffe9b0', '#ffb46b']) : '#1d2733';
      g.fillRect(x, y, 10, 12);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The ground: one big plane whose texture paints asphalt, sidewalks, dashes and crosswalks. */
function groundTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const px = S / (CITY.half * 2); // pixels per world unit
  const W = (v) => (v + CITY.half) * px;
  g.fillStyle = '#2b2e34'; // asphalt base
  g.fillRect(0, 0, S, S);
  // Sidewalk blocks: light slabs between the roads.
  g.fillStyle = '#7d7468';
  for (let i = 0; i < CITY.roads.length - 1; i++) {
    for (let j = 0; j < CITY.roads.length - 1; j++) {
      const x0 = CITY.roads[i] + CITY.roadW / 2;
      const x1 = CITY.roads[i + 1] - CITY.roadW / 2;
      const z0 = CITY.roads[j] + CITY.roadW / 2;
      const z1 = CITY.roads[j + 1] - CITY.roadW / 2;
      g.fillRect(W(x0), W(z0), (x1 - x0) * px, (z1 - z0) * px);
    }
  }
  // Centre dashes on every road.
  g.fillStyle = '#e8c33c';
  for (const r of CITY.roads) {
    for (let v = -CITY.half; v < CITY.half; v += 10) {
      g.fillRect(W(r) - 1, W(v), 2, 5 * px);
      g.fillRect(W(v), W(r) - 1, 5 * px, 2);
    }
  }
  // Crosswalk stripes at every intersection.
  g.fillStyle = '#e8e6df';
  for (const rx of CITY.roads) {
    for (const rz of CITY.roads) {
      for (let k = -2; k <= 2; k++) {
        g.fillRect(W(rx + k * 2.2) - 1, W(rz - CITY.roadW / 2), 2, 3 * px);
        g.fillRect(W(rx - CITY.roadW / 2), W(rz + k * 2.2) - 1, 3 * px, 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

/**
 * Build the whole city into the scene.
 * Returns the building collision boxes [{minX,maxX,minZ,maxZ}] and the lamp positions.
 */
export function buildCity(scene) {
  const buildings = [];
  const lamps = [];

  // Sunset sky, warm sun and a soft ambient fill.
  scene.background = new THREE.Color(0xffc98a);
  scene.fog = new THREE.Fog(0xf2b880, 120, 420);
  const sun = new THREE.DirectionalLight(0xffdfb0, 1.5);
  sun.position.set(80, 120, 40);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffe0b8, 0x4a3a52, 0.7));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2, CITY.half * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Facade variants shared by every tower.
  const facades = [
    facadeTexture('#2c3644', 0.45),
    facadeTexture('#3a2f3d', 0.35),
    facadeTexture('#24303a', 0.55),
    facadeTexture('#41372a', 0.4),
  ];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2b2e35 });
  const lampGlowMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc95e, emissiveIntensity: 1.6 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4128 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a34 });

  // One or two towers per block, with a plaza gap between them.
  for (let i = 0; i < CITY.roads.length - 1; i++) {
    for (let j = 0; j < CITY.roads.length - 1; j++) {
      const x0 = CITY.roads[i] + CITY.roadW / 2 + 3;
      const x1 = CITY.roads[i + 1] - CITY.roadW / 2 - 3;
      const z0 = CITY.roads[j] + CITY.roadW / 2 + 3;
      const z1 = CITY.roads[j + 1] - CITY.roadW / 2 - 3;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const towers = Math.random() < 0.55 ? 2 : 1;
      for (let k = 0; k < towers; k++) {
        const w = rand(12, 20);
        const d = rand(12, 20);
        const h = rand(12, 46);
        const bx = towers === 1 ? cx : cx + (k === 0 ? -9 : 9);
        const bz = towers === 1 ? cz : cz + (k === 0 ? 7 : -7);
        const tex = pick(facades).clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, Math.round(w / 12)), Math.max(1, Math.round(h / 22)));
        const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(bx, h / 2, bz);
        scene.add(tower);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), roofMat);
        roof.position.set(bx, h + 0.4, bz);
        scene.add(roof);
        // Rooftop beacon on the tallest towers.
        if (h > 34) {
          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.7, 8, 8),
            new THREE.MeshLambertMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 2 }),
          );
          beacon.position.set(bx, h + 1.4, bz);
          scene.add(beacon);
        }
        buildings.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
      }
      // A palm or two on the plaza of some blocks.
      if (Math.random() < 0.5) {
        const tx = cx + rand(-8, 8);
        const tz = cz + rand(-8, 8);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 5, 6), trunkMat);
        trunk.position.set(tx, 2.5, tz);
        scene.add(trunk);
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), leafMat);
        leaves.position.set(tx, 6, tz);
        scene.add(leaves);
      }
    }
  }

  // Street lamps along every road, alternating sides.
  for (const r of CITY.roads) {
    for (let v = -CITY.half + 8; v < CITY.half; v += 26) {
      for (const [x, z] of [[r + CITY.roadW / 2 + 1.2, v], [r - CITY.roadW / 2 - 1.2, v + 13]]) {
        if (Math.abs(x) > CITY.half || Math.abs(z) > CITY.half) continue;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 6), lampPoleMat);
        pole.position.set(x, 3.25, z);
        scene.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), lampGlowMat);
        bulb.position.set(x, 6.7, z);
        scene.add(bulb);
        lamps.push({ x, z });
      }
    }
  }

  // A distant skyline ring so the horizon never looks empty.
  const farMat = new THREE.MeshLambertMaterial({ color: 0x8a6a72 });
  for (let a = 0; a < 26; a++) {
    const ang = (a / 26) * Math.PI * 2 + rand(-0.05, 0.05);
    const dist = rand(190, 260);
    const w = rand(14, 26);
    const h = rand(25, 70);
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), farMat);
    box.position.set(Math.cos(ang) * dist, h / 2 - 1, Math.sin(ang) * dist);
    scene.add(box);
  }

  return { buildings, lamps };
}

/** True when the circle (x, z, r) overlaps any building box. */
export function hitsBuilding(buildings, x, z, r) {
  for (const b of buildings) {
    if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return b;
  }
  return null;
}

/** Push a circle out of a building box; returns the corrected position. */
export function pushOutOfBuilding(b, x, z, r) {
  const dxl = x + r - b.minX;
  const dxr = b.maxX - (x - r);
  const dzl = z + r - b.minZ;
  const dzr = b.maxZ - (z - r);
  const m = Math.min(dxl, dxr, dzl, dzr);
  if (m === dxl) x = b.minX - r;
  else if (m === dxr) x = b.maxX + r;
  else if (m === dzl) z = b.minZ - r;
  else z = b.maxZ + r;
  return { x, z };
}

/** Nearest point on a road centre line to (x, z): used to snap spawned cars onto roads. */
export function nearestRoadPoint(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const r of CITY.roads) {
    const d1 = Math.abs(x - r);
    const d2 = Math.abs(z - r);
    if (d1 < bestD) { bestD = d1; best = { x: r, z, axis: 'z' }; }
    if (d2 < bestD) { bestD = d2; best = { x, z: r, axis: 'x' }; }
  }
  return best;
}

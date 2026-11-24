// Neon Bay — story missions: five short jobs across the city, with a beacon marker.
import * as THREE from 'three';
import { CITY } from './city.js';

const rand = (a, b) => a + Math.random() * (b - a);

/** The story: five jobs for Rico, a driver new to Neon Bay. */
export const MISSIONS = [
  {
    id: 'hot-wheels',
    title: 'Job 1 — Hot Wheels',
    brief: 'Rico needs wheels. Steal any car: walk up to one and press E.',
    reward: 250,
  },
  {
    id: 'parcel-dash',
    title: 'Job 2 — Parcel Dash',
    brief: 'A package for the north docks. Drive to the yellow marker before the timer runs out.',
    reward: 350,
    timeLimit: 90,
  },
  {
    id: 'tail-job',
    title: 'Job 3 — Tail Job',
    brief: 'Follow the blue sedan. Stay within 10m of it for 6 seconds — do not lose it.',
    reward: 450,
  },
  {
    id: 'lose-the-heat',
    title: 'Job 4 — Lose the Heat',
    brief: 'The cops are onto Rico. Get your wanted level back down to zero.',
    reward: 600,
  },
  {
    id: 'bay-bank-job',
    title: 'Job 5 — The Bay Bank Job',
    brief: 'Grab the cash at the bank on foot, then lose the cops and reach the safehouse.',
    reward: 1200,
  },
];

/** A glowing ground ring + light pillar + spinning diamond marking an objective. */
export function makeMarker(scene) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 0.25, 24),
    new THREE.MeshLambertMaterial({ color: 0xffd23c, emissive: 0xffb800, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 }),
  );
  ring.position.y = 0.13;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 40, 12, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xffd23c, emissive: 0xffc800, emissiveIntensity: 0.9, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 20;
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshLambertMaterial({ color: 0xffe97a, emissive: 0xffc800, emissiveIntensity: 1.8 }),
  );
  gem.position.y = 5;
  g.add(ring, beam, gem);
  g.userData.gem = gem;
  g.visible = false;
  scene.add(g);
  return g;
}

export function moveMarker(marker, x, z) {
  marker.position.set(x, 0, z);
  marker.visible = true;
}

export function hideMarker(marker) {
  marker.visible = false;
}

export function animateMarker(marker, t) {
  if (!marker.visible) return;
  marker.userData.gem.rotation.y = t * 2;
  marker.userData.gem.position.y = 5 + Math.sin(t * 2.4) * 0.5;
}

/** Pick a road intersection far from (x, z) for a waypoint. */
export function farIntersection(x, z, minDist = 90) {
  const spots = [];
  for (const rx of CITY.roads) for (const rz of CITY.roads) spots.push([rx, rz]);
  const far = spots.filter(([sx, sz]) => Math.hypot(sx - x, sz - z) >= minDist);
  const [sx, sz] = far.length ? far[Math.floor(Math.random() * far.length)] : spots[0];
  return { x: sx, z: sz };
}

/** Mission runtime state. */
export function makeMissionState() {
  return {
    index: 0, // which job is active (0..4), 5 = story done
    active: false,
    timer: 0, // counts down for timed jobs
    tailT: 0, // seconds spent close to the tail target
    target: null, // the tail target car
    stage: 0, // sub-stage inside a job (bank job: 0 = grab cash, 1 = reach safehouse)
    waypoint: null, // {x, z} of the current objective
    done: false,
  };
}

/** Start job `index` for the player at (px, pz). Returns the objective text. */
export function startMission(state, index, px, pz, marker, G) {
  state.index = index;
  state.active = true;
  state.timer = 0;
  state.tailT = 0;
  state.stage = 0;
  state.done = false;
  const m = MISSIONS[index];
  if (!m) return '';
  if (m.id === 'parcel-dash') {
    state.timer = m.timeLimit;
    state.waypoint = farIntersection(px, pz, 100);
    moveMarker(marker, state.waypoint.x, state.waypoint.z);
  } else if (m.id === 'tail-job') {
    state.target = G.tailTarget;
    state.waypoint = null;
    hideMarker(marker);
  } else if (m.id === 'lose-the-heat') {
    state.waypoint = null;
    hideMarker(marker);
    G.setWanted(3);
  } else if (m.id === 'bay-bank-job') {
    state.waypoint = { x: 50, z: -50 };
    moveMarker(marker, 50, -50);
  } else {
    state.waypoint = null;
    hideMarker(marker);
  }
  return m.brief;
}

/**
 * Advance the active job. `G` carries the live game state (player, wanted, cars, ...).
 * Returns {done, failed, message} — done when the job pays out.
 */
export function updateMission(state, dt, G) {
  if (!state.active || state.done) return { done: false };
  const m = MISSIONS[state.index];
  const p = G.player;
  const dist = (w) => (w ? Math.hypot(p.x - w.x, p.z - w.z) : Infinity);

  if (m.id === 'hot-wheels') {
    if (p.inCar) return finish(state, G, 'Nice ride. That car is yours now.');
  }
  if (m.id === 'parcel-dash') {
    state.timer -= dt;
    if (dist(state.waypoint) < 5) return finish(state, G, 'Package delivered, on time.');
    if (state.timer <= 0) return { failed: true, message: 'Too slow — the client walked. Job failed.' };
  }
  if (m.id === 'tail-job') {
    const t = state.target;
    if (!t) return { failed: true, message: 'Lost the target. Job failed.' };
    const d = Math.hypot(p.x - t.x, p.z - t.z);
    if (d < 10) {
      state.tailT += dt;
      if (state.tailT >= 6) return finish(state, G, 'You know where he goes now. Good tail.');
    } else {
      state.tailT = Math.max(0, state.tailT - dt * 0.5);
    }
    if (d > 70) return { failed: true, message: 'Lost the target. Job failed.' };
  }
  if (m.id === 'lose-the-heat') {
    if (G.wanted === 0) return finish(state, G, 'Clean. The heat is off.');
  }
  if (m.id === 'bay-bank-job') {
    if (state.stage === 0) {
      if (!p.inCar && dist(state.waypoint) < 4) {
        state.stage = 1;
        state.waypoint = { x: -100, z: 100 };
        G.moveMarker(state.waypoint.x, state.waypoint.z);
        G.toast('Cash grabbed! Now reach the safehouse — and lose the cops.');
        G.setWanted(4);
      }
    } else if (dist(state.waypoint) < 5 && G.wanted === 0) {
      return finish(state, G, 'The Bay Bank Job is done. Rico is a legend in Neon Bay.');
    }
  }
  return { done: false };
}

function finish(state, G, message) {
  const m = MISSIONS[state.index];
  state.done = true;
  state.active = false;
  G.player.money += m.reward;
  G.hideMarker();
  G.sfx('cash');
  return { done: true, message: `${message} +$${m.reward}`, reward: m.reward };
}

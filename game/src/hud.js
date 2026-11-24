// Neon Bay — the HUD: health, money, wanted stars, speed, mission panel and minimap.
import { CITY } from './city.js';

/** Grab the HUD nodes once; update them from the live game state. */
export function makeHud() {
  const $ = (id) => document.getElementById(id);
  return {
    hpFill: $('hp-fill'),
    hpText: $('hp-text'),
    money: $('money'),
    stars: $('stars'),
    speed: $('speed'),
    speedBox: $('speed-box'),
    objective: $('objective'),
    objectiveTitle: $('objective-title'),
    objectiveText: $('objective-text'),
    toast: $('toast'),
    compass: $('compass-arrow'),
    minimap: $('minimap'),
    toastT: 0,
  };
}

export function showToast(hud, text, seconds = 3.5) {
  hud.toast.textContent = text;
  hud.toast.style.opacity = '1';
  hud.toastT = seconds;
}

/** Refresh the HUD from the game state; call every frame (cheap DOM writes only when changed). */
export function updateHud(hud, G, dt) {
  const p = G.player;
  const hp = Math.max(0, Math.round(p.hp));
  hud.hpFill.style.width = `${hp}%`;
  hud.hpFill.style.background = hp > 50 ? '#37c978' : hp > 25 ? '#e8b93c' : '#e84f4f';
  hud.hpText.textContent = `${hp}`;
  hud.money.textContent = `$${p.money.toLocaleString('en-US')}`;
  const stars = '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted);
  if (hud.stars.textContent !== stars) {
    hud.stars.textContent = stars;
    hud.stars.style.color = G.wanted > 0 ? '#ffd23c' : '#5a6270';
  }
  if (p.inCar) {
    hud.speedBox.style.display = 'block';
    hud.speed.textContent = `${Math.round(Math.abs(p.inCar.speed) * 3.6)}`;
  } else {
    hud.speedBox.style.display = 'none';
  }
  const m = G.mission;
  if (m.active && m.index < 5) {
    hud.objective.style.display = 'block';
    const def = G.missionDefs[m.index];
    hud.objectiveTitle.textContent = def.title;
    let extra = '';
    if (def.id === 'parcel-dash') extra = ` — ${Math.max(0, Math.ceil(m.timer))}s left`;
    if (def.id === 'tail-job') extra = ` — ${Math.min(6, Math.floor(m.tailT))}/6s close`;
    hud.objectiveText.textContent = def.brief + extra;
  } else if (m.index >= 5) {
    hud.objective.style.display = 'block';
    hud.objectiveTitle.textContent = 'Free Roam — Neon Bay';
    hud.objectiveText.textContent = 'Story complete. Cruise the city, cause chaos, or just enjoy the sunset.';
  } else {
    hud.objective.style.display = 'none';
  }
  if (hud.toastT > 0) {
    hud.toastT -= dt;
    if (hud.toastT <= 0) hud.toast.style.opacity = '0';
  }
  // Compass arrow: points toward the objective relative to the camera.
  const w = G.markerVisible ? G.markerPos : null;
  if (w) {
    const ang = Math.atan2(w.x - p.x, w.z - p.z);
    const rel = ang - G.camHeading;
    hud.compass.style.display = 'block';
    hud.compass.style.transform = `rotate(${rel}rad)`;
  } else {
    hud.compass.style.display = 'none';
  }
  drawMinimap(hud.minimap, G);
}

/** Top-down minimap: roads, buildings, player, cars, police and the objective marker. */
export function drawMinimap(canvas, G) {
  const g = canvas.getContext('2d');
  const S = canvas.width;
  const px = S / (CITY.half * 2);
  const W = (v) => (v + CITY.half) * px;
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#14161c';
  g.fillRect(0, 0, S, S);
  // Roads.
  g.strokeStyle = '#3a3f4a';
  g.lineWidth = CITY.roadW * px;
  for (const r of CITY.roads) {
    g.beginPath(); g.moveTo(W(r), 0); g.lineTo(W(r), S); g.stroke();
    g.beginPath(); g.moveTo(0, W(r)); g.lineTo(S, W(r)); g.stroke();
  }
  // Buildings.
  g.fillStyle = '#5a6270';
  for (const b of G.buildings) {
    g.fillRect(W(b.minX), W(b.minZ), (b.maxX - b.minX) * px, (b.maxZ - b.minZ) * px);
  }
  // Objective marker.
  if (G.markerVisible) {
    g.fillStyle = '#ffd23c';
    g.beginPath();
    g.arc(W(G.markerPos.x), W(G.markerPos.z), 6, 0, Math.PI * 2);
    g.fill();
  }
  // Tail target.
  if (G.mission.active && G.mission.target) {
    g.fillStyle = '#3fa9ff';
    g.beginPath();
    g.arc(W(G.mission.target.x), W(G.mission.target.z), 4, 0, Math.PI * 2);
    g.fill();
  }
  // Traffic cars.
  g.fillStyle = '#cfd3da';
  for (const c of G.traffic) g.fillRect(W(c.x) - 1.5, W(c.z) - 1.5, 3, 3);
  // Police.
  g.fillStyle = '#3f7dff';
  for (const c of G.policeCars) {
    g.beginPath();
    g.arc(W(c.x), W(c.z), 3.5, 0, Math.PI * 2);
    g.fill();
  }
  for (const c of G.footPolice) {
    g.beginPath();
    g.arc(W(c.x), W(c.z), 2.5, 0, Math.PI * 2);
    g.fill();
  }
  // Player arrow.
  const p = G.player;
  g.save();
  g.translate(W(p.x), W(p.z));
  g.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)) + Math.PI);
  g.fillStyle = '#37c978';
  g.beginPath();
  g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath();
  g.fill();
  g.restore();
}

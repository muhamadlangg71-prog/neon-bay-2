// Neon Bay — save and load through localStorage.
const KEY = 'neonbay2-save-v1';

/** Persist progress: money, job, health, position and wanted level. */
export function saveGame(G) {
  try {
    const data = {
      money: G.player.money,
      missionIndex: G.mission.index,
      hp: Math.round(G.player.hp),
      x: Math.round(G.player.x),
      z: Math.round(G.player.z),
      wanted: G.wanted,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Read the save, or null when there is none. */
export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage is best-effort */ }
}

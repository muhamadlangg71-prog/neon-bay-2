// Neon Bay — procedural sound: engine hum, sirens, gunshots and cash chimes.
// Everything is synthesized with WebAudio, so the game ships no sound files.
let ctx = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let muted = false;

function ensureCtx() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from the first user gesture; browsers block audio before one. */
export function initAudio() {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  if (engineOsc) return;
  engineOsc = c.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 55;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  engineGain = c.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(filter).connect(engineGain).connect(c.destination);
  engineOsc.start();
  sirenOsc = c.createOscillator();
  sirenOsc.type = 'sine';
  sirenOsc.frequency.value = 700;
  sirenGain = c.createGain();
  sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain).connect(c.destination);
  sirenOsc.start();
}

export function setMuted(m) {
  muted = m;
  if (engineGain) engineGain.gain.value = 0;
  if (sirenGain) sirenGain.gain.value = 0;
}

/** Engine hum follows speed; the siren wails while wanted. Called every frame. */
export function updateAudio(speed01, wanted, driving, t) {
  if (!ctx || muted) return;
  if (engineGain) {
    engineGain.gain.value = driving ? 0.045 + speed01 * 0.05 : 0;
    if (engineOsc) engineOsc.frequency.value = 52 + speed01 * 95;
  }
  if (sirenGain && sirenOsc) {
    if (wanted > 0) {
      sirenGain.gain.value = 0.035;
      sirenOsc.frequency.value = 660 + Math.sin(t * 4.4) * 160;
    } else {
      sirenGain.gain.value = 0;
    }
  }
}

function blip(freq, dur, type, vol, slideTo) {
  if (!ctx || muted) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch { /* audio is best-effort */ }
}

function noiseBurst(dur, vol, freq) {
  if (!ctx || muted) return;
  try {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start();
  } catch { /* audio is best-effort */ }
}

/** One-shot effects by name. */
export function playSfx(name) {
  if (name === 'shot') noiseBurst(0.14, 0.5, 1800);
  else if (name === 'punch') noiseBurst(0.1, 0.35, 500);
  else if (name === 'cash') { blip(880, 0.12, 'sine', 0.2); setTimeout(() => blip(1320, 0.18, 'sine', 0.2), 90); }
  else if (name === 'crash') noiseBurst(0.25, 0.45, 700);
  else if (name === 'steal') blip(300, 0.25, 'square', 0.12, 520);
  else if (name === 'busted') { blip(440, 0.3, 'square', 0.15, 220); setTimeout(() => blip(330, 0.4, 'square', 0.15, 180), 200); }
  else if (name === 'mission') { blip(660, 0.12, 'sine', 0.18); setTimeout(() => blip(990, 0.2, 'sine', 0.18), 110); }
}

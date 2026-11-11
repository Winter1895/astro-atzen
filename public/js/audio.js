// Astro Atzen – kleine Synthie-Soundeffekte per WebAudio (keine Sounddateien nötig).

let ctx = null;
let master = null;
let enabled = true;
let jetNode = null;

export function setSound(on) { enabled = on; if (master) master.gain.value = on ? 0.5 : 0; }

// Muss aus einem Tipp/Klick heraus aufgerufen werden, sonst bleibt der Browser stumm
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.5 : 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    musStart();
  } catch {}
}

function tone(type, f0, f1, dur, vol = 0.3, delay = 0) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.03);
}

let noiseBuf = null;
function noise(dur, f0, f1, vol = 0.3) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (!enabled) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.03);
}

export const sfx = {
  jump: () => tone('square', 260, 620, 0.14, 0.16),
  dash: () => noise(0.3, 500, 4200, 0.4),
  beep: () => tone('square', 440, 440, 0.12, 0.2),
  go: () => { tone('square', 880, 880, 0.3, 0.22); tone('square', 1320, 1320, 0.3, 0.12); },
  die: () => { tone('sawtooth', 520, 60, 0.55, 0.3); noise(0.45, 1800, 200, 0.4); },
  kill: () => { tone('triangle', 660, 990, 0.12, 0.2); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.22, 0.2, i * 0.11)),
  lose: () => [392, 330, 262].forEach((f, i) => tone('triangle', f, f, 0.28, 0.22, i * 0.16)),
  click: () => tone('triangle', 700, 900, 0.05, 0.12),
};

// Dauerton fürs Jetpack
export function jetSound(on) {
  if (!ctx) return;
  if (on && !jetNode && enabled) {
    if (!noiseBuf) noise(0.01, 500, 500, 0.0001);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.value = 0.22;
    s.connect(f); f.connect(g); g.connect(master);
    s.start();
    jetNode = { s, g };
  } else if (!on && jetNode) {
    const n = jetNode; jetNode = null;
    try { n.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04); n.s.stop(ctx.currentTime + 0.2); } catch {}
  }
}

// ---------- Hintergrundmusik ----------
// Selbst komponierter Synthwave-Loop, komplett im Browser erzeugt (keine Musikdatei, keine Rechte-Fragen).
// 8 Takte in a-Moll bei 124 BPM. Im Menü läuft eine ruhige Fassung, im Spiel kommen Drums und Melodie dazu.
// Zum Umkomponieren: CHORDS (Grundton als MIDI-Nummer + Dur/Moll) und MELODY (8 Achtel pro Takt) ändern.
const BPM = 124;
const STEP = 60 / BPM / 4; // eine Sechzehntel
const CHORDS = [[45, 0], [41, 1], [48, 1], [43, 1], [45, 0], [41, 1], [50, 0], [40, 1]]; // Am F C G Am F Dm E
const MELODY = [
  [76, 0, 72, 69, 0, 72, 76, 0],
  [77, 0, 76, 72, 0, 69, 72, 0],
  [79, 0, 76, 72, 0, 76, 79, 0],
  [74, 0, 71, 74, 79, 0, 74, 0],
  [81, 0, 76, 81, 0, 79, 76, 0],
  [77, 0, 81, 77, 0, 76, 72, 0],
  [74, 0, 77, 81, 0, 77, 74, 0],
  [76, 80, 83, 0, 80, 0, 76, 0],
];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const mus = { on: true, mode: 'menu', gain: null, bus: null, timer: 0, step: 0, next: 0, started: false };

function musNote(type, midi, t, dur, vol, cutoff) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = hz(midi);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 2;
    o.connect(f); f.connect(g);
  } else o.connect(g);
  g.connect(mus.bus);
  o.start(t); o.stop(t + dur + 0.03);
}
function musNoise(t, dur, vol, type, freq) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(mus.gain);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function musKick(t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(g); g.connect(mus.gain);
  o.start(t); o.stop(t + 0.26);
}

function musStep(n, t) {
  const bar = Math.floor(n / 16) % 8, s = n % 16, pass = Math.floor(n / 128);
  const [root, major] = CHORDS[bar];
  const game = mus.mode === 'game';
  // Bass: Achtel mit Oktavsprüngen
  if (s % 2 === 0) {
    const pat = [0, 0, 12, 0, 0, 12, 0, 7][s / 2];
    musNote('sawtooth', root - 12 + pat, t, STEP * 1.8, game ? 0.3 : 0.2, game ? 520 : 320);
  }
  // Arpeggio: Sechzehntel über zwei Oktaven
  const third = major ? 4 : 3;
  const arp = [0, third, 7, 12, 12 + third, 12, 7, third][s % 8];
  musNote('square', root + 24 + arp, t, STEP * 1.5, s % 4 === 0 ? 0.075 : 0.05, game ? 2600 : 1500);
  // Fläche: Akkord einmal pro Takt
  if (s === 0) for (const iv of [0, third, 7]) { musNote('sawtooth', root + 12 + iv, t, STEP * 16, 0.045, 900); musNote('sawtooth', root + 12.08 + iv, t, STEP * 16, 0.04, 900); }
  if (game) {
    if (s % 4 === 0) musKick(t);
    if (s === 4 || s === 12) { musNoise(t, 0.16, 0.34, 'bandpass', 1900); musNote('triangle', 55, t, 0.1, 0.2); }
    if (s % 2 === 0) musNoise(t, s % 4 === 2 ? 0.07 : 0.03, s % 4 === 2 ? 0.16 : 0.07, 'highpass', 7500);
    // Melodie in jedem zweiten Durchlauf
    if (pass % 2 === 1 && s % 2 === 0) {
      const m = MELODY[bar][s / 2];
      if (m) musNote('sawtooth', m, t, STEP * 3.2, 0.12, 2400);
    }
  } else if (s % 4 === 2) musNoise(t, 0.04, 0.05, 'highpass', 8000);
}

function musTick() {
  if (!ctx || ctx.state !== 'running') return;
  if (mus.next < ctx.currentTime) mus.next = ctx.currentTime + 0.06; // nach Pause wieder einsteigen
  while (mus.next < ctx.currentTime + 0.25) { musStep(mus.step++, mus.next); mus.next += STEP; }
}

function musStart() {
  if (!ctx || mus.started || !mus.on) return;
  if (!noiseBuf) noise(0.01, 500, 500, 0.0001);
  if (!noiseBuf) return;
  mus.started = true;
  mus.gain = ctx.createGain();
  mus.gain.gain.value = 0.3;
  mus.gain.connect(ctx.destination);
  // Echo auf den Synthies für den typischen Weltraum-Hall
  mus.bus = ctx.createGain();
  const delay = ctx.createDelay(1), fb = ctx.createGain();
  delay.delayTime.value = STEP * 3;
  fb.gain.value = 0.32;
  mus.bus.connect(mus.gain);
  mus.bus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(mus.gain);
  mus.step = 0;
  mus.next = ctx.currentTime + 0.1;
  mus.timer = setInterval(musTick, 60);
}

export function setMusic(on) {
  mus.on = on;
  if (on) musStart();
  if (mus.gain) mus.gain.gain.setTargetAtTime(on ? 0.3 : 0, ctx.currentTime, 0.1);
  if (!on && mus.timer) { clearInterval(mus.timer); mus.timer = 0; mus.started = false; const g = mus.gain; mus.gain = null; setTimeout(() => { try { g.disconnect(); } catch {} }, 600); }
}
export function musicMode(mode) { mus.mode = mode; }
// App im Hintergrund: Ton anhalten, beim Zurückkommen weiter
export function audioPause(paused) {
  if (!ctx) return;
  try { if (paused) ctx.suspend(); else ctx.resume(); } catch {}
}

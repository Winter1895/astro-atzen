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
  if (!ctx || !enabled) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
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

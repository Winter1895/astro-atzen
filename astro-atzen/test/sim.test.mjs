// Bots gegeneinander: prüft, dass Runden sauber enden und nichts NaN wird.
import { Round, Bot, CLASSES, planetRadius, DT, stepKin, newKin, C } from '../public/shared/sim.js';

function playRound(n, level) {
  const defs = Array.from({ length: n }, (_, i) => ({ pid: i + 1, cls: i % CLASSES.length }));
  const r = new Round(defs, planetRadius(n));
  const bots = defs.map(() => new Bot(level));
  let self = 0, other = 0;
  while (!r.over && r.tick < 60 * 240) {
    r.pl.forEach((pl, i) => { if (pl.alive) { const o = bots[i].think(r, pl); pl.inp.s = o.s; pl.inp.j = o.j; pl.inp.d = o.d; } });
    for (const [pid, by] of r.step()) { if (pid === by) self++; else other++; }
    for (const pl of r.pl) if (!Number.isFinite(pl.s.px + pl.s.hx + pl.s.alt)) throw new Error('NaN in Zustand');
  }
  if (!r.over) throw new Error('Runde endet nicht');
  return { t: r.tick * DT, self, other, winner: r.winner };
}

// Jetpack: ein kurzer Tipper muss bis ganz auf Flughöhe gehen, bei jedem Typ
for (const cls of CLASSES) {
  const s = newKin(); let maxAlt = 0, air = 0;
  stepKin(s, { s: 0, j: true, d: false }, cls, 12);
  while (s.alt > 0 || s.up) { stepKin(s, { s: 0, j: false, d: false }, cls, 12); maxAlt = Math.max(maxAlt, s.alt); air++; }
  const h = newKin(); let hair = 0;
  stepKin(h, { s: 0, j: true, d: false }, cls, 12);
  while (h.alt > 0 || h.up) { stepKin(h, { s: 0, j: true, d: false }, cls, 12); hair++; }
  let regen = 0; while (h.fuel < 1) { stepKin(h, { s: 0, j: false, d: false }, cls, 12); regen++; }
  console.log(`${cls.name}: Tipper -> Höhe ${maxAlt.toFixed(2)}, ${(air * DT).toFixed(2)}s in der Luft | halten: ${(hair * DT).toFixed(2)}s | Tank wieder voll nach ${(regen * DT).toFixed(1)}s | Tempo ${(C.SPEED * cls.speed).toFixed(1)}, Wendekreis ${(C.SPEED * cls.speed / (C.TURN * cls.turn)).toFixed(1)}`);
  if (Math.abs(maxAlt - C.FLY_H) > 1e-6) throw new Error('Tipper erreicht die Flughöhe nicht');
  // Breite des Linienstücks auf voller Flughöhe nach einem kurzen Tipper
  { const t = newKin(); let top = 0; stepKin(t, { s: 0, j: true, d: false }, cls, 12); while (t.alt > 0 || t.up) { stepKin(t, { s: 0, j: false, d: false }, cls, 12); if (t.alt >= C.FLY_H) top++; } const w = top * DT * C.SPEED * cls.speed * cls.airSpeed; console.log(`   -> Durchgang unter der Flug-Linie: ${w.toFixed(1)} Einheiten breit (Atze braucht ${(2 * (C.BODY_R + C.TUBE_R)).toFixed(1)})`); if (w < 2 * (C.BODY_R + C.TUBE_R) * 1.8) throw new Error('Durchgang zu schmal'); }
}

const t0 = performance.now();
let ticks = 0;
for (const level of [0, 1, 2]) {
  for (const n of [2, 4, 8]) {
    const N = 30; let sum = 0, self = 0, other = 0, draws = 0, min = 1e9, max = 0;
    for (let i = 0; i < N; i++) { const r = playRound(n, level); sum += r.t; ticks += r.t * 60; self += r.self; other += r.other; if (r.winner == null) draws++; min = Math.min(min, r.t); max = Math.max(max, r.t); }
    console.log(`Level ${level}, ${n} Bots: Ø ${(sum / N).toFixed(1)}s (min ${min.toFixed(1)}, max ${max.toFixed(1)}), eigenes Band ${self}, fremdes ${other}, unentschieden ${draws}`);
  }
}
const ms = performance.now() - t0;
console.log(`Simulations-Tempo: ${(ticks / 60 / (ms / 1000)).toFixed(0)}x Echtzeit`);
console.log('sim ok');

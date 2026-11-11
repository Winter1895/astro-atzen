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

// Sprungkurve
{
  const s = newKin(); let maxAlt = 0, air = 0;
  stepKin(s, { s: 0, j: true, d: false }, CLASSES[0], 12);
  while (s.alt > 0) { stepKin(s, { s: 0, j: false, d: false }, CLASSES[0], 12); maxAlt = Math.max(maxAlt, s.alt); air++; }
  console.log(`Tipp-Sprung: Höhe ${maxAlt.toFixed(2)}, Luftzeit ${(air * DT).toFixed(2)}s, Weite ${(air * DT * C.SPEED).toFixed(1)}`);
  const h = newKin(); let hmax = 0, hair = 0;
  stepKin(h, { s: 0, j: true, d: false }, CLASSES[0], 12);
  while (h.alt > 0) { stepKin(h, { s: 0, j: true, d: false }, CLASSES[0], 12); hmax = Math.max(hmax, h.alt); hair++; }
  console.log(`Halten: Höhe ${hmax.toFixed(2)}, Luftzeit ${(hair * DT).toFixed(2)}s`);
  if (!(maxAlt > C.RIB_HI + 0.2)) throw new Error('Sprung zu niedrig');
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

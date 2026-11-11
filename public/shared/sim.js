// Astro Atzen – gemeinsame Spiellogik.
// Läuft identisch auf dem Server (Node) und im Browser (Vorhersage + Training).

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SNAP_EVERY = 2; // Server schickt alle 2 Ticks einen Zustand (30x pro Sekunde)

// Alle Stellschrauben fürs Spielgefühl an einem Ort
export const C = {
  SPEED: 8.5,        // Laufgeschwindigkeit (Einheiten/Sekunde)
  TURN: 3.0,         // Lenkgeschwindigkeit (Radiant/Sekunde)
  // Jetpack: es gibt genau zwei Ebenen – Boden und Flughöhe. Der Wechsel geht schnell,
  // damit Linien entweder unten ODER oben liegen und man unter Flug-Linien durchlaufen kann.
  FLY_H: 2.0,        // feste Flughöhe
  UP_V: 15,          // Steigen (Einheiten/Sekunde) -> ca. 0,13 s bis oben
  DOWN_V: 13,        // Sinken
  FUEL_TIME: 1.5,    // Sekunden Flug bei vollem Tank
  FUEL_REGEN: 0.5,   // Tank pro Sekunde am Boden
  FUEL_DELAY: 0.25,  // Pause nach der Landung, bevor der Tank nachlädt
  FUEL_MIN: 0.25,    // so viel Tank braucht man zum Abheben
  FLY_MIN: 0.30,     // Mindest-Flugdauer in Sekunden (inkl. 0,13 s Steigen): Durchgang unter der Linie ist dann gut doppelt so breit wie ein Atze
  DASH_MULT: 1.9,
  DASH_TIME: 0.4,
  DASH_CD: 3,
  BODY_H: 1.5,       // Körperhöhe des Atzen (für alle Typen gleich)
  BODY_R: 0.22,      // Körperradius; Treffer, wenn Abstand zur Linie < BODY_R * hit + TUBE_R * line
  TUBE_C: 0.45,      // Höhe der Röhrenmitte über der Lauf-Höhe
  TUBE_R: 0.2,       // Radius der Röhre
  RIB_LO: 0.25,      // Unter-/Oberkante einer normalen Röhre (TUBE_C -/+ TUBE_R)
  RIB_HI: 0.65,
  TRAIL_STEP: 0.3,   // Abstand der Stützpunkte einer Linie
  SELF_SKIP: 9,      // die letzten Punkte der eigenen Linie zählen nicht
};
// Die Linien bleiben die ganze Runde liegen (kein Kürzen wie bei Snake) – auch die von Ausgeschiedenen.

// Die Charaktere. Alle Zahlen sind Faktoren auf die Grundwerte oben.
//   speed = Tempo am Boden      airSpeed = Tempo in der Luft     turn = Wendigkeit
//   jet = Tankgröße             regen = Tank lädt schneller
//   dashCd = Dash-Abklingzeit (kleiner = öfter)                  dashLen = Dash-Dauer
//   line = Dicke der eigenen Linie                               hit = eigene Trefferfläche (kleiner = schmaler)
//   selfImmune = eigene Linie ist harmlos                        dashGhost = im Dash durch Linien hindurch
// Neuer Charakter: hier eine Zeile ergänzen, dazu einen Look in PRESETS (shared/room.js) und einen Körperbau in BUILDS (js/atze.js).
const BASE = { speed: 1, airSpeed: 1, turn: 1, jet: 1, regen: 1, dashCd: 1, dashLen: 1, line: 1, hit: 1, selfImmune: false, dashGhost: false, special: '' };
export const CLASSES = [
  { id: 'allround', name: 'Allrounder', desc: 'Solide in allem.' },
  { id: 'raser', name: 'Raser', desc: 'Brutal schnell, lenkt wie ein Tanker, kleiner Tank.', speed: 1.3, turn: 0.8, jet: 0.6, regen: 0.75, dashCd: 1.3, dashLen: 0.8 },
  { id: 'wiesel', name: 'Wiesel', desc: 'Langsam, dreht aber auf der Stelle.', speed: 0.86, turn: 1.5, jet: 0.8, regen: 1.2, dashCd: 0.8 },
  { id: 'flieger', name: 'Flieger', desc: 'Riesentank, der blitzschnell nachlädt.', speed: 0.93, turn: 0.95, jet: 2.2, regen: 2.0, dashCd: 1.3, dashLen: 0.9 },
  { id: 'kante', name: 'Kante', desc: 'Gemütlich, aber dasht fast pausenlos.', speed: 0.9, turn: 1.1, jet: 0.7, regen: 0.9, dashCd: 0.4, dashLen: 1.5 },
  { id: 'geist', name: 'Geist', desc: 'Langsam und kleiner Tank.', special: 'Läuft durch die eigene Linie', speed: 0.84, turn: 1.0, jet: 0.7, regen: 0.8, dashCd: 1.3, selfImmune: true },
  { id: 'rammbock', name: 'Rammbock', desc: 'Selten bereit, dann unaufhaltsam.', special: 'Dasht durch Linien hindurch', speed: 0.95, turn: 0.9, jet: 0.8, dashCd: 1.7, dashLen: 0.9, dashGhost: true },
  { id: 'brummer', name: 'Brummer', desc: 'Träge, macht aber den Planeten dicht.', special: 'Zieht eine extra dicke Linie', speed: 0.88, turn: 0.9, regen: 0.9, dashCd: 1.2, line: 1.8 },
  { id: 'segler', name: 'Segler', desc: 'Am Boden lahm, oben eine Rakete.', special: 'Fliegt viel schneller als er läuft', speed: 0.85, airSpeed: 1.55, turn: 1.05, jet: 1.5, regen: 1.3, dashCd: 1.4 },
  { id: 'hering', name: 'Hering', desc: 'Passt durch Lücken, wo andere hängen bleiben.', special: 'Halb so breite Trefferfläche', speed: 1.02, turn: 1.1, jet: 0.75, regen: 0.9, dashCd: 1.2, hit: 0.45 },
].map((c) => ({ ...BASE, ...c }));

export function planetRadius(nPlayers) {
  return 8.5 + 1.1 * Math.max(2, nPlayers);
}

// ---------- Bewegungszustand eines Atzen ----------
// p = Position auf der Einheitskugel, h = Blickrichtung (Tangente), alt = Höhe über dem Boden

export function newKin() {
  return { px: 0, py: 1, pz: 0, hx: 0, hy: 0, hz: 1, alt: 0, up: 0, fuel: 1, fw: 0, da: 0, dc: 0, jp: 0, dp: 0, th: 0, ft: 0 };
}

const r5 = (v) => Math.round(v * 1e5) / 1e5;
const r3 = (v) => Math.round(v * 1e3) / 1e3;

export function packKin(s) {
  return [r5(s.px), r5(s.py), r5(s.pz), r5(s.hx), r5(s.hy), r5(s.hz), r3(s.alt), s.up, r3(s.fuel), r3(s.fw), r3(s.da), r3(s.dc), s.jp, s.dp, s.th, r3(s.ft)];
}

export function unpackKin(a, s = newKin()) {
  s.px = a[0]; s.py = a[1]; s.pz = a[2]; s.hx = a[3]; s.hy = a[4]; s.hz = a[5];
  s.alt = a[6]; s.up = a[7]; s.fuel = a[8]; s.fw = a[9]; s.da = a[10]; s.dc = a[11]; s.jp = a[12]; s.dp = a[13]; s.th = a[14]; s.ft = a[15] || 0;
  return s;
}

// Ein Simulationsschritt für einen Atzen. inp = { s: -1..1 (rechts positiv), j: Jetpack gehalten, d: Dash gehalten }
export function stepKin(s, inp, k, R) {
  const dt = DT;

  // Dash
  const dPress = inp.d && !s.dp;
  s.dp = inp.d ? 1 : 0;
  if (s.dc > 0) s.dc = Math.max(0, s.dc - dt);
  if (dPress && s.dc <= 0) { s.da = C.DASH_TIME * k.dashLen; s.dc = C.DASH_CD * k.dashCd; }
  let speed = C.SPEED * k.speed * (s.alt > 0 ? k.airSpeed : 1);
  if (s.da > 0) { speed *= C.DASH_MULT; s.da = Math.max(0, s.da - dt); }

  // Jetpack: Druck = abheben (immer bis ganz auf Flughöhe), halten = oben bleiben, loslassen = landen.
  // Jeder Flug dauert mindestens FLY_MIN – auch bei einem kurzen Tipper oder fast leerem Tank.
  // So ist das Stück Linie auf Flughöhe immer breit genug, um unten durchzulaufen.
  const jPress = inp.j && !s.jp;
  s.jp = inp.j ? 1 : 0;
  if (s.up) {
    s.ft += dt;
    s.fuel = Math.max(0, s.fuel - dt / (C.FUEL_TIME * k.jet));
    s.fw = C.FUEL_DELAY;
    if (s.ft >= C.FLY_MIN && (s.fuel <= 0 || !inp.j)) s.up = 0;
  } else if (jPress && s.fuel >= C.FUEL_MIN) {
    s.up = 1; s.ft = 0;
  }
  if (s.up) s.alt = Math.min(C.FLY_H, s.alt + C.UP_V * dt);
  else if (s.alt > 0) s.alt = Math.max(0, s.alt - C.DOWN_V * dt);
  else if (s.fw > 0) s.fw = Math.max(0, s.fw - dt);
  else if (s.fuel < 1) s.fuel = Math.min(1, s.fuel + C.FUEL_REGEN * k.regen * dt);
  s.th = s.up;

  // Lenken: h um p drehen (positiv = links, deshalb Minus)
  let px = s.px, py = s.py, pz = s.pz, hx = s.hx, hy = s.hy, hz = s.hz;
  const w = -inp.s * C.TURN * k.turn * dt;
  if (w !== 0) {
    const cw = Math.cos(w), sw = Math.sin(w);
    const cx = py * hz - pz * hy, cy = pz * hx - px * hz, cz = px * hy - py * hx;
    hx = hx * cw + cx * sw; hy = hy * cw + cy * sw; hz = hz * cw + cz * sw;
  }
  // Vorwärts laufen: p und h gemeinsam auf dem Großkreis weiterdrehen
  const a = (speed * dt) / R;
  const ca = Math.cos(a), sa = Math.sin(a);
  let nx = px * ca + hx * sa, ny = py * ca + hy * sa, nz = pz * ca + hz * sa;
  let mx = hx * ca - px * sa, my = hy * ca - py * sa, mz = hz * ca - pz * sa;
  let l = 1 / Math.hypot(nx, ny, nz);
  nx *= l; ny *= l; nz *= l;
  const d = mx * nx + my * ny + mz * nz;
  mx -= nx * d; my -= ny * d; mz -= nz * d;
  l = 1 / Math.hypot(mx, my, mz);
  s.px = nx; s.py = ny; s.pz = nz;
  s.hx = mx * l; s.hy = my * l; s.hz = mz * l;
  return s;
}

// ---------- Eine Runde ----------

export class Round {
  // defs: [{ pid, cls }]
  constructor(defs, R) {
    this.R = R;
    this.tick = 0;
    this.over = false;
    this.winner = null;
    this.n0 = defs.length;
    const n = defs.length;
    this.pl = defs.map((d, i) => {
      const s = newKin();
      const th = (i / n) * Math.PI * 2;
      const side = i % 2 ? -1 : 1;
      const tilt = 0.6;
      s.px = Math.cos(th); s.py = 0; s.pz = Math.sin(th);
      // Tangente am Äquator, abwechselnd Richtung Nord-/Südpol gekippt
      s.hx = -Math.sin(th) * Math.cos(tilt); s.hy = Math.sin(tilt) * side; s.hz = Math.cos(th) * Math.cos(tilt);
      return {
        pid: d.pid, k: CLASSES[d.cls] || CLASSES[0], s, alive: true,
        inp: { s: 0, j: false, d: false },
        tx: [], ty: [], tz: [], ta: [], tail: 0, sent: 0, by: -1, diedTick: -1,
      };
    });
    this.stepDot = 1 - (C.TRAIL_STEP * C.TRAIL_STEP) / (2 * R * R);
  }

  get(pid) { return this.pl.find((p) => p.pid === pid); }

  kill(pid, by = -1) {
    const pl = this.get(pid);
    if (pl && pl.alive) { pl.alive = false; pl.by = by; pl.diedTick = this.tick; return true; }
    return false;
  }

  // Steckt dieser Atze in einer Linie? Gibt den Index des Linien-Besitzers zurück, sonst -1.
  hitBy(pl) {
    const s = pl.s, x = s.px, y = s.py, z = s.pz, alt = s.alt, top = alt + C.BODY_H;
    const body = C.BODY_R * pl.k.hit, R2 = 2 * this.R * this.R;
    const pls = this.pl;
    for (let b = 0; b < pls.length; b++) {
      const o = pls[b];
      const tx = o.tx, ty = o.ty, tz = o.tz, ta = o.ta;
      let end = tx.length;
      if (o === pl) { if (pl.k.selfImmune) continue; end -= C.SELF_SKIP; }
      const tube = C.TUBE_R * o.k.line, thr = body + tube;
      const dotMin = 1 - (thr * thr) / R2, lo = C.TUBE_C - tube, hi = C.TUBE_C + tube;
      for (let i = 0; i < end; i++) {
        if (x * tx[i] + y * ty[i] + z * tz[i] > dotMin) {
          const a = ta[i];
          if (alt < a + hi && top > a + lo) return b;
        }
      }
    }
    return -1;
  }

  step() {
    const ev = [];
    const R = this.R;
    for (const pl of this.pl) {
      if (!pl.alive) continue; // die Linie bleibt liegen
      const s = pl.s;
      stepKin(s, pl.inp, pl.k, R);
      const n = pl.tx.length;
      // neuer Stützpunkt nach etwas Strecke – oder sofort, wenn sich die Höhe merklich ändert (saubere Rampen)
      if (n === 0 || s.px * pl.tx[n - 1] + s.py * pl.ty[n - 1] + s.pz * pl.tz[n - 1] < this.stepDot || Math.abs(s.alt - pl.ta[n - 1]) > 0.45) {
        pl.tx.push(s.px); pl.ty.push(s.py); pl.tz.push(s.pz); pl.ta.push(s.alt);
      }
    }
    if (!this.over) {
      const dead = [];
      for (const pl of this.pl) {
        if (!pl.alive) continue;
        if (pl.k.dashGhost && pl.s.da > 0) continue; // Rammbock: im Dash unverwundbar
        const b = this.hitBy(pl);
        if (b >= 0) dead.push([pl, this.pl[b].pid]);
      }
      for (const [pl, by] of dead) {
        pl.alive = false; pl.by = by; pl.diedTick = this.tick;
        ev.push([pl.pid, by]);
      }
      this.checkOver();
    }
    this.tick++;
    return ev;
  }

  checkOver() {
    if (this.over) return;
    const alive = this.pl.filter((p) => p.alive);
    if (this.n0 >= 2 ? alive.length <= 1 : alive.length === 0) {
      this.over = true;
      this.winner = this.n0 >= 2 && alive.length === 1 ? alive[0].pid : null;
    }
  }
}

// ---------- Bots ----------

const BOT_LEVELS = [
  { every: 12, horizon: 0.7, cands: [0, -1, 1], noise: 0.25, jumpP: 0.6, dash: 0 },
  { every: 8, horizon: 1.0, cands: [0, -1, 1, -0.5, 0.5], noise: 0.08, jumpP: 0.9, dash: 0.004 },
  { every: 5, horizon: 1.3, cands: [0, -1, 1, -0.5, 0.5], noise: 0.02, jumpP: 1, dash: 0.012 },
];
export const BOT_LEVEL_NAMES = ['Lauch', 'Normal', 'Endgegner'];
// Ab dieser Linien-Höhe blockiert eine Linie nur noch die Luft bzw. darunter nur den Boden
const GROUND_MAX = C.BODY_H - C.RIB_LO;   // Linie darunter trifft einen Läufer
const AIR_MIN = C.FLY_H - C.RIB_HI;       // Linie darüber trifft einen Flieger

export class Bot {
  constructor(level = 1) {
    this.level = Math.max(0, Math.min(2, level | 0));
    this.phase = Math.floor(Math.random() * 12);
    this.steer = 0; this.fly = false; this.dash = 0;
    this.wander = 0; this.wanderT = 0;
    this.out = { s: 0, j: false, d: false };
    this.g = []; this.gn = 0; // Linien-Punkte in der Nähe, die den Boden blockieren
    this.a = []; this.an = 0; // ... und die, die die Flughöhe blockieren
  }

  // Alle Linien-Punkte in Reichweite einsammeln (einmal pro Entscheidung) – spart bei vollen Karten viel Rechenzeit
  gather(round, me, reach) {
    const s = me.s, g = this.g, a = this.a;
    const ang = reach / round.R;
    const dm = ang >= Math.PI ? -2 : Math.cos(ang);
    let gn = 0, an = 0;
    for (const o of round.pl) {
      const tx = o.tx, ty = o.ty, tz = o.tz, ta = o.ta;
      let end = tx.length;
      if (o === me) { if (me.k.selfImmune) continue; end -= C.SELF_SKIP; }
      for (let i = 0; i < end; i += 2) {
        const x = tx[i], y = ty[i], z = tz[i];
        if (s.px * x + s.py * y + s.pz * z > dm) {
          if (ta[i] < GROUND_MAX) { g[gn++] = x; g[gn++] = y; g[gn++] = z; }
          if (ta[i] > AIR_MIN) { a[an++] = x; a[an++] = y; a[an++] = z; }
        }
      }
    }
    this.gn = gn; this.an = an;
  }

  // Wie lange (Sekunden) bleibt der Weg mit konstantem Lenkeinschlag auf dieser Ebene frei?
  pathTime(round, me, steer, horizon, air) {
    const s = me.s, R = round.R;
    const dtc = 0.05;
    const speed = C.SPEED * me.k.speed * (air ? me.k.airSpeed : 1);
    const a = (speed * dtc) / R, ca = Math.cos(a), sa = Math.sin(a);
    const w = -steer * C.TURN * me.k.turn * dtc, cw = Math.cos(w), sw = Math.sin(w);
    let px = s.px, py = s.py, pz = s.pz, hx = s.hx, hy = s.hy, hz = s.hz;
    const thr = 0.4 + C.BODY_R * me.k.hit;
    const dotMin = 1 - (thr * thr) / (2 * R * R);
    const headR = 1.1;
    const headDot = 1 - (headR * headR) / (2 * R * R);
    const near = air ? this.a : this.g, nn = air ? this.an : this.gn;
    for (let t = dtc; t <= horizon + 1e-6; t += dtc) {
      const cx = py * hz - pz * hy, cy = pz * hx - px * hz, cz = px * hy - py * hx;
      hx = hx * cw + cx * sw; hy = hy * cw + cy * sw; hz = hz * cw + cz * sw;
      const nx = px * ca + hx * sa, ny = py * ca + hy * sa, nz = pz * ca + hz * sa;
      hx = hx * ca - px * sa; hy = hy * ca - py * sa; hz = hz * ca - pz * sa;
      px = nx; py = ny; pz = nz;
      for (let i = 0; i < nn; i += 3) if (px * near[i] + py * near[i + 1] + pz * near[i + 2] > dotMin) return t - dtc;
      // nicht direkt vor die Nase anderer Atzen auf derselben Ebene laufen
      for (const o of round.pl) {
        if (o === me || !o.alive || (o.s.alt > 1) !== air) continue;
        const os = o.s, adv = (C.SPEED * o.k.speed * t) / R;
        const ox = os.px + os.hx * adv, oy = os.py + os.hy * adv, oz = os.pz + os.hz * adv;
        const l = 1 / Math.hypot(ox, oy, oz);
        if ((px * ox + py * oy + pz * oz) * l > headDot) return t - dtc;
      }
    }
    return horizon;
  }

  think(round, me) {
    const L = BOT_LEVELS[this.level];
    const s = me.s;
    this.wanderT -= DT;
    if (this.wanderT <= 0) {
      this.wanderT = 0.8 + Math.random() * 2.2;
      this.wander = [-0.6, -0.3, 0, 0, 0.3, 0.6][Math.floor(Math.random() * 6)];
    }
    if ((round.tick + this.phase) % L.every === 0) {
      this.gather(round, me, C.SPEED * me.k.speed * L.horizon + 1.5);
      const flying = s.up === 1 || s.alt > 0;
      let bestS = 0, bestScore = -1, bestT = 0;
      for (const st of L.cands) {
        const t = this.pathTime(round, me, st, L.horizon, flying);
        const score = t + (st === this.steer ? 0.06 : 0) - Math.abs(st - this.wander) * 0.05 + Math.random() * L.noise;
        if (score > bestScore) { bestScore = score; bestS = st; bestT = t; }
      }
      this.steer = bestT >= L.horizon ? (bestS === 0 ? this.wander : bestS) : bestS;
      if (!flying) {
        if (this.fly) this.fly = false; // Knopf erst loslassen, dann kann neu gedrückt werden
        else if (bestT <= 0.35 && s.fuel >= 0.4 && Math.random() < L.jumpP) {
          // Boden gleich dicht: abheben, wenn oben frei ist
          // ein Flug dauert mindestens FLY_MIN – so lange muss oben frei sein
          if (this.pathTime(round, me, bestS, C.FLY_MIN + 0.15, true) >= C.FLY_MIN) this.fly = true;
        }
      } else {
        // oben bleiben, solange unten etwas im Weg ist; runter, wenn die Luft dicht wird
        const ground = this.pathTime(round, me, bestS, 0.6, false);
        this.fly = ground < 0.55 && bestT > 0.15;
      }
      if (L.dash && bestT >= L.horizon && s.dc <= 0 && Math.random() < L.dash * L.every) this.dash = 0.1;
    }
    if (this.dash > 0) this.dash -= DT;
    const o = this.out;
    o.s = this.steer; o.j = this.fly; o.d = this.dash > 0;
    return o;
  }
}

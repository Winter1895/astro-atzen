// Astro Atzen – gemeinsame Spiellogik.
// Läuft identisch auf dem Server (Node) und im Browser (Vorhersage + Training).

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SNAP_EVERY = 3; // Server schickt alle 3 Ticks einen Zustand (20x pro Sekunde)

// Alle Stellschrauben fürs Spielgefühl an einem Ort
export const C = {
  SPEED: 8.5,        // Laufgeschwindigkeit (Einheiten/Sekunde)
  TURN: 2.7,         // Lenkgeschwindigkeit (Radiant/Sekunde)
  GRAV: 30,
  JUMP_V: 9,         // Absprunggeschwindigkeit
  THRUST: 46,        // Jetpack-Schub
  HOVER_V: 2.6,      // max. Steiggeschwindigkeit mit Jetpack
  MAX_ALT: 2.5,      // Schwebehöhe
  FUEL_TIME: 1.15,   // Sekunden Schub bei vollem Tank
  FUEL_REGEN: 0.6,   // Tank pro Sekunde am Boden
  FUEL_DELAY: 0.3,   // Pause, bevor der Tank nachlädt
  DASH_MULT: 1.9,
  DASH_TIME: 0.4,
  DASH_CD: 3,
  BODY_H: 1.5,       // Körperhöhe des Atzen
  HIT_R: 0.42,       // Trefferradius Atze <-> Band
  RIB_LO: 0.25,      // Unterkante der Röhre über dem Boden
  RIB_HI: 0.65,      // Oberkante der Röhre
  TUBE_R: 0.2,       // Radius der Röhre (nur Optik, passend zu RIB_LO/RIB_HI)
  TRAIL_STEP: 0.3,   // Abstand der Band-Stützpunkte
  SELF_SKIP: 9,      // die letzten Punkte der eigenen Linie zählen nicht
};
// Die Linien bleiben die ganze Runde liegen (kein Kürzen wie bei Snake) – auch die von Ausgeschiedenen.

// Atzen-Typen (wie die unterschiedlichen Spielstile im Original)
export const CLASSES = [
  { id: 'allround', name: 'Allrounder', desc: 'Kann alles ein bisschen.', speed: 1.0, jet: 1.0, turn: 1.0 },
  { id: 'raser', name: 'Raser', desc: 'Schnell, lenkt aber träge.', speed: 1.14, jet: 0.85, turn: 0.88 },
  { id: 'wiesel', name: 'Wiesel', desc: 'Wendig wie sonst keiner.', speed: 0.94, jet: 0.9, turn: 1.28 },
  { id: 'flieger', name: 'Flieger', desc: 'Jetpack hält doppelt so lang.', speed: 0.97, jet: 1.7, turn: 1.0 },
];

export function planetRadius(nPlayers) {
  return 8.5 + 1.1 * Math.max(2, nPlayers);
}

// ---------- Bewegungszustand eines Atzen ----------
// p = Position auf der Einheitskugel, h = Blickrichtung (Tangente), alt = Höhe über dem Boden

export function newKin() {
  return { px: 0, py: 1, pz: 0, hx: 0, hy: 0, hz: 1, alt: 0, vy: 0, fuel: 1, fw: 0, da: 0, dc: 0, jp: 0, dp: 0, th: 0 };
}

const r5 = (v) => Math.round(v * 1e5) / 1e5;
const r3 = (v) => Math.round(v * 1e3) / 1e3;

export function packKin(s) {
  return [r5(s.px), r5(s.py), r5(s.pz), r5(s.hx), r5(s.hy), r5(s.hz), r3(s.alt), r3(s.vy), r3(s.fuel), r3(s.fw), r3(s.da), r3(s.dc), s.jp, s.dp, s.th];
}

export function unpackKin(a, s = newKin()) {
  s.px = a[0]; s.py = a[1]; s.pz = a[2]; s.hx = a[3]; s.hy = a[4]; s.hz = a[5];
  s.alt = a[6]; s.vy = a[7]; s.fuel = a[8]; s.fw = a[9]; s.da = a[10]; s.dc = a[11]; s.jp = a[12]; s.dp = a[13]; s.th = a[14];
  return s;
}

// Ein Simulationsschritt für einen Atzen. inp = { s: -1..1 (rechts positiv), j: Jetpack gehalten, d: Dash gehalten }
export function stepKin(s, inp, k, R) {
  const dt = DT;

  // Dash
  const dPress = inp.d && !s.dp;
  s.dp = inp.d ? 1 : 0;
  if (s.dc > 0) s.dc = Math.max(0, s.dc - dt);
  if (dPress && s.dc <= 0) { s.da = C.DASH_TIME; s.dc = C.DASH_CD; }
  let speed = C.SPEED * k.speed;
  if (s.da > 0) { speed *= C.DASH_MULT; s.da = Math.max(0, s.da - dt); }

  // Sprung + Jetpack
  const jPress = inp.j && !s.jp;
  s.jp = inp.j ? 1 : 0;
  s.th = 0;
  if (s.alt <= 0) {
    if (jPress) {
      s.vy = C.JUMP_V; s.alt = 0.0001; s.fw = C.FUEL_DELAY;
    } else {
      s.vy = 0;
      if (s.fw > 0) s.fw = Math.max(0, s.fw - dt);
      else if (s.fuel < 1) s.fuel = Math.min(1, s.fuel + C.FUEL_REGEN * dt);
    }
  }
  if (s.alt > 0) {
    let acc = -C.GRAV;
    if (inp.j && s.fuel > 0 && s.vy < C.HOVER_V) {
      acc += C.THRUST;
      s.th = 1;
      s.fuel = Math.max(0, s.fuel - dt / (C.FUEL_TIME * k.jet));
      s.fw = C.FUEL_DELAY;
    }
    s.vy += acc * dt;
    if (s.th) {
      const cap = Math.min(C.HOVER_V, (C.MAX_ALT - s.alt) * 6);
      if (s.vy > cap) s.vy = cap;
    }
    s.alt += s.vy * dt;
    if (s.alt <= 0) { s.alt = 0; s.vy = 0; }
  }

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
    this.hitDot = 1 - (C.HIT_R * C.HIT_R) / (2 * R * R);
    this.stepDot = 1 - (C.TRAIL_STEP * C.TRAIL_STEP) / (2 * R * R);
  }

  get(pid) { return this.pl.find((p) => p.pid === pid); }

  kill(pid, by = -1) {
    const pl = this.get(pid);
    if (pl && pl.alive) { pl.alive = false; pl.by = by; pl.diedTick = this.tick; return true; }
    return false;
  }

  // Gibt den Index des Band-Besitzers zurück, in dessen Band (x,y,z,alt) steckt – sonst -1
  hit(x, y, z, alt, dotMin, self, stride) {
    const top = alt + C.BODY_H;
    const pls = this.pl;
    for (let b = 0; b < pls.length; b++) {
      const o = pls[b];
      const tx = o.tx, ty = o.ty, tz = o.tz, ta = o.ta;
      let end = tx.length;
      if (o === self) end -= C.SELF_SKIP;
      for (let i = o.tail; i < end; i += stride) {
        if (x * tx[i] + y * ty[i] + z * tz[i] > dotMin) {
          const a = ta[i];
          if (alt < a + C.RIB_HI && top > a + C.RIB_LO) return b;
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
      if (n === 0 || s.px * pl.tx[n - 1] + s.py * pl.ty[n - 1] + s.pz * pl.tz[n - 1] < this.stepDot) {
        pl.tx.push(s.px); pl.ty.push(s.py); pl.tz.push(s.pz); pl.ta.push(s.alt);
      }
    }
    if (!this.over) {
      const dead = [];
      for (const pl of this.pl) {
        if (!pl.alive) continue;
        const s = pl.s;
        const b = this.hit(s.px, s.py, s.pz, s.alt, this.hitDot, pl, 1);
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

export class Bot {
  constructor(level = 1) {
    this.level = Math.max(0, Math.min(2, level | 0));
    this.phase = Math.floor(Math.random() * 12);
    this.steer = 0; this.jump = 0; this.dash = 0;
    this.wander = 0; this.wanderT = 0;
    this.out = { s: 0, j: false, d: false };
    this.near = []; this.nearN = 0;
  }

  // Alle Linien-Punkte in Reichweite einsammeln (einmal pro Entscheidung) – spart bei vollen Karten viel Rechenzeit
  gather(round, me, reach) {
    const s = me.s, near = this.near;
    const ang = reach / round.R;
    const dm = ang >= Math.PI ? -2 : Math.cos(ang);
    let n = 0;
    for (const o of round.pl) {
      const tx = o.tx, ty = o.ty, tz = o.tz, ta = o.ta;
      let end = tx.length;
      if (o === me) end -= C.SELF_SKIP;
      for (let i = 0; i < end; i += 2) {
        const x = tx[i], y = ty[i], z = tz[i];
        if (s.px * x + s.py * y + s.pz * z > dm && ta[i] < 1.2) { near[n++] = x; near[n++] = y; near[n++] = z; }
      }
    }
    this.nearN = n;
  }

  // Wie lange (Sekunden) bleibt der Weg mit konstantem Lenkeinschlag frei?
  pathTime(round, me, steer, horizon) {
    const s = me.s, R = round.R;
    const dtc = 0.05;
    const speed = C.SPEED * me.k.speed;
    const a = (speed * dtc) / R, ca = Math.cos(a), sa = Math.sin(a);
    const w = -steer * C.TURN * me.k.turn * dtc, cw = Math.cos(w), sw = Math.sin(w);
    let px = s.px, py = s.py, pz = s.pz, hx = s.hx, hy = s.hy, hz = s.hz;
    const tAir = s.alt > 0 ? (s.vy + Math.sqrt(s.vy * s.vy + 2 * C.GRAV * s.alt)) / C.GRAV : 0;
    const thr = 0.62;
    const dotMin = 1 - (thr * thr) / (2 * R * R);
    const headR = 1.1;
    const headDot = 1 - (headR * headR) / (2 * R * R);
    const near = this.near, nn = this.nearN;
    for (let t = dtc; t <= horizon + 1e-6; t += dtc) {
      const cx = py * hz - pz * hy, cy = pz * hx - px * hz, cz = px * hy - py * hx;
      hx = hx * cw + cx * sw; hy = hy * cw + cy * sw; hz = hz * cw + cz * sw;
      const nx = px * ca + hx * sa, ny = py * ca + hy * sa, nz = pz * ca + hz * sa;
      hx = hx * ca - px * sa; hy = hy * ca - py * sa; hz = hz * ca - pz * sa;
      px = nx; py = ny; pz = nz;
      if (t < tAir - 0.05) continue;
      for (let i = 0; i < nn; i += 3) if (px * near[i] + py * near[i + 1] + pz * near[i + 2] > dotMin) return t - dtc;
      // nicht direkt vor die Nase anderer Atzen laufen
      for (const o of round.pl) {
        if (o === me || !o.alive) continue;
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
      let bestS = 0, bestScore = -1, bestT = 0;
      for (const st of L.cands) {
        const t = this.pathTime(round, me, st, L.horizon);
        const score = t + (st === this.steer ? 0.06 : 0) - Math.abs(st - this.wander) * 0.05 + Math.random() * L.noise;
        if (score > bestScore) { bestScore = score; bestS = st; bestT = t; }
      }
      this.steer = bestT >= L.horizon ? (bestS === 0 ? this.wander : bestS) : bestS;
      if (s.alt <= 0) {
        if (bestT <= 0.35 && Math.random() < L.jumpP) this.jump = 0.25 + Math.random() * 0.35;
      } else if (s.fuel > 0.05) {
        // Landeplatz prüfen – liegt dort ein Band, weiter schweben
        const tAir = (s.vy + Math.sqrt(s.vy * s.vy + 2 * C.GRAV * s.alt)) / C.GRAV;
        const adv = (C.SPEED * me.k.speed * tAir) / round.R;
        const lx = s.px + s.hx * adv, ly = s.py + s.hy * adv, lz = s.pz + s.hz * adv;
        const l = 1 / Math.hypot(lx, ly, lz);
        const thr = 1.0, dm = 1 - (thr * thr) / (2 * round.R * round.R);
        if (round.hit(lx * l, ly * l, lz * l, 0, dm, me, 2) >= 0) this.jump = Math.max(this.jump, 0.15);
      }
      if (L.dash && bestT >= L.horizon && s.dc <= 0 && Math.random() < L.dash * L.every) this.dash = 0.1;
    }
    if (this.jump > 0) this.jump -= DT;
    if (this.dash > 0) this.dash -= DT;
    const o = this.out;
    o.s = this.steer; o.j = this.jump > 0; o.d = this.dash > 0;
    return o;
  }
}

// Astro Atzen – Spielzustand im Client.
// Der eigene Atze wird lokal vorhergesagt (fühlt sich sofort an) und mit dem Server abgeglichen,
// die anderen werden zwischen zwei Server-Zuständen weich interpoliert.

import { CLASSES, stepKin, unpackKin, newKin, DT, TICK_RATE } from '../shared/sim.js';

const INTERP = 6; // Ticks, um die andere Atzen verzögert dargestellt werden (100 ms)

function newTrail() { return { x: [], y: [], z: [], a: [], k: [], tail: 0, head: 0 }; }

export class ClientGame {
  constructor(roundMsg, myPid, roster, sendInput) {
    this.R = roundMsg.R;
    this.theme = roundMsg.theme;
    this.seed = roundMsg.seed;
    this.no = roundMsg.no;
    this.myPid = myPid;
    this.sendInput = sendInput;
    this.k = roundMsg.k;
    this.over = !!roundMsg.over;
    this.live = false;
    this.tickOff = null;
    this.players = new Map();
    this.events = []; // [pid, by] – wird von der Oberfläche abgeholt
    roundMsg.ids.forEach((pid, i) => {
      const kin = unpackKin(roundMsg.kin[i]);
      const info = roster.get(pid);
      this.players.set(pid, {
        pid, cls: CLASSES[info ? info.cls : 0] || CLASSES[0], alive: true, flags: 1, diedAt: 0,
        snaps: [{ k: roundMsg.k, x: kin.px, y: kin.py, z: kin.pz, hx: kin.hx, hy: kin.hy, hz: kin.hz, alt: kin.alt, fl: 1 }],
        trail: newTrail(),
        out: { x: kin.px, y: kin.py, z: kin.pz, hx: kin.hx, hy: kin.hy, hz: kin.hz, alt: kin.alt, fl: 1, alive: true },
      });
    });
    if (roundMsg.trails) {
      for (const [pid, tail, flat, alive] of roundMsg.trails) {
        const pl = this.players.get(pid);
        if (!pl) continue;
        this.addPoints(pl.trail, tail, flat, roundMsg.k - 1000);
        pl.trail.tail = tail;
        pl.alive = !!alive;
        pl.out.alive = pl.alive;
      }
    }
    // eigener Atze
    this.me = this.players.get(myPid) || null;
    this.ps = this.me ? unpackKin(roundMsg.kin[roundMsg.ids.indexOf(myPid)]) : null;
    this.pend = [];
    this.path = []; // vorhergesagte eigene Positionen, die der Server noch nicht bestätigt hat
    this.seq = 0;
    this.ex = 0; this.ey = 0; this.ez = 0; // Korrektur-Versatz, der weich ausgeblendet wird
    this.corr = 0; // letzte Korrekturgröße (für Tests / Debug)
    // D = wie viele Eingaben der Server bei Tick k schon verarbeitet hat (a - k), geglättet.
    // Ohne Glättung würde der eigene Atze bei jedem Netz-Zucker um einen Tick vor/zurück springen.
    this.D = null; this.dDir = 0; this.dRun = 0;
  }

  addPoints(tr, idx, flat, k) {
    for (let i = 0, j = idx; i < flat.length; i += 4, j++) {
      tr.x[j] = flat[i]; tr.y[j] = flat[i + 1]; tr.z[j] = flat[i + 2]; tr.a[j] = flat[i + 3]; tr.k[j] = k;
    }
    const end = idx + flat.length / 4;
    if (end > tr.head) tr.head = end;
  }

  onSnap(m, nowMs) {
    const off = m.k - nowMs * (TICK_RATE / 1000);
    if (this.tickOff === null || Math.abs(off - this.tickOff) > 12) this.tickOff = off;
    else this.tickOff += (off - this.tickOff) * 0.08;
    this.k = m.k;

    for (const p of m.p) {
      const pl = this.players.get(p[0]);
      if (!pl) continue;
      const fl = p[8];
      pl.snaps.push({ k: m.k, x: p[1], y: p[2], z: p[3], hx: p[4], hy: p[5], hz: p[6], alt: p[7], fl });
      if (pl.snaps.length > 30) pl.snaps.shift();
      pl.flags = fl;
      pl.trail.tail = p[9];
      if (pl.alive && !(fl & 1)) { pl.alive = false; pl.diedAt = nowMs; }
    }
    if (m.n) for (const [pid, idx, flat] of m.n) { const pl = this.players.get(pid); if (pl) this.addPoints(pl.trail, idx, flat, m.k); }
    if (m.e) for (const e of m.e) this.events.push(e);

    if (m.me && this.me) {
      if (m.k >= 0 && this.me.alive) {
        this.live = true;
        const ox = this.ps.px, oy = this.ps.py, oz = this.ps.pz;
        unpackKin(m.me, this.ps);
        const d = m.a - m.k;
        if (this.D === null || Math.abs(d - this.D) >= 3) { this.D = d; this.dRun = 0; }
        else if (d !== this.D) {
          const dir = Math.sign(d - this.D);
          if (dir === this.dDir) { if (++this.dRun >= 10) { this.D += dir; this.dRun = 0; } }
          else { this.dDir = dir; this.dRun = 1; }
        } else this.dRun = 0;
        const base = m.k + this.D; // Eingaben bis hierhin gelten als vom Server verarbeitet
        let i = 0;
        while (i < this.pend.length && this.pend[i].q <= base) i++;
        if (i) this.pend.splice(0, i);
        i = 0;
        while (i < this.path.length && this.path[i].q <= base) i++;
        if (i) this.path.splice(0, i);
        for (const inp of this.pend) stepKin(this.ps, inp, this.me.cls, this.R);
        const dx = ox - this.ps.px, dy = oy - this.ps.py, dz = oz - this.ps.pz;
        this.corr = Math.hypot(dx, dy, dz) * this.R;
        if (this.corr < 3) { this.ex += dx; this.ey += dy; this.ez += dz; } else { this.ex = this.ey = this.ez = 0; }
      } else {
        unpackKin(m.me, this.ps);
        this.pend.length = 0; this.path.length = 0;
        if (!this.me.alive) this.live = false;
      }
    }
  }

  // Fester 60-Hz-Schritt: Eingabe senden und eigenen Atzen sofort bewegen
  tick(inp) {
    if (!this.live || !this.me || !this.me.alive) return;
    const rec = { q: ++this.seq, s: Math.round(inp.s * 100) / 100, j: inp.j ? 1 : 0, d: inp.d ? 1 : 0 };
    this.pend.push(rec);
    if (this.pend.length > 150) this.pend.shift();
    stepKin(this.ps, rec, this.me.cls, this.R);
    const s = this.ps;
    this.path.push({ q: rec.q, x: s.px, y: s.py, z: s.pz, a: s.alt });
    if (this.path.length > 150) this.path.shift();
    this.sendInput(rec);
  }

  renderTick(nowMs) {
    return this.tickOff === null ? this.k : nowMs * (TICK_RATE / 1000) + this.tickOff - INTERP;
  }

  // Darstellungszustand aller Atzen für diesen Frame berechnen (liegt danach in pl.out)
  sample(nowMs, dt) {
    const rt = this.renderTick(nowMs);
    const f = Math.exp(-12 * dt);
    this.ex *= f; this.ey *= f; this.ez *= f;
    for (const pl of this.players.values()) {
      const o = pl.out;
      o.alive = pl.alive;
      if (pl === this.me && this.live && pl.alive) {
        const s = this.ps;
        let x = s.px + this.ex, y = s.py + this.ey, z = s.pz + this.ez;
        const l = 1 / Math.hypot(x, y, z);
        o.x = x * l; o.y = y * l; o.z = z * l; o.hx = s.hx; o.hy = s.hy; o.hz = s.hz; o.alt = s.alt;
        o.fl = 1 | (s.th ? 2 : 0) | (s.da > 0 ? 4 : 0);
        o.rt = Infinity;
        continue;
      }
      const sn = pl.snaps;
      let b = sn.length - 1;
      while (b > 0 && sn[b - 1].k >= rt) b--;
      const B = sn[b], A = b > 0 ? sn[b - 1] : B;
      let t = B.k > A.k ? (rt - A.k) / (B.k - A.k) : 1;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      let x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t, z = A.z + (B.z - A.z) * t;
      let l = 1 / Math.hypot(x, y, z);
      o.x = x * l; o.y = y * l; o.z = z * l;
      x = A.hx + (B.hx - A.hx) * t; y = A.hy + (B.hy - A.hy) * t; z = A.hz + (B.hz - A.hz) * t;
      l = 1 / Math.hypot(x, y, z);
      o.hx = x * l; o.hy = y * l; o.hz = z * l;
      o.alt = A.alt + (B.alt - A.alt) * t;
      o.fl = B.fl;
      o.rt = rt;
    }
    return rt;
  }
}

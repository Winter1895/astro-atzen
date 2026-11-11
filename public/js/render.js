// Astro Atzen – 3D-Darstellung: Planet, Atzen, Bänder, Kamera.

import * as THREE from '../vendor/three.min.js';
import { buildAtze, animateAtze, makeTag, SUITS } from './atze.js';
import { C } from '../shared/sim.js';

export const THEMES = [
  { name: 'Luna', a: 0x66709a, b: 0x4d5680, crater: 0x3b4267, rim: 0x8b96c2, rock: 0x7a85b0, sky: 0x090a20 },
  { name: 'Mars', a: 0xa85a3e, b: 0x86432f, crater: 0x66301f, rim: 0xd08462, rock: 0xc07050, sky: 0x160912 },
  { name: 'Traube', a: 0x74509f, b: 0x5a3c84, crater: 0x432a68, rim: 0xa07fd0, rock: 0x9370c4, sky: 0x100824 },
  { name: 'Frost', a: 0x4f8bab, b: 0x3b6f90, crater: 0x2c5674, rim: 0x86c4e0, rock: 0x74b4d2, sky: 0x051222 },
  { name: 'Moos', a: 0x4c8259, b: 0x396848, crater: 0x2a5038, rim: 0x7fb88a, rock: 0x6da87a, sky: 0x051416 },
];

const MODEL_SCALE = 1.2; // Atzen etwas größer zeichnen, damit man sie auf dem Handy gut erkennt
const MAXP = 2600; // max. Stützpunkte pro Linie (reicht für gut 80 Sekunden Dauerlauf)
const V = () => new THREE.Vector3();

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randUnit(rnd) {
  const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), z, r * Math.sin(a)];
}

function buildPlanet(R, themeIdx, seed) {
  const th = THEMES[themeIdx % THEMES.length];
  const rnd = mulberry32(seed || 1);
  const group = new THREE.Group();
  const g = new THREE.IcosahedronGeometry(R, Math.max(8, Math.round(R * 1.15)));
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const waves = Array.from({ length: 5 }, () => ({ d: randUnit(rnd), f: 1.5 + rnd() * 3, p: rnd() * 6.28 }));
  const craters = Array.from({ length: Math.round(R * 1.2) }, () => ({ d: randUnit(rnd), r: 0.9 + rnd() * rnd() * 2.6 }));
  const ca = new THREE.Color(th.a), cb = new THREE.Color(th.b), cc = new THREE.Color(th.crater), cr = new THREE.Color(th.rim), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    let x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    let y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    let z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const l = 1 / Math.hypot(x, y, z);
    x *= l; y *= l; z *= l;
    let v = 0;
    for (const w of waves) v += Math.sin((x * w.d[0] + y * w.d[1] + z * w.d[2]) * w.f + w.p);
    v = Math.min(1, Math.max(0, v / 3 + 0.5));
    c.copy(ca).lerp(cb, v * v * (3 - 2 * v));
    for (const k of craters) {
      const d = Math.acos(Math.min(1, x * k.d[0] + y * k.d[1] + z * k.d[2])) * R;
      if (d < k.r * 0.72) { c.copy(cc); break; }
      if (d < k.r) { c.copy(cr); break; }
    }
    c.multiplyScalar(0.93 + rnd() * 0.14);
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // Halb durchsichtig wie im Original: Linien und Atzen auf der Rückseite scheinen durch.
  // Erst die Innenseite der hinteren Hälfte (dunkler), dann die Vorderseite.
  const inner = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.BackSide, transparent: true, opacity: 0.28, depthWrite: false }));
  inner.renderOrder = -2;
  const outer = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.6 }));
  outer.renderOrder = -1;
  group.add(inner, outer);

  // Steinchen als Deko (nur Optik, man läuft einfach durch)
  const nRocks = Math.round(R * 4);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: th.rock, flatShading: true }), nRocks);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(), p = V();
  for (let i = 0; i < nRocks; i++) {
    const d = randUnit(rnd);
    const sc = 0.08 + rnd() * 0.2;
    p.set(d[0], d[1], d[2]).multiplyScalar(R + sc * 0.3);
    q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
    s.set(sc * (0.8 + rnd() * 0.6), sc * 0.7, sc * (0.8 + rnd() * 0.6));
    rocks.setMatrixAt(i, m.compose(p, q, s));
  }
  group.add(rocks);
  group.userData.sky = th.sky;
  return group;
}

// ----- Linie als Röhre -----
// Zwischen zwei Stützpunkten vom Server wird ein Kurvenpunkt eingefügt (Catmull-Rom),
// damit die Linie in Kurven rund aussieht statt eckig.
const TUBE_N = 8;                          // Ecken pro Ring
const TUBE_C = C.TUBE_C;                   // Höhe der Röhrenmitte über der Lauf-Höhe
const MAXR = MAXP * 2;                     // Ringe im Puffer (2 pro Stützpunkt)
const RING = Array.from({ length: TUBE_N }, (_, j) => [Math.cos((j / TUBE_N) * Math.PI * 2), Math.sin((j / TUBE_N) * Math.PI * 2)]);
let tubeIndex = null; // alle Röhren teilen sich dieselbe Dreiecksliste

function makeRibbon(color) {
  if (!tubeIndex) {
    const idx = new Uint32Array((MAXR - 1) * TUBE_N * 6);
    let k = 0;
    for (let i = 0; i < MAXR - 1; i++) {
      const a = i * TUBE_N, b = a + TUBE_N;
      for (let j = 0; j < TUBE_N; j++) {
        const j2 = (j + 1) % TUBE_N;
        idx[k++] = a + j; idx[k++] = a + j2; idx[k++] = b + j;
        idx[k++] = a + j2; idx[k++] = b + j2; idx[k++] = b + j;
      }
    }
    tubeIndex = new THREE.BufferAttribute(idx, 1);
  }
  const g = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(new Float32Array(MAXR * TUBE_N * 3), 3);
  const na = new THREE.BufferAttribute(new Float32Array(MAXR * TUBE_N * 3), 3);
  pa.setUsage(THREE.DynamicDrawUsage);
  na.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pa);
  g.setAttribute('normal', na);
  g.setIndex(tubeIndex);
  g.setDrawRange(0, 0);
  // leuchtet leicht von selbst, damit die Farbe auch im Schatten knallt
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.38 }));
  mesh.frustumCulled = false;
  return mesh;
}
const TMP_N = 512;
const TMP = new Float32Array(TMP_N * 4); // Zwischenspeicher für Stützpunkte: x, y, z, Höhe

class Sparks {
  constructor(scene, n = 300) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3).fill(9999);
    this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.34, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
    this.pts.frustumCulled = false;
    scene.add(this.pts);
    this.c = new THREE.Color();
  }
  burst(p, color, count, speed, up) {
    this.c.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.i = (this.i + 1) % this.n;
      const d = randUnit(Math.random);
      this.pos.set([p.x, p.y, p.z], i * 3);
      this.vel.set([d[0] * speed + (up ? up.x : 0), d[1] * speed + (up ? up.y : 0), d[2] * speed + (up ? up.z : 0)], i * 3);
      const w = 0.75 + Math.random() * 0.5;
      this.col.set([this.c.r * w, this.c.g * w, this.c.b * w], i * 3);
      this.life[i] = 0.5 + Math.random() * 0.6;
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3] = 9999; continue; }
      for (let j = 0; j < 3; j++) { this.pos[i * 3 + j] += this.vel[i * 3 + j] * dt; this.vel[i * 3 + j] *= 1 - 1.5 * dt; }
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.geometry.attributes.color.needsUpdate = true;
  }
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(THEMES[0].sky);
    this.cam = new THREE.PerspectiveCamera(58, 1, 0.1, 2000);
    this.scene.add(new THREE.HemisphereLight(0xeaf0ff, 0x54468a, 1.25));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.0);
    this.scene.add(this.sun);
    this.addSky();

    this.world = new THREE.Group();  // Spielwelt
    this.menu = new THREE.Group();   // Menü-Bühne
    this.scene.add(this.world, this.menu);
    this.menuPlanet = buildPlanet(5, 0, 7);
    this.menu.add(this.menuPlanet);
    this.menuAtze = null;
    this.menuKind = 'home';

    this.sparks = new Sparks(this.scene);
    this.actors = new Map();
    this.game = null;
    this.mode = 'menu';
    this.cu = V().set(0, 1, 0);
    this.ch = V().set(0, 0, 1);
    this.t = 0;
    this._a = V(); this._b = V(); this._c = V();
    this._m = new THREE.Matrix4();
    this.resize();
  }

  addSky() {
    const n = 1500, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = randUnit(Math.random), r = 900;
      pos.set([d[0] * r, d[1] * r, d[2] * r], i * 3);
      const b = 0.45 + Math.random() * 0.55, tint = Math.random();
      col.set([b * (tint < 0.2 ? 1 : 0.85), b * 0.88, b * (tint > 0.8 ? 1 : 0.9)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true }));
    stars.frustumCulled = false;
    this.scene.add(stars);
    // ferne Himmelskörper als Orientierung
    const big = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), new THREE.MeshBasicMaterial({ color: 0x4a3a8c }));
    big.position.set(-380, 160, -520);
    const ring = new THREE.Mesh(new THREE.RingGeometry(95, 130, 40), new THREE.MeshBasicMaterial({ color: 0x8f7fd6, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
    ring.rotation.set(1.25, 0.3, 0);
    big.add(ring);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(26, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff8a5c }));
    moon.position.set(420, -260, 380);
    const sunny = new THREE.Mesh(new THREE.SphereGeometry(34, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
    sunny.position.set(300, 520, -260);
    this.scene.add(big, moon, sunny);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.r.setSize(w, h, false);
    this.portrait = h > w;
    this.cam.aspect = w / h;
    this.cam.fov = this.portrait ? 80 : 58;
    this.cam.updateProjectionMatrix();
  }

  // ----- Menü -----
  setMenuAtze(atze) {
    if (this.menuAtze) this.menu.remove(this.menuAtze);
    this.menuAtze = buildAtze(atze);
    this.menuAtze.position.set(0, 5, 0);
    this.menu.add(this.menuAtze);
  }
  showMenu(kind) {
    this.mode = 'menu';
    this.menuKind = kind || 'home';
    this.menu.visible = true;
    this.world.visible = false;
    this.scene.background.set(THEMES[0].sky);
    if (this.menuAtze && kind !== 'editor') this.menuAtze.rotation.y = 0;
  }

  // ----- Runde -----
  startRound(game, roster) {
    this.game = game;
    this.mode = 'game';
    this.menu.visible = false;
    this.world.visible = true;
    this.disposeRound();
    const planet = buildPlanet(game.R, game.theme, game.seed);
    this.planet = planet;
    this.world.add(planet);
    this.scene.background.set(planet.userData.sky);
    for (const pl of game.players.values()) {
      const info = roster.get(pl.pid) || { name: '?', color: 0, look: {} };
      const color = SUITS[info.color] ?? SUITS[0];
      const model = buildAtze({ ...info.look, color: info.color, cls: info.cls });
      model.matrixAutoUpdate = false;
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.46, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
      shadow.matrixAutoUpdate = false;
      shadow.renderOrder = 1;
      const ribbon = makeRibbon(color);
      const tag = pl.pid === game.myPid ? null : makeTag(info.name, color);
      this.world.add(model, shadow, ribbon);
      if (tag) this.world.add(tag);
      this.actors.set(pl.pid, { model, shadow, ribbon, tag, color, deadFx: false, wasDash: false, done: 0, sx: 1, sy: 0, sz: 0, tubeR: C.TUBE_R * pl.cls.line, ghost: pl.cls.dashGhost });
    }
    const f = game.players.get(game.myPid) || game.players.values().next().value;
    if (f) { this.cu.set(f.out.x, f.out.y, f.out.z); this.ch.set(f.out.hx, f.out.hy, f.out.hz); }
  }

  // Speicher der letzten Runde freigeben (die Atzen-Formen sind geteilt und bleiben)
  disposeRound() {
    if (this.planet) this.planet.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.planet = null;
    for (const a of this.actors.values()) {
      a.ribbon.geometry.setIndex(null); a.ribbon.geometry.dispose(); a.ribbon.material.dispose();
      a.shadow.geometry.dispose(); a.shadow.material.dispose();
      if (a.tag) { a.tag.material.map.dispose(); a.tag.material.dispose(); }
      a.model.traverse((o) => { if (o.material) o.material.dispose(); });
    }
    this.world.clear();
    this.actors.clear();
  }

  // Einen Röhren-Ring in den Puffer schreiben. (tx,ty,tz) = Laufrichtung an dieser Stelle.
  writeRing(act, slot, R, x, y, z, alt, tx, ty, tz, rad) {
    const pos = act.ribbon.geometry.attributes.position.array, nor = act.ribbon.geometry.attributes.normal.array;
    const cx = y * tz - z * ty, cy = z * tx - x * tz, cz = x * ty - y * tx; // Seite = oben x Laufrichtung
    const l = Math.hypot(cx, cy, cz);
    if (l > 1e-7) { act.sx = cx / l; act.sy = cy / l; act.sz = cz / l; }
    const sx = act.sx, sy = act.sy, sz = act.sz, rc = R + alt + TUBE_C;
    let v = slot * TUBE_N * 3;
    for (let j = 0; j < TUBE_N; j++, v += 3) {
      const c = RING[j][0], s = RING[j][1];
      const nx = sx * c + x * s, ny = sy * c + y * s, nz = sz * c + z * s;
      nor[v] = nx; nor[v + 1] = ny; nor[v + 2] = nz;
      pos[v] = x * rc + nx * rad; pos[v + 1] = y * rc + ny * rad; pos[v + 2] = z * rc + nz * rad;
    }
  }

  // Schreibt für die Stützpunkte j0..j1-1 aus TMP je zwei Ringe: einen am Punkt und einen Kurvenpunkt
  // auf halbem Weg zum nächsten. Stützpunkt j landet auf Ring-Platz 2 * (abs0 + j).
  emit(act, R, n, j0, j1, abs0) {
    const T = TMP, r = act.tubeR;
    let last = -1;
    for (let j = j0; j < j1; j++) {
      const c = j * 4, a = (j > 0 ? j - 1 : j) * 4, b = (j < n - 1 ? j + 1 : j) * 4, d = (j < n - 2 ? j + 2 : n - 1) * 4;
      const slot = 2 * (abs0 + j);
      if (slot >= MAXR - 2) break;
      const rad = slot === 0 ? r * 0.05 : slot <= 2 ? r * 0.35 * slot : r; // Anfang läuft spitz zu
      this.writeRing(act, slot, R, T[c], T[c + 1], T[c + 2], T[c + 3], T[b] - T[a], T[b + 1] - T[a + 1], T[b + 2] - T[a + 2], rad);
      last = slot;
      if (j < n - 1) {
        // Catmull-Rom bei t = 0.5: (-P0 + 9 P1 + 9 P2 - P3) / 16, zurück auf die Kugel normiert
        let mx = (-T[a] + 9 * T[c] + 9 * T[b] - T[d]) / 16, my = (-T[a + 1] + 9 * T[c + 1] + 9 * T[b + 1] - T[d + 1]) / 16, mz = (-T[a + 2] + 9 * T[c + 2] + 9 * T[b + 2] - T[d + 2]) / 16;
        const l = 1 / Math.hypot(mx, my, mz);
        mx *= l; my *= l; mz *= l;
        this.writeRing(act, slot + 1, R, mx, my, mz, (T[c + 3] + T[b + 3]) / 2, T[b] - T[c], T[b + 1] - T[c + 1], T[b + 2] - T[c + 2], slot === 0 ? r * 0.35 : rad);
        last = slot + 1;
      }
    }
    return last;
  }

  // Die Linie bleibt die ganze Runde liegen. Alte Abschnitte ändern sich nie, deshalb wird jeder Ring
  // nur einmal berechnet; pro Frame wird nur das Ende (bis zum Atzen) neu geschrieben.
  // act.done = so viele Stützpunkte sind schon endgültig im Puffer.
  fillRibbon(act, pl, game) {
    const tr = pl.trail, R = game.R, o = pl.out, T = TMP;
    const mine = pl === game.me && game.live && pl.alive;
    let end = tr.head;
    if (!mine) while (end > 0 && tr.k[end - 1] > o.rt) end--;
    if (end > MAXP - 80) end = MAXP - 80;
    const from = act.done;
    const load = (i0, i1) => { let n = 0; for (let i = i0; i < i1; i++, n++) { const q = n * 4; T[q] = tr.x[i]; T[q + 1] = tr.y[i]; T[q + 2] = tr.z[i]; T[q + 3] = tr.a[i]; } return n; };
    // 1) Große Rückstände (z.B. nach Wiedereinstieg) in Blöcken endgültig schreiben
    while (end - 3 - act.done > 300) {
      const i0 = Math.max(0, act.done - 1), n = load(i0, act.done + 303);
      this.emit(act, R, n, act.done - i0, act.done - i0 + 300, i0);
      act.done += 300;
    }
    // 2) Rest: letzte Stützpunkte + (bei mir) vorhergesagter Weg + aktuelle Position
    const i0 = Math.max(0, act.done - 1);
    let n = load(i0, end);
    const add = (x, y, z, al) => { if (n < TMP_N) { const q = n * 4; T[q] = x; T[q + 1] = y; T[q + 2] = z; T[q + 3] = al; n++; } };
    if (pl.alive && end > 0) {
      if (mine) { const p = game.path; for (let i = 1; i < p.length - 1; i += 2) add(p[i].x, p[i].y, p[i].z, p[i].a); }
      add(o.x, o.y, o.z, o.alt);
    }
    const last = this.emit(act, R, n, act.done - i0, n, i0);
    // Stützpunkte, deren Nachbarn feststehen, sind ab jetzt endgültig
    const stable = Math.max(act.done, end - 3);
    const g = act.ribbon.geometry;
    if (last >= 0) g.setDrawRange(0, last * TUBE_N * 6);
    if (last >= from * 2) {
      for (const at of [g.attributes.position, g.attributes.normal]) {
        at.clearUpdateRanges();
        at.addUpdateRange(from * 2 * TUBE_N * 3, (last + 1 - from * 2) * TUBE_N * 3);
        at.needsUpdate = true;
      }
    }
    act.done = stable;
  }

  // Bildschirmposition neben dem Kopf eines Atzen (für die kleine Jetpack-Leiste)
  gaugePos(pid, out) {
    const pl = this.game && this.game.players.get(pid);
    if (!pl || this.mode !== 'game') return false;
    const o = pl.out, h = this.game.R + o.alt + 1.42 * MODEL_SCALE, e = this.cam.matrixWorld.elements;
    const v = this._a.set(o.x * h + e[0] * 0.78, o.y * h + e[1] * 0.78, o.z * h + e[2] * 0.78).project(this.cam);
    out.x = (v.x * 0.5 + 0.5) * this.canvas.clientWidth;
    out.y = (-v.y * 0.5 + 0.5) * this.canvas.clientHeight;
    return v.z < 1;
  }

  frame(now, dt, followPid, frac = 0) {
    this.t += dt;
    if (this.mode === 'menu') this.frameMenu(dt);
    else if (this.game) this.frameGame(now, dt, followPid, frac);
    // Licht kommt immer schräg von hinter der Kamera – so ist die sichtbare Seite hell
    this.cam.updateMatrixWorld();
    const e = this.cam.matrixWorld.elements;
    this.sun.position.copy(this.cam.position).addScaledVector(this._a.set(e[4], e[5], e[6]), 9).addScaledVector(this._b.set(e[0], e[1], e[2]), 6);
    this.sparks.update(dt);
    this.r.render(this.scene, this.cam);
  }

  frameMenu(dt) {
    const a = this.menuAtze;
    const editor = this.menuKind === 'editor';
    if (a) {
      if (editor) { a.rotation.y += dt * 0.9; animateAtze(a, this.t, { run: 0 }); }
      else { a.rotation.y = 0.35 + Math.sin(this.t * 0.6) * 0.25; animateAtze(a, this.t, { run: 1 }); }
    }
    if (!editor) this.menuPlanet.rotation.x += dt * 0.55;
    this.cam.up.set(0, 1, 0);
    if (this.portrait) {
      this.cam.position.set(0, 6.3, 6.4);
      this.cam.lookAt(0, 4.6, 0);
    } else {
      this.cam.position.set(-1.75, 6.25, 3.9);
      this.cam.lookAt(-1.75, 5.72, 0);
    }
  }

  frameGame(now, dt, followPid, frac) {
    const game = this.game, R = game.R;
    game.sample(now, dt, frac);
    const X = this._a, U = this._b, H = this._c, m = this._m;
    for (const pl of game.players.values()) {
      const act = this.actors.get(pl.pid);
      if (!act) continue;
      const o = pl.out;
      U.set(o.x, o.y, o.z); H.set(o.hx, o.hy, o.hz);
      X.crossVectors(U, H);
      let alt = o.alt, scale = 1;
      if (!pl.alive) {
        // Abgang: Atze wird ins All geschleudert
        const td = pl.diedAt ? (now - pl.diedAt) / 1000 : 9;
        if (!act.deadFx) {
          act.deadFx = true;
          if (td < 1) this.sparks.burst(U.clone().multiplyScalar(R + alt + 0.8), act.color, 46, 7, U.clone().multiplyScalar(4));
        }
        alt += td * 9; scale = Math.max(0, 1 - td / 1.1);
        act.model.visible = scale > 0;
        act.shadow.visible = false;
        if (act.tag) act.tag.visible = false;
        act.model.userData.body.rotation.z = td * 14;
      }
      const air = o.alt > 0.02, thrust = !!(o.fl & 2), dash = !!(o.fl & 4);
      if (pl.alive) animateAtze(act.model, this.t, { run: game.k >= 0 ? 1 : 0, air, thrust, dash });
      m.makeBasis(X, U, H);
      scale *= MODEL_SCALE;
      m.scale(X.clone().set(scale, scale, scale));
      m.setPosition(o.x * (R + alt), o.y * (R + alt), o.z * (R + alt));
      act.model.matrix.copy(m);
      act.model.matrixWorldNeedsUpdate = true;
      if (pl.alive) {
        const ss = Math.max(0.35, 1 - o.alt * 0.22);
        m.makeBasis(H, X, U).scale(X.clone().set(ss, ss, ss)).setPosition(o.x * (R + 0.05), o.y * (R + 0.05), o.z * (R + 0.05));
        act.shadow.matrix.copy(m);
        act.shadow.matrixWorldNeedsUpdate = true;
        act.shadow.material.opacity = 0.34 * ss;
        if (act.tag) act.tag.position.set(o.x * (R + alt + 2.5), o.y * (R + alt + 2.5), o.z * (R + alt + 2.5));
        if (dash && !act.wasDash) this.sparks.burst(U.clone().multiplyScalar(R + alt + 0.7), 0xffffff, 14, 3, H.clone().multiplyScalar(-5));
        act.wasDash = dash;
        // Rammbock flackert, solange er im Dash durch Linien kann
        act.model.visible = !(dash && act.ghost) || Math.floor(this.t * 30) % 2 === 0;
      }
      this.fillRibbon(act, pl, game);
    }

    // Kamera hinter dem verfolgten Atzen
    const f = game.players.get(followPid) || game.me || game.players.values().next().value;
    if (!f) return;
    const o = f.out;
    U.set(o.x, o.y, o.z); H.set(o.hx, o.hy, o.hz);
    // Kamera folgt zügig – zu träge fühlt sich die Lenkung schwammig an
    this.cu.lerp(U, 1 - Math.exp(-18 * dt)).normalize();
    this.ch.lerp(H, 1 - Math.exp(-12 * dt));
    this.ch.addScaledVector(this.cu, -this.ch.dot(this.cu)).normalize();
    const up = this.portrait ? R * 1.25 : R * 0.78, back = this.portrait ? R * 0.75 : R * 0.66, ahead = this.portrait ? R * 0.12 : R * 0.2;
    this.cam.position.copy(this.cu).multiplyScalar(R + up).addScaledVector(this.ch, -back);
    this.cam.up.copy(this.cu);
    X.copy(this.cu).multiplyScalar(R).addScaledVector(this.ch, ahead);
    this.cam.lookAt(X);
  }
}

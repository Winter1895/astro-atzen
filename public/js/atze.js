// Astro Atzen – 3D-Modell eines Atzen, zusammengesetzt aus einfachen Formen.
// Ursprung = Füße, +Y = oben, +Z = Blickrichtung.
// Neue Outfits/Frisuren/Extras: hier ergänzen UND das passende Limit in shared/room.js (LIMITS) erhöhen.

import * as THREE from '../vendor/three.min.js';

export const SUITS = [0xff4757, 0xff9234, 0xffd93b, 0xb6f23a, 0x38d86b, 0x2bd9d0, 0x3d8bff, 0x9a6bff, 0xff6ad5, 0xf2f4ff];
export const SUIT_NAMES = ['Rot', 'Orange', 'Gelb', 'Limette', 'Grün', 'Türkis', 'Blau', 'Lila', 'Pink', 'Weiß'];
export const COLORS2 = [...SUITS, 0x20212b, 0xe0aa1e]; // Zweitfarbe: alle Hauptfarben + Schwarz + Gold
export const SKINS = [0xffe0c4, 0xf5c9a0, 0xe0a878, 0xc08552, 0x8d5a34, 0x5c3a21];
export const HAIR_COLORS = [0x1c1c22, 0x5a3a1e, 0xe8c15a, 0xd0522a, 0xb9bcc6, 0x3d8bff, 0xff6ad5, 0x38d86b];
export const HAIRS = ['Glatze', 'Kurz', 'Vokuhila', 'Iro', 'Afro', 'Lang', 'Dutt', 'Zopf', 'Locken', 'Scheitel', 'Bürste', 'Halbglatze', 'Stacheln'];
export const BEARDS = ['Keiner', 'Schnäuzer', 'Vollbart', 'Ziegenbart', 'Dreitagebart'];
export const GLASSES = ['Keine', 'Sonnenbrille', 'Schnelle Brille', 'Nerdbrille', 'Pilotenbrille'];
export const HATS = ['Keine', 'Cap', 'Cap rückwärts', 'Fischerhut', 'Mütze', 'Stirnband', 'Krone'];
export const OUTFITS = ['Raumanzug', 'Trainingsanzug', 'Trikot', 'Feinripp', 'Bomberjacke', 'Hawaiihemd', 'Anzug'];
export const PATTERNS = ['Uni', 'Querstreifen', 'Längsstreifen', 'Karo', 'Punkte', 'Seitenstreifen', 'Flammen', 'Camouflage', 'Brustring'];
export const EXTRAS = [['Goldene Uhr', 1], ['Goldkette', 2], ['Bauchtasche', 4], ['Kopfhörer', 8], ['Dose', 16]];

// Körperbau je Charakter (Reihenfolge wie CLASSES in shared/sim.js). Die Trefferfläche ist für alle gleich.
const BUILDS = [
  { w: 1.0, h: 1.0, head: 1.0, pack: 1.0, wings: false },   // Allrounder
  { w: 0.84, h: 1.12, head: 0.9, pack: 0.85, wings: false }, // Raser: lang und dünn
  { w: 0.9, h: 0.8, head: 1.14, pack: 0.9, wings: false },   // Wiesel: klein mit großem Kopf
  { w: 1.0, h: 1.0, head: 1.0, pack: 1.35, wings: true },    // Flieger: dickes Jetpack mit Flügeln
  { w: 1.34, h: 0.97, head: 0.9, pack: 1.0, wings: false },  // Kante: Schrank
  { w: 0.95, h: 1.06, head: 1.08, pack: 0.8, wings: false }, // Geist: schmal, großer Kopf
  { w: 1.2, h: 1.06, head: 0.95, pack: 1.1, wings: false },  // Rammbock: groß und kräftig
  { w: 1.5, h: 0.88, head: 1.0, pack: 1.15, wings: false },  // Brummer: kugelrund
  { w: 0.92, h: 1.04, head: 1.0, pack: 1.2, wings: true },   // Segler: Flügel-Jetpack
  { w: 0.66, h: 1.1, head: 0.82, pack: 0.7, wings: false },  // Hering: Strich in der Landschaft
];

export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const shade = (n, f) => '#' + new THREE.Color(n).multiplyScalar(f).getHexString();

const G = {};
const geo = (key, make) => G[key] || (G[key] = make());
const lam = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
const GOLD = 0xf2c230;
const HEAD_R = 0.27;

// ---------- Oberteil-Textur (Outfit + Muster) ----------
// u läuft einmal um den Körper: Bildrand links/rechts = vorne Mitte, 25 % / 75 % = die Seiten, 50 % = Rücken.
const texCache = new Map();
function torsoTexture(outfit, pattern, c1, c2, skin) {
  const key = `${outfit}|${pattern}|${c1}|${c2}|${outfit === 3 ? skin : 0}`;
  if (texCache.has(key)) return texCache.get(key);
  const W = 256, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const base = outfit === 3 ? '#f4f4f0' : hex(c1);
  const col2 = hex(c2);
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  x.fillStyle = col2;
  switch (pattern) {
    case 1: for (let i = 0; i < 4; i++) x.fillRect(0, 22 + i * 26, W, 12); break;
    case 2: for (let i = 0; i < 8; i++) x.fillRect(i * 32 + 10, 0, 12, H); break;
    case 3: for (let i = 0; i < 16; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) x.fillRect(i * 16, j * 16, 16, 16); break;
    case 4: for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) { x.beginPath(); x.arc(i * 32 + (j % 2 ? 16 : 0) + 8, j * 26 + 12, 7, 0, 7); x.fill(); } break;
    case 5: for (const u of [0.25, 0.75]) for (let i = -1; i <= 1; i++) x.fillRect(u * W + i * 9 - 3, 0, 6, H); break;
    case 6: {
      x.beginPath(); x.moveTo(0, H);
      for (let i = 0; i <= 16; i++) x.lineTo(i * 16, i % 2 ? H * 0.42 : H * 0.8);
      x.lineTo(W, H); x.fill();
      x.fillStyle = '#ffd93b'; x.beginPath(); x.moveTo(0, H);
      for (let i = 0; i <= 16; i++) x.lineTo(i * 16, i % 2 ? H * 0.68 : H * 0.92);
      x.lineTo(W, H); x.fill();
      break;
    }
    case 7: {
      let sd = 7;
      const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
      for (const c of [shade(outfit === 3 ? 0xf4f4f0 : c1, 0.62), col2, shade(outfit === 3 ? 0xf4f4f0 : c1, 0.8)]) {
        x.fillStyle = c;
        for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(rnd() * W, rnd() * H, 12 + rnd() * 18, 7 + rnd() * 10, rnd() * 3, 0, 7); x.fill(); }
      }
      break;
    }
    case 8: x.fillRect(0, H * 0.3, W, H * 0.2); break;
    default:
  }
  // Outfit-Details
  const front = (fn) => { fn(0, 1); fn(W, -1); }; // vorne Mitte liegt auf der Naht: an beiden Rändern zeichnen
  if (outfit === 1 || outfit === 4) { x.fillStyle = '#f4f6ff'; front((px, d) => x.fillRect(d > 0 ? px : px - 3, 0, 3, H)); }
  if (outfit === 4) { x.fillStyle = col2; x.fillRect(0, H * 0.84, W, H * 0.16); x.fillRect(0, 0, W, H * 0.1); }
  if (outfit === 2) {
    x.fillStyle = col2; front((px, d) => { x.beginPath(); x.moveTo(px, 0); x.lineTo(px + d * 22, 0); x.lineTo(px, 26); x.fill(); });
    x.save(); x.translate(W / 2, H * 0.52); x.scale(-1, 1);
    x.font = '900 54px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 7; x.strokeStyle = shade(c1, 0.45); x.strokeText('10', 0, 0);
    x.fillStyle = '#ffffff'; x.fillText('10', 0, 0);
    x.restore();
  }
  if (outfit === 3) {
    x.fillStyle = 'rgba(0,0,0,0.09)'; for (let i = 0; i < 43; i++) x.fillRect(i * 6, 0, 1.5, H);
    // Träger: oben schaut die Haut raus
    x.fillStyle = hex(skin); x.fillRect(0, 0, W, H * 0.3);
    x.fillStyle = '#f4f4f0';
    for (const u of [0.07, 0.43, 0.57, 0.93]) x.fillRect(u * W - 9, 0, 18, H * 0.3);
  }
  if (outfit === 5 && pattern === 0) {
    let sd = 11;
    const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let i = 0; i < 18; i++) {
      const fx = rnd() * W, fy = rnd() * H;
      x.fillStyle = i % 2 ? '#ffffff' : col2;
      for (let p = 0; p < 5; p++) { x.beginPath(); x.arc(fx + Math.cos(p * 1.257) * 6, fy + Math.sin(p * 1.257) * 6, 4.2, 0, 7); x.fill(); }
      x.fillStyle = '#ffd93b'; x.beginPath(); x.arc(fx, fy, 3, 0, 7); x.fill();
    }
  }
  if (outfit === 6) {
    x.fillStyle = '#f4f6ff'; front((px, d) => { x.beginPath(); x.moveTo(px, 0); x.lineTo(px + d * 26, 0); x.lineTo(px, H * 0.62); x.fill(); });
    x.fillStyle = col2; front((px, d) => { x.beginPath(); x.moveTo(px, 4); x.lineTo(px + d * 7, 14); x.lineTo(px + d * 5, H * 0.5); x.lineTo(px, H * 0.57); x.fill(); });
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  texCache.set(key, tex);
  return tex;
}

// ---------- Frisur, Kopfbedeckung ----------
function buildHair(style, m, covered) {
  const g = new THREE.Group();
  const capG = geo('haircap', () => new THREE.SphereGeometry(HEAD_R + 0.018, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5));
  const cap = (rx = -0.32, rz = 0) => { const c = mesh(capG, m); c.rotation.set(rx, 0, rz); return c; };
  const top = (o) => { if (!covered) g.add(o); }; // unter Cap/Mütze verschwindet alles, was oben sitzt
  const spike = (a, b, len = 0.24) => {
    // a = Winkel nach hinten, b = Winkel zur Seite
    const c = mesh(geo('spike', () => new THREE.ConeGeometry(0.065, 1, 6).translate(0, 0.5, 0)), m);
    c.scale.y = len;
    const d = new THREE.Vector3(Math.sin(b), Math.cos(a) * Math.cos(b), -Math.sin(a) * Math.cos(b));
    c.position.copy(d).multiplyScalar(HEAD_R - 0.02);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    return c;
  };
  switch (style) {
    case 1: top(cap()); break;
    case 2: top(cap()); g.add(mesh(geo('mullet', () => new THREE.SphereGeometry(0.2, 12, 10).scale(1.15, 1.5, 0.55)), m, 0, -0.14, -0.2)); break;
    case 3: for (let i = 0; i < 6; i++) top(spike(-0.55 + i * 0.36, 0, 0.3)); break;
    case 4: { const c = mesh(geo('afro', () => new THREE.SphereGeometry(0.36, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6)), m, 0, 0.02, -0.02); c.rotation.x = -0.38; top(c); break; }
    case 5: {
      top(cap());
      const back = mesh(geo('longhair', () => new THREE.CylinderGeometry(HEAD_R + 0.018, HEAD_R - 0.02, 0.34, 14, 1, true, Math.PI / 2, Math.PI)), m.clone(), 0, -0.15, -0.02);
      back.material.side = THREE.DoubleSide;
      g.add(back);
      break;
    }
    case 6: top(cap()); top(mesh(geo('bun', () => new THREE.SphereGeometry(0.1, 10, 8)), m, 0, 0.3, -0.1)); break;
    case 7: { // Zopf
      top(cap());
      const tail = mesh(geo('tail', () => new THREE.CapsuleGeometry(0.06, 0.26, 3, 8)), m, 0, -0.04, -0.33);
      tail.rotation.x = -0.5;
      g.add(tail);
      g.add(mesh(geo('tailknot', () => new THREE.SphereGeometry(0.075, 8, 6)), m, 0, 0.12, -0.27));
      break;
    }
    case 8: { // Locken
      const cg = geo('curl', () => new THREE.SphereGeometry(0.105, 8, 6));
      for (let i = 0; i < 13; i++) {
        const a = i * 2.4, r = 0.1 + (i % 4) * 0.055, y = Math.sqrt(Math.max(0, 0.085 - r * r));
        top(mesh(cg, m, Math.cos(a) * r, y + 0.02, Math.sin(a) * r - 0.05));
      }
      break;
    }
    case 9: { // Scheitel
      top(cap(-0.22, 0.3));
      const fr = mesh(geo('fringe', () => new THREE.SphereGeometry(0.13, 10, 8).scale(1.3, 0.55, 0.8)), m, 0.1, 0.17, 0.19);
      fr.rotation.z = -0.5;
      top(fr);
      break;
    }
    case 10: top(cap(-0.15)); top(mesh(geo('flattop', () => new THREE.CylinderGeometry(0.22, 0.25, 0.13, 14)), m, 0, 0.27, -0.01)); break;
    case 11: { // Halbglatze: Kranz, oben blank
      const ring = mesh(geo('kranz', () => new THREE.SphereGeometry(HEAD_R + 0.02, 18, 6, Math.PI * 0.62, Math.PI * 1.76, Math.PI * 0.3, Math.PI * 0.26)), m.clone());
      ring.material.side = THREE.DoubleSide;
      g.add(ring);
      break;
    }
    case 12: for (let i = 0; i < 11; i++) top(spike(-0.5 + (i % 4) * 0.45, ((i * 7) % 5 - 2) * 0.38, 0.2)); break;
    default:
  }
  return g;
}

function buildHat(hat, m) {
  const g = new THREE.Group();
  const dome = () => mesh(geo('hatdome', () => new THREE.SphereGeometry(HEAD_R + 0.03, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), m);
  const brimG = geo('brim', () => new THREE.CylinderGeometry(0.17, 0.17, 0.03, 14).scale(1, 1, 1.25));
  switch (hat) {
    case 1: { const d = dome(); d.rotation.x = -0.2; g.add(d); const b = mesh(brimG, m, 0, 0.07, 0.31); b.rotation.x = 0.12; g.add(b); break; }
    case 2: { const d = dome(); d.rotation.x = 0.12; g.add(d); const b = mesh(brimG, m, 0, 0.03, -0.31); b.rotation.x = -0.2; g.add(b); break; }
    case 3: { // Fischerhut
      const d = dome(); d.rotation.x = -0.12; d.scale.set(1, 0.85, 1); g.add(d);
      const b = mesh(geo('bucket', () => new THREE.CylinderGeometry(0.3, 0.41, 0.1, 18, 1, true)), m.clone(), 0, 0.06, 0.01);
      b.material.side = THREE.DoubleSide; b.rotation.x = -0.12;
      g.add(b);
      break;
    }
    case 4: { // Mütze mit Bommel
      const d = dome(); d.scale.set(1.03, 1.12, 1.03); d.rotation.x = -0.1; g.add(d);
      const cuff = mesh(geo('cuff', () => new THREE.TorusGeometry(HEAD_R + 0.025, 0.04, 8, 20).rotateX(Math.PI / 2)), m, 0, 0.03, 0);
      cuff.rotation.x = -0.1; g.add(cuff);
      g.add(mesh(geo('pom', () => new THREE.SphereGeometry(0.075, 8, 6)), lam(0xf4f6ff), 0, 0.35, -0.04));
      break;
    }
    case 5: { const b = mesh(geo('band', () => new THREE.TorusGeometry(HEAD_R + 0.012, 0.035, 8, 22).rotateX(Math.PI / 2)), m, 0, 0.11, 0); b.rotation.x = -0.12; g.add(b); break; }
    case 6: { // Krone
      const gold = lam(GOLD, { emissive: GOLD, emissiveIntensity: 0.25 });
      const c = mesh(geo('crown', () => new THREE.CylinderGeometry(0.2, 0.18, 0.1, 14, 1, true)), gold, 0, 0.27, 0);
      c.material.side = THREE.DoubleSide; g.add(c);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(mesh(geo('crownspike', () => new THREE.ConeGeometry(0.05, 0.13, 4)), gold, Math.cos(a) * 0.19, 0.38, Math.sin(a) * 0.19)); }
      break;
    }
    default:
  }
  return g;
}

// ---------- Der ganze Atze ----------
export function buildAtze(a) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // alles Sichtbare – lässt sich neigen/wippen
  root.add(body);
  const B = BUILDS[a.cls | 0] || BUILDS[0];
  body.scale.set(B.w, B.h, B.w);

  const c1 = SUITS[a.color] ?? SUITS[0];
  const c2 = COLORS2[a.color2] ?? COLORS2[9];
  const skinC = SKINS[a.skin] ?? SKINS[0];
  const outfit = a.outfit | 0, pattern = a.pattern | 0, acc = a.acc | 0;
  const suit = lam(c1);
  const trim = lam(new THREE.Color(c1).multiplyScalar(0.55));
  const m2 = lam(c2);
  const white = lam(0xf4f6ff);
  const grey = lam(0x8a90a6);
  const dark = lam(0x20212b);
  const skin = lam(skinC);
  const hairM = lam(HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[0]);
  const gold = lam(GOLD, { emissive: GOLD, emissiveIntensity: 0.25 });

  // Was das Outfit an Armen und Beinen bedeutet
  const armStyle = [2, 2, 1, 0, 2, 1, 2][outfit] ?? 2;   // 0 = nackt, 1 = kurzer Ärmel, 2 = lang
  const legStyle = [2, 2, 1, 2, 2, 1, 2][outfit] ?? 2;   // 1 = kurze Hose, 2 = lang
  const legM = outfit === 4 ? lam(0x2a3350) : outfit === 5 ? m2 : outfit === 2 ? trim : suit;
  const space = outfit === 0;
  const stripes = pattern === 5;

  // Beine (Drehpunkt an der Hüfte)
  const legG = geo('leg', () => new THREE.CapsuleGeometry(0.105, 0.2, 3, 8).translate(0, -0.2, 0));
  const bootG = geo('boot', () => new THREE.SphereGeometry(0.13, 10, 8).scale(1, 0.72, 1.4).translate(0, -0.37, 0.04));
  const legs = [-1, 1].map((sd) => {
    const l = mesh(legG, legStyle === 2 ? legM : skin, 0.14 * sd, 0.47, 0);
    l.add(mesh(bootG, space ? trim : white));
    if (legStyle === 1) l.add(mesh(geo('shortleg', () => new THREE.CapsuleGeometry(0.118, 0.06, 3, 8).translate(0, -0.1, 0)), legM));
    if (stripes && legStyle === 2) l.add(mesh(geo('legstripe', () => new THREE.BoxGeometry(0.03, 0.34, 0.07)), m2, 0.1 * sd, -0.2, 0));
    body.add(l);
    return l;
  });
  if (legStyle === 1) body.add(mesh(geo('shorts', () => new THREE.CylinderGeometry(0.262, 0.255, 0.2, 16)), legM, 0, 0.5, 0));

  // Rumpf mit Muster-Textur
  const torso = mesh(geo('torso', () => new THREE.CapsuleGeometry(0.25, 0.2, 4, 18)), lam(0xffffff, { map: torsoTexture(outfit, pattern, c1, c2, skinC) }), 0, 0.72, 0);
  if (outfit === 4) torso.scale.set(1.1, 1, 1.12); // Bomberjacke trägt auf
  body.add(torso);
  if (space) {
    body.add(mesh(geo('belt', () => new THREE.CylinderGeometry(0.258, 0.258, 0.07, 16)), trim, 0, 0.56, 0));
    body.add(mesh(geo('badge', () => new THREE.BoxGeometry(0.16, 0.1, 0.04)), white, 0, 0.8, 0.235));
  }
  if (space || a.helmet) body.add(mesh(geo('collar', () => new THREE.TorusGeometry(0.2, 0.05, 8, 18).rotateX(Math.PI / 2)), white, 0, 0.99, 0));

  // Arme (Drehpunkt an der Schulter)
  const armG = geo('arm', () => new THREE.CapsuleGeometry(0.085, 0.2, 3, 8).translate(0, -0.17, 0));
  const gloveG = geo('glove', () => new THREE.SphereGeometry(0.1, 10, 8).translate(0, -0.36, 0));
  const armPos = outfit === 4 ? 0.36 : 0.33;
  const arms = [-1, 1].map((sd) => {
    const p = new THREE.Group();
    p.position.set(armPos * sd, 0.9, 0);
    const arm = mesh(armG, armStyle === 2 ? suit : skin);
    arm.rotation.z = 0.22 * sd;
    arm.add(mesh(gloveG, space ? white : skin));
    if (armStyle === 1) arm.add(mesh(geo('sleeve', () => new THREE.CapsuleGeometry(0.1, 0.05, 3, 8).translate(0, -0.06, 0)), suit));
    if (outfit === 4) arm.add(mesh(geo('armcuff', () => new THREE.CylinderGeometry(0.095, 0.095, 0.06, 10)), m2, 0, -0.27, 0));
    if (stripes && armStyle === 2) arm.add(mesh(geo('armstripe', () => new THREE.BoxGeometry(0.03, 0.3, 0.06)), m2, 0.08 * sd, -0.16, 0));
    p.add(arm);
    p.userData.arm = arm;
    body.add(p);
    return p;
  });

  // Kopf (wird gegen den Körperbau zurückskaliert, damit er rund bleibt)
  const head = new THREE.Group();
  head.position.set(0, 1.21, 0);
  head.scale.set(B.head / B.w, B.head / B.h, B.head / B.w);
  head.add(mesh(geo('head', () => new THREE.SphereGeometry(HEAD_R, 20, 16)), skin));
  const gl = a.glasses | 0, beard = a.beard | 0, hat = a.hat | 0;
  const eyeG = geo('eye', () => new THREE.SphereGeometry(0.036, 8, 6));
  if (gl === 0 || gl === 3) { head.add(mesh(eyeG, dark, -0.095, 0.035, 0.248)); head.add(mesh(eyeG, dark, 0.095, 0.035, 0.248)); }
  if (gl === 1) head.add(mesh(geo('shades', () => new THREE.BoxGeometry(0.42, 0.1, 0.06)), dark, 0, 0.045, 0.235));
  if (gl === 2) { // Schnelle Brille: ein durchgehendes Visier in der Zweitfarbe
    const v = mesh(geo('visor', () => new THREE.CylinderGeometry(HEAD_R + 0.015, HEAD_R + 0.015, 0.11, 18, 1, true, -1.05, 2.1)), lam(c2, { emissive: c2, emissiveIntensity: 0.35, side: THREE.DoubleSide }), 0, 0.045, 0);
    head.add(v);
  }
  if (gl === 3) for (const sx of [-1, 1]) head.add(mesh(geo('nerd', () => new THREE.TorusGeometry(0.068, 0.016, 6, 14)), dark, 0.098 * sx, 0.035, 0.258));
  if (gl === 3) head.add(mesh(geo('bridge', () => new THREE.BoxGeometry(0.06, 0.018, 0.02)), dark, 0, 0.04, 0.27));
  if (gl === 4) for (const sx of [-1, 1]) {
    head.add(mesh(geo('pilotlens', () => new THREE.SphereGeometry(0.078, 12, 8).scale(1, 0.9, 0.3)), dark, 0.1 * sx, 0.03, 0.245));
    head.add(mesh(geo('pilotrim', () => new THREE.TorusGeometry(0.078, 0.012, 6, 16).scale(1, 0.9, 1)), gold, 0.1 * sx, 0.03, 0.262));
  }
  if (beard === 1) head.add(mesh(geo('stache', () => new THREE.BoxGeometry(0.17, 0.045, 0.05)), hairM, 0, -0.075, 0.255));
  if (beard === 2 || beard === 4) {
    const bm = beard === 2 ? hairM : lam(new THREE.Color(skinC).multiplyScalar(0.72));
    const b = mesh(geo('beard', () => new THREE.SphereGeometry(HEAD_R + 0.015, 16, 10, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44)), bm);
    b.rotation.x = 0.55;
    if (beard === 4) b.scale.setScalar(0.975);
    head.add(b);
  }
  if (beard === 3) { const b = mesh(geo('goatee', () => new THREE.ConeGeometry(0.07, 0.16, 6).rotateX(Math.PI)), hairM, 0, -0.26, 0.17); b.rotation.x = -0.35; head.add(b); }
  if (beard !== 2) head.add(mesh(geo('mouth', () => new THREE.BoxGeometry(0.09, 0.02, 0.03)), dark, 0, -0.125, 0.238));
  head.add(buildHair(a.hair | 0, hairM, hat >= 1 && hat <= 4));
  head.add(buildHat(hat, m2));
  if (acc & 8) { // Kopfhörer
    head.add(mesh(geo('hpband', () => new THREE.TorusGeometry(HEAD_R + 0.045, 0.028, 6, 16, Math.PI)), dark, 0, 0.02, 0));
    for (const sx of [-1, 1]) head.add(mesh(geo('hpcup', () => new THREE.CylinderGeometry(0.095, 0.095, 0.07, 12).rotateZ(Math.PI / 2)), m2, (HEAD_R + 0.04) * sx, 0, 0));
  }
  if (a.helmet) {
    const helmet = mesh(
      geo('helmet', () => new THREE.SphereGeometry(0.42, 22, 16)),
      new THREE.MeshPhongMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.2, shininess: 140, specular: 0xffffff, depthWrite: false }),
      0, 0.02, 0,
    );
    helmet.renderOrder = 2;
    head.add(helmet);
  }
  body.add(head);

  // Extras
  if (acc & 1) { // Goldene Uhr am Handgelenk – extra protzig
    const arm = arms[1].userData.arm;
    arm.add(mesh(geo('watchband', () => new THREE.CylinderGeometry(0.1, 0.1, 0.075, 12)), gold, 0, -0.255, 0));
    arm.add(mesh(geo('watchcase', () => new THREE.CylinderGeometry(0.075, 0.075, 0.04, 12).rotateZ(Math.PI / 2)), gold, 0.105, -0.255, 0));
    arm.add(mesh(geo('watchdial', () => new THREE.CylinderGeometry(0.055, 0.055, 0.045, 12).rotateZ(Math.PI / 2)), lam(0x0b6b3a), 0.108, -0.255, 0));
  }
  if (acc & 2) { // Goldkette
    const ch = mesh(geo('chain', () => new THREE.TorusGeometry(0.2, 0.026, 6, 20)), gold, 0, 0.9, 0.08);
    ch.rotation.x = -1.05;
    body.add(ch);
    body.add(mesh(geo('pendant', () => new THREE.BoxGeometry(0.07, 0.09, 0.03)), gold, 0, 0.8, 0.262));
  }
  if (acc & 4) { // Bauchtasche quer vor der Brust
    const bag = mesh(geo('bag', () => new THREE.BoxGeometry(0.3, 0.15, 0.12)), m2, 0.02, 0.68, 0.26);
    bag.rotation.z = 0.35;
    body.add(bag);
    const strap = mesh(geo('strap', () => new THREE.TorusGeometry(0.27, 0.022, 6, 20)), dark, 0, 0.72, 0);
    strap.rotation.set(Math.PI / 2, 0.35, 0);
    body.add(strap);
  }
  if (acc & 16) { // Dose in der Hand
    const arm = arms[0].userData.arm;
    arm.add(mesh(geo('can', () => new THREE.CylinderGeometry(0.052, 0.052, 0.15, 10)), lam(0xcfd3dc), 0, -0.4, 0.09));
    arm.add(mesh(geo('canband', () => new THREE.CylinderGeometry(0.054, 0.054, 0.07, 10)), m2, 0, -0.4, 0.09));
  }

  // Jetpack
  const pk = B.pack;
  const pack = new THREE.Group();
  pack.position.set(0, 0.76, -0.22 - 0.09 * pk);
  pack.scale.setScalar(pk);
  pack.add(mesh(geo('pack', () => new THREE.BoxGeometry(0.36, 0.42, 0.17)), grey));
  if (B.wings) for (const sx of [-1, 1]) {
    const w = mesh(geo('wing', () => new THREE.BoxGeometry(0.34, 0.1, 0.03)), suit, 0.3 * sx, 0.1, 0);
    w.rotation.z = 0.5 * sx;
    pack.add(w);
    pack.add(mesh(geo('wingtip', () => new THREE.BoxGeometry(0.05, 0.16, 0.05)), m2, 0.46 * sx, 0.2, 0));
  }
  const nozG = geo('nozzle', () => new THREE.CylinderGeometry(0.06, 0.08, 0.12, 8));
  const flameG = geo('flame', () => new THREE.ConeGeometry(0.075, 0.42, 8).rotateX(Math.PI).translate(0, -0.21, 0));
  const flameM = new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.92 });
  const flames = [-1, 1].map((sd) => {
    pack.add(mesh(nozG, dark, 0.1 * sd, -0.26, 0));
    const f = mesh(flameG, flameM, 0.1 * sd, -0.31, 0);
    f.visible = false;
    pack.add(f);
    return f;
  });
  body.add(pack);

  root.userData = { body, legs, arms, head, flames, phase: Math.random() * 6 };
  return root;
}

// st: { run: 0..1, air, thrust, dash }
export function animateAtze(m, t, st) {
  const u = m.userData;
  const ph = t * 15 + u.phase;
  if (st.air) {
    u.legs[0].rotation.x = 0.55; u.legs[1].rotation.x = -0.35;
    u.arms[0].rotation.x = st.thrust ? -2.7 : -1.2; u.arms[1].rotation.x = st.thrust ? -2.7 : -0.8;
    u.body.position.y = 0;
  } else {
    const sw = Math.sin(ph) * 0.95 * st.run;
    u.legs[0].rotation.x = sw; u.legs[1].rotation.x = -sw;
    u.arms[0].rotation.x = -sw * 0.85; u.arms[1].rotation.x = sw * 0.85;
    u.body.position.y = Math.abs(Math.cos(ph)) * 0.05 * st.run;
  }
  u.body.rotation.x = st.dash ? 0.5 : 0.14 * st.run;
  for (const f of u.flames) {
    f.visible = !!st.thrust;
    if (st.thrust) f.scale.set(1, 0.7 + Math.random() * 0.7, 1);
  }
}

// Namensschild über dem Kopf
export function makeTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = '900 34px system-ui, -apple-system, "Segoe UI", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 8; x.strokeStyle = 'rgba(10,10,30,0.85)'; x.lineJoin = 'round';
  x.strokeText(name, 128, 34);
  x.fillStyle = hex(color);
  x.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // sizeAttenuation: false = immer gleich groß auf dem Bildschirm, egal wie weit weg
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false }));
  sp.scale.set(0.2, 0.05, 1);
  sp.renderOrder = 3;
  return sp;
}

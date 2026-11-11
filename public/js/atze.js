// Astro Atzen – 3D-Modell eines Atzen, zusammengesetzt aus einfachen Formen.
// Ursprung = Füße, +Y = oben, +Z = Blickrichtung.

import * as THREE from '../vendor/three.min.js';

export const SUITS = [0xff4757, 0xff9234, 0xffd93b, 0xb6f23a, 0x38d86b, 0x2bd9d0, 0x3d8bff, 0x9a6bff, 0xff6ad5, 0xf2f4ff];
export const SUIT_NAMES = ['Rot', 'Orange', 'Gelb', 'Limette', 'Grün', 'Türkis', 'Blau', 'Lila', 'Pink', 'Weiß'];
export const SKINS = [0xffe0c4, 0xf5c9a0, 0xe0a878, 0xc08552, 0x8d5a34, 0x5c3a21];
export const HAIR_COLORS = [0x1c1c22, 0x5a3a1e, 0xe8c15a, 0xd0522a, 0xb9bcc6, 0x3d8bff, 0xff6ad5, 0x38d86b];
export const HAIRS = ['Glatze', 'Kurz', 'Vokuhila', 'Iro', 'Afro', 'Lang', 'Cap', 'Dutt'];
export const FACES = ['Nix', 'Sonnenbrille', 'Schnäuzer', 'Vollbart', 'Brille + Schnäuzer'];

export const hex = (n) => '#' + n.toString(16).padStart(6, '0');

const G = {};
const geo = (key, make) => G[key] || (G[key] = make());
const lam = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

const HEAD_R = 0.27;

function buildHair(style, m, capM) {
  const g = new THREE.Group();
  const capG = geo('haircap', () => new THREE.SphereGeometry(HEAD_R + 0.018, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5));
  const cap = () => {
    const c = mesh(capG, m);
    c.rotation.x = -0.32;
    return c;
  };
  switch (style) {
    case 1: g.add(cap()); break;
    case 2: { // Vokuhila: vorne kurz, hinten lang
      g.add(cap());
      g.add(mesh(geo('mullet', () => new THREE.SphereGeometry(0.2, 12, 10).scale(1.15, 1.5, 0.55)), m, 0, -0.14, -0.2));
      break;
    }
    case 3: { // Iro
      for (let i = 0; i < 6; i++) {
        const a = -0.55 + i * 0.36;
        const c = mesh(geo('spike', () => new THREE.ConeGeometry(0.065, 0.24, 6)), m, 0, Math.cos(a) * (HEAD_R + 0.07), -Math.sin(a) * (HEAD_R + 0.07));
        c.rotation.x = -a;
        g.add(c);
      }
      break;
    }
    case 4: { // Afro
      const c = mesh(geo('afro', () => new THREE.SphereGeometry(0.36, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6)), m, 0, 0.02, -0.02);
      c.rotation.x = -0.38;
      g.add(c);
      break;
    }
    case 5: { // Lang
      g.add(cap());
      const back = mesh(geo('longhair', () => new THREE.CylinderGeometry(HEAD_R + 0.018, HEAD_R - 0.02, 0.34, 14, 1, true, Math.PI / 2, Math.PI)), m, 0, -0.15, -0.02);
      back.material = m.clone();
      back.material.side = THREE.DoubleSide;
      g.add(back);
      break;
    }
    case 6: { // Cap
      const c = mesh(capG, capM);
      c.rotation.x = -0.2;
      g.add(c);
      const brim = mesh(geo('brim', () => new THREE.CylinderGeometry(0.17, 0.17, 0.03, 14).scale(1, 1, 1.25)), capM, 0, 0.07, 0.3);
      brim.rotation.x = 0.12;
      g.add(brim);
      break;
    }
    case 7: { // Dutt
      g.add(cap());
      g.add(mesh(geo('bun', () => new THREE.SphereGeometry(0.1, 10, 8)), m, 0, 0.3, -0.1));
      break;
    }
    default:
  }
  return g;
}

export function buildAtze(a) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // alles Sichtbare – lässt sich neigen/wippen
  root.add(body);

  const suitC = SUITS[a.color] ?? SUITS[0];
  const suit = lam(suitC);
  const trim = lam(new THREE.Color(suitC).multiplyScalar(0.55));
  const white = lam(0xf4f6ff);
  const grey = lam(0x8a90a6);
  const dark = lam(0x20212b);
  const skin = lam(SKINS[a.skin] ?? SKINS[0]);
  const hairM = lam(HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[0]);

  // Beine (Drehpunkt an der Hüfte)
  const legG = geo('leg', () => new THREE.CapsuleGeometry(0.105, 0.2, 3, 8).translate(0, -0.2, 0));
  const bootG = geo('boot', () => new THREE.SphereGeometry(0.13, 10, 8).scale(1, 0.72, 1.4).translate(0, -0.37, 0.04));
  const legs = [-1, 1].map((sd) => {
    const l = mesh(legG, suit, 0.14 * sd, 0.47, 0);
    l.add(mesh(bootG, trim));
    body.add(l);
    return l;
  });

  // Rumpf
  body.add(mesh(geo('torso', () => new THREE.CapsuleGeometry(0.25, 0.2, 4, 14)), suit, 0, 0.72, 0));
  body.add(mesh(geo('belt', () => new THREE.CylinderGeometry(0.258, 0.258, 0.07, 16)), trim, 0, 0.56, 0));
  body.add(mesh(geo('badge', () => new THREE.BoxGeometry(0.16, 0.1, 0.04)), white, 0, 0.8, 0.235));
  body.add(mesh(geo('collar', () => new THREE.TorusGeometry(0.2, 0.05, 8, 18).rotateX(Math.PI / 2)), white, 0, 0.99, 0));

  // Arme (Drehpunkt an der Schulter)
  const armG = geo('arm', () => new THREE.CapsuleGeometry(0.085, 0.2, 3, 8).translate(0, -0.17, 0));
  const gloveG = geo('glove', () => new THREE.SphereGeometry(0.1, 10, 8).translate(0, -0.36, 0));
  const arms = [-1, 1].map((sd) => {
    const p = new THREE.Group();
    p.position.set(0.33 * sd, 0.9, 0);
    const arm = mesh(armG, suit);
    arm.rotation.z = 0.22 * sd;
    arm.add(mesh(gloveG, white));
    p.add(arm);
    body.add(p);
    return p;
  });

  // Kopf
  const head = new THREE.Group();
  head.position.set(0, 1.21, 0);
  head.add(mesh(geo('head', () => new THREE.SphereGeometry(HEAD_R, 20, 16)), skin));
  const face = a.face | 0;
  const shades = face === 1 || face === 4;
  if (shades) {
    head.add(mesh(geo('shades', () => new THREE.BoxGeometry(0.42, 0.1, 0.06)), dark, 0, 0.045, 0.235));
  } else {
    const eyeG = geo('eye', () => new THREE.SphereGeometry(0.036, 8, 6));
    head.add(mesh(eyeG, dark, -0.095, 0.035, 0.248));
    head.add(mesh(eyeG, dark, 0.095, 0.035, 0.248));
  }
  if (face === 2 || face === 4) head.add(mesh(geo('stache', () => new THREE.BoxGeometry(0.17, 0.045, 0.05)), hairM, 0, -0.075, 0.255));
  if (face === 3) {
    const beard = mesh(geo('beard', () => new THREE.SphereGeometry(HEAD_R + 0.015, 16, 10, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44)), hairM);
    beard.rotation.x = 0.55;
    head.add(beard);
  } else {
    head.add(mesh(geo('mouth', () => new THREE.BoxGeometry(0.09, 0.02, 0.03)), dark, 0, -0.125, 0.238));
  }
  head.add(buildHair(a.hair | 0, hairM, trim));
  body.add(head);

  // Helm (Glaskugel)
  const helmet = mesh(
    geo('helmet', () => new THREE.SphereGeometry(0.42, 22, 16)),
    new THREE.MeshPhongMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.2, shininess: 140, specular: 0xffffff, depthWrite: false }),
    0, 1.23, 0,
  );
  helmet.renderOrder = 2;
  body.add(helmet);

  // Jetpack
  body.add(mesh(geo('pack', () => new THREE.BoxGeometry(0.36, 0.42, 0.17)), grey, 0, 0.76, -0.31));
  const nozG = geo('nozzle', () => new THREE.CylinderGeometry(0.06, 0.08, 0.12, 8));
  const flameG = geo('flame', () => new THREE.ConeGeometry(0.075, 0.42, 8).rotateX(Math.PI).translate(0, -0.21, 0));
  const flameM = new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.92 });
  const flames = [-1, 1].map((sd) => {
    body.add(mesh(nozG, dark, 0.1 * sd, 0.5, -0.31));
    const f = mesh(flameG, flameM, 0.1 * sd, 0.45, -0.31);
    f.visible = false;
    body.add(f);
    return f;
  });

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

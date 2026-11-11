// Astro Atzen – Eingabe: Joystick links (lenken), zwei Buttons rechts (Jetpack, Dash), Tastatur am PC.

const HOLD_TICKS = 4; // ein kurzer Tipper gilt mindestens so viele Ticks als gedrückt

export class Input {
  constructor(el) {
    this.el = el; // { zone, base, knob, jet, dash }
    this.steer = 0;
    this.jet = false; this.dash = false;
    this.jetLatch = 0; this.dashLatch = 0;
    this.keys = new Set();
    this.joyId = null; this.ox = 0; this.oy = 0;
    this.radius = 56;
    this.out = { s: 0, j: false, d: false };
    this.enabled = false;

    const z = el.zone;
    z.addEventListener('pointerdown', (e) => {
      if (this.joyId !== null) return;
      this.joyId = e.pointerId;
      try { z.setPointerCapture(e.pointerId); } catch {}
      const r = z.getBoundingClientRect();
      this.ox = e.clientX; this.oy = e.clientY;
      el.base.style.left = `${e.clientX - r.left}px`;
      el.base.style.top = `${e.clientY - r.top}px`;
      el.base.classList.add('on');
      this.moveJoy(e);
      e.preventDefault();
    });
    z.addEventListener('pointermove', (e) => { if (e.pointerId === this.joyId) this.moveJoy(e); });
    const end = (e) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null; this.steer = 0;
      el.base.classList.remove('on');
      el.base.style.left = ''; el.base.style.top = '';
      el.knob.style.transform = '';
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);

    const btn = (b, name) => {
      const down = (e) => {
        this[name] = true; this[name + 'Latch'] = HOLD_TICKS;
        b.classList.add('on');
        try { b.setPointerCapture(e.pointerId); } catch {}
        e.preventDefault();
      };
      const up = () => { this[name] = false; b.classList.remove('on'); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    btn(el.jet, 'jet');
    btn(el.dash, 'dash');

    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { this.jetLatch = HOLD_TICKS; e.preventDefault(); }
      if (e.code.startsWith('Shift') || e.code === 'ArrowDown' || e.code === 'KeyS') { this.dashLatch = HOLD_TICKS; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.jet = this.dash = false; });
  }

  moveJoy(e) {
    let dx = (e.clientX - this.ox) / this.radius, dy = (e.clientY - this.oy) / this.radius;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    this.el.knob.style.transform = `translate(${dx * this.radius}px, ${dy * this.radius}px)`;
    // kleine Totzone, danach leicht progressiv: feines Lenken in der Mitte, voller Einschlag am Rand
    const a = Math.abs(dx);
    this.steer = a < 0.1 ? 0 : Math.sign(dx) * Math.pow((a - 0.1) / 0.9, 1.25);
  }

  // einmal pro 60-Hz-Tick aufrufen
  sample() {
    const k = this.keys;
    let s = this.steer;
    if (k.has('ArrowLeft') || k.has('KeyA')) s = -1;
    if (k.has('ArrowRight') || k.has('KeyD')) s = 1;
    const kj = k.has('Space') || k.has('ArrowUp') || k.has('KeyW');
    const kd = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('ArrowDown') || k.has('KeyS');
    const o = this.out;
    o.s = s;
    o.j = this.jet || kj || this.jetLatch > 0;
    o.d = this.dash || kd || this.dashLatch > 0;
    if (this.jetLatch > 0) this.jetLatch--;
    if (this.dashLatch > 0) this.dashLatch--;
    return o;
  }
}

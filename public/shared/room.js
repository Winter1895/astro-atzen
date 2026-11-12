// Astro Atzen – ein Spielraum: Lobby, Runden, Punkte, Bots.
// Der Server hält pro Raumcode eine Instanz; im Training läuft dieselbe Klasse im Browser.

import { Round, Bot, SNAP_EVERY, TICK_RATE, packKin, planetRadius, CLASSES } from './sim.js';

export const MAX_PLAYERS = 8;
export const N_COLORS = 10;
export const N_THEMES = 5;
// Aussehen: jedes Feld ist eine Zahl von 0 bis (Limit - 1). acc ist eine Bitmaske der Extras.
export const LIMITS = { color2: 12, skin: 6, hair: 13, hairColor: 8, beard: 5, glasses: 5, hat: 7, outfit: 7, pattern: 9, acc: 32, helmet: 2 };
export const LOOK_KEYS = Object.keys(LIMITS);
export const ACC = { uhr: 1, kette: 2, bauchtasche: 4, kopfhoerer: 8, dose: 16 };
const BOT_NAMES = ['Kalle', 'Mäcces', 'Digga', 'Brudi', 'Keule', 'Günni', 'Maschine', 'Ronny', 'Uschi', 'Atzinger', 'Schorsch', 'Babsi'];

// Standard-Look jedes Charakters (Reihenfolge wie CLASSES). Danach kann man alles umstellen.
export const PRESETS = [
  { outfit: 0, pattern: 0, color2: 9, hair: 1, hairColor: 1, beard: 0, glasses: 0, hat: 0, acc: 0, helmet: 1 },   // Allrounder: klassischer Raumanzug
  { outfit: 2, pattern: 8, color2: 9, hair: 3, hairColor: 0, beard: 0, glasses: 2, hat: 0, acc: 0, helmet: 1 },   // Raser: Trikot, schnelle Brille, Iro
  { outfit: 1, pattern: 5, color2: 9, hair: 1, hairColor: 2, beard: 0, glasses: 0, hat: 2, acc: 4, helmet: 1 },   // Wiesel: Trainingsanzug, Cap rückwärts, Bauchtasche
  { outfit: 4, pattern: 0, color2: 1, hair: 9, hairColor: 1, beard: 1, glasses: 4, hat: 0, acc: 8, helmet: 1 },   // Flieger: Bomberjacke, Pilotenbrille, Schnäuzer, Kopfhörer
  { outfit: 3, pattern: 0, color2: 11, hair: 0, hairColor: 0, beard: 2, glasses: 1, hat: 0, acc: 3, helmet: 1 },  // Kante: Feinripp, Goldkette, goldene Uhr
];

const int = (v, max, def = 0) => (Number.isInteger(v) && v >= 0 && v < max ? v : def);
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const r3 = (v) => Math.round(v * 1e3) / 1e3;

export function cleanAtze(a) {
  a = a && typeof a === 'object' ? a : {};
  let name = typeof a.name === 'string' ? a.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12) : '';
  if (!name) name = 'Atze';
  const cls = int(a.cls, CLASSES.length);
  const out = { name, cls, color: int(a.color, N_COLORS) };
  const pre = PRESETS[cls];
  for (const k of LOOK_KEYS) out[k] = int(a[k], LIMITS[k], k === 'skin' ? 0 : pre[k]);
  return out;
}
const pickLook = (a) => { const l = {}; for (const k of LOOK_KEYS) l[k] = a[k]; return l; };

export function randomAtze(name, cls) {
  const r = (n) => Math.floor(Math.random() * n);
  if (cls === undefined) cls = r(CLASSES.length);
  const a = { name, cls, color: r(N_COLORS), skin: r(LIMITS.skin), ...PRESETS[cls] };
  // ein bisschen Abwechslung, damit zwei gleiche Charaktere nicht identisch aussehen
  a.hairColor = r(LIMITS.hairColor);
  if (Math.random() < 0.5) a.hair = r(LIMITS.hair);
  if (Math.random() < 0.3) a.beard = r(LIMITS.beard);
  if (Math.random() < 0.3) a.pattern = r(LIMITS.pattern);
  if (Math.random() < 0.4) a.color2 = r(LIMITS.color2);
  return cleanAtze(a);
}

export class Room {
  // send(pid, jsonString) liefert eine Nachricht an einen Spieler aus.
  // opts.ranked: Runden dieses Raums können für die Rangliste zählen (nur echte Server-Räume).
  // opts.onStats(liste): wird nach jeder gewerteten Runde mit den Zahlen pro Konto aufgerufen.
  constructor(code, send, opts = {}) {
    this.code = code;
    this.send = send;
    this.ranked = !!opts.ranked;
    this.onStats = opts.onStats || null;
    this.rated = false;
    this.players = [];
    this.nextPid = 1;
    this.host = 0;
    this.state = 'lobby'; // lobby | countdown | playing | roundEnd | matchEnd
    this.settings = { target: 5, botLevel: 1 };
    this.round = null;
    this.roundNo = 0;
    this.cd = 0;
    this.phase = 0;
    this.events = [];
    this.lastResult = null;
    this.idleTicks = 0;
  }

  // ----- Spieler -----

  get(pid) { return this.players.find((p) => p.pid === pid); }
  humans() { return this.players.filter((p) => !p.bot); }
  connectedHumans() { return this.players.filter((p) => !p.bot && p.conn).length; }

  pickColor(want, exceptPid) {
    const used = new Set(this.players.filter((p) => p.pid !== exceptPid).map((p) => p.color));
    if (!used.has(want)) return want;
    for (let i = 1; i < N_COLORS; i++) { const c = (want + i) % N_COLORS; if (!used.has(c)) return c; }
    return want;
  }

  // Zählt die nächste Runde für die Rangliste? Nur ohne Bots und mit mindestens zwei echten Spielern.
  willRate() {
    if (!this.ranked) return false;
    const part = this.players.filter((p) => p.bot || p.conn);
    return part.length >= 2 && !part.some((p) => p.bot);
  }

  // Gibt { pid } oder { err } zurück. Gleiche cid = Wiedereinstieg nach Verbindungsabbruch.
  // acct = { uid, name } eines angemeldeten Kontos (oder null für Gäste).
  join(cid, atze, acct) {
    // dasselbe Konto darf nicht zweimal im Raum sitzen (sonst könnte man sich selbst abfarmen)
    if (acct && this.players.some((p) => p.uid === acct.uid && p.cid !== cid)) acct = null;
    const old = this.players.find((p) => !p.bot && p.cid === cid);
    if (old) {
      old.conn = true; old.dc = 0;
      if (acct && !old.uid) { old.uid = acct.uid; old.acc = acct.name; }
      this.fixHost();
      this.send(old.pid, JSON.stringify({ t: 'joined', pid: old.pid, code: this.code }));
      this.sendLobby();
      this.sendRoundTo(old.pid);
      return { pid: old.pid, rejoin: true };
    }
    if (this.players.length >= MAX_PLAYERS) {
      const bot = this.state === 'lobby' ? this.players.find((p) => p.bot) : null;
      if (!bot) return { err: 'Raum ist voll.' };
      this.remove(bot.pid, true);
    }
    const a = cleanAtze(atze);
    const p = {
      pid: this.nextPid++, cid, name: a.name, cls: a.cls, want: a.color, color: 0,
      look: pickLook(a),
      bot: false, level: 0, brain: null, conn: true, dc: 0, score: 0, ack: 0,
      uid: acct ? acct.uid : 0, acc: acct ? acct.name : '',
    };
    p.color = this.pickColor(p.want, p.pid);
    this.players.push(p);
    if (!this.get(this.host) || !this.get(this.host).conn) this.host = p.pid;
    this.send(p.pid, JSON.stringify({ t: 'joined', pid: p.pid, code: this.code }));
    this.sendLobby();
    this.sendRoundTo(p.pid);
    return { pid: p.pid };
  }

  addBot() {
    if (this.players.length >= MAX_PLAYERS) return;
    const taken = new Set(this.players.map((p) => p.name));
    const free = BOT_NAMES.filter((n) => !taken.has(n));
    const a = randomAtze(free[Math.floor(Math.random() * free.length)] || 'Bot');
    const p = {
      pid: this.nextPid++, cid: null, name: a.name, cls: a.cls, want: a.color, color: 0,
      look: pickLook(a),
      bot: true, level: this.settings.botLevel, brain: new Bot(this.settings.botLevel), conn: true, dc: 0, score: 0, ack: 0,
    };
    p.color = this.pickColor(p.want, p.pid);
    this.players.push(p);
  }

  disconnect(pid) {
    const p = this.get(pid);
    if (!p || p.bot) return;
    p.conn = false; p.dc = 0;
    this.fixHost();
    this.sendLobby();
  }

  remove(pid, silent) {
    const i = this.players.findIndex((p) => p.pid === pid);
    if (i < 0) return;
    this.players.splice(i, 1);
    if (this.round && this.round.kill(pid)) { this.events.push([pid, -1]); this.round.checkOver(); }
    this.fixHost();
    if (!silent) this.sendLobby();
  }

  fixHost() {
    const h = this.get(this.host);
    if (h && h.conn && !h.bot) return;
    const next = this.players.find((p) => !p.bot && p.conn);
    this.host = next ? next.pid : 0;
  }

  // ----- Nachrichten -----

  all(str) { for (const p of this.players) if (!p.bot && p.conn) this.send(p.pid, str); }

  lobbyInfo() {
    return {
      t: 'lobby', code: this.code, state: this.state, host: this.host, settings: this.settings,
      ranked: this.ranked, rated: this.state === 'lobby' || this.state === 'matchEnd' ? this.willRate() : this.rated,
      players: this.players.map((p) => ({ pid: p.pid, name: p.name, cls: p.cls, color: p.color, look: p.look, bot: p.bot, score: p.score, conn: p.conn, acc: p.acc || '' })),
      result: this.state === 'matchEnd' ? this.lastResult : null,
    };
  }
  sendLobby() { this.all(JSON.stringify(this.lobbyInfo())); }

  roundInfo(full) {
    const r = this.round;
    const m = {
      t: 'round', no: this.roundNo, R: r.R, theme: this.theme, seed: this.seed,
      k: this.state === 'countdown' ? -this.cd : r.tick,
      over: r.over,
      ids: r.pl.map((p) => p.pid),
      kin: r.pl.map((p) => packKin(p.s)),
    };
    if (full) {
      m.trails = r.pl.map((p) => {
        const flat = [];
        for (let i = p.tail; i < p.tx.length; i++) flat.push(r5(p.tx[i]), r5(p.ty[i]), r5(p.tz[i]), r3(p.ta[i]));
        return [p.pid, p.tail, flat, p.alive ? 1 : 0];
      });
    }
    return m;
  }

  // Wer mitten in der Runde (wieder) dazukommt, bekommt den kompletten Stand
  sendRoundTo(pid) {
    if (!this.round || this.state === 'lobby' || this.state === 'matchEnd') return;
    this.send(pid, JSON.stringify(this.roundInfo(true)));
  }

  handle(pid, m) {
    const p = this.get(pid);
    if (!p || !m || typeof m !== 'object') return;
    const isHost = pid === this.host;
    switch (m.t) {
      case 'in': {
        if (this.state !== 'playing' && this.state !== 'roundEnd') return;
        const pl = this.round && this.round.get(pid);
        if (!pl) return;
        let s = +m.s; if (!(s >= -1 && s <= 1)) s = 0;
        pl.inp.s = s; pl.inp.j = !!m.j; pl.inp.d = !!m.d;
        if (Number.isInteger(m.q)) p.ack = m.q;
        return;
      }
      case 'ping':
        this.send(pid, JSON.stringify({ t: 'pong', c: m.c }));
        return;
      case 'atze': {
        if (this.state !== 'lobby' && this.state !== 'matchEnd') return;
        const a = cleanAtze(m.atze);
        p.name = a.name; p.cls = a.cls; p.want = a.color;
        p.look = pickLook(a);
        p.color = this.pickColor(p.want, p.pid);
        this.sendLobby();
        return;
      }
      case 'set':
        if (!isHost) return;
        if ([3, 5, 10].includes(m.target)) this.settings.target = m.target;
        if ([0, 1, 2].includes(m.botLevel)) {
          this.settings.botLevel = m.botLevel;
          for (const b of this.players) if (b.bot) { b.level = m.botLevel; b.brain = new Bot(m.botLevel); }
        }
        this.sendLobby();
        return;
      case 'bot':
        if (!isHost || (this.state !== 'lobby' && this.state !== 'matchEnd')) return;
        if (m.add) this.addBot();
        else {
          const b = m.pid ? this.players.find((x) => x.bot && x.pid === m.pid) : [...this.players].reverse().find((x) => x.bot);
          if (b) this.remove(b.pid, true);
        }
        this.sendLobby();
        return;
      case 'start':
        if (!isHost || (this.state !== 'lobby' && this.state !== 'matchEnd')) return;
        if (this.players.filter((x) => x.bot || x.conn).length < 2) return;
        for (const x of this.players) x.score = 0;
        this.roundNo = 0;
        this.startRound();
        return;
      case 'lobby':
        if (!isHost) return;
        this.toLobby();
        return;
      case 'leave':
        this.remove(pid);
        return;
      default:
    }
  }

  // ----- Ablauf -----

  toLobby() {
    this.state = 'lobby';
    this.round = null;
    this.players = this.players.filter((p) => p.bot || p.conn);
    this.fixHost();
    this.sendLobby();
  }

  startRound() {
    // Wer zu lange weg ist, fliegt zwischen den Runden raus
    this.players = this.players.filter((p) => p.bot || p.conn || p.dc < 20 * TICK_RATE);
    this.fixHost();
    const part = this.players.filter((p) => p.bot || p.conn);
    if (part.length < 2 || this.connectedHumans() === 0) { this.toLobby(); return; }
    this.roundNo++;
    this.theme = Math.floor(Math.random() * N_THEMES);
    this.seed = Math.floor(Math.random() * 1e9);
    // Startplätze durchmischen
    this.rated = this.willRate();
    const order = part.map((p) => ({ pid: p.pid, cls: p.cls, uid: p.uid || 0 })).sort(() => Math.random() - 0.5);
    this.round = new Round(order, planetRadius(part.length));
    for (const p of this.players) { p.ack = 0; if (p.bot) p.brain = new Bot(p.level); }
    this.events = [];
    this.state = 'countdown';
    this.cd = Math.round(3.5 * TICK_RATE);
    this.sendLobby();
    this.all(JSON.stringify(this.roundInfo(false)));
  }

  endRound() {
    const r = this.round;
    const w = r.winner != null ? this.get(r.winner) : null;
    if (w) w.score++;
    const match = w && w.score >= this.settings.target ? w.pid : null;
    this.lastResult = { winner: w ? w.pid : null, match, scores: this.players.map((p) => [p.pid, p.score]), time: Math.round(r.tick / TICK_RATE * 10) / 10 };
    this.matchOver = match != null;
    // Rangliste: Kill = jemand läuft in deine Linie, Tod = du bist raus (egal wodurch, auch Verlassen)
    if (this.rated && this.onStats) {
      const list = [];
      for (const pl of r.pl) {
        if (!pl.uid) continue;
        let kills = 0;
        for (const o of r.pl) if (o !== pl && !o.alive && o.by === pl.pid) kills++;
        list.push({ uid: pl.uid, kills, deaths: pl.alive ? 0 : 1, rounds: 1, wins: r.winner === pl.pid ? 1 : 0, matches: this.matchOver ? 1 : 0, matchWins: match === pl.pid ? 1 : 0 });
      }
      if (list.length) { try { this.onStats(list); } catch {} }
    }
    this.state = 'roundEnd';
    this.phase = Math.round((this.matchOver ? 4.5 : 3.5) * TICK_RATE);
    this.all(JSON.stringify({ t: 'roundEnd', rated: this.rated, ...this.lastResult }));
  }

  snapshot() {
    const r = this.round;
    const P = [], N = [];
    for (const pl of r.pl) {
      const s = pl.s;
      const fl = (pl.alive ? 1 : 0) | (s.th ? 2 : 0) | (s.da > 0 ? 4 : 0);
      P.push([pl.pid, r5(s.px), r5(s.py), r5(s.pz), r5(s.hx), r5(s.hy), r5(s.hz), r3(s.alt), fl, pl.tail]);
      if (pl.sent < pl.tx.length) {
        const flat = [];
        for (let i = pl.sent; i < pl.tx.length; i++) flat.push(r5(pl.tx[i]), r5(pl.ty[i]), r5(pl.tz[i]), r3(pl.ta[i]));
        N.push([pl.pid, pl.sent, flat]);
        pl.sent = pl.tx.length;
      }
    }
    const base = { t: 's', k: this.state === 'countdown' ? -this.cd : r.tick, p: P };
    if (N.length) base.n = N;
    if (this.events.length) { base.e = this.events; this.events = []; }
    const head = JSON.stringify(base).slice(0, -1);
    for (const p of this.players) {
      if (p.bot || !p.conn) continue;
      const pl = r.get(p.pid);
      this.send(p.pid, pl ? `${head},"a":${p.ack},"me":${JSON.stringify(packKin(pl.s))}}` : `${head}}`);
    }
  }

  // Wird 60x pro Sekunde aufgerufen
  tick() {
    for (const p of this.players) if (!p.bot && !p.conn) p.dc++;
    if (this.connectedHumans() === 0) this.idleTicks++; else this.idleTicks = 0;

    if (this.state === 'lobby' || this.state === 'matchEnd') {
      const before = this.players.length;
      this.players = this.players.filter((p) => p.bot || p.conn || p.dc < 30 * TICK_RATE);
      if (this.players.length !== before) { this.fixHost(); this.sendLobby(); }
      return;
    }
    const r = this.round;
    if (this.state === 'countdown') {
      this.cd--;
      if (this.cd % SNAP_EVERY === 0) this.snapshot();
      if (this.cd <= 0) this.state = 'playing';
      return;
    }
    // playing / roundEnd: Simulation läuft weiter (Sieger dreht Ehrenrunden)
    for (const p of this.players) {
      const pl = r.get(p.pid);
      if (!pl || !pl.alive) continue;
      if (p.bot) {
        const o = p.brain.think(r, pl);
        pl.inp.s = o.s; pl.inp.j = o.j; pl.inp.d = o.d;
      } else if (!p.conn && p.dc > 3 * TICK_RATE && !r.over) {
        if (r.kill(p.pid)) { this.events.push([p.pid, -1]); r.checkOver(); }
      }
    }
    const ev = r.step();
    for (const e of ev) this.events.push(e);
    if (r.tick % SNAP_EVERY === 0) this.snapshot();

    if (this.state === 'playing') {
      if (r.over) this.endRound();
    } else if (--this.phase <= 0) {
      if (this.matchOver) {
        this.state = 'matchEnd';
        this.sendLobby();
      } else this.startRound();
    }
  }
}

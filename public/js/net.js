// Astro Atzen – Verbindung zum Spielraum.
// WSConn: echter Server per WebSocket.  LocalConn: derselbe Raum-Code direkt im Browser (Training, offline).
// HostConn / PeerConn (unten): ein Handy hostet, die anderen hängen direkt dran (WLAN-Modus).

import { Room } from '../shared/room.js';
import { TICK_RATE } from '../shared/sim.js';

export function serverUrl() {
  // window.ASTRO_SERVER erlaubt später eine verpackte App (APK), die auf einen festen Server zeigt
  const base = (typeof window !== 'undefined' && window.ASTRO_SERVER) || location.origin;
  return base.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
}

export class WSConn {
  constructor(handlers) {
    this.h = handlers; // { open, msg, close }
    this.ws = null;
    this.closed = false;
    this.local = false;
  }
  connect() {
    const ws = new WebSocket(serverUrl());
    this.ws = ws;
    ws.onopen = () => this.h.open && this.h.open();
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (this.h.msg) this.h.msg(m);
    };
    ws.onclose = () => { if (this.ws === ws && !this.closed) this.h.close && this.h.close(); };
    ws.onerror = () => {};
  }
  get ready() { return this.ws && this.ws.readyState === 1; }
  send(m) { if (this.ready) this.ws.send(JSON.stringify(m)); }
  close() {
    this.closed = true;
    if (this.ws) { try { this.ws.close(); } catch {} }
  }
}

export class LocalConn {
  constructor(handlers) {
    this.h = handlers;
    this.local = true;
    this.pid = 0;
    this.room = new Room('TRAINING', (pid, str) => { if (pid === this.pid) this.h.msg(JSON.parse(str)); });
    this.ready = true;
  }
  connect() { this.h.open && this.h.open(); }
  send(m) {
    if (m.t === 'join') {
      this.pid = this.room.nextPid;
      this.room.join('local', m.atze);
      for (let i = 0; i < (m.bots || 0); i++) this.room.addBot();
      this.room.sendLobby();
      return;
    }
    if (m.t === 'leave') return;
    this.room.handle(this.pid, m);
  }
  // wird vom Spiel-Loop im festen 60-Hz-Takt aufgerufen
  localTick() { this.room.tick(); }
  close() { this.ready = false; }
}

// ---------- WLAN-Modus: ein Handy hostet, die anderen verbinden sich direkt (WebRTC) ----------
// Der Server vermittelt nur den Verbindungsaufbau ("Signaling"). Danach laufen alle Spieldaten direkt
// zwischen den Geräten – im selben WLAN mit wenigen Millisekunden Verzögerung.
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
// Direktverbindungen vertragen keine riesigen Einzelnachrichten (z.B. alle Linien beim Wiedereinstieg):
// lange Texte in Stücken schicken. '~0' = es kommt noch was, '~1' = letztes Stück.
const CHUNK = 12000;
function sendBig(dc, str) {
  if (str.length <= CHUNK) { dc.send(str); return; }
  for (let i = 0; i < str.length; i += CHUNK) dc.send((i + CHUNK >= str.length ? '~1' : '~0') + str.slice(i, i + CHUNK));
}

// Mitspieler-Seite: baut die Direktverbindung zum Host auf. sig = bereits offene WSConn zum Server.
export class PeerConn {
  constructor(handlers, sig) {
    this.h = handlers; // { open, msg, close, fail }
    this.sig = sig;
    this.p2p = true;
    this.local = false;
    this.ready = false;
    this.closed = false;
    const pc = this.pc = new RTCPeerConnection({ iceServers: ICE });
    const dc = this.dc = pc.createDataChannel('game'); // zuverlässig + in Reihenfolge, wie beim WebSocket
    dc.onopen = () => {
      this.ready = true;
      clearTimeout(this.timer);
      setTimeout(() => this.sig.close(), 1500); // Vermittlung wird nicht mehr gebraucht
      this.h.open && this.h.open();
    };
    let parts = '';
    dc.onmessage = (e) => {
      let data = e.data;
      if (typeof data !== 'string') return;
      if (data[0] === '~') { parts += data.slice(2); if (data[1] !== '1') return; data = parts; parts = ''; }
      let m;
      try { m = JSON.parse(data); } catch { return; }
      this.h.msg(m);
    };
    dc.onclose = () => { const was = this.ready; this.ready = false; if (!this.closed) { this.closed = true; if (was) this.h.close && this.h.close(); else this.fail(); } };
    pc.onicecandidate = (e) => { if (e.candidate) sig.send({ t: 'p2p-sig', data: { ice: e.candidate } }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && !this.ready) this.fail(); };
    sig.h = {
      msg: (m) => {
        if (m.t === 'p2p-sig' && m.data) {
          if (m.data.sdp) pc.setRemoteDescription(m.data.sdp).catch(() => this.fail());
          else if (m.data.ice) pc.addIceCandidate(m.data.ice).catch(() => {});
        } else if (m.t === 'p2p-closed') this.fail();
      },
      close: () => {},
    };
    pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => sig.send({ t: 'p2p-sig', data: { sdp: pc.localDescription } })).catch(() => this.fail());
    this.timer = setTimeout(() => this.fail(), 12000);
  }
  fail() {
    if (this.closed || this.ready) return;
    this.close();
    this.h.fail && this.h.fail();
  }
  connect() {}
  send(m) { if (this.ready && this.dc.readyState === 'open') { try { this.dc.send(JSON.stringify(m)); } catch {} } }
  close() {
    this.closed = true; this.ready = false;
    clearTimeout(this.timer);
    try { this.dc.close(); } catch {}
    try { this.pc.close(); } catch {}
    this.sig.close();
  }
}

// Host-Seite: der Raum läuft hier im Browser (wie im Training), Mitspieler hängen per Direktverbindung dran.
export class HostConn {
  constructor(handlers, sig, code) {
    this.h = handlers;
    this.code = code;
    this.p2p = true;
    this.local = false;
    this.ready = true;
    this.closed = false;
    this.pid = 0;
    this.peers = new Map(); // Vermittlungs-ID -> { pc, dc, pid }
    this.byPid = new Map();
    this.room = new Room(code, (pid, str) => {
      if (pid === this.pid) { this.h.msg(JSON.parse(str)); return; }
      const p = this.byPid.get(pid);
      if (p && p.dc && p.dc.readyState === 'open') { try { sendBig(p.dc, str); } catch {} }
    });
    this.attach(sig);
    // alle 4 Minuten ein Lebenszeichen, damit der Gratis-Server nicht einschläft und der Code gültig bleibt
    this.keep = setInterval(() => this.sig.send({ t: 'p2p-ping' }), 240000);
    // Eigener 60-Hz-Takt, unabhängig von der Bildrate: ruckelt die Grafik beim Host, läuft das Spiel für alle normal weiter
    const step = 1000 / TICK_RATE;
    let last = performance.now(), acc = 0;
    this.loop = setInterval(() => {
      const now = performance.now();
      acc += now - last; last = now;
      if (acc > 250) acc = 250;
      while (acc >= step) { acc -= step; this.room.tick(); }
    }, 4);
  }

  attach(sig) {
    this.sig = sig;
    sig.h = {
      msg: (m) => this.onSig(m),
      // Vermittlung weg (Funkloch, Server-Neustart): laufende Spiele betrifft das nicht.
      // Im Hintergrund neu anmelden und denselben Code zurückholen, damit Nachzügler noch beitreten können.
      close: () => { if (!this.closed) this.retry = setTimeout(() => this.reclaim(), 4000); },
      open: () => this.sig.send({ t: 'p2p-host', code: this.code }),
    };
  }
  reclaim() {
    if (this.closed) return;
    const sig = new WSConn({});
    this.attach(sig);
    sig.connect();
  }

  onSig(m) {
    // nach einer Neuanmeldung kann der alte Code vergeben sein – dann gilt der neue
    if (m.t === 'p2p-hosted' && m.code !== this.code) { this.code = m.code; this.room.code = m.code; this.room.sendLobby(); return; }
    if (m.t !== 'p2p-sig' || !m.data) return;
    const p = this.peers.get(m.from) || this.addPeer(m.from);
    if (m.data.sdp) {
      p.pc.setRemoteDescription(m.data.sdp)
        .then(() => p.pc.createAnswer())
        .then((a) => p.pc.setLocalDescription(a))
        .then(() => this.sig.send({ t: 'p2p-sig', to: m.from, data: { sdp: p.pc.localDescription } }))
        .catch(() => this.drop(p));
    } else if (m.data.ice) p.pc.addIceCandidate(m.data.ice).catch(() => {});
  }

  addPeer(id) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const p = { id, pc, dc: null, pid: 0, gone: false };
    pc.onicecandidate = (e) => { if (e.candidate) this.sig.send({ t: 'p2p-sig', to: id, data: { ice: e.candidate } }); };
    pc.ondatachannel = (e) => {
      p.dc = e.channel;
      p.dc.onmessage = (ev) => this.onPeerMsg(p, ev.data);
      p.dc.onclose = () => this.drop(p);
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(p); };
    this.peers.set(id, p);
    return p;
  }

  onPeerMsg(p, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join') {
      if (p.pid) return;
      let cid = typeof m.cid === 'string' ? m.cid.slice(0, 40) : '';
      if (!cid) return;
      if (cid === this.cid) cid += '-' + p.id; // gleiches Gerät/Profil wie der Host
      // Erst die Zuordnung eintragen, dann beitreten – join() verschickt sofort Nachrichten
      const ex = this.room.players.find((q) => !q.bot && q.cid === cid);
      const pid = ex ? ex.pid : this.room.nextPid;
      const old = this.byPid.get(pid);
      if (old && old !== p) { old.pid = 0; this.drop(old); }
      this.byPid.set(pid, p);
      const res = this.room.join(cid, m.atze);
      if (res.err) { this.byPid.delete(pid); try { p.dc.send(JSON.stringify({ t: 'err', msg: res.err })); } catch {} return; }
      p.pid = res.pid;
      return;
    }
    if (!p.pid) return;
    if (m.t === 'leave') { const pid = p.pid; p.pid = 0; this.byPid.delete(pid); this.room.remove(pid); return; }
    this.room.handle(p.pid, m);
  }

  drop(p) {
    if (p.gone) return;
    p.gone = true;
    this.peers.delete(p.id);
    if (p.pid && this.byPid.get(p.pid) === p) { this.byPid.delete(p.pid); this.room.disconnect(p.pid); }
    try { if (p.dc) p.dc.close(); } catch {}
    try { p.pc.close(); } catch {}
  }

  connect() {}
  send(m) {
    if (m.t === 'join') { this.cid = m.cid; this.pid = this.room.nextPid; this.room.join(m.cid, m.atze); return; }
    if (m.t === 'leave') return;
    this.room.handle(this.pid, m);
  }
  close() {
    this.closed = true; this.ready = false;
    clearInterval(this.keep); clearInterval(this.loop); clearTimeout(this.retry);
    // den Mitspielern Bescheid sagen, dann erst die Leitungen kappen
    const peers = [...this.peers.values()];
    for (const p of peers) { p.pid = 0; try { if (p.dc && p.dc.readyState === 'open') p.dc.send('{"t":"bye"}'); } catch {} }
    setTimeout(() => { for (const p of peers) this.drop(p); }, 400);
    this.sig.close();
  }
}

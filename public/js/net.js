// Astro Atzen – Verbindung zum Spielraum.
// WSConn: echter Server per WebSocket.  LocalConn: derselbe Raum-Code direkt im Browser (Training, offline).

import { Room } from '../shared/room.js';

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
      this.h.msg(m);
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

// Astro Atzen – Server: liefert das Spiel aus (public/) und hostet die Multiplayer-Räume per WebSocket.
// Zweite Aufgabe: Vermittlung für "WLAN-Räume", bei denen ein Handy selbst hostet (WebRTC). Dort läuft
// nur der Verbindungsaufbau über den Server, das Spiel selbst geht direkt von Handy zu Handy.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './public/shared/room.js';
import { TICK_RATE } from './public/shared/sim.js';

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const MAX_ROOMS = 200;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// ---------- Dateien ausliefern ----------
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`ok ${rooms.size} ${p2p.size}`); return; }
    if (p === '/') p = '/index.html';
    const file = path.join(PUBLIC, path.normalize(p));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': p.startsWith('/vendor/') || ext === '.png' ? 'public, max-age=604800' : 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
  }
});

// ---------- Räume ----------
const rooms = new Map(); // code -> { room, socks: Map<pid, ws> }

function newCode() {
  for (let n = 0; n < 50; n++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c) && !p2p.has(c)) return c;
  }
  return null;
}

function createRoom() {
  if (rooms.size >= MAX_ROOMS) return null;
  const code = newCode();
  if (!code) return null;
  const socks = new Map();
  const room = new Room(code, (pid, str) => {
    const ws = socks.get(pid);
    if (ws && ws.readyState === 1) ws.send(str);
  });
  const entry = { room, socks };
  rooms.set(code, entry);
  return entry;
}

// WLAN-Räume: code -> { host: ws, peers: Map<id, ws>, n }
const p2p = new Map();
const say = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.entry = null;
  ws.pid = 0;
  ws.p2p = null;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m !== 'object') return;
    // ----- WLAN-Raum anmelden (der Host kann seinen Code nach einem Verbindungsabbruch zurückholen) -----
    if (m.t === 'p2p-host') {
      if (ws.entry || ws.p2p) return;
      let code = typeof m.code === 'string' && /^[A-Z]{4}$/.test(m.code) && !rooms.has(m.code) && !p2p.has(m.code) ? m.code : null;
      if (!code && p2p.size < 500) code = newCode();
      if (!code) { say(ws, { t: 'err', msg: 'Server ist voll, probier es gleich nochmal.' }); return; }
      p2p.set(code, { host: ws, peers: new Map(), n: 1 });
      ws.p2p = { code, host: true };
      say(ws, { t: 'p2p-hosted', code });
      return;
    }
    // ----- Verbindungsdaten zwischen Host und Mitspieler durchreichen -----
    if (m.t === 'p2p-sig') {
      const pr = ws.p2p && p2p.get(ws.p2p.code);
      if (!pr || !m.data || typeof m.data !== 'object') return;
      if (ws.p2p.host) say(pr.peers.get(m.to), { t: 'p2p-sig', data: m.data });
      else say(pr.host, { t: 'p2p-sig', from: ws.p2p.id, data: m.data });
      return;
    }
    if (m.t === 'p2p-ping') return; // hält den Server wach, solange jemand hostet
    if (m.t === 'join') {
      if (ws.entry || ws.p2p) return;
      const cid = typeof m.cid === 'string' ? m.cid.slice(0, 40) : '';
      if (!cid) return;
      let entry;
      if (m.create) {
        entry = createRoom();
        if (!entry) { ws.send(JSON.stringify({ t: 'err', msg: 'Server ist voll, probier es gleich nochmal.' })); return; }
      } else {
        const code = String(m.room || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        entry = rooms.get(code);
        if (!entry) {
          // Kein Server-Raum mit dem Code – vielleicht ein WLAN-Raum? Dann zum Host vermitteln.
          const pr = p2p.get(code);
          if (pr && pr.host.readyState === 1) {
            const id = Math.random().toString(36).slice(2, 10); // zufällig, damit IDs auch nach einem Server-Neustart eindeutig bleiben
            pr.peers.set(id, ws);
            ws.p2p = { code, id };
            say(ws, { t: 'p2p', code, id });
            return;
          }
          ws.send(JSON.stringify({ t: 'err', msg: `Raum ${code || '????'} gibt es nicht.` }));
          return;
        }
      }
      // Erst die Verbindung eintragen, dann beitreten – join() verschickt sofort Nachrichten
      const existing = entry.room.players.find((p) => !p.bot && p.cid === cid);
      if (existing) {
        const oldWs = entry.socks.get(existing.pid);
        if (oldWs && oldWs !== ws) { oldWs.entry = null; try { oldWs.close(4001, 'ersetzt'); } catch {} }
        entry.socks.set(existing.pid, ws);
      } else {
        entry.socks.set(entry.room.nextPid, ws);
      }
      const pidGuess = existing ? existing.pid : entry.room.nextPid;
      const res = entry.room.join(cid, m.atze);
      if (res.err) {
        entry.socks.delete(pidGuess);
        ws.send(JSON.stringify({ t: 'err', msg: res.err }));
        return;
      }
      ws.entry = entry;
      ws.pid = res.pid;
      return;
    }
    if (!ws.entry) return;
    if (m.t === 'leave') {
      const e = ws.entry;
      ws.entry = null;
      e.socks.delete(ws.pid);
      e.room.remove(ws.pid);
      return;
    }
    ws.entry.room.handle(ws.pid, m);
  });
  ws.on('close', () => {
    if (ws.p2p) {
      const pr = p2p.get(ws.p2p.code);
      if (pr && ws.p2p.host && pr.host === ws) {
        for (const peer of pr.peers.values()) say(peer, { t: 'p2p-closed' });
        p2p.delete(ws.p2p.code);
      } else if (pr && !ws.p2p.host) pr.peers.delete(ws.p2p.id);
    }
    const e = ws.entry;
    if (!e) return;
    ws.entry = null;
    if (e.socks.get(ws.pid) === ws) { e.socks.delete(ws.pid); e.room.disconnect(ws.pid); }
  });
  ws.on('error', () => {});
});

// ---------- Spieltakt: 60 Ticks pro Sekunde ----------
const STEP = 1000 / TICK_RATE;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += now - last;
  last = now;
  if (acc > 250) acc = 250;
  while (acc >= STEP) {
    acc -= STEP;
    for (const [code, e] of rooms) {
      try { e.room.tick(); } catch (err) { console.error('Raum', code, err); rooms.delete(code); continue; }
      // Leere Räume nach 45 Sekunden aufräumen
      if (e.room.idleTicks > 45 * TICK_RATE) rooms.delete(code);
    }
  }
}, 5);

// Tote Verbindungen erkennen
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    try { ws.ping(); } catch {}
  }
}, 15000);

server.listen(PORT, () => console.log(`Astro Atzen läuft auf Port ${PORT}`));

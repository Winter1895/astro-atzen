// Startet den echten Server, verbindet 3 Clients mit künstlicher Latenz und prüft:
// Raum erstellen/beitreten, Rundenablauf, Vorhersage-Fehler, Wiedereinstieg.
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { ClientGame } from '../public/js/netgame.js';

const PORT = 3999;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 600));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name, lag, jitter = 0) {
  const c = { name, lag, pid: 0, code: '', lobby: null, game: null, roster: new Map(), corr: [], results: [], steer: 0, t: 0, ws: null, snaps: 0 };
  c.open = (join) => new Promise((res) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    c.ws = ws;
    // Verzögerung mit Schwankung, aber garantiert in Sende-Reihenfolge (wie bei echtem TCP)
    const lane = () => { const q = []; let last = 0; setInterval(() => { const now = performance.now(); while (q.length && q[0].t <= now) q.shift().fn(); }, 1); return (fn) => { last = Math.max(performance.now() + lag + Math.random() * jitter, last); q.push({ t: last, fn }); }; };
    const up = lane(), down = lane();
    const sendRaw = (m) => up(() => ws.readyState === 1 && ws.send(JSON.stringify(m)));
    c.send = sendRaw;
    ws.on('open', () => sendRaw({ t: 'join', cid: 'cid-' + name, atze: { name, cls: 0, color: 2 }, ...join }));
    ws.on('message', (raw) => down(() => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'joined') { c.pid = m.pid; c.code = m.code; res(c); }
      else if (m.t === 'err') { c.err = m.msg; res(c); }
      else if (m.t === 'lobby') { c.lobby = m; c.roster = new Map(m.players.map((p) => [p.pid, p])); }
      else if (m.t === 'round') { c.game = new ClientGame(m, c.pid, c.roster, (rec) => sendRaw({ t: 'in', q: rec.q, s: rec.s, j: rec.j, d: rec.d })); c.rounds = (c.rounds || 0) + 1; }
      else if (m.t === 's' && c.game) { c.game.onSnap(m, performance.now()); c.snaps++; if (c.game.live && c.game.me?.alive) c.corr.push(c.game.corr); }
      else if (m.t === 'roundEnd') c.results.push(m);
    }));
  });
  // 60-Hz-Client-Loop mit wildem Lenken
  let last = performance.now(), acc = 0;
  c.timer = setInterval(() => {
    const now = performance.now(); acc += now - last; last = now;
    while (acc >= 1000 / 60) {
      acc -= 1000 / 60; c.t++;
      if (c.t % 40 === 0) c.steer = Math.random() * 2 - 1;
      if (c.game) c.game.tick({ s: c.steer, j: c.t % 90 < 20, d: c.t % 200 < 5 });
    }
    if (c.game) c.game.sample(now, 1 / 60);
  }, 8);
  return c;
}
const fail = (msg) => { console.error('FEHLER:', msg); srv.kill(); process.exit(1); };

const a = await client('Anna', 30, 10).open({ create: true });
if (!/^[A-Z]{4}$/.test(a.code)) fail('kein Raumcode');
const b = await client('Bernd', 60, 25).open({ room: a.code });
const c = await client('Cem', 15, 5).open({ room: a.code.toLowerCase() });
const x = await client('Xaver', 5).open({ room: 'QQQQ' });
if (!x.err) fail('falscher Raum sollte Fehler geben');
await sleep(300);
if (a.lobby.players.length !== 3) fail('Lobby hat nicht 3 Spieler: ' + a.lobby.players.length);
if (a.lobby.host !== a.pid) fail('Host falsch');
const colors = new Set(a.lobby.players.map((p) => p.color));
if (colors.size !== 3) fail('Farben nicht eindeutig');
b.send({ t: 'start' }); // darf nicht: kein Host
await sleep(300);
if (a.lobby.state !== 'lobby') fail('Nicht-Host konnte starten');
a.send({ t: 'bot', add: true });
a.send({ t: 'set', target: 3 });
for (let i = 0; i < 40 && !(a.lobby.players.length === 4 && a.lobby.settings.target === 3); i++) await sleep(50);
if (a.lobby.players.length !== 4 || a.lobby.settings.target !== 3) fail('Bot/Einstellung: ' + JSON.stringify([a.lobby.players.map((p) => p.name), a.lobby.settings, a.lobby.host, a.pid]));
a.send({ t: 'start' });
await sleep(1500);
if (!a.game || !b.game || !c.game) fail('Runde nicht gestartet');
if (a.game.k >= 0) fail('Countdown fehlt');

// Wiedereinstieg: Cem verliert mitten im Spiel die Verbindung und kommt zurück
await sleep(4000);
c.ws.close();
await sleep(700);
const oldPid = c.pid;
await c.open({ room: a.code });
if (c.pid !== oldPid) fail('Wiedereinstieg bekam neue pid');

// bis zum Match-Ende laufen lassen
const tEnd = Date.now() + 150000;
while (Date.now() < tEnd && a.lobby.state !== 'matchEnd') await sleep(500);
if (a.lobby.state !== 'matchEnd') fail('Match endete nicht (state ' + a.lobby.state + ')');

for (const cl of [a, b, c]) {
  const v = cl.corr.slice().sort((p, q) => p - q);
  const avg = v.reduce((s, q) => s + q, 0) / v.length;
  const p95 = v[Math.floor(v.length * 0.95)];
  console.log(`${cl.name} (Latenz ~${cl.lag * 2}ms hin+zurück): ${cl.rounds} Runden, ${cl.snaps} Zustände, Korrektur Ø ${avg.toFixed(3)} / p95 ${p95.toFixed(3)} / max ${v[v.length - 1].toFixed(2)} Einheiten`);
  if (p95 > 0.6) fail('Vorhersage weicht zu stark ab');
}
console.log('Rundenergebnisse:', a.results.map((r) => `${r.winner ?? '-'}@${r.time}s`).join(', '));
console.log('Endstand:', a.lobby.players.map((p) => `${p.name}:${p.score}`).join(' '));
a.send({ t: 'lobby' });
await sleep(300);
if (a.lobby.state !== 'lobby') fail('zurück zur Lobby');
console.log('net ok');
for (const cl of [a, b, c, x]) { clearInterval(cl.timer); try { cl.ws.close(); } catch {} }
srv.kill();
process.exit(0);

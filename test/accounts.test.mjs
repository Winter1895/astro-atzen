// Konten + Rangliste: registrieren, anmelden, gewertete und ungewertete Runden.
// Aufruf: node test/accounts.test.mjs            (Datei-Speicher)
//         DATABASE_URL=postgres://... node test/accounts.test.mjs   (Postgres)
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { rm } from 'node:fs/promises';

const PORT = 3997, URL_ = `http://localhost:${PORT}`;
if (!process.env.DATABASE_URL) await rm(new URL('../data/db.json', import.meta.url), { force: true });
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT }, stdio: 'inherit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1200);
const fail = (msg) => { console.error('FEHLER:', msg); srv.kill(); process.exit(1); };
const api = async (route, body, token) => {
  const r = await fetch(`${URL_}/api/${route}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return [r.status, await r.json()];
};
const tag = Math.random().toString(36).slice(2, 6);
const N = (n) => `${n}${tag}`;

// --- Konten ---
let [st, a] = await api('register', { name: N('Anna'), password: 'geheim123' });
if (st !== 200 || !a.token) fail('registrieren: ' + JSON.stringify(a));
let [, b] = await api('register', { name: N('Bernd'), password: 'geheim456' });
[st] = await api('register', { name: N('anna'), password: 'andere123' });
if (st !== 409) fail('doppelter Name (andere Schreibweise) muss abgelehnt werden: ' + st);
[st] = await api('register', { name: 'x', password: 'geheim123' }); if (st !== 400) fail('zu kurzer Name');
[st] = await api('register', { name: N('Carl'), password: '123' }); if (st !== 400) fail('zu kurzes Passwort');
[st] = await api('login', { name: N('Anna'), password: 'falsch999' }); if (st !== 401) fail('falsches Passwort muss 401 geben');
let [st2, a2] = await api('login', { name: N('ANNA'), password: 'geheim123' });
if (st2 !== 200 || a2.account.name !== N('Anna')) fail('anmelden: ' + JSON.stringify(a2));
[st] = await api('me', null, 'x'.repeat(48)); if (st !== 401) fail('falsches Token');
[st] = await api('me', null, a.token); if (st !== 200) fail('me');
console.log('Konten ok');

// --- Spielen ---
let n = 0;
function client(name, token, join) {
  const c = { name, lobby: null, pid: 0, code: '', ends: [] };
  // jeder lenkt anders, sonst sterben alle im selben Moment (unentschieden)
  let q = 0; const steer = [0.25, -0.45, 0.1, 0.8][n++ % 4];
  c.timer = setInterval(() => { if (c.ws && c.ws.readyState === 1) c.send({ t: 'in', q: ++q, s: steer, j: q % 240 < 30 ? 1 : 0, d: 0 }); }, 50);
  c.ready = new Promise((res) => {
    const ws = c.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    c.send = (m) => ws.send(JSON.stringify(m));
    ws.on('open', () => c.send({ t: 'join', cid: 'cid-' + name + Math.random(), atze: { name }, token, ...join }));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'joined') { c.pid = m.pid; c.code = m.code; }
      else if (m.t === 'lobby') { c.lobby = m; res(c); }
      else if (m.t === 'roundEnd') c.ends.push(m);
    });
  });
  return c;
}
const until = async (fn, ms = 120000) => { const t = Date.now() + ms; while (Date.now() < t) { if (fn()) return true; await sleep(100); } return false; };
const me = async (tok) => (await api('me', null, tok))[1].account;

// 1) Raum mit Bot: darf nicht zählen
const A = await client('A', a.token, { create: true }).ready;
if (!A.lobby.ranked || A.lobby.rated) fail('allein darf nicht gewertet sein');
A.send({ t: 'bot', add: true }); A.send({ t: 'set', target: 3 });
await until(() => A.lobby.players.length === 2 && A.lobby.settings.target === 3, 3000);
if (A.lobby.rated) fail('mit Bot darf nicht gewertet sein');
A.send({ t: 'start' });
if (!await until(() => A.lobby.state === 'matchEnd')) fail('Bot-Match endet nicht');
await sleep(300);
let sa = await me(a.token);
if (sa.rounds !== 0 || sa.kills !== 0 || sa.deaths !== 0) fail('Bot-Runden wurden gezählt: ' + JSON.stringify(sa));
if (A.ends.some((e) => e.rated)) fail('roundEnd.rated bei Bot-Runde');
console.log(`Bot-Match (${A.ends.length} Runden): nichts gezählt – ok`);

// 2) Bot raus, Bernd + Gast rein, dazu dasselbe Konto ein zweites Mal
A.send({ t: 'lobby' });
await until(() => A.lobby.state === 'lobby', 3000);
A.send({ t: 'bot', add: false });
const B = await client('B', b.token, { room: A.code }).ready;
const G = await client('Gast', undefined, { room: A.code }).ready;
const A2 = await client('A-doppelt', a.token, { room: A.code }).ready;
await until(() => A.lobby.players.length === 4 && !A.lobby.players.some((p) => p.bot), 3000);
const accs = A.lobby.players.map((p) => p.acc);
if (accs.filter((x) => x === N('Anna')).length !== 1) fail('Konto doppelt im Raum: ' + accs);
if (!A.lobby.rated) fail('4 Menschen ohne Bot sollten gewertet sein');
A.ends.length = 0;
A.send({ t: 'start' });
if (!await until(() => A.lobby.state === 'matchEnd')) fail('Match endet nicht');
await sleep(500);
sa = await me(a.token); const sb = await me(b.token);
const rounds = A.ends.length;
console.log(`Gewertetes Match: ${rounds} Runden | Anna ${JSON.stringify(sa)} | Bernd ${JSON.stringify(sb)}`);
if (sa.rounds !== rounds || sb.rounds !== rounds) fail('Rundenzahl stimmt nicht');
if (sa.matches !== 1 || sb.matches !== 1) fail('Match nicht gezählt');
if (sa.wins + sa.deaths !== rounds && sa.deaths > rounds) fail('Tode unplausibel');
const winsA = A.ends.filter((e) => e.winner === A.pid).length;
if (sa.wins !== winsA) fail(`Rundensiege: ${sa.wins} statt ${winsA}`);
if (!A.ends.every((e) => e.rated)) fail('roundEnd.rated fehlt');
const [, lb] = await api('leaderboard');
if (!lb.top.some((u) => u.name === N('Anna')) || !lb.top.some((u) => u.name === N('Bernd'))) fail('Rangliste unvollständig');
if (lb.top.some((u) => 'pass' in u || 'id' in u)) fail('Rangliste verrät interne Felder');
console.log('Rangliste:', lb.top.filter((u) => u.name.endsWith(tag)).map((u) => `${u.name} ${u.kills}/${u.deaths}`).join(', '));
await api('logout', {}, a.token);
[st] = await api('me', null, a.token); if (st !== 401) fail('nach Abmelden noch gültig');
console.log('accounts ok');
for (const c of [A, B, G, A2]) { clearInterval(c.timer); c.ws.close(); }
srv.kill(); process.exit(0);

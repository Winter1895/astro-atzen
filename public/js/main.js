// Astro Atzen – Hauptprogramm: Menüs, Atzen-Editor, Lobby, Spielschleife.

import { View } from './render.js';
import { Input } from './input.js';
import { ClientGame } from './netgame.js';
import { WSConn, LocalConn, HostConn, PeerConn } from './net.js';
import { CLASSES, C, DT, TICK_RATE, BOT_LEVEL_NAMES } from '../shared/sim.js';
import { cleanAtze, randomAtze, MAX_PLAYERS, PRESETS } from '../shared/room.js';
import { SUITS, COLORS2, SKINS, HAIR_COLORS, HAIRS, BEARDS, GLASSES, HATS, OUTFITS, PATTERNS, EXTRAS, hex } from './atze.js';
import { sfx, unlockAudio, setSound, jetSound, setMusic, musicMode, audioPause } from './audio.js';

const OFFLINE = !!window.ASTRO_OFFLINE; // Einzeldatei-Testversion ohne Server
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

// ---------- Gespeicherte Atzen ----------
const KEY = 'astroatzen.v1';
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
// Atzen aus der ersten Version (ein Feld "face", Cap als Frisur) auf die neuen Felder umziehen
function migrate(a) {
  if (!a || a.face === undefined) return a;
  const b = { ...a, outfit: 0, pattern: 0, color2: 9, hat: 0, acc: 0, helmet: 1 };
  b.glasses = a.face === 1 || a.face === 4 ? 1 : 0;
  b.beard = a.face === 2 || a.face === 4 ? 1 : a.face === 3 ? 2 : 0;
  if (a.hair === 6) { b.hair = 1; b.hat = 1; } else if (a.hair === 7) b.hair = 6;
  delete b.face;
  return b;
}
function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.atzen) && s.atzen.length) {
      s.atzen = s.atzen.slice(0, 12).map((a) => cleanAtze(migrate(a)));
      s.active = Math.min(Math.max(0, s.active | 0), s.atzen.length - 1);
      if (!s.cid) s.cid = uid();
      return s;
    }
  } catch {}
  return { atzen: [randomAtze('Atze')], active: 0, sound: true, cid: uid(), fresh: true };
}
const store = loadStore();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };
const active = () => store.atzen[store.active];

// ---------- Zustand ----------
const view = new View($('gl'));
const input = new Input({ zone: $('joy-zone'), base: $('joy-base'), knob: $('joy-knob'), jet: $('btn-jet'), dash: $('btn-dash') });
let conn = null;
let connKind = '';
let myPid = 0;
let roomCode = '';
let lobby = null;
let roster = new Map();
let game = null;
let screen = 'home';
let editorBack = 'home';
let specPid = 0;
let reconnects = 0;
let joinTimer = 0;
const hud = { cd: null, wasLive: false, alt: 0, da: 0, sig: '', fuel: -1, dash: -1, bannerT: 0, pingT: 0, specName: '' };

setSound(store.sound !== false);
setMusic(store.music !== false);

// ---------- kleine Helfer ----------
let toastT = 0;
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), ms);
}
function busy(text) { $('busy').hidden = !text; if (text) $('busy-text').textContent = text; }
function banner(text, sub = '', ms = 1500, color = '') {
  const b = $('banner');
  b.firstElementChild.textContent = text;
  b.firstElementChild.style.color = color;
  b.lastElementChild.textContent = sub;
  b.classList.add('on');
  hud.bannerT = performance.now() + ms;
}
function feed(html) {
  const f = $('feed');
  const d = document.createElement('div');
  d.innerHTML = html;
  f.appendChild(d);
  while (f.children.length > 4) f.firstChild.remove();
  setTimeout(() => d.remove(), 4000);
}
function fullscreen(force) {
  if (!coarse && !force) return;
  try {
    const el = document.documentElement;
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
    const lock = () => { try { const l = window.screen.orientation && window.screen.orientation.lock && window.screen.orientation.lock('landscape'); if (l && l.catch) l.catch(() => {}); } catch {} };
    if (p && p.then) p.then(lock).catch(() => {}); else lock();
  } catch {}
}
let wake = null;
async function wakeLock() {
  try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch {}
}
const nameOf = (pid) => (roster.get(pid) ? roster.get(pid).name : '?');
const colorOf = (pid) => hex(SUITS[roster.get(pid) ? roster.get(pid).color : 0] ?? SUITS[0]);
const tagName = (pid) => `<b style="color:${colorOf(pid)}">${esc(nameOf(pid))}</b>`;

// ---------- Screens ----------
function show(name) {
  screen = name;
  for (const s of ['home', 'editor', 'lobby', 'account', 'board']) $('scr-' + s).hidden = s !== name;
  const inGame = name === 'game';
  musicMode(inGame ? 'game' : 'menu');
  $('hud').hidden = !inGame;
  input.enabled = inGame;
  if (!inGame) {
    $('pause').hidden = true;
    $('result').hidden = true;
    jetSound(false);
    view.showMenu(name === 'editor' ? 'editor' : 'home');
  }
  if (name === 'home') renderHome();
  if (name === 'editor') renderEditor();
  if (name === 'lobby') renderLobby();
  if (name === 'account') renderAccount();
  if (name === 'board') renderBoard();
}

// ---------- Konto + Rangliste ----------
const API = ((typeof window !== 'undefined' && window.ASTRO_SERVER) || location.origin).replace(/\/$/, '') + '/api/';
async function api(route, body) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (store.token) headers.authorization = 'Bearer ' + store.token;
  let r;
  try { r = await fetch(API + route, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Server nicht erreichbar.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.err || 'Das hat nicht geklappt.'); e.status = r.status; throw e; }
  return j;
}
const kd = (u) => (u.kills / Math.max(1, u.deaths)).toFixed(2);
const rate = (u) => (u.rounds ? Math.round((u.wins / u.rounds) * 100) : 0) + ' %';
function statBoxes(u) {
  const box = (v, l) => `<div><b>${v}</b><small>${l}</small></div>`;
  return box(kd(u), 'K/D') + box(u.kills, 'Kills') + box(u.deaths, 'Tode') + box(`${u.wins}/${u.rounds}`, 'Runden gewonnen') + box(rate(u), 'Siegquote') + box(`${u.matchWins}/${u.matches}`, 'Matches gewonnen');
}
function setAccount(res) {
  if (res) { store.token = res.token || store.token; store.account = res.account.name; store.stats = res.account; }
  else { delete store.token; delete store.account; delete store.stats; }
  save();
}
async function renderAccount() {
  const logged = !!store.token;
  $('acc-out').hidden = logged;
  $('acc-in').hidden = !logged;
  if (!logged) return;
  $('acc-who').textContent = store.account || '';
  if (store.stats) $('acc-stats').innerHTML = statBoxes(store.stats);
  try { const r = await api('me'); setAccount({ account: r.account }); if (screen === 'account') { $('acc-who').textContent = r.account.name; $('acc-stats').innerHTML = statBoxes(r.account); } }
  catch (e) { if (e.status === 401) { setAccount(null); toast('Bitte neu anmelden.'); if (screen === 'account') renderAccount(); } }
}
async function auth(route) {
  const name = $('acc-name').value.trim(), password = $('acc-pass').value;
  if (name.length < 3) { toast('Der Name braucht mindestens 3 Zeichen.'); return; }
  if (password.length < 6) { toast('Das Passwort braucht mindestens 6 Zeichen.'); return; }
  busy(route === 'login' ? 'Melde an …' : 'Lege Konto an …');
  try {
    setAccount(await api(route, { name, password }));
    $('acc-pass').value = '';
    toast(route === 'login' ? `Hi ${store.account}!` : `Konto ${store.account} angelegt.`);
    renderAccount();
  } catch (e) { toast(e.message, 4000); }
  busy('');
}
async function renderBoard() {
  const el = $('board-list');
  el.innerHTML = '<span class="hint" style="grid-column:1/-1">Lade …</span>';
  try {
    const r = await api('leaderboard');
    if (!r.top.length) { el.innerHTML = '<span class="hint" style="grid-column:1/-1">Noch keine gewerteten Runden. Spielt eine Runde im Server-Raum ohne Bots.</span>'; return; }
    let html = '<span class="h">#</span><span class="h">Name</span><span class="h r">K/D</span><span class="h r">Kills</span><span class="h r">Tode</span><span class="h r">Siege</span><span class="h r">Quote</span>';
    let rank = 0;
    for (const u of r.top) {
      const placed = u.rounds >= r.minRounds;
      const c = (u.name === store.account ? ' me' : '') + (placed ? '' : ' dim');
      html += `<span class="r${c}">${placed ? ++rank : '–'}</span><span class="n${c}">${esc(u.name)}</span><span class="v kd${c}">${kd(u)}</span><span class="v${c}">${u.kills}</span><span class="v${c}">${u.deaths}</span><span class="v${c}">${u.wins}/${u.rounds}</span><span class="v${c}">${rate(u)}</span>`;
    }
    el.innerHTML = html;
  } catch (e) { el.innerHTML = `<span class="hint" style="grid-column:1/-1">${esc(e.message)}</span>`; }
}

function renderHome() {
  const a = active();
  $('home-name').textContent = a.name;
  $('home-cls').textContent = CLASSES[a.cls].name;
  $('home-dot').style.background = hex(SUITS[a.color]);
  $('home-online').hidden = OFFLINE;
  $('home-music').textContent = `Musik: ${store.music !== false ? 'an' : 'aus'}`;
  $('btn-account').textContent = store.account ? `Konto: ${store.account}` : 'Anmelden';
  $('home-hint').textContent = OFFLINE
    ? 'Testversion: hier läuft nur das Training. Online mit Freunden geht über die Server-Version.'
    : coarse ? 'Tipp: Über „Zum Home-Bildschirm" läuft das Spiel im Vollbild wie eine App.' : 'Am PC: A/D oder Pfeiltasten lenken, Leertaste = Jetpack, Shift = Dash.';
}

// ---------- Editor ----------
function optButtons(el, items, key, render) {
  el.innerHTML = '';
  items.forEach((it, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    render(b, it, i);
    b.addEventListener('click', () => { active()[key] = i; save(); sfx.click(); renderEditor(); });
    el.appendChild(b);
  });
}
const ED_KEYS = ['cls', 'color', 'color2', 'outfit', 'pattern', 'skin', 'hair', 'hairColor', 'hat', 'glasses', 'beard'];
function buildEditor() {
  const bar = (label, v) => `<span>${label}</span><div class="bar"><i style="width:${Math.round(Math.max(0.06, Math.min(1, v)) * 100)}%"></i></div>`;
  // Charakter wählen = Körperbau + Werte + Standard-Look dieses Charakters (Name und Linienfarbe bleiben)
  const cls = $('ed-cls');
  CLASSES.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.innerHTML = `${esc(c.name)}<small>${esc(c.desc)}</small><div class="bars">${bar('Tempo', (c.speed - 0.85) / 0.3)}${bar('Wendig', (c.turn - 0.82) / 0.4)}${bar('Tank', (c.jet - 0.75) / 0.55)}${bar('Laden', (c.regen - 0.8) / 0.4)}${bar('Dash', (1 / c.dashCd - 0.75) / 0.7)}</div>${c.special ? `<em>★ ${esc(c.special)}</em>` : ''}`;
    b.addEventListener('click', () => {
      const a = active();
      if (a.cls !== i) Object.assign(a, PRESETS[i], { cls: i });
      save(); sfx.click(); renderEditor();
    });
    cls.appendChild(b);
  });
  const sw = (b, col, i) => { b.className = 'sw'; b.style.background = hex(col); b.setAttribute('aria-label', `Farbe ${i + 1}`); };
  const txt = (b, t) => { b.className = 'opt'; b.textContent = t; };
  optButtons($('ed-color'), SUITS, 'color', sw);
  optButtons($('ed-color2'), COLORS2, 'color2', sw);
  optButtons($('ed-skin'), SKINS, 'skin', sw);
  optButtons($('ed-hairColor'), HAIR_COLORS, 'hairColor', sw);
  optButtons($('ed-outfit'), OUTFITS, 'outfit', txt);
  optButtons($('ed-pattern'), PATTERNS, 'pattern', txt);
  optButtons($('ed-hair'), HAIRS, 'hair', txt);
  optButtons($('ed-hat'), HATS, 'hat', txt);
  optButtons($('ed-glasses'), GLASSES, 'glasses', txt);
  optButtons($('ed-beard'), BEARDS, 'beard', txt);
  // Extras lassen sich einzeln an- und ausschalten
  const ex = $('ed-acc');
  const toggle = (label, get, flip) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'opt'; b.textContent = label;
    b._on = get;
    b.addEventListener('click', () => { flip(active()); save(); sfx.click(); renderEditor(); });
    ex.appendChild(b);
  };
  for (const [label, bit] of EXTRAS) toggle(label, (a) => !!(a.acc & bit), (a) => { a.acc ^= bit; });
  toggle('Helm', (a) => !!a.helmet, (a) => { a.helmet = a.helmet ? 0 : 1; });
}
function renderEditor() {
  const a = active();
  const list = $('ed-list');
  list.innerHTML = '';
  store.atzen.forEach((z, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt' + (i === store.active ? ' on' : '');
    b.innerHTML = `<i class="dot" style="display:inline-block;width:12px;height:12px;vertical-align:-1px;margin-right:6px;background:${hex(SUITS[z.color])}"></i>${esc(z.name)}`;
    b.addEventListener('click', () => { store.active = i; save(); renderEditor(); });
    list.appendChild(b);
  });
  if (store.atzen.length < 12) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.textContent = '+ Neuer Atze';
    b.addEventListener('click', () => {
      store.atzen.push(randomAtze('Atze ' + (store.atzen.length + 1)));
      store.active = store.atzen.length - 1;
      save(); renderEditor();
      $('ed-name').focus(); $('ed-name').select();
    });
    list.appendChild(b);
  }
  if (document.activeElement !== $('ed-name')) $('ed-name').value = a.name;
  for (const key of ED_KEYS) {
    [...$('ed-' + key).children].forEach((b, i) => b.classList.toggle('on', i === a[key]));
  }
  [...$('ed-acc').children].forEach((b) => b.classList.toggle('on', b._on(a)));
  $('ed-delete').disabled = store.atzen.length < 2;
  view.setMenuAtze(a);
}

// ---------- Lobby ----------
function plRow(p, opts = {}) {
  const tags = [];
  if (p.pid === myPid) tags.push('Du');
  if (lobby && p.pid === lobby.host) tags.push('Host');
  if (p.bot) tags.push('Bot');
  if (p.acc) tags.push(`Konto ${p.acc}`);
  if (!p.conn) tags.push('weg');
  tags.push(CLASSES[p.cls].name);
  return `<div class="pl${p.pid === myPid ? ' me' : ''}${p.conn ? '' : ' off'}"><i class="dot" style="background:${hex(SUITS[p.color])}"></i>` +
    `<span class="nm"><b>${esc(p.name)}</b><small>${esc(tags.join(' · '))}</small></span>` +
    (opts.score ? `<span class="pts">${p.score}</span>` : '') +
    (opts.kick && p.bot ? `<button class="x" data-kick="${p.pid}" aria-label="Bot entfernen">×</button>` : '') + '</div>';
}
function buildLobby() {
  const t = $('lob-target');
  [3, 5, 10].forEach((n) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'opt'; b.textContent = n; b.dataset.v = n;
    b.addEventListener('click', () => conn && conn.send({ t: 'set', target: n }));
    t.appendChild(b);
  });
  const l = $('lob-botlevel');
  BOT_LEVEL_NAMES.forEach((n, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'opt'; b.textContent = n;
    b.addEventListener('click', () => conn && conn.send({ t: 'set', botLevel: i }));
    l.appendChild(b);
  });
  $('lob-players').addEventListener('click', (e) => {
    const k = e.target.closest('[data-kick]');
    if (k && conn) conn.send({ t: 'bot', pid: +k.dataset.kick });
  });
}
function renderLobby() {
  if (!lobby) return;
  const local = conn && conn.local;
  const isHost = lobby.host === myPid;
  $('lob-label').textContent = local ? 'Modus' : conn && conn.p2p ? (isHost ? 'WLAN-Raum · du hostest' : 'WLAN-Raum') : 'Raumcode';
  $('lob-code').textContent = local ? 'TRAINING' : lobby.code;
  $('lob-code').style.fontSize = local ? '22px' : '';
  $('lob-share').hidden = local;
  $('lob-players').innerHTML = lobby.players.map((p) => plRow(p, { kick: isHost })).join('');
  $('lob-host').hidden = !isHost;
  [...$('lob-target').children].forEach((b) => b.classList.toggle('on', +b.dataset.v === lobby.settings.target));
  [...$('lob-botlevel').children].forEach((b, i) => b.classList.toggle('on', i === lobby.settings.botLevel));
  const bots = lobby.players.filter((p) => p.bot).length;
  $('lob-botn').textContent = bots;
  $('lob-botminus').disabled = bots === 0;
  $('lob-botplus').disabled = lobby.players.length >= MAX_PLAYERS;
  const n = lobby.players.filter((p) => p.bot || p.conn).length;
  $('lob-start').disabled = n < 2;
  // Zählt die Runde für die Rangliste?
  const rk = $('lob-rank');
  const meAcc = (lobby.players.find((p) => p.pid === myPid) || {}).acc;
  rk.classList.toggle('yes', !!lobby.rated);
  rk.textContent = local ? ''
    : lobby.rated ? (meAcc ? '★ Diese Runde zählt für die Rangliste.' : '★ Diese Runde zählt für die Rangliste – du spielst aber als Gast (im Startmenü anmelden).')
      : bots > 0 ? 'Mit Bots im Raum zählt die Runde nicht für die Rangliste.' : 'Für die Rangliste braucht es mindestens 2 Spieler.';
  $('lob-hint').textContent = !isHost ? `Warte, bis ${nameOf(lobby.host)} startet …`
    : n < 2 ? 'Mindestens 2 Atzen: Schick deinen Freunden den Link oder füg Bots hinzu.'
      : local ? '' : conn && conn.p2p ? 'Du hostest: Lass das Spiel offen, sonst steht es für alle. Beitreten geht mit dem Code wie immer.'
        : 'Freunde treten mit dem Code oder dem Link bei (bis zu 8 Atzen).';
}

function showResult() {
  if (!lobby || !lobby.result) return;
  const isHost = lobby.host === myPid;
  const w = lobby.result.match;
  $('res-title').textContent = w === myPid ? 'Du gewinnst das Match!' : `${nameOf(w)} gewinnt das Match!`;
  $('res-list').innerHTML = [...lobby.players].sort((a, b) => b.score - a.score).map((p) => plRow(p, { score: true })).join('');
  $('res-host').hidden = !isHost;
  $('res-wait').hidden = isHost;
  $('res-wait').textContent = `Warte auf ${nameOf(lobby.host)} …`;
  $('pause').hidden = true;
  $('result').hidden = false;
}

// ---------- Verbindung ----------
function leave(silent) {
  clearTimeout(joinTimer);
  if (conn) { try { conn.send({ t: 'leave' }); } catch {} conn.close(); }
  conn = null; game = null; lobby = null; myPid = 0; roomCode = ''; reconnects = 0;
  view.game = null;
  busy('');
  if (!silent) show('home');
}

function connect(kind, code) {
  unlockAudio();
  leave(true);
  connKind = kind;
  const handlers = {
    open: () => conn.send({ t: 'join', create: kind === 'create', room: code || '', cid: store.cid, atze: active(), bots: 3, token: store.token }),
    msg: onMsg,
    close: onClose,
  };
  if (kind === 'local') {
    conn = new LocalConn(handlers);
  } else if (kind === 'host') {
    // WLAN-Raum: beim Server nur einen Code holen, der Raum selbst läuft dann auf diesem Gerät
    if (typeof RTCPeerConnection === 'undefined') { toast('Dieser Browser kann keine Direktverbindungen. Nimm den Server-Raum.', 5000); show('home'); return; }
    const sig = new WSConn({
      open: () => sig.send({ t: 'p2p-host', token: store.token }),
      msg: (m) => {
        if (m.t === 'p2p-hosted') { conn = new HostConn(handlers, sig, m.code, m.acct); handlers.open(); }
        else if (m.t === 'err') onMsg(m);
      },
      close: onClose,
    });
    conn = sig;
    busy('Öffne WLAN-Raum …');
    joinTimer = setTimeout(() => { if (!myPid) { leave(); toast('Server nicht erreichbar. Evtl. wacht er gerade auf – probier es in einer Minute nochmal.', 5000); } }, 12000);
  } else {
    conn = new WSConn(handlers);
    busy(kind === 'create' ? 'Erstelle Raum …' : 'Trete bei …');
    joinTimer = setTimeout(() => { if (!myPid) { leave(); toast('Server nicht erreichbar. Evtl. wacht er gerade auf – probier es in einer Minute nochmal.', 5000); } }, 12000);
  }
  conn.connect();
}

function onClose() {
  // Verbindung unerwartet weg: ein paar Mal neu verbinden und wieder einsteigen
  if (!roomCode || reconnects >= 6) {
    const had = !!roomCode;
    leave();
    toast(had ? 'Verbindung verloren.' : 'Server nicht erreichbar.');
    return;
  }
  reconnects++;
  busy('Verbindung weg – verbinde neu …');
  const code = roomCode;
  setTimeout(() => {
    if (roomCode !== code) return;
    const handlers = {
      open: () => conn.send({ t: 'join', room: code, cid: store.cid, atze: active(), token: store.token }),
      msg: onMsg,
      close: onClose,
    };
    if (conn) conn.close();
    conn = new WSConn(handlers);
    conn.connect();
  }, 900);
}

function onMsg(m) {
  switch (m.t) {
    case 's':
      if (game) game.onSnap(m, performance.now());
      return;
    case 'joined':
      clearTimeout(joinTimer);
      myPid = m.pid; roomCode = m.code; reconnects = 0;
      busy('');
      return;
    case 'err':
      leave();
      toast(m.msg || 'Das hat nicht geklappt.');
      return;
    case 'bye':
      leave();
      toast('Der Host hat den Raum geschlossen.', 4000);
      return;
    case 'p2p': {
      // Der Code gehört zu einem WLAN-Raum: Direktverbindung zum Host aufbauen
      clearTimeout(joinTimer);
      if (typeof RTCPeerConnection === 'undefined') { leave(); toast('Dieser Browser kann keine Direktverbindungen.'); return; }
      busy('Verbinde direkt mit dem Host …');
      const sig = conn;
      conn = new PeerConn({
        open: () => conn.send({ t: 'join', room: m.code, cid: store.cid, atze: active() }),
        msg: onMsg,
        close: onClose,
        fail: () => { leave(); toast('Direktverbindung zum Host klappt in diesem Netz nicht. Nehmt einen Server-Raum.', 6000); },
      }, sig);
      return;
    }
    case 'lobby': {
      lobby = m;
      roster = new Map(m.players.map((p) => [p.pid, p]));
      if (m.state === 'lobby') { game = null; view.game = null; if (screen !== 'editor') show('lobby'); }
      else if (m.state === 'matchEnd') showResult();
      hud.sig = '';
      return;
    }
    case 'round':
      game = new ClientGame(m, myPid, roster, (rec) => conn && conn.send({ t: 'in', q: rec.q, s: rec.s, j: rec.j, d: rec.d }));
      view.startRound(game, roster);
      specPid = 0;
      Object.assign(hud, { cd: null, wasLive: m.k >= 0, alt: 0, da: 0, sig: '', fuel: -1, dash: -1 });
      $('feed').innerHTML = '';
      $('banner').classList.remove('on');
      $('result').hidden = true;
      $('pause').hidden = true;
      show('game');
      wakeLock();
      return;
    case 'roundEnd': {
      for (const [pid, sc] of m.scores) { const p = roster.get(pid); if (p) p.score = sc; }
      hud.sig = '';
      const target = lobby ? lobby.settings.target : 5;
      if (m.winner == null) { banner('Unentschieden!', 'Keiner kriegt den Punkt', 3000); sfx.lose(); }
      else if (m.winner === myPid) { banner('Deine Runde!', m.match ? 'Match gewonnen!' : `${roster.get(myPid).score} von ${target} Punkten`, 3200, colorOf(myPid)); sfx.win(); }
      else { banner(`${nameOf(m.winner)} holt die Runde`, m.match ? 'und das Match!' : `${roster.get(m.winner) ? roster.get(m.winner).score : '?'} von ${target} Punkten`, 3200, colorOf(m.winner)); sfx.lose(); }
      return;
    }
    case 'pong':
      $('ping').textContent = conn && conn.localTick ? '' : `${Math.round(performance.now() - m.c)} ms`;
      return;
    default:
  }
}

// ---------- HUD ----------
function followPid(now) {
  if (!game) return 0;
  const me = game.me;
  if (me && (me.alive || now - me.diedAt < 1300)) return myPid;
  const cur = game.players.get(specPid);
  if (cur && cur.alive) return specPid;
  for (const p of game.players.values()) if (p.alive) { specPid = p.pid; return p.pid; }
  return me ? myPid : specPid;
}
function cycleSpec() {
  if (!game) return;
  const alive = [...game.players.values()].filter((p) => p.alive).map((p) => p.pid);
  if (alive.length) specPid = alive[(alive.indexOf(specPid) + 1) % alive.length];
}

function hudUpdate(now) {
  const me = game.me;
  // Countdown
  const est = game.tickOff === null ? game.k : now * (TICK_RATE / 1000) + game.tickOff;
  if (game.k < 0) {
    const n = Math.min(3, Math.max(1, Math.ceil(-est / TICK_RATE)));
    if (n !== hud.cd) { hud.cd = n; banner(String(n), me ? 'Mach dich bereit' : 'Du steigst nächste Runde ein', 1100); sfx.beep(); }
  } else if (!hud.wasLive) {
    hud.wasLive = true;
    banner('LOS!', '', 700, '#ffd93b');
    sfx.go();
  }
  if (hud.bannerT && now > hud.bannerT) { hud.bannerT = 0; $('banner').classList.remove('on'); }

  // Ereignisse
  while (game.events.length) {
    const [pid, by] = game.events.shift();
    const selfHit = by === pid;
    feed(by < 0 ? `${tagName(pid)} ist raus` : selfHit ? `${tagName(pid)} läuft in die eigene Linie` : `${tagName(pid)} rennt in die Linie von ${tagName(by)}`);
    if (pid === myPid) {
      sfx.die();
      try { if (navigator.vibrate) navigator.vibrate(180); } catch {}
      if (!game.over) banner('Raus!', selfHit ? 'Eigene Linie erwischt' : by > 0 ? `In der Linie von ${nameOf(by)}` : '', 1600, '#ff4757');
    } else if (by === myPid) { sfx.kill(); } else sfx.click();
    hud.sig = '';
  }

  // eigener Atze: Tank, Dash, Sounds
  const mine = me && me.alive && game.live;
  if (mine) {
    const s = game.ps;
    const fuel = Math.round(s.fuel * 50) * 2;
    if (fuel !== hud.fuel) { hud.fuel = fuel; $('btn-jet').style.setProperty('--v', fuel); }
    const dash = Math.round((1 - s.dc / (C.DASH_CD * me.cls.dashCd)) * 50) * 2;
    if (dash !== hud.dash) { hud.dash = dash; $('btn-dash').style.setProperty('--v', dash); }
    if (s.up && !hud.alt) sfx.jump();
    if (s.da > 0 && hud.da <= 0) sfx.dash();
    hud.alt = s.up; hud.da = s.da;
    jetSound(!!s.th);
  } else jetSound(false);

  // Zuschauen
  const spectating = !mine && !(me && me.alive);
  $('hud').classList.toggle('spectate', spectating);
  const sp = $('spec');
  if (spectating && game.k >= 0) {
    const f = followPid(now);
    const txt = f && f !== myPid ? `Du schaust ${nameOf(f)} zu · tippen zum Wechseln` : '';
    if (txt !== hud.specName) { hud.specName = txt; sp.textContent = txt; }
    sp.hidden = !txt;
  } else sp.hidden = true;

  // Punktestand
  let sig = '';
  for (const pl of game.players.values()) sig += pl.pid + (pl.alive ? 'a' : 'd') + (roster.get(pl.pid) ? roster.get(pl.pid).score : 0) + ',';
  if (sig !== hud.sig) {
    hud.sig = sig;
    $('score').innerHTML = [...game.players.values()].map((pl) => {
      const p = roster.get(pl.pid);
      return p ? `<span class="sc${pl.alive ? '' : ' dead'}${pl.pid === myPid ? ' me' : ''}"><i style="background:${hex(SUITS[p.color])}"></i>${esc(p.name)} <b>${p.score}</b></span>` : '';
    }).join('');
  }
  if (now > hud.pingT && conn) { hud.pingT = now + 2000; conn.send({ t: 'ping', c: now }); }
}

// ---------- Spielschleife ----------
let last = performance.now();
let acc = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let n = 0;
  while (acc >= DT) {
    acc -= DT;
    if (++n > 6) { acc = 0; break; }
    const inp = input.sample();
    if (game) game.tick(inp);
    if (conn && conn.localTick) conn.localTick();
  }
  if (game && screen === 'game') hudUpdate(now);
  view.frame(now, dt, game ? followPid(now) : 0, acc);
  if (screen === 'game') gaugeUpdate();
}

// Kleine Tank-Leiste direkt neben dem Kopf des eigenen Atzen (läuft von oben nach unten leer)
const gp = { x: 0, y: 0 };
let gaugeShown = false, gaugeFill = -1;
function gaugeUpdate() {
  const el = $('fuel');
  const on = !!(game && game.me && game.me.alive && view.gaugePos(myPid, gp));
  if (on !== gaugeShown) { gaugeShown = on; el.hidden = !on; }
  if (!on) return;
  el.style.transform = `translate(${gp.x.toFixed(1)}px, ${gp.y.toFixed(1)}px)`;
  const f = Math.round(game.ps.fuel * 100);
  if (f !== gaugeFill) {
    gaugeFill = f;
    el.firstElementChild.style.height = f + '%';
    el.classList.toggle('low', f < 25);
    el.classList.toggle('full', f >= 100);
  }
}

// ---------- Buttons ----------
function wire() {
  const click = (id, fn) => $(id).addEventListener('click', (e) => { unlockAudio(); sfx.click(); fn(e); });
  click('home-atze', () => { editorBack = 'home'; show('editor'); });
  click('btn-create', () => { fullscreen(); connect('create'); });
  click('btn-host', () => { fullscreen(); connect('host'); });
  click('btn-board', () => show('board'));
  click('btn-account', () => show('account'));
  click('acc-back', () => show('home'));
  click('board-back', () => show('home'));
  click('acc-login', () => auth('login'));
  click('acc-register', () => auth('register'));
  click('acc-logout', () => { api('logout', {}).catch(() => {}); setAccount(null); renderAccount(); });
  $('acc-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('acc-login').click(); });
  click('btn-join', () => {
    const code = $('inp-code').value.toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 4) { toast('Der Raumcode hat 4 Buchstaben.'); $('inp-code').focus(); return; }
    fullscreen();
    connect('join', code);
  });
  $('inp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
  click('btn-train', () => { fullscreen(); connect('local'); });

  $('ed-name').addEventListener('input', () => { active().name = cleanAtze({ name: $('ed-name').value }).name; save(); renderEditor(); });
  $('ed-name').addEventListener('blur', () => { $('ed-name').value = active().name; });
  click('ed-random', () => {
    // komplett würfeln: Charakter bleibt, alles andere wird neu gemischt
    const a = active(), r = (n) => Math.floor(Math.random() * n);
    Object.assign(a, cleanAtze({ name: a.name, cls: a.cls, color: r(SUITS.length), color2: r(COLORS2.length), skin: r(SKINS.length), hair: r(HAIRS.length), hairColor: r(HAIR_COLORS.length),
      beard: r(BEARDS.length), glasses: r(GLASSES.length), hat: Math.random() < 0.5 ? 0 : r(HATS.length), outfit: r(OUTFITS.length), pattern: r(PATTERNS.length), acc: r(32) & r(32), helmet: 1 }));
    save(); renderEditor();
  });
  click('ed-delete', () => {
    if (store.atzen.length < 2) return;
    store.atzen.splice(store.active, 1);
    store.active = Math.max(0, store.active - 1);
    save(); renderEditor();
  });
  click('ed-done', () => {
    delete store.fresh; save();
    if (editorBack === 'lobby' && conn && lobby && lobby.state === 'lobby') { conn.send({ t: 'atze', atze: active() }); show('lobby'); }
    else show('home');
  });

  click('lob-share', async () => {
    const url = `${location.origin}${location.pathname}?room=${roomCode}`;
    const text = `Komm in meinen Astro-Atzen-Raum! Code: ${roomCode}`;
    try { if (navigator.share) { await navigator.share({ title: 'Astro Atzen', text, url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(url); toast('Link kopiert'); } catch { toast(url, 6000); }
  });
  click('lob-atze', () => { editorBack = 'lobby'; show('editor'); });
  click('lob-leave', () => leave());
  click('lob-botplus', () => conn && conn.send({ t: 'bot', add: true }));
  click('lob-botminus', () => conn && conn.send({ t: 'bot', add: false }));
  click('lob-start', () => { fullscreen(); conn && conn.send({ t: 'start' }); });

  click('hud-menu', () => {
    $('pa-lobby').hidden = !(lobby && lobby.host === myPid);
    $('pa-sound').textContent = `Sound: ${store.sound !== false ? 'an' : 'aus'}`;
    $('pa-music').textContent = `Musik: ${store.music !== false ? 'an' : 'aus'}`;
    $('pause').hidden = false;
  });
  click('pa-resume', () => { $('pause').hidden = true; });
  click('pa-sound', () => { store.sound = store.sound === false; save(); setSound(store.sound); $('pa-sound').textContent = `Sound: ${store.sound ? 'an' : 'aus'}`; });
  const toggleMusic = () => { store.music = store.music === false; save(); setMusic(store.music); const t = `Musik: ${store.music ? 'an' : 'aus'}`; $('pa-music').textContent = t; $('home-music').textContent = t; };
  click('pa-music', toggleMusic);
  click('home-music', toggleMusic);
  click('pa-full', () => { fullscreen(true); $('pause').hidden = true; });
  click('pa-lobby', () => { conn && conn.send({ t: 'lobby' }); $('pause').hidden = true; });
  click('pa-leave', () => leave());
  click('res-again', () => conn && conn.send({ t: 'start' }));
  click('res-lobby', () => conn && conn.send({ t: 'lobby' }));
  click('res-leave', () => leave());
  click('busy-cancel', () => leave());
  click('rot-skip', () => { rotateSkip = true; checkRotate(); });

  // Zuschauer wechseln per Tipp
  $('joy-zone').addEventListener('pointerdown', () => { if (game && !(game.me && game.me.alive)) cycleSpec(); });
  $('gl').addEventListener('pointerdown', () => { unlockAudio(); if (screen === 'game' && game && !(game.me && game.me.alive)) cycleSpec(); });
  document.addEventListener('contextmenu', (e) => { if (screen === 'game') e.preventDefault(); });
  // iOS: Pinch-Zoom und Doppeltipp-Zoom unterbinden
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  window.addEventListener('resize', () => { view.resize(); checkRotate(); });
  window.addEventListener('orientationchange', () => setTimeout(() => { view.resize(); checkRotate(); }, 250));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { last = performance.now(); acc = 0; audioPause(false); if (game) wakeLock(); }
    else { jetSound(false); audioPause(true); }
  });
}

let rotateSkip = false;
function checkRotate() {
  $('rotate').hidden = !(coarse && window.innerHeight > window.innerWidth && !rotateSkip);
}

// ---------- Start ----------
buildEditor();
buildLobby();
wire();
view.setMenuAtze(active());
const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
if (urlRoom && !OFFLINE) $('inp-code').value = urlRoom;
if (store.fresh) { editorBack = 'home'; show('editor'); } else show('home');
if (urlRoom && !OFFLINE) toast(`Raum ${urlRoom}: Atze aussuchen und auf „Beitreten" tippen`, 4500);
checkRotate();
requestAnimationFrame(frame);

// für Tests / Debugging in der Konsole
window.__astro = { get game() { return game; }, get lobby() { return lobby; }, get conn() { return conn; }, view, connect, store };

// Astro Atzen – Konten: registrieren, anmelden, Rangliste. Wird von server.js unter /api/... eingehängt.
// Passwörter werden nie im Klartext gespeichert (scrypt mit Salz), Anmelde-Tokens nur als Hash.
import crypto from 'node:crypto';

const NAME_RE = /^[A-Za-z0-9ÄÖÜäöüß_\-]{3,12}$/;
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, { N: 4096, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const pub = (u) => ({ name: u.name, kills: u.kills, deaths: u.deaths, rounds: u.rounds, wins: u.wins, matches: u.matches, matchWins: u.matchWins });

export function makeAccounts(db) {
  // einfache Bremse gegen Passwort-Raten: pro Adresse 12 Versuche in 10 Minuten
  const tries = new Map();
  const limited = (ip) => {
    const now = Date.now();
    let t = tries.get(ip);
    if (!t || now > t.until) { t = { n: 0, until: now + 600000 }; tries.set(ip, t); }
    if (tries.size > 5000) for (const [k, v] of tries) if (now > v.until) tries.delete(k);
    return ++t.n > 12;
  };
  const cache = new Map(); // token-hash -> { uid, name, at }

  async function issue(u) {
    const token = crypto.randomBytes(24).toString('hex');
    await db.addToken(sha(token), u.id);
    return { token, account: pub(u) };
  }

  return {
    // Für den Spielserver: Token -> { uid, name } oder null
    async verify(token) {
      if (typeof token !== 'string' || token.length !== 48) return null;
      const h = sha(token);
      const c = cache.get(h);
      if (c && Date.now() - c.at < 300000) return { uid: c.uid, name: c.name };
      const u = await db.userByToken(h);
      if (!u) return null;
      if (cache.size > 2000) cache.clear();
      cache.set(h, { uid: u.id, name: u.name, at: Date.now() });
      return { uid: u.id, name: u.name };
    },

    // HTTP: gibt [status, objekt] zurück
    async handle(route, body, ip, auth) {
      if (route === 'leaderboard') return [200, { top: (await db.top(50)).map(pub), minRounds: 10 }];
      if (route === 'me') {
        const u = auth && auth.length === 48 ? await db.userByToken(sha(auth)) : null;
        return u ? [200, { account: pub(u) }] : [401, { err: 'Nicht angemeldet.' }];
      }
      if (route === 'logout') {
        if (auth) { cache.delete(sha(auth)); await db.dropToken(sha(auth)); }
        return [200, {}];
      }
      if (route !== 'register' && route !== 'login') return [404, { err: 'Unbekannt.' }];
      if (limited(ip)) return [429, { err: 'Zu viele Versuche. Warte ein paar Minuten.' }];
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const pw = typeof body.password === 'string' ? body.password : '';
      if (!NAME_RE.test(name)) return [400, { err: 'Name: 3 bis 12 Zeichen, nur Buchstaben, Zahlen, - und _.' }];
      if (pw.length < 6 || pw.length > 72) return [400, { err: 'Passwort: mindestens 6 Zeichen.' }];
      if (route === 'register') {
        const salt = crypto.randomBytes(16);
        const hash = await scrypt(pw, salt);
        const u = await db.createUser(name, `s1$${salt.toString('hex')}$${hash.toString('hex')}`);
        if (!u) return [409, { err: 'Der Name ist schon vergeben.' }];
        return [200, await issue(u)];
      }
      const u = await db.userByName(name);
      const parts = u ? u.pass.split('$') : ['s1', '00', '00'];
      const hash = await scrypt(pw, Buffer.from(parts[1], 'hex'));
      const want = Buffer.from(parts[2], 'hex');
      if (!u || want.length !== hash.length || !crypto.timingSafeEqual(hash, want)) return [401, { err: 'Name oder Passwort stimmt nicht.' }];
      return [200, await issue(u)];
    },
  };
}

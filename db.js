// Astro Atzen – Speicher für Konten und Rangliste.
// Mit der Umgebungsvariable DATABASE_URL (Postgres, z.B. Neon) bleiben die Daten dauerhaft erhalten.
// Ohne sie landet alles in data/db.json – gut zum Ausprobieren am eigenen Rechner, aber auf einem
// Gratis-Server von Render ist diese Datei nach jedem Neustart wieder leer.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STAT_KEYS = ['kills', 'deaths', 'rounds', 'wins', 'matches', 'matchWins'];
const COLS = { kills: 'kills', deaths: 'deaths', rounds: 'rounds', wins: 'wins', matches: 'matches', matchWins: 'match_wins' };
const TOP_ORDER = (u) => [u.rounds >= 10 ? 1 : 0, u.kills / Math.max(1, u.deaths), u.kills];

// ---------- Postgres ----------
async function openPg(url) {
  const { default: pg } = await import('pg');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /host=\/|%2F/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max: 3,
    // Gehostete Datenbanken verlangen eine verschlüsselte Verbindung. Steht sslmode schon in der Adresse, gilt das.
    ssl: local || /sslmode=/.test(url) || process.env.PGSSL === 'off' ? undefined : { rejectUnauthorized: false },
  });
  pool.on('error', (e) => console.error('Datenbank:', e.message));
  await pool.query(`CREATE TABLE IF NOT EXISTS aa_users (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, name_lc TEXT NOT NULL UNIQUE, pass TEXT NOT NULL,
    kills INT NOT NULL DEFAULT 0, deaths INT NOT NULL DEFAULT 0, rounds INT NOT NULL DEFAULT 0, wins INT NOT NULL DEFAULT 0,
    matches INT NOT NULL DEFAULT 0, match_wins INT NOT NULL DEFAULT 0, created TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS aa_tokens (
    hash TEXT PRIMARY KEY, user_id INT NOT NULL REFERENCES aa_users(id) ON DELETE CASCADE, created TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const row = (r) => r && { id: r.id, name: r.name, pass: r.pass, kills: r.kills, deaths: r.deaths, rounds: r.rounds, wins: r.wins, matches: r.matches, matchWins: r.match_wins };
  return {
    kind: 'postgres',
    async createUser(name, pass) {
      const r = await pool.query('INSERT INTO aa_users (name, name_lc, pass) VALUES ($1, $2, $3) ON CONFLICT (name_lc) DO NOTHING RETURNING *', [name, name.toLowerCase(), pass]);
      return row(r.rows[0]) || null;
    },
    async userByName(name) { return row((await pool.query('SELECT * FROM aa_users WHERE name_lc = $1', [name.toLowerCase()])).rows[0]) || null; },
    async addToken(hash, uid) { await pool.query('INSERT INTO aa_tokens (hash, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [hash, uid]); },
    async userByToken(hash) { return row((await pool.query('SELECT u.* FROM aa_tokens t JOIN aa_users u ON u.id = t.user_id WHERE t.hash = $1', [hash])).rows[0]) || null; },
    async dropToken(hash) { await pool.query('DELETE FROM aa_tokens WHERE hash = $1', [hash]); },
    async addStats(uid, d) {
      const sets = STAT_KEYS.filter((k) => d[k] > 0);
      if (!sets.length) return;
      await pool.query(`UPDATE aa_users SET ${sets.map((k, i) => `${COLS[k]} = ${COLS[k]} + $${i + 2}`).join(', ')} WHERE id = $1`, [uid, ...sets.map((k) => d[k] | 0)]);
    },
    async top(limit) {
      const r = await pool.query(`SELECT * FROM aa_users WHERE rounds > 0
        ORDER BY (rounds >= 10) DESC, kills::float / GREATEST(deaths, 1) DESC, kills DESC LIMIT $1`, [limit]);
      return r.rows.map(row);
    },
  };
}

// ---------- Datei ----------
async function openFile() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'db.json');
  let data = { nextId: 1, users: [], tokens: {} };
  try { data = JSON.parse(await readFile(file, 'utf8')); } catch {}
  let timer = null;
  const save = () => {
    if (timer) return;
    timer = setTimeout(async () => {
      timer = null;
      try { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file + '.tmp', JSON.stringify(data)); await rename(file + '.tmp', file); } catch (e) { console.error('Speichern:', e.message); }
    }, 500);
  };
  const byId = (id) => data.users.find((u) => u.id === id) || null;
  return {
    kind: 'datei',
    async createUser(name, pass) {
      if (data.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) return null;
      const u = { id: data.nextId++, name, pass, kills: 0, deaths: 0, rounds: 0, wins: 0, matches: 0, matchWins: 0 };
      data.users.push(u); save();
      return u;
    },
    async userByName(name) { return data.users.find((u) => u.name.toLowerCase() === name.toLowerCase()) || null; },
    async addToken(hash, uid) { data.tokens[hash] = uid; save(); },
    async userByToken(hash) { return data.tokens[hash] ? byId(data.tokens[hash]) : null; },
    async dropToken(hash) { delete data.tokens[hash]; save(); },
    async addStats(uid, d) { const u = byId(uid); if (!u) return; for (const k of STAT_KEYS) u[k] += d[k] | 0; save(); },
    async top(limit) {
      return data.users.filter((u) => u.rounds > 0).sort((a, b) => { const x = TOP_ORDER(a), y = TOP_ORDER(b); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; }).slice(0, limit);
    },
  };
}

export async function openDb() {
  if (process.env.DATABASE_URL) {
    try { return await openPg(process.env.DATABASE_URL); } catch (e) { console.error('Datenbank nicht erreichbar, nutze Datei:', e.message); }
  }
  return openFile();
}

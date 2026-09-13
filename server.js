// server.js — Express backend for Deepest.
// Holds the Turso credentials server-side and exposes account APIs.
// Also serves the static front-end (Deepest/Deepest/).

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

const app = express();
app.use(cors());
app.use(express.json());

const url = process.env.TURSO_URL || 'libsql://deepest-ruoyan812.aws-ap-northeast-1.turso.io';
const authToken = process.env.TURSO_TOKEN || '';
const PORT = process.env.PORT || 3000;

const db = createClient({ url, authToken });

function normalizeName(n) {
  return (n || '').trim().toLowerCase();
}

async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL UNIQUE,   -- normalized (lowercase) key
      display_name TEXT NOT NULL,
      salt         TEXT NOT NULL,
      hash         TEXT NOT NULL,
      iterations   INTEGER NOT NULL,
      created_at   INTEGER NOT NULL
    );
  `);
}

// GET /api/user/:name -> { exists, salt, iterations } (used by the client to
// derive the password hash locally before login, so the plaintext never leaves the browser)
app.get('/api/user/:name', async (req, res) => {
  try {
    const key = normalizeName(decodeURIComponent(req.params.name));
    const rows = await db.execute({
      sql: 'SELECT salt, iterations FROM users WHERE name = ?',
      args: [key]
    });
    if (rows.rows.length === 0) {
      return res.status(404).json({ exists: false });
    }
    const r = rows.rows[0];
    res.json({ exists: true, salt: r.salt, iterations: r.iterations });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/register { name, salt, hash, iterations }
app.post('/api/register', async (req, res) => {
  try {
    const { name, salt, hash, iterations } = req.body || {};
    if (!name || !salt || !hash) {
      return res.status(400).json({ error: 'Missing fields.' });
    }
    const key = normalizeName(name);
    const existing = await db.execute({
      sql: 'SELECT name FROM users WHERE name = ?',
      args: [key]
    });
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'That name is already taken — please choose another name.' });
    }
    const id = crypto.randomUUID();
    await db.execute({
      sql: 'INSERT INTO users (id, name, display_name, salt, hash, iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, key, name, salt, hash, iterations || 100000, Date.now()]
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/login { name, hash } -> constant-time compare against stored hash
app.post('/api/login', async (req, res) => {
  try {
    const { name, hash } = req.body || {};
    if (!name || !hash) {
      return res.status(400).json({ ok: false, error: 'Missing fields.' });
    }
    const key = normalizeName(name);
    const rows = await db.execute({
      sql: 'SELECT hash FROM users WHERE name = ?',
      args: [key]
    });
    if (rows.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Name not found.' });
    }
    const stored = rows.rows[0].hash;
    const a = Buffer.from(hash);
    const b = Buffer.from(stored);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ ok: false, error: 'Password incorrect.' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve the front-end static files.
app.use(express.static(__dirname + '/Deepest'));

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Deepest server running at http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error('Failed to initialize database:', e);
    process.exit(1);
  });

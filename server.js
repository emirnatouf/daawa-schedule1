const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS store (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function ensureSeed() {
  const row = db.prepare('SELECT data FROM store WHERE id = 1').get();
  if (!row) {
    let seed = [];
    try { seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed_data.json'), 'utf-8')); }
    catch (e) { seed = []; }
    db.prepare('INSERT INTO store (id, data, updated_at) VALUES (1, ?, ?)')
      .run(JSON.stringify(seed), new Date().toISOString());
  }
}
ensureSeed();

const tokens = new Map();
const TOKEN_TTL = 1000 * 60 * 60 * 12;
function newToken() {
  const tok = crypto.randomBytes(24).toString('hex');
  tokens.set(tok, Date.now() + TOKEN_TTL);
  return tok;
}
function isValidToken(tok) {
  if (!tok) return false;
  const exp = tokens.get(tok);
  if (!exp) return false;
  if (Date.now() > exp) { tokens.delete(tok); return false; }
  return true;
}
function requireAdmin(req, res, next) {
  const tok = req.get('X-Admin-Token') || req.query.token;
  if (!isValidToken(tok)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/data', (req, res) => {
  const row = db.prepare('SELECT data, updated_at FROM store WHERE id = 1').get();
  res.json({ data: JSON.parse(row.data), updatedAt: row.updated_at });
});

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'wrong_password' });
  }
  res.json({ token: newToken(), expiresInMs: TOKEN_TTL });
});

app.post('/api/logout', (req, res) => {
  const tok = req.get('X-Admin-Token');
  if (tok) tokens.delete(tok);
  res.json({ ok: true });
});

app.put('/api/data', requireAdmin, (req, res) => {
  const { data } = req.body || {};
  if (!Array.isArray(data)) return res.status(400).json({ error: 'invalid_data' });
  const now = new Date().toISOString();
  db.prepare('UPDATE store SET data = ?, updated_at = ? WHERE id = 1').run(JSON.stringify(data), now);
  res.json({ ok: true, updatedAt: now });
});

app.get('/api/export', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT data FROM store WHERE id = 1').get();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="schedule-export.json"');
  res.send(row.data);
});

app.post('/api/import', requireAdmin, (req, res) => {
  const { data } = req.body || {};
  if (!Array.isArray(data)) return res.status(400).json({ error: 'invalid_data' });
  const now = new Date().toISOString();
  db.prepare('UPDATE store SET data = ?, updated_at = ? WHERE id = 1').run(JSON.stringify(data), now);
  res.json({ ok: true, count: data.length, updatedAt: now });
});

app.post('/api/reset', requireAdmin, (req, res) => {
  let seed = [];
  try { seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed_data.json'), 'utf-8')); }
  catch (e) { return res.status(500).json({ error: 'seed_missing' }); }
  const now = new Date().toISOString();
  db.prepare('UPDATE store SET data = ?, updated_at = ? WHERE id = 1').run(JSON.stringify(seed), now);
  res.json({ ok: true, data: seed, updatedAt: now });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS store (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT NOT NULL);`);

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed_data.json'), 'utf-8'));
const now = new Date().toISOString();
const exists = db.prepare('SELECT 1 FROM store WHERE id = 1').get();
if (exists) db.prepare('UPDATE store SET data = ?, updated_at = ? WHERE id = 1').run(JSON.stringify(seed), now);
else db.prepare('INSERT INTO store (id, data, updated_at) VALUES (1, ?, ?)').run(JSON.stringify(seed), now);
console.log('Seeded ' + seed.length + ' items.');

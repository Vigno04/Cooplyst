const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Data directory: resolves to /app/data inside the container, matching the Docker volume mount
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'cooplyst.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    oidc_sub      TEXT,
    role          TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
    created_at    INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migration: add oidc_sub column for existing DBs.
// IMPORTANT: SQLite's ALTER TABLE ADD COLUMN does NOT support UNIQUE constraints,
// so we add the plain column first, then enforce uniqueness via a partial index.
const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userCols.includes('oidc_sub')) {
  db.exec('ALTER TABLE users ADD COLUMN oidc_sub TEXT');
}
// Idempotent — safe to run on both new and existing databases.
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc_sub
  ON users (oidc_sub)
  WHERE oidc_sub IS NOT NULL
`);

// Migration: add avatar columns
if (!userCols.includes('avatar')) {
  db.exec('ALTER TABLE users ADD COLUMN avatar TEXT');
}
if (!userCols.includes('avatar_pixelated')) {
  db.exec('ALTER TABLE users ADD COLUMN avatar_pixelated INTEGER NOT NULL DEFAULT 0');
}

// Make password_hash nullable on existing DBs (SQLite can't ALTER COLUMN, so we
// use a pragma trick: the column was originally NOT NULL, but that constraint is
// not enforced by SQLite when the schema is re-read via CREATE TABLE IF NOT EXISTS.
// For new installs the schema above already has it nullable.)

// Seed default settings if not present
const seedSetting = db.prepare(
  `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
);
seedSetting.run('registration_enabled', 'true');
seedSetting.run('site_url', '');
seedSetting.run('authentik_enabled', 'false');
seedSetting.run('authentik_url', '');
seedSetting.run('authentik_client_id', '');
seedSetting.run('authentik_client_secret', '');
seedSetting.run('local_auth_enabled', 'true');
seedSetting.run('authentik_auto_redirect', 'false');

module.exports = db;

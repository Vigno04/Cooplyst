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

  CREATE TABLE IF NOT EXISTS games (
    id                TEXT PRIMARY KEY,
    title             TEXT NOT NULL,
    cover_url         TEXT,
    thumbnail_url     TEXT,
    logo_url          TEXT,
    backdrop_url      TEXT,
    description       TEXT,
    genre             TEXT,
    release_year      INTEGER,
    release_date      TEXT,
    platforms         TEXT,
    rating            REAL,
    developer         TEXT,
    age_rating        TEXT,
    time_to_beat      TEXT,
    player_counts     TEXT,
    coop              TEXT,
    online_offline    TEXT,
    screenshots       TEXT,
    videos            TEXT,
    provider_payload  TEXT,
    tags              TEXT,
    website           TEXT,
    api_id            TEXT,
    api_provider      TEXT,
    status            TEXT NOT NULL DEFAULT 'proposed'
                        CHECK(status IN ('proposed','voting','backlog','playing','completed')),
    proposed_by       TEXT NOT NULL REFERENCES users(id),
    proposed_at       INTEGER NOT NULL DEFAULT (unixepoch()),
    status_changed_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS votes (
    game_id   TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote      INTEGER NOT NULL CHECK(vote IN (0, 1)),
    voted_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (game_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS game_players (
    game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (game_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS game_runs (
    id           TEXT PRIMARY KEY,
    game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    run_number   INTEGER NOT NULL DEFAULT 1,
    name         TEXT,
    started_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    completed_at INTEGER,
    UNIQUE(game_id, run_number)
  );

  CREATE TABLE IF NOT EXISTS ratings (
    run_id   TEXT NOT NULL REFERENCES game_runs(id) ON DELETE CASCADE,
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score    INTEGER NOT NULL CHECK(score >= 1 AND score <= 10),
    comment  TEXT,
    rated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (run_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS media (
    id          TEXT PRIMARY KEY,
    game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    run_id      TEXT REFERENCES game_runs(id) ON DELETE SET NULL,
    uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    uploaded_at INTEGER NOT NULL DEFAULT (unixepoch())
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

// Migration: add extra game metadata columns (backdrop, rating, developer, tags, website)
const gameCols = db.prepare('PRAGMA table_info(games)').all().map(c => c.name);
if (!gameCols.includes('backdrop_url')) db.exec('ALTER TABLE games ADD COLUMN backdrop_url TEXT');
if (!gameCols.includes('thumbnail_url')) db.exec('ALTER TABLE games ADD COLUMN thumbnail_url TEXT');
if (!gameCols.includes('logo_url')) db.exec('ALTER TABLE games ADD COLUMN logo_url TEXT');
if (!gameCols.includes('rating')) db.exec('ALTER TABLE games ADD COLUMN rating REAL');
if (!gameCols.includes('developer')) db.exec('ALTER TABLE games ADD COLUMN developer TEXT');
if (!gameCols.includes('release_date')) db.exec('ALTER TABLE games ADD COLUMN release_date TEXT');
if (!gameCols.includes('age_rating')) db.exec('ALTER TABLE games ADD COLUMN age_rating TEXT');
if (!gameCols.includes('time_to_beat')) db.exec('ALTER TABLE games ADD COLUMN time_to_beat TEXT');
if (!gameCols.includes('player_counts')) db.exec('ALTER TABLE games ADD COLUMN player_counts TEXT');
if (!gameCols.includes('coop')) db.exec('ALTER TABLE games ADD COLUMN coop TEXT');
if (!gameCols.includes('online_offline')) db.exec('ALTER TABLE games ADD COLUMN online_offline TEXT');
if (!gameCols.includes('screenshots')) db.exec('ALTER TABLE games ADD COLUMN screenshots TEXT');
if (!gameCols.includes('videos')) db.exec('ALTER TABLE games ADD COLUMN videos TEXT');
if (!gameCols.includes('provider_payload')) db.exec('ALTER TABLE games ADD COLUMN provider_payload TEXT');

// Migration: add optional run name column
const runCols = db.prepare('PRAGMA table_info(game_runs)').all().map(c => c.name);
if (!runCols.includes('name')) db.exec('ALTER TABLE game_runs ADD COLUMN name TEXT');

// Migration: add language preference and email notifications to users
if (!userCols.includes('language')) db.exec('ALTER TABLE users ADD COLUMN language TEXT');
if (!userCols.includes('email_notifications')) db.exec('ALTER TABLE users ADD COLUMN email_notifications INTEGER NOT NULL DEFAULT 1');
if (!gameCols.includes('tags')) db.exec('ALTER TABLE games ADD COLUMN tags TEXT');
if (!gameCols.includes('website')) db.exec('ALTER TABLE games ADD COLUMN website TEXT');

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
seedSetting.run('vote_threshold', '3');
seedSetting.run('vote_visibility', 'public');
seedSetting.run('game_api_providers', '[]');
seedSetting.run('upload_timeout_ms', '300000');
seedSetting.run('allow_all_users_add_downloads', 'false');

db.exec(`
  CREATE TABLE IF NOT EXISTS game_downloads (
    id          TEXT PRIMARY KEY,
    game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK(type IN ('magnet','torrent')),
    link        TEXT,
    filename    TEXT,
    mime_type   TEXT,
    uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uploaded_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

module.exports = db;

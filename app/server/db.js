import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH   = process.env.SARIF_DB_PATH || resolve(__dirname, 'data', 'sarif.db');

const DDL = `
  CREATE TABLE IF NOT EXISTS alerts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL DEFAULT '',
    origin       TEXT    NOT NULL,
    destination  TEXT    NOT NULL,
    cabin        TEXT    NOT NULL DEFAULT 'J',
    date_from    TEXT,
    date_to      TEXT,
    max_miles    INTEGER,
    max_taxes    INTEGER,
    min_seats    INTEGER DEFAULT 1,
    direct_only  INTEGER NOT NULL DEFAULT 0,
    programs     TEXT,
    transferable INTEGER NOT NULL DEFAULT 0,
    enabled      INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    last_run_at  TEXT,
    last_match_at TEXT
  );

  CREATE TABLE IF NOT EXISTS alert_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id     INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    ran_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    status       TEXT    NOT NULL DEFAULT 'ok',
    matches_new  INTEGER NOT NULL DEFAULT 0,
    matches_seen INTEGER NOT NULL DEFAULT 0,
    error        TEXT
  );

  CREATE TABLE IF NOT EXISTS alert_matches (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id     INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    fingerprint  TEXT    NOT NULL,
    source       TEXT    NOT NULL,
    date         TEXT    NOT NULL,
    cabin        TEXT    NOT NULL,
    miles        INTEGER,
    taxes        INTEGER,
    seats        INTEGER,
    direct       INTEGER NOT NULL DEFAULT 0,
    airlines     TEXT,
    availability_id TEXT,
    status       TEXT    NOT NULL DEFAULT 'new',
    first_seen_at TEXT   NOT NULL DEFAULT (datetime('now')),
    last_seen_at  TEXT   NOT NULL DEFAULT (datetime('now')),
    missed_polls  INTEGER NOT NULL DEFAULT 0,
    notified_at   TEXT,
    UNIQUE(alert_id, fingerprint)
  );
`;

export function createDatabase(path = DB_PATH) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const database = new Database(path);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(DDL);

  // Migration: add notified_at to alert_matches for existing databases
  const cols = database.pragma('table_info(alert_matches)');
  if (!cols.some(c => c.name === 'notified_at')) {
    database.exec('ALTER TABLE alert_matches ADD COLUMN notified_at TEXT');
  }

  return database;
}

const db = createDatabase();

export default db;

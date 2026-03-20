import Database from 'better-sqlite3';

export function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
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
      UNIQUE(alert_id, fingerprint)
    );
  `);

  return db;
}

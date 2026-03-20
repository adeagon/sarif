import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../helpers/createTestDb.js';
import { insertAlert } from '../helpers/fixtures.js';

let db;
let alertId;

beforeEach(() => {
  db = createTestDb();
  alertId = insertAlert(db).id;
});

function insertRun(db, alertId, overrides = {}) {
  const data = {
    alert_id: alertId,
    status: 'ok',
    matches_new: 0,
    matches_seen: 0,
    error: null,
    ...overrides,
  };
  const r = db.prepare(`
    INSERT INTO alert_runs (alert_id, status, matches_new, matches_seen, error)
    VALUES (@alert_id, @status, @matches_new, @matches_seen, @error)
  `).run(data);
  return db.prepare(`SELECT * FROM alert_runs WHERE id = ?`).get(r.lastInsertRowid);
}

describe('Alert runs', () => {
  it('records a successful run with match counts', () => {
    const run = insertRun(db, alertId, { matches_new: 3, matches_seen: 1 });
    expect(run.status).toBe('ok');
    expect(run.matches_new).toBe(3);
    expect(run.matches_seen).toBe(1);
    expect(run.error).toBeNull();
  });

  it('records an error run with error text', () => {
    const run = insertRun(db, alertId, { status: 'error', error: 'API failed' });
    expect(run.status).toBe('error');
    expect(run.error).toBe('API failed');
  });

  it('records a skipped run', () => {
    const run = insertRun(db, alertId, { status: 'skipped', error: 'Rate limited — skipped' });
    expect(run.status).toBe('skipped');
  });

  it('cascade: deleting alert removes its runs', () => {
    insertRun(db, alertId);
    db.prepare(`DELETE FROM alerts WHERE id = ?`).run(alertId);
    const runs = db.prepare(`SELECT * FROM alert_runs WHERE alert_id = ?`).all(alertId);
    expect(runs).toHaveLength(0);
  });

  it('cascade: deleting alert removes its matches', () => {
    db.prepare(`INSERT INTO alert_matches (alert_id, fingerprint, source, date, cabin) VALUES (?, 'fp-1', 'aeroplan', '2026-06-15', 'J')`).run(alertId);
    db.prepare(`DELETE FROM alerts WHERE id = ?`).run(alertId);
    const matches = db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ?`).all(alertId);
    expect(matches).toHaveLength(0);
  });

  it('last_run_at updates on alert after timestamp update', () => {
    expect(db.prepare(`SELECT last_run_at FROM alerts WHERE id = ?`).get(alertId).last_run_at).toBeNull();
    db.prepare(`UPDATE alerts SET last_run_at = datetime('now') WHERE id = ?`).run(alertId);
    expect(db.prepare(`SELECT last_run_at FROM alerts WHERE id = ?`).get(alertId).last_run_at).toBeTruthy();
  });

  it('last_match_at updates only when had_match is truthy', () => {
    db.prepare(`UPDATE alerts SET last_run_at = datetime('now'), last_match_at = CASE WHEN 0 THEN datetime('now') ELSE last_match_at END WHERE id = ?`).run(alertId);
    expect(db.prepare(`SELECT last_match_at FROM alerts WHERE id = ?`).get(alertId).last_match_at).toBeNull();

    db.prepare(`UPDATE alerts SET last_match_at = CASE WHEN 1 THEN datetime('now') ELSE last_match_at END WHERE id = ?`).run(alertId);
    expect(db.prepare(`SELECT last_match_at FROM alerts WHERE id = ?`).get(alertId).last_match_at).toBeTruthy();
  });
});

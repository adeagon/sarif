import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../helpers/createTestDb.js';
import { insertAlert } from '../helpers/fixtures.js';

let db;
let alertId;

beforeEach(() => {
  db = createTestDb();
  alertId = insertAlert(db).id;
});

function insertMatch(db, alertId, overrides = {}) {
  const data = {
    alert_id: alertId,
    fingerprint: 'fp-001',
    source: 'aeroplan',
    date: '2026-06-15',
    cabin: 'J',
    miles: 70000,
    taxes: 5600,
    seats: 2,
    direct: 1,
    airlines: 'NH',
    availability_id: 'avail-001',
    ...overrides,
  };
  db.prepare(`
    INSERT INTO alert_matches
      (alert_id, fingerprint, source, date, cabin, miles, taxes, seats, direct, airlines, availability_id, status)
    VALUES
      (@alert_id, @fingerprint, @source, @date, @cabin, @miles, @taxes, @seats, @direct, @airlines, @availability_id, 'new')
    ON CONFLICT(alert_id, fingerprint) DO UPDATE SET
      last_seen_at  = datetime('now'),
      missed_polls  = 0,
      status        = CASE WHEN status = 'dismissed' THEN 'dismissed' ELSE 'active' END
  `).run(data);
  return db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ? AND fingerprint = ?`)
    .get(alertId, data.fingerprint);
}

describe('Match lifecycle', () => {
  it('second insert with same fingerprint updates last_seen_at, not duplicated', () => {
    insertMatch(db, alertId);
    insertMatch(db, alertId); // same fingerprint
    const all = db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ?`).all(alertId);
    expect(all).toHaveLength(1);
  });

  it('dismissed matches stay dismissed on re-insert', () => {
    insertMatch(db, alertId);
    db.prepare(`UPDATE alert_matches SET status = 'dismissed' WHERE alert_id = ?`).run(alertId);
    insertMatch(db, alertId); // upsert
    const m = db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ?`).get(alertId);
    expect(m.status).toBe('dismissed');
  });

  it('non-dismissed matches become active on re-insert', () => {
    insertMatch(db, alertId); // status='new'
    insertMatch(db, alertId); // upsert → status='active'
    const m = db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ?`).get(alertId);
    expect(m.status).toBe('active');
  });

  it('missed_polls resets to 0 on re-insert', () => {
    insertMatch(db, alertId);
    db.prepare(`UPDATE alert_matches SET missed_polls = 5 WHERE alert_id = ?`).run(alertId);
    insertMatch(db, alertId); // upsert resets
    const m = db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ?`).get(alertId);
    expect(m.missed_polls).toBe(0);
  });

  it('UNIQUE(alert_id, fingerprint) prevents true duplicates', () => {
    db.prepare(`
      INSERT INTO alert_matches (alert_id, fingerprint, source, date, cabin) VALUES (?, 'fp-unique', 'aeroplan', '2026-06-15', 'J')
    `).run(alertId);
    expect(() => {
      db.prepare(`
        INSERT INTO alert_matches (alert_id, fingerprint, source, date, cabin) VALUES (?, 'fp-unique', 'aeroplan', '2026-06-15', 'J')
      `).run(alertId);
    }).toThrow();
  });

  it('first_seen_at does NOT change on conflict update', () => {
    insertMatch(db, alertId);
    const first = db.prepare(`SELECT first_seen_at FROM alert_matches WHERE alert_id = ?`).get(alertId).first_seen_at;

    insertMatch(db, alertId); // upsert
    const after = db.prepare(`SELECT first_seen_at FROM alert_matches WHERE alert_id = ?`).get(alertId).first_seen_at;
    expect(after).toBe(first);
  });
});

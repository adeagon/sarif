import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../helpers/createTestDb.js';
import { insertAlert, ALERT_DEFAULTS } from '../helpers/fixtures.js';

let db;
beforeEach(() => { db = createTestDb(); });

describe('Alert CRUD', () => {
  it('inserts and retrieves an alert with all fields matching', () => {
    const alert = insertAlert(db);
    expect(alert.origin).toBe('JFK');
    expect(alert.destination).toBe('NRT');
    expect(alert.cabin).toBe('J');
    expect(alert.max_miles).toBe(80000);
    expect(alert.max_taxes).toBe(200);
    expect(alert.name).toBe('Test Alert');
  });

  it('auto-increments IDs', () => {
    const a1 = insertAlert(db);
    const a2 = insertAlert(db, { name: 'Second' });
    expect(a2.id).toBe(a1.id + 1);
  });

  it('applies defaults: enabled=1, cabin=J, created_at populated', () => {
    const r = db.prepare(`
      INSERT INTO alerts (origin, destination) VALUES ('LAX', 'CDG')
    `).run();
    const alert = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(r.lastInsertRowid);
    expect(alert.enabled).toBe(1);
    expect(alert.cabin).toBe('J');
    expect(alert.created_at).toBeTruthy();
  });

  it('updates allowed fields', () => {
    const alert = insertAlert(db);
    db.prepare(`UPDATE alerts SET max_miles = 60000, enabled = 0 WHERE id = ?`).run(alert.id);
    const updated = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(alert.id);
    expect(updated.max_miles).toBe(60000);
    expect(updated.enabled).toBe(0);
  });

  it('delete non-existent returns 0 changes', () => {
    const r = db.prepare(`DELETE FROM alerts WHERE id = 9999`).run();
    expect(r.changes).toBe(0);
  });

  it('enforces NOT NULL on origin and destination', () => {
    expect(() => {
      db.prepare(`INSERT INTO alerts (destination) VALUES ('NRT')`).run();
    }).toThrow();
    expect(() => {
      db.prepare(`INSERT INTO alerts (origin) VALUES ('JFK')`).run();
    }).toThrow();
  });
});

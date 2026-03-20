import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTestDb } from '../helpers/createTestDb.js';
import { insertAlert } from '../helpers/fixtures.js';
import { runPollCycle, startPolling } from '../../server/services/alertScheduler.js';

let db;
let searchCache;
let evaluate;

beforeEach(() => {
  db = createTestDb();
  searchCache = new Map();
  evaluate = vi.fn().mockResolvedValue({ matchesNew: 0, matchesSeen: 0 });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const opts = () => ({ database: db, evaluate });

describe('runPollCycle()', () => {
  it('auto-disables alerts with date_to in the past', async () => {
    insertAlert(db, { date_to: '2020-01-01', enabled: 1 });
    await runPollCycle(searchCache, 'key', opts());
    const alert = db.prepare(`SELECT * FROM alerts ORDER BY id DESC LIMIT 1`).get();
    expect(alert.enabled).toBe(0);
  });

  it('skips cycle when no enabled alerts (evaluate never called)', async () => {
    insertAlert(db, { enabled: 0 });
    await runPollCycle(searchCache, 'key', opts());
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('groups alerts by route/cabin/dates — same-group alerts share params', async () => {
    // Two alerts same route, different names — should be in same group
    insertAlert(db, { name: 'Alert A' });
    insertAlert(db, { name: 'Alert B' });
    // Advance timers past the stagger
    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;
    // Both alerts evaluated
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('two different groups are each preceded by a stagger delay', async () => {
    insertAlert(db, { origin: 'JFK', destination: 'NRT' });
    insertAlert(db, { origin: 'LAX', destination: 'CDG' }); // different group
    const calls = [];
    evaluate.mockImplementation(async (id) => {
      calls.push({ id, time: Date.now() });
      return { matchesNew: 0, matchesSeen: 0 };
    });

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    expect(evaluate).toHaveBeenCalledTimes(2);
    // The two calls should have at least 2000ms apart (one stagger per group)
    if (calls.length === 2) {
      expect(calls[1].time - calls[0].time).toBeGreaterThanOrEqual(2000);
    }
  });

  it('rate limited: stops processing remaining groups', async () => {
    insertAlert(db, { origin: 'JFK', destination: 'NRT' }); // group 1
    insertAlert(db, { origin: 'LAX', destination: 'CDG' }); // group 2

    evaluate.mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { code: 'RATE_LIMITED' }));

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    // Only 1 evaluate call before rate limit stopped processing
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('rate limited: records skipped run for rate-limited alert', async () => {
    const alert = insertAlert(db);
    evaluate.mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { code: 'RATE_LIMITED' }));

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    const runs = db.prepare(`SELECT * FROM alert_runs WHERE alert_id = ?`).all(alert.id);
    expect(runs.some(r => r.status === 'skipped')).toBe(true);
  });

  it('increments missed_polls for stale matches', async () => {
    const alert = insertAlert(db);
    // Insert a match with old last_seen_at
    db.prepare(`
      INSERT INTO alert_matches (alert_id, fingerprint, source, date, cabin, last_seen_at)
      VALUES (?, 'fp-stale', 'aeroplan', '2026-06-15', 'J', datetime('now', '-20 minutes'))
    `).run(alert.id);

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    const match = db.prepare(`SELECT * FROM alert_matches WHERE fingerprint = 'fp-stale'`).get();
    expect(match.missed_polls).toBeGreaterThan(0);
  });

  it('expires matches with missed_polls >= 3', async () => {
    const alert = insertAlert(db);
    db.prepare(`
      INSERT INTO alert_matches (alert_id, fingerprint, source, date, cabin, status, missed_polls, last_seen_at)
      VALUES (?, 'fp-expire', 'aeroplan', '2026-06-15', 'J', 'active', 3, datetime('now', '-20 minutes'))
    `).run(alert.id);

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    const match = db.prepare(`SELECT * FROM alert_matches WHERE fingerprint = 'fp-expire'`).get();
    expect(match.status).toBe('expired');
  });
});

describe('startPolling()', () => {
  it('returns an interval ID that can be cleared', () => {
    const intervalId = startPolling(searchCache, 'key');
    expect(intervalId).toBeTruthy();
    clearInterval(intervalId);
  });
});

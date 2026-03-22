import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTestDb } from '../helpers/createTestDb.js';
import { insertAlert } from '../helpers/fixtures.js';
import { runPollCycle, startPolling } from '../../server/services/alertScheduler.js';

let db;
let searchCache;
let fetchFn;
let evaluateFn;

const MOCK_ROWS = [{ Date: '2026-06-15', Source: 'aeroplan' }];

beforeEach(() => {
  db = createTestDb();
  searchCache = new Map();
  fetchFn   = vi.fn().mockResolvedValue({ data: MOCK_ROWS, fromCache: false });
  evaluateFn = vi.fn().mockReturnValue({ matchesNew: 0, matchesSeen: 0 });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const opts = () => ({ database: db, fetchFn, evaluateFn });

describe('runPollCycle()', () => {
  it('auto-disables alerts with date_to in the past', async () => {
    insertAlert(db, { date_to: '2020-01-01', enabled: 1 });
    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;
    const a = db.prepare(`SELECT * FROM alerts ORDER BY id DESC LIMIT 1`).get();
    expect(a.enabled).toBe(0);
  });

  it('skips cycle when no enabled alerts (fetchFn never called)', async () => {
    insertAlert(db, { enabled: 0 });
    await runPollCycle(searchCache, 'key', opts());
    expect(fetchFn).not.toHaveBeenCalled();
  });

  // ── Grouping ────────────────────────────────────────────────────────────────

  it('same-route alerts share one fetch (fetchFn called once for two alerts)', async () => {
    insertAlert(db, { name: 'Alert A' });
    insertAlert(db, { name: 'Alert B' }); // same route/dates as Alert A

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(evaluateFn).toHaveBeenCalledTimes(2);
  });

  it('same route different cabin = same group (cabin not in group key)', async () => {
    insertAlert(db, { cabin: 'J' });
    insertAlert(db, { cabin: 'Y' }); // same route, different cabin

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(evaluateFn).toHaveBeenCalledTimes(2);
  });

  it('different routes = different groups (fetchFn called once per group)', async () => {
    insertAlert(db, { origin: 'JFK', destination: 'NRT' });
    insertAlert(db, { origin: 'LAX', destination: 'CDG' });

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(evaluateFn).toHaveBeenCalledTimes(2);
  });

  it('evaluateFn is called with the full alert object and fetched rows', async () => {
    const alert = insertAlert(db);
    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    expect(evaluateFn).toHaveBeenCalledWith(
      expect.objectContaining({ id: alert.id }),
      MOCK_ROWS,
      expect.objectContaining({ database: db }),
    );
  });

  it('two different groups are each preceded by a stagger delay', async () => {
    insertAlert(db, { origin: 'JFK', destination: 'NRT' });
    insertAlert(db, { origin: 'LAX', destination: 'CDG' });
    const calls = [];
    fetchFn.mockImplementation(async () => {
      calls.push(Date.now());
      return { data: MOCK_ROWS, fromCache: false };
    });

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    expect(calls).toHaveLength(2);
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(2000);
  });

  // ── Rate limiting ───────────────────────────────────────────────────────────

  it('rate limited fetch: stops processing remaining groups', async () => {
    insertAlert(db, { origin: 'JFK', destination: 'NRT' }); // group 1
    insertAlert(db, { origin: 'LAX', destination: 'CDG' }); // group 2

    fetchFn.mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { code: 'RATE_LIMITED' }));

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    // Only 1 fetch attempted (group 2 skipped entirely)
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(evaluateFn).not.toHaveBeenCalled();
  });

  it('rate limited: records skipped run for rate-limited group alert', async () => {
    const alert = insertAlert(db);
    fetchFn.mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { code: 'RATE_LIMITED' }));

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    const runs = db.prepare(`SELECT * FROM alert_runs WHERE alert_id = ?`).all(alert.id);
    expect(runs.some(r => r.status === 'skipped')).toBe(true);
  });

  it('rate limited: records skipped for all remaining groups too', async () => {
    const a1 = insertAlert(db, { origin: 'JFK', destination: 'NRT' }); // group 1 → rate limited
    const a2 = insertAlert(db, { origin: 'LAX', destination: 'CDG' }); // group 2 → skipped

    fetchFn.mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { code: 'RATE_LIMITED' }));

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    const runs1 = db.prepare(`SELECT * FROM alert_runs WHERE alert_id = ?`).all(a1.id);
    const runs2 = db.prepare(`SELECT * FROM alert_runs WHERE alert_id = ?`).all(a2.id);
    expect(runs1.some(r => r.status === 'skipped')).toBe(true);
    expect(runs2.some(r => r.status === 'skipped')).toBe(true);
  });

  // ── Non-rate-limit fetch errors ─────────────────────────────────────────────

  it('non-rate-limit fetch error: records skipped for that group, next group proceeds', async () => {
    const a1 = insertAlert(db, { origin: 'JFK', destination: 'NRT' }); // group 1 → fetch error
    const a2 = insertAlert(db, { origin: 'LAX', destination: 'CDG' }); // group 2 → succeeds

    fetchFn.mockRejectedValueOnce(new Error('Connection timeout')); // no code → not rate limit

    const cyclePromise = runPollCycle(searchCache, 'key', opts());
    await vi.runAllTimersAsync();
    await cyclePromise;

    const runs1 = db.prepare(`SELECT * FROM alert_runs WHERE alert_id = ?`).all(a1.id);
    const runs2 = db.prepare(`SELECT * FROM alert_runs WHERE alert_id = ?`).all(a2.id);

    expect(runs1.some(r => r.status === 'skipped')).toBe(true);
    // group 2 was evaluated
    expect(evaluateFn).toHaveBeenCalledTimes(1);
    // a2 gets no skipped run — evaluateFn handles its own run recording
    expect(runs2.some(r => r.status === 'skipped')).toBe(false);
  });
});

describe('startPolling()', () => {
  it('returns an interval ID that can be cleared', () => {
    const intervalId = startPolling(searchCache, 'key');
    expect(intervalId).toBeTruthy();
    clearInterval(intervalId);
  });
});

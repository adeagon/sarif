import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTestDb } from '../helpers/createTestDb.js';
import { insertAlert, SEATS_API_SUCCESS, SEATS_API_EMPTY, mockFetchSuccess, mockFetch429, mockFetch500 } from '../helpers/fixtures.js';
import { evaluateAlert, runningAlerts } from '../../server/services/alertEvaluator.js';

let db;
let alertId;
let broadcast;
let searchCache;

beforeEach(() => {
  db = createTestDb();
  alertId = insertAlert(db).id;
  broadcast = vi.fn();
  searchCache = new Map();
  vi.stubGlobal('fetch', mockFetchSuccess(SEATS_API_SUCCESS));
});

afterEach(() => {
  vi.unstubAllGlobals();
  runningAlerts.clear();
});

const opts = () => ({ database: db, broadcast });

describe('evaluateAlert()', () => {
  it('inserts new matches and returns correct matchesNew count', async () => {
    const result = await evaluateAlert(alertId, searchCache, 'key', opts());
    // SEATS_API_SUCCESS has 2 matching rows (MATCH + MATCH_ALT), 1 expensive (filtered out)
    expect(result.matchesNew).toBe(2);
    expect(result.matchesSeen).toBe(0);
    const matches = db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ?`).all(alertId);
    expect(matches).toHaveLength(2);
  });

  it('broadcasts SSE for each new match', async () => {
    await evaluateAlert(alertId, searchCache, 'key', opts());
    expect(broadcast).toHaveBeenCalledTimes(2);
    expect(broadcast.mock.calls[0][0].type).toBe('match');
    expect(broadcast.mock.calls[0][0].alertId).toBe(alertId);
  });

  it('re-run with same data: matchesSeen incremented, matchesNew=0, no duplicates', async () => {
    await evaluateAlert(alertId, searchCache, 'key', opts());
    broadcast.mockClear();
    const result = await evaluateAlert(alertId, searchCache, 'key', opts());
    expect(result.matchesNew).toBe(0);
    expect(result.matchesSeen).toBe(2);
    expect(broadcast).not.toHaveBeenCalled();
    const matches = db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ?`).all(alertId);
    expect(matches).toHaveLength(2);
  });

  it('no matching rows: returns matchesNew=0, matchesSeen=0', async () => {
    vi.stubGlobal('fetch', mockFetchSuccess(SEATS_API_EMPTY));
    const result = await evaluateAlert(alertId, searchCache, 'key', opts());
    expect(result.matchesNew).toBe(0);
    expect(result.matchesSeen).toBe(0);
  });

  it('429 response throws with err.code === RATE_LIMITED', async () => {
    vi.stubGlobal('fetch', mockFetch429());
    await expect(evaluateAlert(alertId, searchCache, 'key', opts())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('500 response throws and records error run in alert_runs', async () => {
    vi.stubGlobal('fetch', mockFetch500());
    await expect(evaluateAlert(alertId, searchCache, 'key', opts())).rejects.toThrow();
    const runs = db.prepare(`SELECT * FROM alert_runs WHERE alert_id = ?`).all(alertId);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('error');
    expect(runs[0].error).toBeTruthy();
  });

  it('uses searchCache hit when TTL not expired (fetch not called)', async () => {
    // Pre-populate cache with the same params the evaluator would use
    const params = new URLSearchParams({
      origin_airport: 'JFK',
      destination_airport: 'NRT',
      cabin: 'J',
      take: '300',
      start_date: '2026-06-01',
      end_date: '2026-06-30',
    });
    searchCache.set(params.toString(), { data: SEATS_API_SUCCESS.data, ts: Date.now() });

    const mockFn = vi.fn();
    vi.stubGlobal('fetch', mockFn);

    await evaluateAlert(alertId, searchCache, 'key', opts());
    expect(mockFn).not.toHaveBeenCalled();
  });

  it('fetches fresh when cache is expired', async () => {
    const params = new URLSearchParams({
      origin_airport: 'JFK',
      destination_airport: 'NRT',
      cabin: 'J',
      take: '300',
      start_date: '2026-06-01',
      end_date: '2026-06-30',
    });
    // Expired (ts in the past by 11 minutes)
    searchCache.set(params.toString(), { data: [], ts: Date.now() - 11 * 60 * 1000 });

    const freshFetch = mockFetchSuccess(SEATS_API_SUCCESS);
    vi.stubGlobal('fetch', freshFetch);
    await evaluateAlert(alertId, searchCache, 'key', opts());
    expect(freshFetch).toHaveBeenCalled();
  });

  it('throws when no API key and cache is empty', async () => {
    vi.stubGlobal('fetch', vi.fn()); // should not be called
    await expect(evaluateAlert(alertId, searchCache, undefined, opts())).rejects.toThrow('SEATS_API_KEY not configured');
  });

  it('always records alert_runs entry even on error (finally block)', async () => {
    vi.stubGlobal('fetch', mockFetch500());
    try { await evaluateAlert(alertId, searchCache, 'key', opts()); } catch { /* expected */ }
    const runs = db.prepare(`SELECT * FROM alert_runs WHERE alert_id = ?`).all(alertId);
    expect(runs).toHaveLength(1);
  });

  it('updates last_run_at and last_match_at timestamps', async () => {
    await evaluateAlert(alertId, searchCache, 'key', opts());
    const alert = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(alertId);
    expect(alert.last_run_at).toBeTruthy();
    expect(alert.last_match_at).toBeTruthy(); // had 2 new matches
  });

  it('filters rows through matchesCriteria — expensive row not inserted', async () => {
    await evaluateAlert(alertId, searchCache, 'key', opts());
    const matches = db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ?`).all(alertId);
    // Expensive row (150k miles) should be filtered out
    const expensive = matches.find(m => m.miles === 150000);
    expect(expensive).toBeUndefined();
  });

  it('concurrent Run Now: second call while first is running throws "Alert already running"', async () => {
    // Simulate first call in flight by manually adding to set
    runningAlerts.add(alertId);
    await expect(evaluateAlert(alertId, searchCache, 'key', opts())).rejects.toThrow('Alert already running');
  });

  it('lock released after error: subsequent run succeeds', async () => {
    vi.stubGlobal('fetch', mockFetch500());
    try { await evaluateAlert(alertId, searchCache, 'key', opts()); } catch { /* expected */ }
    expect(runningAlerts.has(alertId)).toBe(false);

    vi.stubGlobal('fetch', mockFetchSuccess(SEATS_API_EMPTY));
    const result = await evaluateAlert(alertId, searchCache, 'key', opts());
    expect(result.matchesNew).toBe(0);
  });
});

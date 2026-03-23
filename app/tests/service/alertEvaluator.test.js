import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTestDb } from '../helpers/createTestDb.js';
import {
  insertAlert, SEATS_API_SUCCESS, SEATS_API_EMPTY,
  mockFetchSuccess, mockFetch429, mockFetch500,
  SEATS_ROW_MATCH, SEATS_ROW_MATCH_ALT, makeSeatsRow,
} from '../helpers/fixtures.js';
import { evaluateAlert, evaluateRowsForAlert, runningAlerts } from '../../server/services/alertEvaluator.js';
import { runPollCycle } from '../../server/services/alertScheduler.js';

let db;
let alertId;
let alert;
let broadcast;
let searchCache;

beforeEach(() => {
  db = createTestDb();
  alert = insertAlert(db);
  alertId = alert.id;
  broadcast = vi.fn();
  searchCache = new Map();
  vi.stubGlobal('fetch', mockFetchSuccess(SEATS_API_SUCCESS));
});

afterEach(() => {
  vi.unstubAllGlobals();
  runningAlerts.clear();
});

const opts = () => ({ database: db, broadcast });

// ── evaluateAlert() — thin wrapper ────────────────────────────────────────────

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
    const params = new URLSearchParams({
      origin_airport: 'JFK',
      destination_airport: 'NRT',
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
    const a = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(alertId);
    expect(a.last_run_at).toBeTruthy();
    expect(a.last_match_at).toBeTruthy(); // had 2 new matches
  });

  it('filters rows through matchesCriteria — expensive row not inserted', async () => {
    await evaluateAlert(alertId, searchCache, 'key', opts());
    const matches = db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ?`).all(alertId);
    // Expensive row (150k miles) should be filtered out
    const expensive = matches.find(m => m.miles === 150000);
    expect(expensive).toBeUndefined();
  });

  it('concurrent Run Now: second call while first is running throws "Alert already running"', async () => {
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

// ── evaluateRowsForAlert() — direct lifecycle tests ───────────────────────────

describe('evaluateRowsForAlert()', () => {
  it('with pre-fetched rows returns correct matchesNew/matchesSeen', () => {
    const result = evaluateRowsForAlert(alert, SEATS_API_SUCCESS.data, opts());
    expect(result.matchesNew).toBe(2);
    expect(result.matchesSeen).toBe(0);
  });

  it('re-run with same rows: matchesSeen=2, matchesNew=0', () => {
    evaluateRowsForAlert(alert, SEATS_API_SUCCESS.data, opts());
    broadcast.mockClear();
    const result = evaluateRowsForAlert(alert, SEATS_API_SUCCESS.data, opts());
    expect(result.matchesNew).toBe(0);
    expect(result.matchesSeen).toBe(2);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('inserts alert_run record on success', () => {
    evaluateRowsForAlert(alert, SEATS_API_SUCCESS.data, opts());
    const runs = db.prepare(`SELECT * FROM alert_runs WHERE alert_id = ?`).all(alertId);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('ok');
    expect(runs[0].matches_new).toBe(2);
  });

  it('match first seen → status=new, second seen → status=active', () => {
    evaluateRowsForAlert(alert, SEATS_API_SUCCESS.data, opts());
    const firstRun = db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ? ORDER BY id`).all(alertId);
    expect(firstRun[0].status).toBe('new');

    evaluateRowsForAlert(alert, SEATS_API_SUCCESS.data, opts());
    const secondRun = db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ? ORDER BY id`).all(alertId);
    expect(secondRun[0].status).toBe('active');
  });

  it('missed_polls increments for unseen matches', () => {
    // Insert a match manually
    db.prepare(`
      INSERT INTO alert_matches (alert_id, fingerprint, source, date, cabin, status, missed_polls)
      VALUES (?, 'fp-unseen', 'aeroplan', '2026-06-15', 'J', 'active', 0)
    `).run(alertId);

    evaluateRowsForAlert(alert, [], opts()); // empty rows → nothing seen

    const match = db.prepare(`SELECT * FROM alert_matches WHERE fingerprint = 'fp-unseen'`).get();
    expect(match.missed_polls).toBe(1);
  });

  it('missed_polls resets to 0 for seen match', () => {
    // Insert a match with missed_polls=2
    db.prepare(`
      INSERT INTO alert_matches (alert_id, fingerprint, source, date, cabin, status, missed_polls)
      VALUES (?, ?, 'aeroplan', '2026-06-15', 'J', 'active', 2)
    `).run(alertId, `${alertId}-avail-001`);

    evaluateRowsForAlert(alert, [SEATS_ROW_MATCH], opts());

    const match = db.prepare(`SELECT * FROM alert_matches WHERE fingerprint = ?`).get(`${alertId}-avail-001`);
    expect(match.missed_polls).toBe(0);
  });

  it('"new" match with missed_polls >= 3 → expired', () => {
    db.prepare(`
      INSERT INTO alert_matches (alert_id, fingerprint, source, date, cabin, status, missed_polls)
      VALUES (?, 'fp-new-expire', 'aeroplan', '2026-06-15', 'J', 'new', 3)
    `).run(alertId);

    evaluateRowsForAlert(alert, [], opts());

    const match = db.prepare(`SELECT * FROM alert_matches WHERE fingerprint = 'fp-new-expire'`).get();
    expect(match.status).toBe('expired');
  });

  it('"active" match with missed_polls >= 3 → expired', () => {
    db.prepare(`
      INSERT INTO alert_matches (alert_id, fingerprint, source, date, cabin, status, missed_polls)
      VALUES (?, 'fp-active-expire', 'aeroplan', '2026-06-15', 'J', 'active', 3)
    `).run(alertId);

    evaluateRowsForAlert(alert, [], opts());

    const match = db.prepare(`SELECT * FROM alert_matches WHERE fingerprint = 'fp-active-expire'`).get();
    expect(match.status).toBe('expired');
  });

  it('"dismissed" match never incremented or expired', () => {
    db.prepare(`
      INSERT INTO alert_matches (alert_id, fingerprint, source, date, cabin, status, missed_polls)
      VALUES (?, 'fp-dismissed', 'aeroplan', '2026-06-15', 'J', 'dismissed', 2)
    `).run(alertId);

    evaluateRowsForAlert(alert, [], opts());

    const match = db.prepare(`SELECT * FROM alert_matches WHERE fingerprint = 'fp-dismissed'`).get();
    expect(match.status).toBe('dismissed');
    expect(match.missed_polls).toBe(2); // unchanged
  });

  it('match with past travel date → expired (date-based expiration)', () => {
    const pastRow = makeSeatsRow({ Date: '2020-01-01', ID: 'avail-past' });
    evaluateRowsForAlert(alert, [pastRow], opts());

    // Row matched criteria but date is past — no new match inserted (expired immediately)
    const matches = db.prepare(`SELECT * FROM alert_matches WHERE alert_id = ?`).all(alertId);
    // No active/new matches inserted for past-date row
    const active = matches.filter(m => m.status !== 'expired');
    expect(active).toHaveLength(0);
  });

  it('dismissed past-date match stays dismissed, not reclassified to expired', () => {
    db.prepare(`
      INSERT INTO alert_matches (alert_id, fingerprint, source, date, cabin, status, missed_polls)
      VALUES (?, 'fp-dis-past', 'aeroplan', '2020-01-01', 'J', 'dismissed', 0)
    `).run(alertId);

    evaluateRowsForAlert(alert, [], opts());

    const match = db.prepare(`SELECT * FROM alert_matches WHERE fingerprint = 'fp-dis-past'`).get();
    expect(match.status).toBe('dismissed');
  });

  it('transferable alert: rejects non-transferable program (american)', () => {
    const a = insertAlert(db, { transferable: 1 });
    const row = makeSeatsRow({ Source: 'american' });
    const result = evaluateRowsForAlert(a, [row], opts());
    expect(result.matchesNew).toBe(0);
  });

  it('transferable alert: accepts transferable program (aeroplan)', () => {
    const a = insertAlert(db, { transferable: 1 });
    const row = makeSeatsRow({ Source: 'aeroplan' }); // aeroplan has transferFrom
    const result = evaluateRowsForAlert(a, [row], opts());
    expect(result.matchesNew).toBe(1);
  });

  it('manual run and scheduled eval produce identical lifecycle transitions', async () => {
    // Two separate alerts to independently exercise each wiring path.
    // a1 goes through evaluateAlert (lock + fetchResults + evaluateRowsForAlert).
    // a2 goes through runPollCycle (grouping + fetchFn + evaluateRowsForAlert).
    const a1 = insertAlert(db, { name: 'Manual path' });
    const a2 = insertAlert(db, { name: 'Scheduler path' });

    const fetchFn = vi.fn().mockResolvedValue({ data: SEATS_API_SUCCESS.data, fromCache: false });

    // -- Manual path: two runs → first 'new', second 'active'
    await evaluateAlert(a1.id, searchCache, 'key', opts());
    await evaluateAlert(a1.id, searchCache, 'key', opts());

    // -- Scheduler path: two poll cycles with real evaluateRowsForAlert → same transitions
    // Disable a1 so only a2 is picked up by the scheduler
    db.prepare(`UPDATE alerts SET enabled = 0 WHERE id = ?`).run(a1.id);
    vi.useFakeTimers();
    let cycle = runPollCycle(searchCache, 'key', { database: db, fetchFn, evaluateFn: evaluateRowsForAlert });
    await vi.runAllTimersAsync();
    await cycle;
    cycle = runPollCycle(searchCache, 'key', { database: db, fetchFn, evaluateFn: evaluateRowsForAlert });
    await vi.runAllTimersAsync();
    await cycle;
    vi.useRealTimers();

    const manualMatches    = db.prepare(`SELECT status FROM alert_matches WHERE alert_id = ?`).all(a1.id);
    const scheduledMatches = db.prepare(`SELECT status FROM alert_matches WHERE alert_id = ?`).all(a2.id);

    expect(manualMatches.length).toBeGreaterThan(0);
    expect(manualMatches.length).toBe(scheduledMatches.length);
    expect(manualMatches.every(m => m.status === 'active')).toBe(true);
    expect(scheduledMatches.every(m => m.status === 'active')).toBe(true);
  });
});

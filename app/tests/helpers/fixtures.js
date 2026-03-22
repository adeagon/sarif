import { vi } from 'vitest';

// ── Canonical seats.aero mock rows ────────────────────────────────────────────

export const SEATS_ROW_MATCH = {
  Date: '2026-06-15',
  Source: 'aeroplan',
  ID: 'avail-001',
  JMileageCostRaw: 70000,
  JTotalTaxesRaw: 5600,
  JRemainingSeatsRaw: 2,
  JDirect: true,
  JAirlines: 'NH',
  JAvailable: true,
};

export const SEATS_ROW_EXPENSIVE = {
  ...SEATS_ROW_MATCH,
  ID: 'avail-002',
  JMileageCostRaw: 150000,
};

export const SEATS_ROW_WRONG_CABIN = {
  ...SEATS_ROW_MATCH,
  ID: 'avail-003',
  JRemainingSeatsRaw: 0,
};

export const SEATS_ROW_MATCH_ALT = {
  Date: '2026-06-16',
  Source: 'united',
  ID: 'avail-004',
  JMileageCostRaw: 80000,
  JTotalTaxesRaw: 3200,
  JRemainingSeatsRaw: 1,
  JDirect: false,
  JAirlines: 'UA',
  JAvailable: true,
};

export const SEATS_ROW_NO_ID = {
  ...SEATS_ROW_MATCH,
  ID: undefined,
  id: undefined,
  AvailabilityID: undefined,
};

// ── Mock API responses ─────────────────────────────────────────────────────────

export const SEATS_API_SUCCESS = {
  data: [SEATS_ROW_MATCH, SEATS_ROW_MATCH_ALT, SEATS_ROW_EXPENSIVE],
};

export const SEATS_API_EMPTY = { data: [] };

// ── Alert fixture ─────────────────────────────────────────────────────────────

export const ALERT_DEFAULTS = {
  name: 'Test Alert',
  origin: 'JFK',
  destination: 'NRT',
  cabin: 'J',
  date_from: '2026-06-01',
  date_to: '2026-06-30',
  max_miles: 80000,
  max_taxes: 200,
  min_seats: 1,
  direct_only: 0,
  programs: null,
  transferable: 0,
  enabled: 1,
};

/**
 * Insert an alert into the test DB, returns the inserted row.
 * @param {import('better-sqlite3').Database} db
 * @param {object} overrides
 */
export function insertAlert(db, overrides = {}) {
  const data = { ...ALERT_DEFAULTS, ...overrides };
  const r = db.prepare(`
    INSERT INTO alerts (name, origin, destination, cabin, date_from, date_to,
      max_miles, max_taxes, min_seats, direct_only, programs, transferable, enabled)
    VALUES (@name, @origin, @destination, @cabin, @date_from, @date_to,
      @max_miles, @max_taxes, @min_seats, @direct_only, @programs, @transferable, @enabled)
  `).run(data);
  return db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(r.lastInsertRowid);
}

/**
 * Merge overrides onto SEATS_ROW_MATCH.
 */
export function makeSeatsRow(overrides = {}) {
  return { ...SEATS_ROW_MATCH, ...overrides };
}

/**
 * Returns a vi.fn() that resolves to a successful Response-like object.
 */
export function mockFetchSuccess(data) {
  const body = JSON.stringify(data);
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => body,
    json: async () => data,
  });
}

/**
 * Returns a vi.fn() that resolves to a 429 Response-like object.
 */
export function mockFetch429() {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 429,
    text: async () => 'Rate limited',
    json: async () => ({ error: true, message: 'Rate limited' }),
  });
}

/**
 * Returns a vi.fn() that resolves to a 500 Response-like object.
 */
export function mockFetch500() {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => 'Internal error',
    json: async () => ({ error: true }),
  });
}

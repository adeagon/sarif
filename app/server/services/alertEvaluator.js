import db from '../db.js';
import { broadcastSSE } from './alertSSE.js';

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes — matches index.js

// Per-alert concurrency guard
export const runningAlerts = new Set();

/**
 * Compute a stable fingerprint for a result row.
 * Prefer the availability ID from seats.aero if present.
 */
export function fingerprint(alertId, row, cabin) {
  const availId = row.ID || row.id || row.AvailabilityID;
  if (availId) return `${alertId}-${availId}`;
  const miles  = row[`${cabin}MileageCostRaw`] ?? '';
  const taxes  = row[`${cabin}TotalTaxesRaw`]  ?? '';
  const seats  = row[`${cabin}RemainingSeatsRaw`] ?? '';
  const direct = row[`${cabin}Direct`] ? '1' : '0';
  const airlines = row[`${cabin}Airlines`] ?? '';
  return `${alertId}-${row.Date}-${row.Source}-${miles}-${taxes}-${seats}-${direct}-${airlines}`;
}

/**
 * Filter a seats.aero result row against an alert's criteria.
 */
export function matchesCriteria(row, alert) {
  const { cabin, max_miles, max_taxes, min_seats, direct_only, programs } = alert;

  // Must have at least 1 seat
  const seats = row[`${cabin}RemainingSeatsRaw`];
  if (!seats || seats < (min_seats || 1)) return false;

  // Miles threshold
  const miles = row[`${cabin}MileageCostRaw`];
  if (!miles || miles <= 0) return false;
  if (max_miles && miles > max_miles) return false;

  // Taxes threshold (stored in cents from seats.aero)
  if (max_taxes) {
    const taxes = row[`${cabin}TotalTaxesRaw`] || 0;
    if (taxes > max_taxes * 100) return false; // max_taxes is in dollars
  }

  // Direct only
  if (direct_only && !row[`${cabin}Direct`]) return false;

  // Program filter
  if (programs) {
    const allowed = programs.split(',').map(p => p.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(row.Source)) return false;
  }

  // Date range
  if (alert.date_from && row.Date < alert.date_from) return false;
  if (alert.date_to   && row.Date > alert.date_to)   return false;

  return true;
}

/**
 * Fetch award search results (using shared cache).
 */
async function fetchResults(alert, searchCache, seatsApiKey) {
  const params = new URLSearchParams({
    origin_airport:      alert.origin,
    destination_airport: alert.destination,
    cabin:               alert.cabin,
    take:                '300',
  });
  if (alert.date_from) params.set('start_date', alert.date_from);
  if (alert.date_to)   params.set('end_date',   alert.date_to);

  const cacheKey = params.toString();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { data: cached.data, fromCache: true };
  }

  if (!seatsApiKey) throw new Error('SEATS_API_KEY not configured');

  const url = `https://seats.aero/partnerapi/search?${cacheKey}`;
  const r   = await fetch(url, { headers: { 'Partner-Authorization': seatsApiKey } });
  const text = await r.text();
  if (!r.ok) {
    if (r.status === 429) throw Object.assign(new Error('Rate limited (429)'), { code: 'RATE_LIMITED' });
    throw new Error(`Seats.aero ${r.status}: ${text.slice(0, 120)}`);
  }
  const parsed = JSON.parse(text);
  if (parsed.error) throw new Error(parsed.message || 'Seats.aero error');
  const data = parsed.data || [];
  searchCache.set(cacheKey, { data, ts: Date.now() });
  return { data, fromCache: false };
}

/**
 * Evaluate a single alert against live/cached seats.aero data.
 * @param {number} alertId
 * @param {Map} searchCache
 * @param {string|undefined} seatsApiKey
 * @param {{ database?: import('better-sqlite3').Database, broadcast?: Function }} [opts]
 * @returns {{ matchesNew: number, matchesSeen: number, error?: string }}
 */
export async function evaluateAlert(alertId, searchCache, seatsApiKey, { database = db, broadcast = broadcastSSE } = {}) {
  if (runningAlerts.has(alertId)) throw new Error('Alert already running');
  runningAlerts.add(alertId);

  const insertMatch = database.prepare(`
    INSERT INTO alert_matches
      (alert_id, fingerprint, source, date, cabin, miles, taxes, seats, direct, airlines, availability_id, status)
    VALUES
      (@alert_id, @fingerprint, @source, @date, @cabin, @miles, @taxes, @seats, @direct, @airlines, @availability_id, 'new')
    ON CONFLICT(alert_id, fingerprint) DO UPDATE SET
      last_seen_at  = datetime('now'),
      missed_polls  = 0,
      status        = CASE WHEN status = 'dismissed' THEN 'dismissed' ELSE 'active' END
  `);

  const updateAlertTimestamps = database.prepare(`
    UPDATE alerts
    SET last_run_at   = datetime('now'),
        last_match_at = CASE WHEN @had_match THEN datetime('now') ELSE last_match_at END
    WHERE id = @id
  `);

  const insertRun = database.prepare(`
    INSERT INTO alert_runs (alert_id, status, matches_new, matches_seen, error)
    VALUES (@alert_id, @status, @matches_new, @matches_seen, @error)
  `);

  const getAlert = database.prepare(`SELECT * FROM alerts WHERE id = ?`);

  const alert = getAlert.get(alertId);
  if (!alert) throw new Error(`Alert ${alertId} not found`);

  let matchesNew  = 0;
  let matchesSeen = 0;
  let runError    = null;

  try {
    const { data } = await fetchResults(alert, searchCache, seatsApiKey);

    const runInserts = database.transaction(() => {
      for (const row of data) {
        if (!matchesCriteria(row, alert)) continue;

        const fp = fingerprint(alertId, row, alert.cabin);
        const availId = row.ID || row.id || row.AvailabilityID || null;

        const prev = database.prepare('SELECT id, status FROM alert_matches WHERE alert_id = ? AND fingerprint = ?').get(alertId, fp);

        insertMatch.run({
          alert_id:        alertId,
          fingerprint:     fp,
          source:          row.Source,
          date:            row.Date,
          cabin:           alert.cabin,
          miles:           row[`${alert.cabin}MileageCostRaw`] || null,
          taxes:           row[`${alert.cabin}TotalTaxesRaw`]  || null,
          seats:           row[`${alert.cabin}RemainingSeatsRaw`] || null,
          direct:          row[`${alert.cabin}Direct`] ? 1 : 0,
          airlines:        row[`${alert.cabin}Airlines`] || null,
          availability_id: availId,
        });

        if (!prev) {
          matchesNew++;
          broadcast({
            type:        'match',
            alertId,
            alertName:   alert.name || `${alert.origin}→${alert.destination}`,
            origin:      alert.origin,
            destination: alert.destination,
            cabin:       alert.cabin,
            match: {
              fingerprint: fp,
              source:      row.Source,
              date:        row.Date,
              miles:       row[`${alert.cabin}MileageCostRaw`],
              taxes:       row[`${alert.cabin}TotalTaxesRaw`],
              seats:       row[`${alert.cabin}RemainingSeatsRaw`],
              direct:      row[`${alert.cabin}Direct`],
              airlines:    row[`${alert.cabin}Airlines`],
            },
          });
        } else {
          matchesSeen++;
        }
      }
    });

    runInserts();

    updateAlertTimestamps.run({ id: alertId, had_match: matchesNew > 0 ? 1 : 0 });

  } catch (err) {
    runError = err.message;
    updateAlertTimestamps.run({ id: alertId, had_match: 0 });
    throw err;
  } finally {
    runningAlerts.delete(alertId);
    insertRun.run({
      alert_id:     alertId,
      status:       runError ? 'error' : 'ok',
      matches_new:  matchesNew,
      matches_seen: matchesSeen,
      error:        runError,
    });
  }

  return { matchesNew, matchesSeen };
}

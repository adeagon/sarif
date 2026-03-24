import db from '../db.js';
import { broadcastSSE } from './alertSSE.js';
import { sendNotification } from './pushover.js';
import { PROGRAMS } from '../awardConstants.js';

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes — matches index.js

// Per-alert concurrency guard
export const runningAlerts = new Set();

/**
 * Compute a stable fingerprint for a result row.
 * Prefer the availability ID from seats.aero if present.
 */
export function fingerprint(alertId, row, cabin) {
  const availId = row.ID || row.id || row.AvailabilityID;
  if (availId) return `${alertId}-${cabin}-${availId}`;
  const miles    = row[`${cabin}MileageCostRaw`] ?? '';
  const taxes    = row[`${cabin}TotalTaxesRaw`]  ?? '';
  const seats    = row[`${cabin}RemainingSeatsRaw`] ?? '';
  const direct   = row[`${cabin}Direct`] ? '1' : '0';
  const airlines = row[`${cabin}Airlines`] ?? '';
  return `${alertId}-${row.Date}-${row.Source}-${miles}-${taxes}-${seats}-${direct}-${airlines}`;
}

/**
 * Returns true if the program has at least one transfer partner.
 */
export function isTransferableProgram(source) {
  const prog = PROGRAMS[source];
  return !!(prog && prog.transferFrom && prog.transferFrom.length > 0);
}

/**
 * Filter a seats.aero result row against an alert's criteria.
 */
export function matchesCriteria(row, alert) {
  const { cabin, max_miles, max_taxes, min_seats, direct_only, programs, transferable } = alert;

  // Must have at least min_seats seats
  const seats = row[`${cabin}RemainingSeatsRaw`];
  if (!seats || seats < (min_seats || 1)) return false;

  // Miles must be positive and under threshold
  const miles = row[`${cabin}MileageCostRaw`];
  if (!miles || miles <= 0) return false;
  if (max_miles && miles > max_miles) return false;

  // max_taxes in dollars, API returns cents
  if (max_taxes) {
    const taxes = row[`${cabin}TotalTaxesRaw`] || 0;
    if (taxes > max_taxes * 100) return false;
  }

  // Direct only
  if (direct_only && !row[`${cabin}Direct`]) return false;

  // Program filter
  if (programs) {
    const allowed = programs.split(',').map(p => p.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(row.Source)) return false;
  }

  // Transferable programs only
  if (transferable && !isTransferableProgram(row.Source)) return false;

  // Date range
  if (alert.date_from && row.Date < alert.date_from) return false;
  if (alert.date_to   && row.Date > alert.date_to)   return false;

  return true;
}

/**
 * Returns the array of cabin keys from alert.cabin (comma-separated) that
 * each pass matchesCriteria against the given row. Empty array if none match.
 */
export function getMatchingCabins(row, alert) {
  const cabins = alert.cabin.split(',').map(c => c.trim()).filter(Boolean);
  return cabins.filter(cabin => matchesCriteria(row, { ...alert, cabin }));
}

/**
 * Fetch award search results (using shared cache).
 * Exported so the scheduler can call it once per group.
 */
export async function fetchResults(alert, searchCache, seatsApiKey) {
  const params = new URLSearchParams({
    origin_airport:      alert.origin,
    destination_airport: alert.destination,
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

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatMatchMessage(row, cabin) {
  const miles = row[`${cabin}MileageCostRaw`];
  const taxes = row[`${cabin}TotalTaxesRaw`];
  const seats = row[`${cabin}RemainingSeatsRaw`];

  const [, mm, dd] = (row.Date || '').split('-');
  const dateStr = (mm && dd)
    ? `${MONTHS[parseInt(mm, 10) - 1]} ${parseInt(dd, 10)}`
    : (row.Date || '');

  const milesStr = miles ? `${Math.round(miles / 1000)}k` : '';
  const taxesStr = taxes ? `$${Math.round(taxes / 100)}` : '';
  const costStr  = [milesStr, taxesStr].filter(Boolean).join(' + ');
  const seatsStr = seats ? ` · ${seats} seat${seats !== 1 ? 's' : ''}` : '';

  return `${dateStr} · ${row.Source}${costStr ? ' · ' + costStr : ''}${seatsStr}`;
}

/**
 * Evaluate pre-fetched rows against an alert's criteria.
 * Handles: match upserts, lifecycle transitions (missed_polls, expiry), SSE broadcast, run recording.
 * Does NOT manage the runningAlerts lock — caller is responsible.
 *
 * @param {object} alert  — full alert row from DB
 * @param {Array}  rows   — seats.aero data rows (pre-fetched)
 * @param {{ database?: import('better-sqlite3').Database, broadcast?: Function }} opts
 * @returns {{ matchesNew: number, matchesSeen: number }}
 */
export async function evaluateRowsForAlert(alert, rows, { database = db, broadcast = broadcastSSE } = {}) {
  const alertId = alert.id;
  const today   = new Date().toISOString().slice(0, 10);

  const insertMatch = database.prepare(`
    INSERT INTO alert_matches
      (alert_id, fingerprint, source, date, cabin, miles, taxes, seats, direct, airlines, availability_id, origin_airport, destination_airport, status)
    VALUES
      (@alert_id, @fingerprint, @source, @date, @cabin, @miles, @taxes, @seats, @direct, @airlines, @availability_id, @origin_airport, @destination_airport, 'new')
    ON CONFLICT(alert_id, fingerprint) DO UPDATE SET
      last_seen_at  = datetime('now'),
      missed_polls  = 0,
      status        = CASE WHEN status = 'dismissed' THEN 'dismissed' ELSE 'active' END
  `);

  let matchesNew  = 0;
  let matchesSeen = 0;
  let runError    = null;
  const pendingNotifications = [];

  try {
    const seenFingerprints = new Set();

    const runTransaction = database.transaction(() => {
      for (const row of rows) {
        const matchingCabins = getMatchingCabins(row, alert);
        if (matchingCabins.length === 0) continue;

        const availId = row.ID || row.id || row.AvailabilityID || null;
        for (const cabin of matchingCabins) {
          const fp = fingerprint(alertId, row, cabin);

          // Date-based expiration takes precedence — past travel dates expire immediately.
          // Rows first encountered with a past date are silently ignored (no match inserted);
          // only previously-tracked matches reach this branch and get expired.
          if (row.Date < today) {
            database.prepare(`
              UPDATE alert_matches SET status = 'expired'
              WHERE alert_id = ? AND fingerprint = ? AND status IN ('new', 'active')
            `).run(alertId, fp);
            continue;
          }

          const prev = database.prepare(
            'SELECT id, status FROM alert_matches WHERE alert_id = ? AND fingerprint = ?'
          ).get(alertId, fp);

          seenFingerprints.add(fp);

          insertMatch.run({
            alert_id:            alertId,
            fingerprint:         fp,
            source:              row.Source,
            date:                row.Date,
            cabin,
            miles:               row[`${cabin}MileageCostRaw`] || null,
            taxes:               row[`${cabin}TotalTaxesRaw`]  || null,
            seats:               row[`${cabin}RemainingSeatsRaw`] || null,
            direct:              row[`${cabin}Direct`] ? 1 : 0,
            airlines:            row[`${cabin}Airlines`] || null,
            availability_id:     availId,
            origin_airport:      row.Route?.OriginAirport      || null,
            destination_airport: row.Route?.DestinationAirport || null,
          });

          if (!prev) {
            matchesNew++;
            broadcast({
              type:        'match',
              alertId,
              alertName:   alert.name || `${alert.origin}→${alert.destination}`,
              origin:      alert.origin,
              destination: alert.destination,
              cabin,
              match: {
                fingerprint: fp,
                source:      row.Source,
                date:        row.Date,
                miles:       row[`${cabin}MileageCostRaw`],
                taxes:       row[`${cabin}TotalTaxesRaw`],
                seats:       row[`${cabin}RemainingSeatsRaw`],
                direct:      row[`${cabin}Direct`],
                airlines:    row[`${cabin}Airlines`],
              },
            });
            pendingNotifications.push({
              fp,
              title:   `${alert.origin} → ${row.Route?.DestinationAirport || alert.destination}`,
              message: formatMatchMessage(row, cabin),
            });
          } else {
            matchesSeen++;
          }
        }
      }

      // Increment missed_polls for matches not seen in this run
      if (seenFingerprints.size > 0) {
        const placeholders = [...seenFingerprints].map(() => '?').join(',');
        database.prepare(`
          UPDATE alert_matches SET missed_polls = missed_polls + 1
          WHERE alert_id = ? AND status NOT IN ('dismissed', 'expired')
            AND fingerprint NOT IN (${placeholders})
        `).run(alertId, ...[...seenFingerprints]);
      } else {
        database.prepare(`
          UPDATE alert_matches SET missed_polls = missed_polls + 1
          WHERE alert_id = ? AND status NOT IN ('dismissed', 'expired')
        `).run(alertId);
      }

      // Expire matches with missed_polls >= 3 (new or active)
      database.prepare(`
        UPDATE alert_matches SET status = 'expired'
        WHERE alert_id = ? AND status IN ('new', 'active') AND missed_polls >= 3
      `).run(alertId);

      // Expire any remaining past-date matches (handles pre-existing rows)
      database.prepare(`
        UPDATE alert_matches SET status = 'expired'
        WHERE alert_id = ? AND status IN ('new', 'active') AND date < ?
      `).run(alertId, today);
    });

    runTransaction();

    // Send push notifications for new matches (post-transaction, sequential)
    for (const { fp, title, message } of pendingNotifications) {
      const result = await sendNotification({ title, message });
      if (result.ok) {
        database.prepare(
          `UPDATE alert_matches SET notified_at = datetime('now') WHERE alert_id = ? AND fingerprint = ?`
        ).run(alertId, fp);
      }
    }

    database.prepare(`
      UPDATE alerts
      SET last_run_at   = datetime('now'),
          last_match_at = CASE WHEN @had_match THEN datetime('now') ELSE last_match_at END
      WHERE id = @id
    `).run({ id: alertId, had_match: matchesNew > 0 ? 1 : 0 });

  } catch (err) {
    runError = err.message;
    database.prepare(`UPDATE alerts SET last_run_at = datetime('now') WHERE id = ?`).run(alertId);
    throw err;
  } finally {
    database.prepare(`
      INSERT INTO alert_runs (alert_id, status, matches_new, matches_seen, error)
      VALUES (?, ?, ?, ?, ?)
    `).run(alertId, runError ? 'error' : 'ok', matchesNew, matchesSeen, runError);
  }

  return { matchesNew, matchesSeen };
}

/**
 * Evaluate a single alert end-to-end: fetch + evaluate.
 * Manages the runningAlerts lock. Thin wrapper for manual Run Now.
 *
 * @param {number} alertId
 * @param {Map} searchCache
 * @param {string|undefined} seatsApiKey
 * @param {{ database?: import('better-sqlite3').Database, broadcast?: Function }} opts
 * @returns {{ matchesNew: number, matchesSeen: number }}
 */
export async function evaluateAlert(alertId, searchCache, seatsApiKey, { database = db, broadcast = broadcastSSE } = {}) {
  if (runningAlerts.has(alertId)) throw new Error('Alert already running');
  runningAlerts.add(alertId);

  try {
    const alert = database.prepare(`SELECT * FROM alerts WHERE id = ?`).get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    let data;
    try {
      ({ data } = await fetchResults(alert, searchCache, seatsApiKey));
    } catch (fetchErr) {
      // Record fetch error as a run entry before re-throwing
      database.prepare(`
        INSERT INTO alert_runs (alert_id, status, matches_new, matches_seen, error)
        VALUES (?, 'error', 0, 0, ?)
      `).run(alertId, fetchErr.message);
      database.prepare(`UPDATE alerts SET last_run_at = datetime('now') WHERE id = ?`).run(alertId);
      throw fetchErr;
    }

    return evaluateRowsForAlert(alert, data, { database, broadcast });
  } finally {
    runningAlerts.delete(alertId);
  }
}

import db from '../db.js';
import { fetchResults, evaluateRowsForAlert } from './alertEvaluator.js';

const DEFAULT_POLL_MS = 15 * 60 * 1000; // 15 minutes
const STAGGER_MS      = 2_000;           // 2 s between query groups

/**
 * Start the background polling loop.
 * @param {Map} searchCache  — shared with index.js proxy route
 * @param {string|undefined} seatsApiKey
 * @returns {ReturnType<typeof setInterval>} interval ID
 */
export function startPolling(searchCache, seatsApiKey) {
  const intervalMs = parseInt(process.env.ALERT_POLL_INTERVAL_MS || '0', 10) || DEFAULT_POLL_MS;
  console.log(`[alerts] polling started — interval ${intervalMs / 1000}s`);
  return setInterval(() => runPollCycle(searchCache, seatsApiKey), intervalMs);
}

/**
 * Run a single poll cycle.
 * Groups alerts by route/dates (cabin omitted — fetch is cabin-agnostic).
 * Fetches once per group, evaluates each alert in the group against the shared rows.
 *
 * @param {Map} searchCache
 * @param {string|undefined} seatsApiKey
 * @param {{ database?: import('better-sqlite3').Database, fetchFn?: Function, evaluateFn?: Function }} opts
 */
export async function runPollCycle(searchCache, seatsApiKey, {
  database   = db,
  fetchFn    = fetchResults,
  evaluateFn = evaluateRowsForAlert,
} = {}) {
  const now = new Date().toISOString().slice(0, 10);

  // Auto-disable alerts whose date_to has passed
  database.prepare(`UPDATE alerts SET enabled = 0 WHERE enabled = 1 AND date_to IS NOT NULL AND date_to < ?`).run(now);

  const alerts = database.prepare(`SELECT * FROM alerts WHERE enabled = 1`).all();
  if (!alerts.length) return;

  // Group by route/dates only — cabin intentionally omitted, fetch is cabin-agnostic
  const groups = new Map();
  for (const alert of alerts) {
    const key = `${alert.origin}|${alert.destination}|${alert.date_from || ''}|${alert.date_to || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(alert);
  }

  const allGroups = [...groups.values()];
  let rateLimited = false;

  for (const groupAlerts of allGroups) {
    // Rate limit already hit — record skipped for remaining groups and move on
    if (rateLimited) {
      for (const alert of groupAlerts) {
        database.prepare(`
          INSERT INTO alert_runs (alert_id, status, matches_new, matches_seen, error)
          VALUES (?, 'skipped', 0, 0, 'Rate limited — skipped')
        `).run(alert.id);
      }
      continue;
    }

    // Stagger between groups
    await new Promise(resolve => setTimeout(resolve, STAGGER_MS));

    // Fetch once for the whole group using the first alert as representative
    const representative = groupAlerts[0];
    let rows;
    let fetchFailed = false;

    try {
      const result = await fetchFn(representative, searchCache, seatsApiKey);
      rows = result.data;
    } catch (err) {
      fetchFailed = true;
      if (err.code === 'RATE_LIMITED') {
        rateLimited = true;
        console.warn('[alerts] rate limited by seats.aero — skipping remaining groups');
        for (const alert of groupAlerts) {
          database.prepare(`
            INSERT INTO alert_runs (alert_id, status, matches_new, matches_seen, error)
            VALUES (?, 'skipped', 0, 0, 'Rate limited — skipped')
          `).run(alert.id);
        }
      } else {
        // Non-rate-limit fetch error: record skipped for this group, continue to next
        console.error(`[alerts] fetch error ${representative.origin}→${representative.destination}:`, err.message);
        for (const alert of groupAlerts) {
          database.prepare(`
            INSERT INTO alert_runs (alert_id, status, matches_new, matches_seen, error)
            VALUES (?, 'skipped', 0, 0, ?)
          `).run(alert.id, `Fetch error: ${err.message}`);
        }
      }
    }

    if (fetchFailed) continue;

    // Fetch succeeded — evaluate each alert in the group against the shared rows
    for (const alert of groupAlerts) {
      try {
        const result = await evaluateFn(alert, rows, { database });
        const { matchesNew = 0, matchesSeen = 0 } = result || {};
        console.log(`[alerts] poll alert#${alert.id} — ${matchesNew} new, ${matchesSeen} seen`);
      } catch (err) {
        console.error(`[alerts] eval error alert#${alert.id}:`, err.message);
        // evaluateRowsForAlert records its own error run in its finally block
      }
    }
  }

  const status = rateLimited ? 'rate limited' : 'ok';
  console.log(`[alerts] poll complete — ${alerts.length} alerts, ${allGroups.length} groups, ${status}`);
}

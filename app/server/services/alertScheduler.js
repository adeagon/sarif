import db from '../db.js';
import { evaluateAlert } from './alertEvaluator.js';

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
 * @param {Map} searchCache
 * @param {string|undefined} seatsApiKey
 * @param {{ database?: import('better-sqlite3').Database, evaluate?: Function }} [opts]
 */
export async function runPollCycle(searchCache, seatsApiKey, { database = db, evaluate = evaluateAlert } = {}) {
  const now = new Date().toISOString().slice(0, 10);

  // Auto-disable alerts whose date_to has passed
  database.prepare(`UPDATE alerts SET enabled = 0 WHERE enabled = 1 AND date_to IS NOT NULL AND date_to < ?`).run(now);

  const alerts = database.prepare(`SELECT * FROM alerts WHERE enabled = 1`).all();
  if (!alerts.length) return;

  // Group alerts by (origin, destination, date_from, date_to, cabin) to share API calls
  const groups = new Map();
  for (const alert of alerts) {
    const key = `${alert.origin}|${alert.destination}|${alert.cabin}|${alert.date_from || ''}|${alert.date_to || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(alert);
  }

  let rateLimited = false;

  for (const [, groupAlerts] of groups) {
    if (rateLimited) break;

    // Stagger between groups
    await new Promise(resolve => setTimeout(resolve, STAGGER_MS));

    for (const alert of groupAlerts) {
      if (rateLimited) break;
      try {
        const result = await evaluate(alert.id, searchCache, seatsApiKey);
        console.log(`[alerts] poll alert#${alert.id} — ${result.matchesNew} new, ${result.matchesSeen} seen`);
      } catch (err) {
        if (err.code === 'RATE_LIMITED') {
          rateLimited = true;
          console.warn('[alerts] rate limited by seats.aero — skipping remaining groups');
          // Mark remaining alerts in this cycle as skipped
          database.prepare(`
            INSERT INTO alert_runs (alert_id, status, matches_new, matches_seen, error)
            VALUES (?, 'skipped', 0, 0, 'Rate limited — skipped')
          `).run(alert.id);
        } else {
          console.error(`[alerts] poll error alert#${alert.id}:`, err.message);
        }
      }
    }
  }

  // Increment missed_polls for matches not seen in this cycle, expire after 3 misses
  database.prepare(`
    UPDATE alert_matches
    SET missed_polls = missed_polls + 1
    WHERE status NOT IN ('dismissed', 'expired')
      AND last_seen_at < datetime('now', '-${Math.ceil(DEFAULT_POLL_MS / 60000)} minutes')
  `).run();

  database.prepare(`
    UPDATE alert_matches SET status = 'expired'
    WHERE status = 'active' AND missed_polls >= 3
  `).run();
}

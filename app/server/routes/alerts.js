import { Router } from 'express';
import db from '../db.js';
import { evaluateAlert } from '../services/alertEvaluator.js';
import { setupSSE } from '../services/alertSSE.js';

const MAX_ALERTS = parseInt(process.env.MAX_ALERTS || '10', 10);

export function createAlertsRouter(database = db) {
  const router = Router();

  // ── SSE ──────────────────────────────────────────────────────────────────────
  setupSSE(router);

  // ── List alerts ──────────────────────────────────────────────────────────────
  router.get('/', (req, res) => {
    const alerts = database.prepare(`
      SELECT
        a.*,
        (SELECT COUNT(*) FROM alert_matches m WHERE m.alert_id = a.id AND m.status NOT IN ('dismissed','expired')) AS match_count,
        (SELECT status  FROM alert_runs    r WHERE r.alert_id = a.id ORDER BY r.ran_at DESC LIMIT 1)              AS last_run_status,
        (SELECT error   FROM alert_runs    r WHERE r.alert_id = a.id ORDER BY r.ran_at DESC LIMIT 1)              AS last_run_error
      FROM alerts a
      ORDER BY a.created_at DESC
    `).all();
    res.json(alerts);
  });

  // ── Create alert ─────────────────────────────────────────────────────────────
  router.post('/', (req, res) => {
    const { origin, destination, cabin } = req.body;
    if (!origin || !destination || !cabin) {
      return res.status(400).json({ error: true, message: 'origin, destination, and cabin are required' });
    }

    const activeCount = database.prepare(`SELECT COUNT(*) AS n FROM alerts WHERE enabled = 1`).get().n;
    if (activeCount >= MAX_ALERTS) {
      return res.status(409).json({ error: true, message: `Maximum of ${MAX_ALERTS} active alerts reached` });
    }

    const {
      name        = '',
      date_from   = null,
      date_to     = null,
      max_miles   = null,
      max_taxes   = null,
      min_seats   = 1,
      direct_only = 0,
      programs    = null,
      transferable = 0,
    } = req.body;

    const result = database.prepare(`
      INSERT INTO alerts (name, origin, destination, cabin, date_from, date_to, max_miles, max_taxes, min_seats, direct_only, programs, transferable)
      VALUES (@name, @origin, @destination, @cabin, @date_from, @date_to, @max_miles, @max_taxes, @min_seats, @direct_only, @programs, @transferable)
    `).run({ name, origin: origin.toUpperCase(), destination: destination.toUpperCase(), cabin, date_from, date_to, max_miles, max_taxes, min_seats, direct_only: direct_only ? 1 : 0, programs, transferable: transferable ? 1 : 0 });

    const alert = database.prepare(`SELECT * FROM alerts WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(alert);
  });

  // ── Update alert ─────────────────────────────────────────────────────────────
  router.put('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const alert = database.prepare(`SELECT * FROM alerts WHERE id = ?`).get(id);
    if (!alert) return res.status(404).json({ error: true, message: 'Alert not found' });

    const allowed = ['name','origin','destination','cabin','date_from','date_to','max_miles','max_taxes','min_seats','direct_only','programs','transferable','enabled'];
    const updates = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: true, message: 'No valid fields to update' });

    const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
    database.prepare(`UPDATE alerts SET ${setClauses} WHERE id = @id`).run({ ...updates, id });

    const updated = database.prepare(`SELECT * FROM alerts WHERE id = ?`).get(id);
    res.json(updated);
  });

  // ── Delete alert ─────────────────────────────────────────────────────────────
  router.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const r = database.prepare(`DELETE FROM alerts WHERE id = ?`).run(id);
    if (!r.changes) return res.status(404).json({ error: true, message: 'Alert not found' });
    res.json({ ok: true });
  });

  // ── Manual run ───────────────────────────────────────────────────────────────
  router.post('/:id/run', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const alert = database.prepare(`SELECT * FROM alerts WHERE id = ?`).get(id);
    if (!alert) return res.status(404).json({ error: true, code: 'NOT_FOUND', message: 'Alert not found' });

    const searchCache = req.app.get('searchCache');
    const seatsApiKey = process.env.SEATS_API_KEY;

    try {
      const result = await evaluateAlert(id, searchCache, seatsApiKey, { database });
      res.json({ ok: true, matchesNew: result.matchesNew, matchesSeen: result.matchesSeen });
    } catch (err) {
      if (err.message === 'Alert already running') {
        return res.status(409).json({ error: true, code: 'ALREADY_RUNNING', message: 'Alert is already running' });
      }
      if (err.code === 'RATE_LIMITED') {
        return res.status(429).json({ error: true, code: 'RATE_LIMITED', message: 'Rate limited by seats.aero — try again in a few minutes' });
      }
      res.status(502).json({ error: true, code: 'UPSTREAM_ERROR', message: err.message });
    }
  });

  // ── Get matches for an alert ─────────────────────────────────────────────────
  router.get('/:id/matches', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const matches = database.prepare(`
      SELECT * FROM alert_matches
      WHERE alert_id = ?
      ORDER BY date ASC, miles ASC
    `).all(id);
    res.json(matches);
  });

  // ── Get run history for an alert ─────────────────────────────────────────────
  router.get('/:id/runs', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const runs = database.prepare(`
      SELECT * FROM alert_runs WHERE alert_id = ? ORDER BY ran_at DESC LIMIT 50
    `).all(id);
    res.json(runs);
  });

  // ── Dismiss a match ───────────────────────────────────────────────────────────
  router.post('/matches/:id/dismiss', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const r = database.prepare(`UPDATE alert_matches SET status = 'dismissed' WHERE id = ?`).run(id);
    if (!r.changes) return res.status(404).json({ error: true, message: 'Match not found' });
    res.json({ ok: true });
  });

  return router;
}

export default createAlertsRouter();

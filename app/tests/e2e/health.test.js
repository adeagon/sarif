import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestDb } from '../helpers/createTestDb.js';

let app;

beforeEach(() => {
  const db = createTestDb();
  app = express();
  app.get('/api/health', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ ok: true, service: 'sarif' });
    } catch {
      res.status(503).json({ ok: false, service: 'sarif' });
    }
  });
});

describe('GET /api/health', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('returns { ok: true, service: "sarif" }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toEqual({ ok: true, service: 'sarif' });
  });
});

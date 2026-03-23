import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Build a minimal Express app wired exactly like the real server's static/fallback block.
function buildTestApp(distPath) {
  const app = express();
  const indexPath = path.join(distPath, 'index.html');

  if (fs.existsSync(indexPath)) {
    app.use(express.static(distPath));

    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api/')) return next();
      if (!req.accepts('html')) return next();
      res.sendFile(indexPath);
    });
  }

  return app;
}

describe('production static serving', () => {
  let tmpDir;
  let app;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sarif-test-dist-'));
    fs.writeFileSync(
      path.join(tmpDir, 'index.html'),
      '<!doctype html><html><body>SARIF_APP</body></html>',
    );
    app = buildTestApp(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('serves index.html for browser navigation to non-API route', async () => {
    const res = await request(app)
      .get('/dashboard')
      .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');

    expect(res.status).toBe(200);
    expect(res.text).toContain('SARIF_APP');
  });

  it('does not swallow API routes with SPA fallback', async () => {
    // Add a test API route before the fallback
    const appWithApi = express();
    const indexPath  = path.join(tmpDir, 'index.html');
    appWithApi.get('/api/test', (_req, res) => res.json({ ok: true }));
    appWithApi.use(express.static(tmpDir));
    appWithApi.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api/')) return next();
      if (!req.accepts('html')) return next();
      res.sendFile(indexPath);
    });

    const res = await request(appWithApi)
      .get('/api/test')
      .set('Accept', 'text/html,*/*');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('does not serve index.html for non-HTML Accept header', async () => {
    const res = await request(app)
      .get('/unknown-path')
      .set('Accept', 'application/json');

    // Should NOT return the index.html content
    expect(res.text ?? '').not.toContain('SARIF_APP');
    // Should be 404 (static file not found, fallback skipped)
    expect(res.status).toBe(404);
  });
});

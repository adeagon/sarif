import { describe, it, expect, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';

describe('db.js configuration', () => {
  afterEach(() => {
    delete process.env.SARIF_DB_PATH;
    vi.resetModules();
  });

  it('createDatabase(":memory:") creates all tables', async () => {
    const { createDatabase } = await import('../../server/db.js');
    const db = createDatabase(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map(r => r.name);
    expect(tables).toContain('alerts');
    expect(tables).toContain('alert_runs');
    expect(tables).toContain('alert_matches');
    db.close();
  });

  it('createDatabase(customPath) creates a file-backed DB', async () => {
    const { createDatabase } = await import('../../server/db.js');
    const dbPath = join(tmpdir(), `sarif-test-${Date.now()}.db`);
    const db = createDatabase(dbPath);
    db.close();
    expect(existsSync(dbPath)).toBe(true);
    rmSync(dbPath, { force: true });
  });

  it('SARIF_DB_PATH env var is respected by the default export', async () => {
    const dbPath = join(tmpdir(), `sarif-env-test-${Date.now()}.db`);
    process.env.SARIF_DB_PATH = dbPath;
    vi.resetModules();
    const mod = await import('../../server/db.js');
    const db = mod.default;
    db.close();
    expect(existsSync(dbPath)).toBe(true);
    rmSync(dbPath, { force: true });
  });
});

import { describe, it, expect } from 'vitest';
import { fingerprint } from '../../server/services/alertEvaluator.js';

describe('fingerprint()', () => {
  it('uses row.ID when present, includes cabin', () => {
    const row = { ID: 'avail-001', Date: '2026-06-15', Source: 'aeroplan' };
    expect(fingerprint(42, row, 'J')).toBe('42-J-avail-001');
  });

  it('falls back to row.id when row.ID is absent, includes cabin', () => {
    const row = { id: 'avail-002', Date: '2026-06-15', Source: 'aeroplan' };
    expect(fingerprint(42, row, 'J')).toBe('42-J-avail-002');
  });

  it('falls back to row.AvailabilityID as last resort, includes cabin', () => {
    const row = { AvailabilityID: 'avail-003', Date: '2026-06-15', Source: 'aeroplan' };
    expect(fingerprint(42, row, 'J')).toBe('42-J-avail-003');
  });

  it('builds composite fingerprint when no ID fields exist', () => {
    const row = {
      Date: '2026-06-15', Source: 'aeroplan',
      JMileageCostRaw: 70000, JTotalTaxesRaw: 5600,
      JRemainingSeatsRaw: 2, JDirect: true, JAirlines: 'NH',
    };
    const fp = fingerprint(7, row, 'J');
    expect(fp).toBe('7-2026-06-15-aeroplan-70000-5600-2-1-NH');
  });

  it('missing cabin fields produce empty-string segments without crashing', () => {
    const row = { Date: '2026-06-15', Source: 'aeroplan' };
    expect(() => fingerprint(1, row, 'J')).not.toThrow();
    const fp = fingerprint(1, row, 'J');
    expect(fp).toContain('1-2026-06-15-aeroplan');
  });

  it('different alertIds produce different fingerprints for same row', () => {
    const row = { ID: 'avail-001' };
    expect(fingerprint(1, row, 'J')).not.toBe(fingerprint(2, row, 'J'));
  });
});

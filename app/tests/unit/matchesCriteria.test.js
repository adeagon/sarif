import { describe, it, expect } from 'vitest';
import { matchesCriteria, isTransferableProgram } from '../../server/services/alertEvaluator.js';

const BASE_ALERT = {
  cabin: 'J',
  max_miles: 80000,
  max_taxes: 200,
  min_seats: 1,
  direct_only: 0,
  programs: null,
  date_from: '2026-06-01',
  date_to: '2026-06-30',
};

const BASE_ROW = {
  JRemainingSeatsRaw: 2,
  JMileageCostRaw: 70000,
  JTotalTaxesRaw: 5600,   // $56 — well under $200
  JDirect: true,
  JAirlines: 'NH',
  Source: 'aeroplan',
  Date: '2026-06-15',
};

describe('matchesCriteria()', () => {
  it('returns true for a row meeting all criteria', () => {
    expect(matchesCriteria(BASE_ROW, BASE_ALERT)).toBe(true);
  });

  it('rejects row with 0 seats', () => {
    expect(matchesCriteria({ ...BASE_ROW, JRemainingSeatsRaw: 0 }, BASE_ALERT)).toBe(false);
  });

  it('rejects row below min_seats threshold', () => {
    expect(matchesCriteria({ ...BASE_ROW, JRemainingSeatsRaw: 1 }, { ...BASE_ALERT, min_seats: 2 })).toBe(false);
  });

  it('rejects row with 0 miles', () => {
    expect(matchesCriteria({ ...BASE_ROW, JMileageCostRaw: 0 }, BASE_ALERT)).toBe(false);
  });

  it('rejects row exceeding max_miles', () => {
    expect(matchesCriteria({ ...BASE_ROW, JMileageCostRaw: 90000 }, BASE_ALERT)).toBe(false);
  });

  it('accepts row at exactly max_miles', () => {
    expect(matchesCriteria({ ...BASE_ROW, JMileageCostRaw: 80000 }, BASE_ALERT)).toBe(true);
  });

  it('rejects row exceeding max_taxes (dollars→cents)', () => {
    // max_taxes = 200 dollars → 20000 cents; taxes = 20001 cents → reject
    expect(matchesCriteria({ ...BASE_ROW, JTotalTaxesRaw: 20001 }, BASE_ALERT)).toBe(false);
  });

  it('accepts row at exactly max_taxes boundary', () => {
    // max_taxes = 200 → 20000 cents
    expect(matchesCriteria({ ...BASE_ROW, JTotalTaxesRaw: 20000 }, BASE_ALERT)).toBe(true);
  });

  it('rejects non-direct flight when direct_only=1', () => {
    expect(matchesCriteria({ ...BASE_ROW, JDirect: false }, { ...BASE_ALERT, direct_only: 1 })).toBe(false);
  });

  it('accepts direct flight when direct_only=1', () => {
    expect(matchesCriteria({ ...BASE_ROW, JDirect: true }, { ...BASE_ALERT, direct_only: 1 })).toBe(true);
  });

  it('rejects row from non-allowed program when programs is set', () => {
    expect(matchesCriteria({ ...BASE_ROW, Source: 'united' }, { ...BASE_ALERT, programs: 'aeroplan,flyingblue' })).toBe(false);
  });

  it('accepts row from allowed program', () => {
    expect(matchesCriteria({ ...BASE_ROW, Source: 'aeroplan' }, { ...BASE_ALERT, programs: 'aeroplan,flyingblue' })).toBe(true);
  });

  it('accepts any program when programs is null', () => {
    expect(matchesCriteria({ ...BASE_ROW, Source: 'turkish' }, { ...BASE_ALERT, programs: null })).toBe(true);
  });

  it('rejects row before date_from', () => {
    expect(matchesCriteria({ ...BASE_ROW, Date: '2026-05-31' }, BASE_ALERT)).toBe(false);
  });

  it('rejects row after date_to', () => {
    expect(matchesCriteria({ ...BASE_ROW, Date: '2026-07-01' }, BASE_ALERT)).toBe(false);
  });

  it('accepts row when no date filters set', () => {
    expect(matchesCriteria({ ...BASE_ROW, Date: '2099-12-31' }, { ...BASE_ALERT, date_from: null, date_to: null })).toBe(true);
  });

  it('ignores max_miles when null', () => {
    expect(matchesCriteria({ ...BASE_ROW, JMileageCostRaw: 999999 }, { ...BASE_ALERT, max_miles: null })).toBe(true);
  });

  it('ignores max_taxes when null', () => {
    expect(matchesCriteria({ ...BASE_ROW, JTotalTaxesRaw: 99999 }, { ...BASE_ALERT, max_taxes: null })).toBe(true);
  });

  it('rejects non-transferable program (american) when transferable=1', () => {
    expect(matchesCriteria({ ...BASE_ROW, Source: 'american' }, { ...BASE_ALERT, transferable: 1 })).toBe(false);
  });

  it('accepts transferable program (aeroplan) when transferable=1', () => {
    expect(matchesCriteria({ ...BASE_ROW, Source: 'aeroplan' }, { ...BASE_ALERT, transferable: 1 })).toBe(true);
  });

  it('accepts non-transferable program (american) when transferable=0', () => {
    expect(matchesCriteria({ ...BASE_ROW, Source: 'american' }, { ...BASE_ALERT, transferable: 0 })).toBe(true);
  });

  it('rejects unknown program when transferable=1', () => {
    expect(matchesCriteria({ ...BASE_ROW, Source: 'unknownprogram' }, { ...BASE_ALERT, transferable: 1 })).toBe(false);
  });
});

describe('isTransferableProgram()', () => {
  it('returns true for aeroplan (has transferFrom)', () => {
    expect(isTransferableProgram('aeroplan')).toBe(true);
  });

  it('returns false for american (empty transferFrom)', () => {
    expect(isTransferableProgram('american')).toBe(false);
  });

  it('returns false for unknown source key', () => {
    expect(isTransferableProgram('unknownxyz')).toBe(false);
  });
});

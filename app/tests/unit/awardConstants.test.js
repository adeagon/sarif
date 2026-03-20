import { describe, it, expect } from 'vitest';
import {
  fmt, fmtDate, fmtTaxes, parseAirlines, bookLink, cppColor, PROGRAMS,
} from '../../src/utils/awardConstants.js';

describe('fmt()', () => {
  it('formats whole thousands', () => {
    expect(fmt(75000)).toBe('75k');
  });

  it('formats fractional thousands', () => {
    expect(fmt(70500)).toBe('70.5k');
  });

  it('returns null for 0', () => {
    expect(fmt(0)).toBeNull();
  });

  it('returns null for null', () => {
    expect(fmt(null)).toBeNull();
  });
});

describe('fmtDate()', () => {
  it('formats a date string to short month + day', () => {
    expect(fmtDate('2026-06-15')).toBe('Jun 15');
  });
});

describe('fmtTaxes()', () => {
  it('converts cents to dollar string', () => {
    expect(fmtTaxes(5600)).toBe('$56');
  });

  it('returns null for null', () => {
    expect(fmtTaxes(null)).toBeNull();
  });
});

describe('parseAirlines()', () => {
  it('parses known carrier codes', () => {
    const result = parseAirlines('AF,KL');
    expect(result).toEqual([
      { code: 'AF', name: 'Air France' },
      { code: 'KL', name: 'KLM' },
    ]);
  });

  it('returns empty array for null', () => {
    expect(parseAirlines(null)).toEqual([]);
  });

  it('uses code as name fallback for unknown carrier', () => {
    const result = parseAirlines('ZZ');
    expect(result).toEqual([{ code: 'ZZ', name: 'ZZ' }]);
  });
});

describe('bookLink()', () => {
  it('returns United URL with origin/dest params', () => {
    const url = bookLink('united', 'JFK', 'NRT');
    expect(url).toContain('united.com');
    expect(url).toContain('JFK');
    expect(url).toContain('NRT');
  });

  it('falls back to PROGRAMS bookUrl for known non-switch source', () => {
    // 'airindia' is in PROGRAMS but not in the switch statement
    const url = bookLink('airindia', 'JFK', 'BOM');
    expect(url).toBe(PROGRAMS['airindia'].bookUrl);
  });
});

describe('cppColor()', () => {
  it('returns Excellent tier for cpp >= 8', () => {
    expect(cppColor(8).label).toBe('Excellent');
    expect(cppColor(10).label).toBe('Excellent');
    expect(cppColor(8).text).toContain('emerald');
  });

  it('returns Good tier for cpp >= 6 and < 8', () => {
    expect(cppColor(6).label).toBe('Good');
    expect(cppColor(7).label).toBe('Good');
    expect(cppColor(6).text).toContain('blue');
  });

  it('returns OK tier for cpp >= 4 and < 6', () => {
    expect(cppColor(4).label).toBe('OK');
    expect(cppColor(5).label).toBe('OK');
    expect(cppColor(4).text).toContain('yellow');
  });

  it('returns Poor tier for cpp < 4', () => {
    expect(cppColor(3).label).toContain('Poor');
    expect(cppColor(0).text).toContain('red');
  });
});

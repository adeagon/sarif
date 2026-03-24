/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AwardSearch from '../../src/components/AwardSearch.jsx';

// A seats.aero row with both J and Y availability (W/F unavailable)
const DUAL_CABIN_ROW = {
  Date: '2026-11-12',
  Source: 'aeroplan',
  ID: 'test-001',
  Route: { OriginAirport: 'LAX', DestinationAirport: 'HND' },
  JAvailable: true,  JMileageCostRaw: 70000, JTotalTaxesRaw: 5600, JRemainingSeatsRaw: 2, JDirect: true,  JAirlines: 'AC',
  YAvailable: true,  YMileageCostRaw: 40000, YTotalTaxesRaw: 2000, YRemainingSeatsRaw: 4, YDirect: true,  YAirlines: 'AC',
  WAvailable: false, WMileageCostRaw: 0,
  FAvailable: false, FMileageCostRaw: 0,
};

// A row with J only
const J_ONLY_ROW = {
  ...DUAL_CABIN_ROW,
  ID: 'test-002',
  YAvailable: false, YMileageCostRaw: 0,
};

function mockFetch(rows = []) {
  return vi.fn().mockImplementation((url) => {
    const body = String(url).includes('/api/seats/search')
      ? JSON.stringify({ data: rows })
      : JSON.stringify({ prices: [], data: [] });
    return Promise.resolve({ ok: true, text: async () => body, json: async () => JSON.parse(body) });
  });
}

beforeEach(() => {
  global.fetch = mockFetch();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.fetch;
});

// ── Cabin toggle state ────────────────────────────────────────────────────────

describe('Multi-cabin selection — toggle state', () => {
  it('starts with Business selected by default', async () => {
    render(<AwardSearch homeAirport="LAX" />);
    const btn = await waitFor(() => screen.getByRole('button', { name: 'Business' }));
    expect(btn.className).toContain('text-blue-400');
  });

  it('can add a second cabin by clicking it', async () => {
    const user = userEvent.setup();
    render(<AwardSearch homeAirport="LAX" />);
    const econBtn = await waitFor(() => screen.getByRole('button', { name: 'Economy' }));
    await user.click(econBtn);
    expect(econBtn.className).toContain('text-blue-400');
    // Business still selected
    expect(screen.getByRole('button', { name: 'Business' }).className).toContain('text-blue-400');
  });

  it('cannot deselect the last remaining cabin', async () => {
    const user = userEvent.setup();
    render(<AwardSearch homeAirport="LAX" />);
    const bizBtn = await waitFor(() => screen.getByRole('button', { name: 'Business' }));
    // Click Business when it is the only selected cabin — should stay selected
    await user.click(bizBtn);
    expect(bizBtn.className).toContain('text-blue-400');
  });

  it('can deselect a cabin when another is still selected', async () => {
    const user = userEvent.setup();
    render(<AwardSearch homeAirport="LAX" />);
    const econBtn = await waitFor(() => screen.getByRole('button', { name: 'Economy' }));
    const bizBtn  = screen.getByRole('button', { name: 'Business' });

    await user.click(econBtn);  // add Economy → [J, Y]
    await user.click(bizBtn);   // remove Business → [Y]
    expect(bizBtn.className).not.toContain('text-blue-400');
    expect(econBtn.className).toContain('text-blue-400');
  });
});

// ── Alert button ──────────────────────────────────────────────────────────────

describe('Multi-cabin selection — Alert button', () => {
  it('is always enabled (single cabin)', async () => {
    render(<AwardSearch homeAirport="LAX" onCreateAlert={vi.fn()} />);
    const alertBtn = await waitFor(() => screen.getByTitle(/create an alert/i));
    expect(alertBtn).not.toBeDisabled();
  });

  it('is enabled even when multiple cabins are selected', async () => {
    const user = userEvent.setup();
    render(<AwardSearch homeAirport="LAX" onCreateAlert={vi.fn()} />);
    const econBtn = await waitFor(() => screen.getByRole('button', { name: 'Economy' }));
    await user.click(econBtn);
    const alertBtn = screen.getByTitle(/create an alert/i);
    expect(alertBtn).not.toBeDisabled();
  });

  it('passes single cabin key when single cabin is selected', async () => {
    const onCreateAlert = vi.fn();
    const user = userEvent.setup();
    render(<AwardSearch homeAirport="LAX" onCreateAlert={onCreateAlert} />);
    const alertBtn = await waitFor(() => screen.getByTitle(/create an alert/i));
    await user.click(alertBtn);
    expect(onCreateAlert).toHaveBeenCalledTimes(1);
    expect(onCreateAlert.mock.calls[0][0].cabin).toBe('J');
  });

  it('passes comma-separated cabins when multiple cabins are selected', async () => {
    const onCreateAlert = vi.fn();
    const user = userEvent.setup();
    render(<AwardSearch homeAirport="LAX" onCreateAlert={onCreateAlert} />);
    const econBtn = await waitFor(() => screen.getByRole('button', { name: 'Economy' }));
    await user.click(econBtn);
    const alertBtn = screen.getByTitle(/create an alert/i);
    await user.click(alertBtn);
    expect(onCreateAlert).toHaveBeenCalledTimes(1);
    expect(onCreateAlert.mock.calls[0][0].cabin).toBe('J,Y');
  });
});

// ── Result flattening and cabin labels ────────────────────────────────────────

describe('Multi-cabin selection — result flattening', () => {
  it('shows both Business and Economy results from one dual-cabin row', async () => {
    global.fetch = mockFetch([DUAL_CABIN_ROW]);
    const user = userEvent.setup();
    render(<AwardSearch homeAirport="LAX" />);

    // Select J + Y
    const econBtn = await waitFor(() => screen.getByRole('button', { name: 'Economy' }));
    await user.click(econBtn);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    // Both miles values appear (in cards and table — use queryAll to avoid multi-match errors)
    await waitFor(() => expect(screen.queryAllByText('70k').length).toBeGreaterThan(0));
    expect(screen.queryAllByText('40k').length).toBeGreaterThan(0);
  });

  it('shows only the matching cabin when the other cabin is unavailable', async () => {
    global.fetch = mockFetch([J_ONLY_ROW]);
    const user = userEvent.setup();
    render(<AwardSearch homeAirport="LAX" />);

    const econBtn = await waitFor(() => screen.getByRole('button', { name: 'Economy' }));
    await user.click(econBtn);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.queryAllByText('70k').length).toBeGreaterThan(0));
    expect(screen.queryAllByText('40k')).toHaveLength(0);
  });

  it('shows cabin labels in the results table', async () => {
    global.fetch = mockFetch([DUAL_CABIN_ROW]);
    const user = userEvent.setup();
    render(<AwardSearch homeAirport="LAX" />);

    const econBtn = await waitFor(() => screen.getByRole('button', { name: 'Economy' }));
    await user.click(econBtn);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    // Table should have a Cabin column header
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Cabin' })).toBeInTheDocument());

    // The table shows cabin label cells for both cabins
    const table = screen.getByRole('table');
    expect(within(table).getByText('Business')).toBeInTheDocument();
    expect(within(table).getByText('Economy')).toBeInTheDocument();
  });
});

// ── Sorting across mixed cabins ───────────────────────────────────────────────

describe('Multi-cabin selection — sorting', () => {
  it('sorts mixed-cabin results by each entry\'s own miles value', async () => {
    const cheapY = { ...DUAL_CABIN_ROW, YMileageCostRaw: 30000 }; // 30k Y < 70k J
    global.fetch = mockFetch([cheapY]);
    const user = userEvent.setup();
    render(<AwardSearch homeAirport="LAX" />);

    const econBtn = await waitFor(() => screen.getByRole('button', { name: 'Economy' }));
    await user.click(econBtn);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.queryAllByText('30k').length).toBeGreaterThan(0));

    const table = screen.getByRole('table');
    const rows  = within(table).getAllByRole('row');
    // First data row (index 1, after header) should be the cheaper 30k Economy entry
    expect(within(rows[1]).getByText('30k')).toBeInTheDocument();
    expect(within(rows[2]).getByText('70k')).toBeInTheDocument();
  });
});

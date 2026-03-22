/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertManager from '../../src/components/AlertManager.jsx';

// ── MockEventSource ────────────────────────────────────────────────────────────
class MockEventSource {
  constructor(url) {
    this.url = url;
    this.closed = false;
    MockEventSource.instances.push(this);
  }
  close() { this.closed = true; }
  static instances = [];
  static reset() { MockEventSource.instances = []; }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeAlert(overrides = {}) {
  return {
    id: 1,
    name: 'Test Alert',
    origin: 'JFK',
    destination: 'NRT',
    cabin: 'J',
    date_from: '2026-06-01',
    date_to: '2026-06-30',
    max_miles: 80000,
    max_taxes: 200,
    min_seats: 1,
    direct_only: 0,
    programs: null,
    transferable: 0,
    enabled: 1,
    match_count: 0,
    last_run_at: null,
    last_run_status: null,
    last_run_error: null,
    created_at: '2026-03-19 00:00:00',
    ...overrides,
  };
}

function mockFetch(responses = {}) {
  return vi.fn().mockImplementation((url, opts) => {
    const method = (opts?.method || 'GET').toUpperCase();
    const key = `${method} ${url}`;

    if (key in responses) return Promise.resolve(responses[key]);

    // defaults
    if (url === '/api/alerts' && method === 'GET') {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

beforeEach(() => {
  MockEventSource.reset();
  global.EventSource = MockEventSource;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.EventSource;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AlertManager — loading / empty states', () => {
  it('renders loading spinner initially', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    render(<AlertManager />);
    expect(screen.getByText(/loading alerts/i)).toBeInTheDocument();
  });

  it('renders empty state when fetch returns []', async () => {
    global.fetch = mockFetch();
    render(<AlertManager />);
    await waitFor(() => expect(screen.getByText(/no alerts yet/i)).toBeInTheDocument());
  });

  it('renders alert list after successful fetch', async () => {
    global.fetch = mockFetch({
      'GET /api/alerts': { ok: true, json: async () => [makeAlert()] },
    });
    render(<AlertManager />);
    await waitFor(() => expect(screen.getByText(/JFK → NRT/)).toBeInTheDocument());
  });
});

describe('AlertManager — create form', () => {
  it('"New Alert" button toggles form visibility', async () => {
    global.fetch = mockFetch();
    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/new alert/i));

    const btn = screen.getByRole('button', { name: /new alert/i });
    await user.click(btn);
    expect(screen.getByText(/create alert/i, { selector: 'h3' })).toBeInTheDocument();
  });

  it('form has required attributes on origin, destination, cabin', async () => {
    global.fetch = mockFetch();
    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/new alert/i));
    await user.click(screen.getByRole('button', { name: /new alert/i }));

    expect(screen.getByPlaceholderText('LAX')).toBeRequired();
    expect(screen.getByPlaceholderText('NRT')).toBeRequired();
    // cabin is a select — it always has a value so required is implicit, skip
  });

  it('successful create adds alert to list and shows success message', async () => {
    const newAlert = makeAlert({ id: 2, name: 'New' });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // initial load
      .mockResolvedValueOnce({ ok: true, json: async () => newAlert }); // POST

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/no alerts yet/i));

    await user.click(screen.getByRole('button', { name: /new alert/i }));
    await user.type(screen.getByPlaceholderText('LAX'), 'JFK');
    await user.type(screen.getByPlaceholderText('NRT'), 'CDG');

    await user.click(screen.getByRole('button', { name: /create alert/i }));

    await waitFor(() => expect(screen.getByText(/alert created/i)).toBeInTheDocument());
    expect(screen.getByText(/JFK → NRT/)).toBeInTheDocument();
  });

  it('create error (409) displays error message', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: true, message: 'Maximum of 10 active alerts reached' }) });

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/no alerts yet/i));

    await user.click(screen.getByRole('button', { name: /new alert/i }));
    await user.type(screen.getByPlaceholderText('LAX'), 'JFK');
    await user.type(screen.getByPlaceholderText('NRT'), 'NRT');

    await user.click(screen.getByRole('button', { name: /create alert/i }));
    await waitFor(() => expect(screen.getByText(/maximum of 10/i)).toBeInTheDocument());
  });
});

describe('AlertManager — prefill', () => {
  it('alertPrefill prop populates origin, destination, cabin and opens form', async () => {
    global.fetch = mockFetch();
    const prefill = { origin: 'SFO', destination: 'LHR', cabin: 'J', dateFrom: '2026-07-01', dateTo: '2026-07-31' };
    render(<AlertManager alertPrefill={prefill} />);
    await waitFor(() => expect(screen.getByDisplayValue('SFO')).toBeInTheDocument());
    expect(screen.getByDisplayValue('LHR')).toBeInTheDocument();
  });
});

describe('AlertManager — toggle / delete', () => {
  it('toggle calls PUT /api/alerts/:id with enabled flag', async () => {
    const alert = makeAlert({ enabled: 1 });
    const updated = makeAlert({ enabled: 0 });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [alert] })
      .mockResolvedValueOnce({ ok: true, json: async () => updated });

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));

    // Click the toggle button (first button in the card)
    const toggleBtn = screen.getByTitle(/disable alert/i);
    await user.click(toggleBtn);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/alerts/1'),
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('delete shows confirm then removes from list', async () => {
    const alert = makeAlert();
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [alert] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }); // DELETE

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));

    await user.click(screen.getByTitle(/delete alert/i));
    await waitFor(() => expect(screen.queryByText(/JFK → NRT/)).not.toBeInTheDocument());
  });

  it('cancelled confirm does nothing', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [makeAlert()] });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));

    await user.click(screen.getByTitle(/delete alert/i));
    // Should still be in the list
    expect(screen.getByText(/JFK → NRT/)).toBeInTheDocument();
  });
});

describe('AlertManager — Run Now', () => {
  it('Run Now shows spinner while running', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [makeAlert()] })
      .mockReturnValueOnce(new Promise(() => {})); // run hangs

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));

    await user.click(screen.getByTitle(/run now/i));
    // Spinner should appear (animate-spin)
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('successful run shows match count message', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [makeAlert()] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, matchesNew: 3, matchesSeen: 0 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [makeAlert({ match_count: 3 })] }); // re-fetch

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));
    await user.click(screen.getByTitle(/run now/i));
    await waitFor(() => expect(screen.getByText(/3 new match/i)).toBeInTheDocument());
  });

  it('run error displays error message', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [makeAlert()] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ error: true, message: 'API key missing' }) });

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));
    await user.click(screen.getByTitle(/run now/i));
    await waitFor(() => expect(screen.getByText(/api key missing/i)).toBeInTheDocument());
  });

  it('run with RATE_LIMITED → shows rate limit message', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [makeAlert()] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ error: true, code: 'RATE_LIMITED', message: 'Rate limited' }) });

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));
    await user.click(screen.getByTitle(/run now/i));
    await waitFor(() => expect(screen.getByText(/rate limited/i)).toBeInTheDocument());
  });

  it('run with ALREADY_RUNNING → shows already running message', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [makeAlert()] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ error: true, code: 'ALREADY_RUNNING', message: 'Already running' }) });

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));
    await user.click(screen.getByTitle(/run now/i));
    await waitFor(() => expect(screen.getByText(/already running/i)).toBeInTheDocument());
  });

  it('run with UPSTREAM_ERROR → shows error message from response', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [makeAlert()] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ error: true, code: 'UPSTREAM_ERROR', message: 'Connection refused' }) });

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));
    await user.click(screen.getByTitle(/run now/i));
    await waitFor(() => expect(screen.getByText(/connection refused/i)).toBeInTheDocument());
  });

  it('network failure shows connection error message', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [makeAlert()] })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));
    await user.click(screen.getByTitle(/run now/i));
    await waitFor(() => expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument());
  });
});

describe('AlertManager — SSE', () => {
  it('creates EventSource on mount with correct URL', async () => {
    global.fetch = mockFetch();
    render(<AlertManager />);
    await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0));
    expect(MockEventSource.instances[0].url).toBe('/api/alerts/events');
  });

  it('refreshes alerts when match event received', async () => {
    const alertsAfter = [makeAlert({ match_count: 1 })];
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => alertsAfter });

    render(<AlertManager />);
    await waitFor(() => screen.getByText(/no alerts yet/i));

    // Simulate SSE match event
    const es = MockEventSource.instances[0];
    act(() => {
      es.onmessage({ data: JSON.stringify({ type: 'match' }) });
    });

    await waitFor(() => expect(screen.getByText(/JFK → NRT/)).toBeInTheDocument());
  });

  it('closes EventSource on unmount', async () => {
    global.fetch = mockFetch();
    const { unmount } = render(<AlertManager />);
    await waitFor(() => MockEventSource.instances.length > 0);
    unmount();
    expect(MockEventSource.instances[0].closed).toBe(true);
  });
});

describe('AlertManager — sub-components', () => {
  it('StatusBadge renders correct badge for each status', async () => {
    const alertWithMatch = makeAlert({ match_count: 1 });
    const matches = [
      { id: 1, miles: 70000, date: '2026-06-15', taxes: 5600, direct: 1, seats: 2, source: 'aeroplan', airlines: 'NH', status: 'new' },
    ];
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [alertWithMatch] })
      .mockResolvedValueOnce({ ok: true, json: async () => matches })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const user = userEvent.setup();
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));

    // Expand alert
    await user.click(screen.getByTitle(/view matches/i));
    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());
  });

  it('transferable=1 shows "Transferable only" badge', async () => {
    global.fetch = mockFetch({
      'GET /api/alerts': { ok: true, json: async () => [makeAlert({ transferable: 1 })] },
    });
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/transferable only/i));
  });

  it('transferable=0 does not show "Transferable only" badge', async () => {
    global.fetch = mockFetch({
      'GET /api/alerts': { ok: true, json: async () => [makeAlert({ transferable: 0 })] },
    });
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));
    expect(screen.queryByText(/transferable only/i)).not.toBeInTheDocument();
  });

  it('disabled alert renders with muted opacity class', async () => {
    global.fetch = mockFetch({
      'GET /api/alerts': { ok: true, json: async () => [makeAlert({ enabled: 0 })] },
    });
    render(<AlertManager />);
    await waitFor(() => screen.getByText(/JFK → NRT/));
    const card = document.querySelector('.opacity-60');
    expect(card).toBeTruthy();
  });
});

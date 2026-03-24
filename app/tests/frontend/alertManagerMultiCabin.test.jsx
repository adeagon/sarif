/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertManager from '../../src/components/AlertManager.jsx';

function mockFetch() {
  return vi.fn().mockImplementation((url) => {
    const u = String(url);
    if (u.includes('/api/alerts') && !u.includes('/events')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    // SSE — return a never-resolving stub via EventSource mock
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

// Minimal EventSource stub (AlertManager opens one on mount)
class FakeEventSource {
  constructor() { this.onmessage = null; }
  close() {}
}

beforeEach(() => {
  global.fetch = mockFetch();
  global.EventSource = FakeEventSource;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.fetch;
  delete global.EventSource;
});

describe('AlertManager — multi-cabin form UI', () => {
  it('shows all four cabin toggle buttons in the form', async () => {
    const user = userEvent.setup();
    render(<AlertManager />);
    await user.click(await waitFor(() => screen.getByText('New Alert')));
    await waitFor(() => screen.getByText('Business'));
    expect(screen.getByText('Business')).toBeInTheDocument();
    expect(screen.getByText('Premium Eco')).toBeInTheDocument();
    expect(screen.getByText('Economy')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
  });

  it('Business is selected by default', async () => {
    const user = userEvent.setup();
    render(<AlertManager />);
    await user.click(await waitFor(() => screen.getByText('New Alert')));
    const bizBtn = await waitFor(() => screen.getByRole('button', { name: 'Business' }));
    expect(bizBtn.className).toContain('text-blue-300');
  });

  it('can add a second cabin', async () => {
    const user = userEvent.setup();
    render(<AlertManager />);
    await user.click(await waitFor(() => screen.getByText('New Alert')));
    const econBtn = await waitFor(() => screen.getByRole('button', { name: 'Economy' }));
    await user.click(econBtn);
    expect(econBtn.className).toContain('text-blue-300');
    expect(screen.getByRole('button', { name: 'Business' }).className).toContain('text-blue-300');
  });

  it('cannot deselect the last remaining cabin', async () => {
    const user = userEvent.setup();
    render(<AlertManager />);
    await user.click(await waitFor(() => screen.getByText('New Alert')));
    const bizBtn = await waitFor(() => screen.getByRole('button', { name: 'Business' }));
    await user.click(bizBtn); // try to deselect — should stay selected
    expect(bizBtn.className).toContain('text-blue-300');
  });

  it('can deselect a cabin when another is still selected', async () => {
    const user = userEvent.setup();
    render(<AlertManager />);
    await user.click(await waitFor(() => screen.getByText('New Alert')));
    const econBtn = await waitFor(() => screen.getByRole('button', { name: 'Economy' }));
    const bizBtn  = screen.getByRole('button', { name: 'Business' });
    await user.click(econBtn);  // add Economy → J,Y
    await user.click(bizBtn);   // remove Business → Y only
    expect(bizBtn.className).not.toContain('text-blue-300');
    expect(econBtn.className).toContain('text-blue-300');
  });
});

describe('AlertManager — CabinLabel', () => {
  it('renders a multi-cabin alert card with readable labels', async () => {
    // Pre-seed fetch to return a J,Y alert
    global.fetch = vi.fn().mockImplementation((url) => {
      const u = String(url);
      if (u === '/api/alerts') {
        return Promise.resolve({
          ok: true,
          json: async () => [{
            id: 1, origin: 'JFK', destination: 'NRT', cabin: 'J,Y',
            enabled: 1, match_count: 0, name: '',
          }],
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    render(<AlertManager />);
    await waitFor(() => expect(screen.getByText('Business, Economy')).toBeInTheDocument());
  });

  it('renders a single-cabin alert card normally', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      const u = String(url);
      if (u === '/api/alerts') {
        return Promise.resolve({
          ok: true,
          json: async () => [{
            id: 1, origin: 'JFK', destination: 'NRT', cabin: 'J',
            enabled: 1, match_count: 0, name: '',
          }],
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    render(<AlertManager />);
    await waitFor(() => expect(screen.getByText('Business')).toBeInTheDocument());
  });
});

describe('AlertManager — prefill from AwardSearch', () => {
  it('pre-fills multi-cabin selection from alertPrefill prop', async () => {
    render(<AlertManager alertPrefill={{ origin: 'LAX', destination: 'HND', cabin: 'J,Y' }} />);
    // Form should open automatically with J and Y both selected
    await waitFor(() => screen.getByRole('button', { name: 'Business' }));
    expect(screen.getByRole('button', { name: 'Business' }).className).toContain('text-blue-300');
    expect(screen.getByRole('button', { name: 'Economy' }).className).toContain('text-blue-300');
  });

  it('pre-fills single-cabin selection from alertPrefill prop', async () => {
    render(<AlertManager alertPrefill={{ origin: 'LAX', destination: 'HND', cabin: 'J' }} />);
    await waitFor(() => screen.getByRole('button', { name: 'Business' }));
    expect(screen.getByRole('button', { name: 'Business' }).className).toContain('text-blue-300');
    expect(screen.getByRole('button', { name: 'Economy' }).className).not.toContain('text-blue-300');
  });
});

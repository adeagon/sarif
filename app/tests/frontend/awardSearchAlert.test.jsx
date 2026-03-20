/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AwardSearch from '../../src/components/AwardSearch.jsx';

// Minimal fetch mock — AwardSearch fetches on form submit but we just need render
function mockFetchEmpty() {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
}

beforeEach(() => {
  global.fetch = mockFetchEmpty();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.fetch;
});

describe('AwardSearch — Alert button', () => {
  it('renders Bell/Alert button when onCreateAlert prop is provided', async () => {
    const onCreateAlert = vi.fn();
    render(<AwardSearch onCreateAlert={onCreateAlert} />);
    // The alert button should be visible
    await waitFor(() => expect(screen.getByTitle(/create an alert/i)).toBeInTheDocument());
  });

  it('does not render button when onCreateAlert is not provided', async () => {
    render(<AwardSearch />);
    await waitFor(() => expect(screen.queryByTitle(/create an alert/i)).not.toBeInTheDocument());
  });

  it('click calls onCreateAlert with origin, destination, cabin, dateFrom, dateTo', async () => {
    const onCreateAlert = vi.fn();
    const user = userEvent.setup();
    render(<AwardSearch onCreateAlert={onCreateAlert} homeAirport="JFK" />);

    await waitFor(() => screen.getByTitle(/create an alert/i));
    await user.click(screen.getByTitle(/create an alert/i));

    expect(onCreateAlert).toHaveBeenCalledTimes(1);
    const arg = onCreateAlert.mock.calls[0][0];
    expect(arg).toMatchObject({
      origin: expect.any(String),
      destination: expect.any(String),
      cabin: expect.any(String),
    });
    expect('dateFrom' in arg).toBe(true);
    expect('dateTo' in arg).toBe(true);
  });
});

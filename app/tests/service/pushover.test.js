import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendNotification, isConfigured } from '../../server/services/pushover.js';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('isConfigured()', () => {
  it('returns false when env vars are missing', () => {
    expect(isConfigured()).toBe(false);
  });

  it('returns false when only TOKEN is set', () => {
    vi.stubEnv('PUSHOVER_TOKEN', 'tok');
    expect(isConfigured()).toBe(false);
  });

  it('returns false when only USER_KEY is set', () => {
    vi.stubEnv('PUSHOVER_USER_KEY', 'usr');
    expect(isConfigured()).toBe(false);
  });

  it('returns true when both env vars are set', () => {
    vi.stubEnv('PUSHOVER_TOKEN', 'tok');
    vi.stubEnv('PUSHOVER_USER_KEY', 'usr');
    expect(isConfigured()).toBe(true);
  });
});

describe('sendNotification()', () => {
  it('returns not_configured when env vars are missing, does not call fetch', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendNotification({ title: 'Test', message: 'Hello' });

    expect(result).toEqual({ ok: false, reason: 'not_configured' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('POSTs to Pushover API with correct payload on success', async () => {
    vi.stubEnv('PUSHOVER_TOKEN', 'test-token');
    vi.stubEnv('PUSHOVER_USER_KEY', 'test-user');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const result = await sendNotification({ title: 'JFK → NRT', message: 'Jun 15 · Aeroplan · 70k + $56 · 2 seats' });

    expect(result).toEqual({ ok: true });

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.pushover.net/1/messages.json');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(init.body);
    expect(body.get('token')).toBe('test-token');
    expect(body.get('user')).toBe('test-user');
    expect(body.get('title')).toBe('JFK → NRT');
    expect(body.get('message')).toBe('Jun 15 · Aeroplan · 70k + $56 · 2 seats');
  });

  it('includes optional url and url_title when provided', async () => {
    vi.stubEnv('PUSHOVER_TOKEN', 'tok');
    vi.stubEnv('PUSHOVER_USER_KEY', 'usr');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    await sendNotification({ title: 'T', message: 'M', url: 'http://example.com', urlTitle: 'Book' });

    const body = new URLSearchParams(global.fetch.mock.calls[0][1].body);
    expect(body.get('url')).toBe('http://example.com');
    expect(body.get('url_title')).toBe('Book');
  });

  it('returns ok:false on non-ok HTTP response, does not throw', async () => {
    vi.stubEnv('PUSHOVER_TOKEN', 'tok');
    vi.stubEnv('PUSHOVER_USER_KEY', 'usr');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:     false,
      status: 400,
      text:   async () => 'bad request',
    }));

    const result = await sendNotification({ title: 'T', message: 'M' });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('http_400');
  });

  it('returns ok:false on network error, does not throw', async () => {
    vi.stubEnv('PUSHOVER_TOKEN', 'tok');
    vi.stubEnv('PUSHOVER_USER_KEY', 'usr');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const result = await sendNotification({ title: 'T', message: 'M' });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('ECONNREFUSED');
  });
});

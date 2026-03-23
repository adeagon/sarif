const API_URL = 'https://api.pushover.net/1/messages.json';

export function isConfigured() {
  return !!(process.env.PUSHOVER_TOKEN && process.env.PUSHOVER_USER_KEY);
}

/**
 * Send a push notification via Pushover.
 * Returns { ok: true } on success, { ok: false, reason } on failure or when not configured.
 * Never throws — notification failures must not block alert evaluation.
 *
 * @param {{ title: string, message: string, url?: string, urlTitle?: string, priority?: number }} params
 */
export async function sendNotification({ title, message, url, urlTitle, priority } = {}) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };

  const body = new URLSearchParams({
    token:   process.env.PUSHOVER_TOKEN,
    user:    process.env.PUSHOVER_USER_KEY,
    title,
    message,
  });
  if (url)             body.set('url', url);
  if (urlTitle)        body.set('url_title', urlTitle);
  if (priority != null) body.set('priority', String(priority));

  try {
    const res = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[pushover] API error ${res.status}: ${text.slice(0, 120)}`);
      return { ok: false, reason: `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[pushover] send failed:', err.message);
    return { ok: false, reason: err.message };
  }
}

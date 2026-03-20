/** SSE client management for real-time alert match push */

const clients = new Set();

/**
 * Register the SSE endpoint on an Express router.
 * @param {import('express').Router} router
 */
export function setupSSE(router) {
  router.get('/events', (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send a comment to confirm the connection
    res.write(': connected\n\n');

    clients.add(res);

    // Keep-alive ping every 25 s
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
  });
}

/**
 * Push an event to all connected SSE clients.
 * @param {{ type: string, [key: string]: unknown }} data
 */
export function broadcastSSE(data) {
  if (clients.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

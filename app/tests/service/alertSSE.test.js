import { describe, it, expect, beforeEach } from 'vitest';

// We need to import after resetting — use dynamic imports inside tests
// so each test gets a fresh module isn't possible with static imports.
// Instead we reset via _resetClients.
import { setupSSE, broadcastSSE, _resetClients } from '../../server/services/alertSSE.js';
import express from 'express';

function makeRes() {
  const written = [];
  return {
    written,
    setHeader: () => {},
    flushHeaders: () => {},
    write: (chunk) => written.push(chunk),
    on: () => {},
  };
}

function makeReq(onClose = null) {
  return {
    on: (event, cb) => { if (event === 'close' && onClose) onClose(cb); },
  };
}

beforeEach(() => {
  _resetClients();
});

describe('alertSSE', () => {
  it('setupSSE registers GET /events endpoint with SSE headers', () => {
    const app = express();
    const router = express.Router();
    setupSSE(router);
    app.use('/api/alerts', router);

    // Check that the router has a layer for GET /events
    const layers = router.stack || [];
    const eventsLayer = layers.find(l => l.route && l.route.path === '/events');
    expect(eventsLayer).toBeTruthy();
  });

  it('broadcastSSE sends JSON payload to all connected clients', () => {
    const res1 = makeRes();
    const res2 = makeRes();
    // Add clients directly by using setupSSE logic — simulate adding to set
    // by calling the route handler
    const router = express.Router();
    setupSSE(router);

    // Manually trigger the route handler to register clients
    const handler = router.stack.find(l => l.route?.path === '/events').route.stack[0].handle;
    handler(makeReq(), res1);
    handler(makeReq(), res2);

    broadcastSSE({ type: 'test', value: 42 });

    expect(res1.written.some(w => w.includes('"type":"test"'))).toBe(true);
    expect(res2.written.some(w => w.includes('"type":"test"'))).toBe(true);
  });

  it('broadcastSSE is a no-op when no clients connected', () => {
    expect(() => broadcastSSE({ type: 'test' })).not.toThrow();
  });

  it('client disconnect removes from set', () => {
    let closeCb;
    const res = makeRes();
    const router = express.Router();
    setupSSE(router);
    const handler = router.stack.find(l => l.route?.path === '/events').route.stack[0].handle;
    handler(makeReq((cb) => { closeCb = cb; }), res);

    // Trigger disconnect
    closeCb();

    // After disconnect, broadcast should not write to this res
    const before = res.written.length;
    broadcastSSE({ type: 'after-disconnect' });
    expect(res.written.length).toBe(before);
  });

  it('_resetClients clears all clients', () => {
    const res = makeRes();
    const router = express.Router();
    setupSSE(router);
    const handler = router.stack.find(l => l.route?.path === '/events').route.stack[0].handle;
    handler(makeReq(), res);

    _resetClients();
    broadcastSSE({ type: 'after-reset' });
    // Nothing written after reset
    const dataWrites = res.written.filter(w => w.startsWith('data:'));
    expect(dataWrites).toHaveLength(0);
  });
});

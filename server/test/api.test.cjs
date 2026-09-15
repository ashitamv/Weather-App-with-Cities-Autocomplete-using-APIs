const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../app.cjs');
const { createDemoProvider } = require('../demo.cjs');
const { ApiError } = require('../errors.cjs');

async function start(t, options = {}) {
  const server = createApp({ provider: createDemoProvider(), logger: () => {}, ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return (path, options) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
}

test('city search and weather work over HTTP, returning demo labels, cache status and request IDs', async (t) => {
  const request = await start(t);
  const cities = await request('/api/cities?q=Hy');
  assert.equal(cities.status, 200);
  assert.equal((await cities.json()).cities[0].label, 'Hyderabad, IN');
  const first = await request('/api/weather?lat=17.385&lon=78.4867');
  const second = await request('/api/weather?lat=17.3850&lon=78.48670');
  assert.equal(first.headers.get('x-cache'), 'miss');
  assert.equal(second.headers.get('x-cache'), 'hit');
  assert.ok(first.headers.get('x-request-id'));
  assert.equal(first.headers.get('cache-control'), 'no-store');
  const body = await first.json();
  assert.equal(body.meta.mode, 'demo');
  assert.ok(body.weather.forecast.length >= 5);
});

test('invalid and duplicate inputs fail before calling providers', async (t) => {
  let calls = 0;
  const request = await start(t, { provider: { mode: 'test', weather: () => calls++, cities: () => calls++ } });
  for (const query of ['lat=91&lon=0', 'lat=&lon=0', 'lat=0&lon=181', 'lat=NaN&lon=0', 'lat=0&lat=1&lon=0', 'lon=0', 'lat=0x12&lon=0']) {
    assert.equal((await request(`/api/weather?${query}`)).status, 400, query);
  }
  for (const query of ['q=x', 'q=', 'q=Hy&q=Lo', `q=${'a'.repeat(81)}`, 'q=%00Hy']) {
    assert.equal((await request(`/api/cities?${query}`)).status, 400, query);
  }
  assert.equal(calls, 0);
});

test('city-cache keys normalize case and whitespace', async (t) => {
  const request = await start(t);
  assert.equal((await request('/api/cities?q=Hy')).headers.get('x-cache'), 'miss');
  assert.equal((await request('/api/cities?q=%20hy%20')).headers.get('x-cache'), 'hit');
});

test('client rate limit returns Retry-After, ignores spoofed forwarding headers and resets', async (t) => {
  let time = 0;
  const request = await start(t, { rateLimit: 2, now: () => time });
  await request('/api/cities?q=Hy');
  await request('/api/cities?q=Hy');
  const blocked = await request('/api/cities?q=Hy', { headers: { 'x-forwarded-for': '203.0.113.10' } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal((await request('/api/health')).status, 200);
  time = 60000;
  assert.equal((await request('/api/cities?q=Hy')).status, 200);
});

test('temporary provider failure returns stale metadata until the maximum age is reached', async (t) => {
  let time = 0;
  let fail = false;
  const demo = createDemoProvider();
  const request = await start(t, {
    now: () => time, weatherTtlMs: 10, weatherMaxAgeMs: 100,
    provider: { mode: 'test', weather: async (...args) => {
      if (fail) throw new ApiError(502, 'OUTAGE', 'Provider unavailable', { transient: true });
      return demo.weather(...args);
    } },
  });
  await request('/api/weather?lat=0&lon=0');
  fail = true;
  time = 10;
  const stale = await request('/api/weather?lat=0&lon=0');
  assert.equal(stale.headers.get('x-cache'), 'stale');
  assert.equal((await stale.json()).meta.stale, true);
  time = 100;
  assert.equal((await request('/api/weather?lat=0&lon=0')).status, 502);
});

test('unexpected errors and unknown API routes return safe JSON without secrets in logs', async (t) => {
  const logs = [];
  const request = await start(t, {
    logger: (line) => logs.push(line),
    provider: { mode: 'test', weather: async () => { throw new Error('secret-diagnostic'); } },
  });
  const failed = await request('/api/weather?lat=0&lon=0&extra=secret-query');
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).error.code, 'INTERNAL_ERROR');
  const unknown = await request('/api/missing');
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, 'NOT_FOUND');
  assert.equal(logs.join('').includes('secret'), false);
});

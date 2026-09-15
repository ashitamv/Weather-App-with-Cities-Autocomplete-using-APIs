const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProvider } = require('../provider.cjs');
const { normalizeWeather } = require('../forecast.cjs');
const { sample } = require('../demo.cjs');
const timestamp = (date) => Date.parse(date) / 1000;

test('forecast groups real city-local dates, aggregates ranges and selects the sample nearest noon', () => {
  const early = sample(timestamp('2026-09-15T00:00:00Z'), 0);
  const noon = sample(timestamp('2026-09-15T06:00:00Z'), 1);
  const nextDay = sample(timestamp('2026-09-15T21:00:00Z'), 2);
  const result = normalizeWeather(early, { city: { timezone: 19800 }, list: [nextDay, noon, early] });
  assert.deepEqual(result.forecast.map((day) => day.date), ['2026-09-15', '2026-09-16']);
  assert.equal(result.forecast[0].slots, 2);
  assert.equal(result.forecast[0].sampleTime, '11:30');
  assert.equal(result.forecast[0].min, Math.min(early.main.temp_min, noon.main.temp_min));
  assert.equal(result.forecast[0].max, Math.max(early.main.temp_max, noon.main.temp_max));
});

test('negative UTC offsets group an early UTC reading into the previous local date', () => {
  const current = sample(timestamp('2026-09-15T03:00:00Z'));
  const result = normalizeWeather(current, { city: { timezone: -28800 }, list: [current] });
  assert.equal(result.forecast[0].date, '2026-09-14');
  assert.equal(result.forecast[0].sampleTime, '19:00');
});

test('incomplete provider responses are rejected and unknown icons use a local fallback', async () => {
  assert.throws(() => normalizeWeather({}, { list: [] }), { code: 'INVALID_UPSTREAM_RESPONSE' });
  const current = sample(timestamp('2026-09-15T03:00:00Z'));
  assert.throws(() => normalizeWeather(current, { city: { timezone: 0 }, list: [null] }), { code: 'INVALID_UPSTREAM_RESPONSE' });
  const provider = createProvider({ geoKey: 'test', fetchImpl: async () => Response.json({ data: [null] }) });
  await assert.rejects(provider.cities('Hy'), { code: 'INVALID_UPSTREAM_RESPONSE' });
  current.weather[0].icon = '../../private';
  const result = normalizeWeather(current, { city: { timezone: 0 }, list: [current] });
  assert.equal(result.current.weather[0].icon, 'unknown');
});

test('both weather endpoints request metric units and keys remain in server requests', async () => {
  const calls = [];
  const current = sample(timestamp('2026-09-15T03:00:00Z'));
  const provider = createProvider({ weatherKey: 'test-weather-key', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.pathname.endsWith('/forecast') ? { city: { timezone: 0 }, list: [current] } : current);
  } });
  const result = await provider.weather(12.9716, 77.5946);
  assert.equal(calls.length, 2);
  for (const { url, options } of calls) {
    assert.equal(url.origin, 'https://api.openweathermap.org');
    assert.equal(url.searchParams.get('units'), 'metric');
    assert.equal(url.searchParams.get('appid'), 'test-weather-key');
    assert.equal(options.redirect, 'error');
  }
  assert.equal(JSON.stringify(result).includes('test-weather-key'), false);
});

test('city queries are URL encoded and provider headers stay server-side', async () => {
  const provider = createProvider({ geoKey: 'test-geo-key', fetchImpl: async (url, options) => {
    assert.equal(url.searchParams.get('namePrefix'), 'São & City');
    assert.equal(options.headers['X-RapidAPI-Key'], 'test-geo-key');
    return Response.json({ data: [{ name: 'São & City', regionCode: 'SP', countryCode: 'BR', latitude: -23.55, longitude: -46.63 }] });
  } });
  assert.deepEqual(await provider.cities('São & City'), [{ label: 'São & City, SP, BR', value: '-23.55 -46.63' }]);
});

test('provider timeouts abort the request and return a safe, retryable error', async () => {
  let aborted = false;
  const provider = createProvider({ geoKey: 'test', timeoutMs: 5, fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('private diagnostic')); }, { once: true });
  }) });
  await assert.rejects(provider.cities('Hy'), { status: 504, code: 'UPSTREAM_TIMEOUT', transient: true });
  assert.equal(aborted, true);
});

test('provider throttling respects a bounded cooldown without repeated upstream calls', async () => {
  let time = 0;
  let calls = 0;
  const provider = createProvider({ geoKey: 'test', now: () => time, fetchImpl: async () => {
    calls++;
    return calls === 1 ? new Response('quota', { status: 429, headers: { 'retry-after': '2' } }) : Response.json({ data: [] });
  } });
  await assert.rejects(provider.cities('Hy'), { status: 503, retryAfter: 2 });
  await assert.rejects(provider.cities('Lo'), { code: 'UPSTREAM_BUSY' });
  assert.equal(calls, 1);
  time = 2000;
  assert.deepEqual(await provider.cities('Lo'), []);
  assert.equal(calls, 2);
});

test('authentication failures do not expose upstream error bodies', async () => {
  const provider = createProvider({ geoKey: 'test', fetchImpl: async () => new Response('secret diagnostics', { status: 401 }) });
  await assert.rejects(provider.cities('Hy'), (error) => error.code === 'PROVIDER_CONFIGURATION' && !error.transient && !error.message.includes('secret'));
});

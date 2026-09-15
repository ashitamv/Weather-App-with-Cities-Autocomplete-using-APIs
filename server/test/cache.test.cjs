const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RequestCache } = require('../cache.cjs');
const { ApiError } = require('../errors.cjs');

test('fresh values avoid upstream calls and expired values are refreshed', async () => {
  let time = 0;
  let calls = 0;
  const cache = new RequestCache({ ttlMs: 10, now: () => time });
  const load = async () => ++calls;
  assert.equal((await cache.get('city', load)).cache, 'miss');
  time = 9;
  assert.equal((await cache.get('city', load)).data, 1);
  time = 10;
  assert.equal((await cache.get('city', load)).data, 2);
  assert.equal(calls, 2);
});

test('30 simultaneous misses share one upstream operation', async () => {
  let release;
  let calls = 0;
  const cache = new RequestCache({ ttlMs: 1000 });
  const loader = () => { calls++; return new Promise((resolve) => { release = resolve; }); };
  const requests = Array.from({ length: 30 }, () => cache.get('city', loader));
  release('forecast');
  const results = await Promise.all(requests);
  assert.equal(calls, 1);
  assert.equal(results.filter((result) => result.cache === 'coalesced').length, 29);
  assert.ok(results.every((result) => result.data === 'forecast'));
});

test('transient outages serve marked stale data with backoff, but never beyond the maximum age', async () => {
  let time = 0;
  let calls = 0;
  const cache = new RequestCache({ ttlMs: 10, maxAgeMs: 100, now: () => time });
  await cache.get('city', async () => 'forecast');
  const fail = async () => { calls++; throw new ApiError(502, 'OUTAGE', 'Unavailable', { transient: true }); };
  time = 10;
  const stale = await cache.get('city', fail);
  assert.equal(stale.cache, 'stale');
  assert.equal(stale.fetchedAt, 0);
  time = 50;
  assert.equal((await cache.get('city', fail)).cache, 'stale');
  assert.equal(calls, 1);
  time = 100;
  await assert.rejects(cache.get('city', fail), { code: 'OUTAGE' });
});

test('maximum stale age is checked after a slow failed refresh', async () => {
  let time = 0;
  const cache = new RequestCache({ ttlMs: 10, maxAgeMs: 100, now: () => time });
  await cache.get('city', async () => 'old');
  time = 95;
  await assert.rejects(cache.get('city', async () => {
    time = 101;
    throw new ApiError(504, 'TIMEOUT', 'Timeout', { transient: true });
  }), { code: 'TIMEOUT' });
});

test('configuration errors never fall back to stale data; failed loads can be retried', async () => {
  let time = 0;
  const cache = new RequestCache({ ttlMs: 10, maxAgeMs: 100, now: () => time });
  await cache.get('city', async () => 'old');
  time = 10;
  await assert.rejects(cache.get('city', async () => { throw new ApiError(503, 'CONFIG', 'Invalid key'); }), { code: 'CONFIG' });
  assert.equal((await cache.get('city', async () => 'new')).data, 'new');
});

test('bounded storage evicts the least recently used fresh entry', async () => {
  const cache = new RequestCache({ ttlMs: 1000, maxEntries: 2 });
  const load = async () => 'value';
  await cache.get('a', load);
  await cache.get('b', load);
  await cache.get('a', load);
  await cache.get('c', load);
  assert.equal((await cache.get('a', load)).cache, 'hit');
  assert.equal((await cache.get('b', load)).cache, 'miss');
});

test('in-flight limit bounds distinct work while still allowing request coalescing', async () => {
  const cache = new RequestCache({ ttlMs: 1000, maxPending: 1 });
  let release;
  const a = cache.get('a', () => new Promise((resolve) => { release = resolve; }));
  const joined = cache.get('a', async () => assert.fail('must share existing request'));
  await assert.rejects(cache.get('b', async () => 'other'), { code: 'SERVER_BUSY' });
  release('value');
  await Promise.all([a, joined]);
  assert.equal((await cache.get('b', async () => 'other')).data, 'other');
});

const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { createApp } = require('./app.cjs');
const { createProvider } = require('./provider.cjs');
const { sample } = require('./demo.cjs');

async function scenario(name, ttlMs, concurrency) {
  let upstreamCalls = 0;
  const timestamp = Math.floor(Date.now() / 1000);
  const provider = createProvider({ weatherKey: 'benchmark-placeholder', fetchImpl: async (url) => {
    upstreamCalls++;
    await delay(50);
    return Response.json(url.pathname.endsWith('/forecast') ? {
      city: { timezone: 19800 },
      list: Array.from({ length: 40 }, (_, index) => sample(timestamp + index * 10800, index)),
    } : sample(timestamp));
  } });
  const server = createApp({ provider, logger: () => {}, rateLimit: 10000, weatherTtlMs: ttlMs, weatherMaxAgeMs: ttlMs }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const durations = [];
  const statuses = {};
  let next = 0;
  try {
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (next++ < 30) {
        const start = performance.now();
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/weather?lat=17.385&lon=78.4867`);
        if (!response.ok) throw new Error(`Benchmark request failed: ${response.status}`);
        await response.json();
        durations.push(performance.now() - start);
        const cache = response.headers.get('x-cache');
        statuses[cache] = (statuses[cache] || 0) + 1;
      }
    }));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  durations.sort((a, b) => a - b);
  return { name, requests: durations.length, concurrency, upstreamCalls, cacheStatuses: statuses,
    medianMs: Number(durations[Math.ceil(durations.length * 0.5) - 1].toFixed(2)),
    p95Ms: Number(durations[Math.ceil(durations.length * 0.95) - 1].toFixed(2)) };
}

async function main() {
  const results = [];
  results.push(await scenario('No cache, sequential requests', 0, 1));
  results.push(await scenario('Cache enabled, sequential requests', 600000, 1));
  results.push(await scenario('Cache enabled, concurrent cold start', 600000, 30));
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version,
    environment: `${process.platform}/${process.arch}, loopback HTTP, synthetic provider with 50 ms delay per call`,
    scope: '30 requests for one location per scenario. No real provider, internet latency, production traffic, or distributed cache.', results }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });

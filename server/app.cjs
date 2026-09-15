const express = require('express');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { RequestCache } = require('./cache.cjs');
const { ApiError } = require('./errors.cjs');

function queryString(req, name) {
  if (typeof req.query[name] !== 'string') throw new ApiError(400, 'INVALID_QUERY', `Provide one ${name} parameter.`);
  return req.query[name].trim();
}

function coordinate(req, name, max) {
  const raw = queryString(req, name);
  const value = Number(raw);
  if (!raw || !/^-?\d+(\.\d+)?$/.test(raw) || !Number.isFinite(value) || Math.abs(value) > max) {
    throw new ApiError(400, 'INVALID_COORDINATES', `${name} must be a number between ${-max} and ${max}.`);
  }
  return Number(value.toFixed(4));
}

function createApp({ provider, now = Date.now, logger = console.log, rateLimit = 60, windowMs = 60000, weatherTtlMs = 600000, weatherMaxAgeMs = 1800000, staticDir = path.join(__dirname, '../build') }) {
  const app = express();
  const weatherCache = new RequestCache({ ttlMs: weatherTtlMs, maxAgeMs: weatherMaxAgeMs, now });
  const cityCache = new RequestCache({ ttlMs: 86400000, now });
  const clients = new Map();
  app.disable('x-powered-by');
  // Keep Express's default trust proxy=false. Forwarded headers are not identities.
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
    next();
  });
  app.use('/api', (req, res, next) => {
    const started = performance.now();
    const requestId = randomUUID();
    res.set({ 'X-Request-Id': requestId, 'Cache-Control': 'no-store' });
    res.on('finish', () => logger(JSON.stringify({ requestId, method: req.method, status: res.statusCode, durationMs: Math.round((performance.now() - started) * 100) / 100, cache: res.getHeader('X-Cache') || null })));
    next();
  });
  app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: provider.mode }));
  app.use('/api', (req, res, next) => {
    const clientId = req.ip;
    const time = now();
    let client = clients.get(clientId);
    if (!client || time >= client.resetAt) {
      if (clients.size >= 10000) {
        for (const [key, value] of clients) if (time >= value.resetAt) clients.delete(key);
        if (!clients.has(clientId) && clients.size >= 10000) throw new ApiError(503, 'SERVER_BUSY', 'The weather service is busy. Please try again shortly.', { retryAfter: 60 });
      }
      client = { count: 0, resetAt: time + windowMs };
      clients.set(clientId, client);
    }
    client.count += 1;
    if (client.count > rateLimit) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', { retryAfter: Math.max(1, Math.ceil((client.resetAt - time) / 1000)) });
    next();
  });
  function send(res, result, key) {
    res.set('X-Cache', result.cache);
    res.json({ [key]: result.data, meta: { mode: provider.mode, cache: result.cache, fetchedAt: new Date(result.fetchedAt).toISOString(), stale: result.cache === 'stale' } });
  }
  app.get('/api/cities', async (req, res) => {
    const query = queryString(req, 'q').normalize('NFC');
    if (query.length < 2 || query.length > 80 || /[\u0000-\u001f\u007f]/.test(query)) throw new ApiError(400, 'INVALID_QUERY', 'Enter a city name between 2 and 80 characters.');
    send(res, await cityCache.get(query.toLowerCase(), () => provider.cities(query)), 'cities');
  });
  app.get('/api/weather', async (req, res) => {
    const lat = coordinate(req, 'lat', 90);
    const lon = coordinate(req, 'lon', 180);
    send(res, await weatherCache.get(`${lat},${lon}`, () => provider.weather(lat, lon)), 'weather');
  });
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }));
  app.use(express.static(staticDir));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const known = error instanceof ApiError;
    if (known && error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    res.status(known ? error.status : 500).json({ error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : 'Something went wrong. Please try again.',
    } });
  });
  return app;
}

module.exports = { createApp };

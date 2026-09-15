const { ApiError } = require('./errors.cjs');
const { normalizeWeather } = require('./forecast.cjs');

function createProvider({ weatherKey, geoKey, fetchImpl = fetch, timeoutMs = 5000, now = Date.now }) {
  const cooldowns = new Map();

  async function readJson(url, headers = {}) {
    const cooldown = cooldowns.get(url.host) || 0;
    if (cooldown > now()) {
      throw new ApiError(503, 'UPSTREAM_BUSY', 'The data provider is busy. Please try again shortly.', { transient: true, retryAfter: Math.ceil((cooldown - now()) / 1000) });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { headers, signal: controller.signal, redirect: 'error' });
      if (!response.ok) {
        if (response.body) await response.body.cancel();
        if (response.status === 401 || response.status === 403) {
          throw new ApiError(503, 'PROVIDER_CONFIGURATION', 'A data provider is not configured correctly. Please contact the app owner.');
        }
        if (response.status === 429) {
          const header = response.headers?.get('retry-after');
          const seconds = header && /^\d+$/.test(header) ? Number(header) : (Date.parse(header) - now()) / 1000;
          const retryAfter = Math.min(300, Math.max(1, Math.ceil(Number.isFinite(seconds) ? seconds : 30)));
          cooldowns.set(url.host, now() + retryAfter * 1000);
          throw new ApiError(503, 'UPSTREAM_BUSY', 'The data provider is busy. Please try again shortly.', { transient: true, retryAfter });
        }
        throw new ApiError(502, 'UPSTREAM_UNAVAILABLE', 'The data provider is unavailable. Please try again.', { transient: response.status >= 500 });
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) {
        throw new ApiError(504, 'UPSTREAM_TIMEOUT', 'The data provider took too long to respond. Please try again.', { transient: true });
      }
      throw new ApiError(502, 'UPSTREAM_UNAVAILABLE', 'The data provider is unavailable. Please try again.', { transient: true });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    mode: 'live',
    async weather(lat, lon) {
      if (!weatherKey) throw new ApiError(503, 'NOT_CONFIGURED', 'Weather data is not configured. Please contact the app owner.');
      const urls = ['weather', 'forecast'].map((endpoint) => {
        const url = new URL(`https://api.openweathermap.org/data/2.5/${endpoint}`);
        url.search = new URLSearchParams({ lat, lon, units: 'metric', appid: weatherKey });
        return url;
      });
      // Keep both calls accounted for until they finish, including on failure.
      const responses = await Promise.allSettled(urls.map((url) => readJson(url)));
      const failure = responses.find((response) => response.status === 'rejected');
      if (failure) throw failure.reason;
      return normalizeWeather(responses[0].value, responses[1].value);
    },
    async cities(query) {
      if (!geoKey) throw new ApiError(503, 'NOT_CONFIGURED', 'City search is not configured. Please contact the app owner.');
      const url = new URL('https://wft-geo-db.p.rapidapi.com/v1/geo/cities');
      url.search = new URLSearchParams({ namePrefix: query, limit: '5', types: 'CITY', sort: '-population' });
      const result = await readJson(url, { 'X-RapidAPI-Key': geoKey, 'X-RapidAPI-Host': url.host });
      if (!Array.isArray(result?.data) || result.data.some((city) =>
        typeof city?.name !== 'string' || typeof city.countryCode !== 'string' ||
        !Number.isFinite(city.latitude) || Math.abs(city.latitude) > 90 ||
        !Number.isFinite(city.longitude) || Math.abs(city.longitude) > 180)) {
        throw new ApiError(502, 'INVALID_UPSTREAM_RESPONSE', 'City search returned incomplete data. Please try again.', { transient: true });
      }
      return result.data.slice(0, 5).map((city) => ({
        value: `${city.latitude} ${city.longitude}`,
        label: [city.name, city.regionCode || city.region, city.countryCode].filter(Boolean).join(', '),
      }));
    },
  };
}

module.exports = { createProvider };

const { normalizeWeather } = require('./forecast.cjs');

// Synthetic data only. This mode never contacts a provider or reads API keys.
const cities = [
  { name: 'Bengaluru', label: 'Bengaluru, IN', lat: 12.9716, lon: 77.5946, offset: 19800 },
  { name: 'Hyderabad', label: 'Hyderabad, IN', lat: 17.385, lon: 78.4867, offset: 19800 },
  { name: 'London', label: 'London, GB', lat: 51.5074, lon: -0.1278, offset: 0 },
  { name: 'Seattle', label: 'Seattle, US', lat: 47.6062, lon: -122.3321, offset: -28800 },
  { name: 'Tokyo', label: 'Tokyo, JP', lat: 35.6762, lon: 139.6503, offset: 32400 },
];

function sample(dt, index = 0) {
  const temp = Math.round((24 + 4 * Math.sin(index / 2)) * 10) / 10;
  return {
    dt,
    main: { temp, temp_min: temp - 1, temp_max: temp + 1, feels_like: temp + 1, humidity: 65, pressure: 1013 },
    wind: { speed: 3.2 }, clouds: { all: 40 },
    weather: [{ description: 'scattered clouds', icon: '03d' }],
  };
}

function createDemoProvider({ now = Date.now } = {}) {
  return {
    mode: 'demo',
    async cities(query) {
      return cities.filter((city) => city.name.toLowerCase().startsWith(query.toLowerCase())).map((city) => ({ value: `${city.lat} ${city.lon}`, label: city.label }));
    },
    async weather(lat, lon) {
      const city = cities.find((candidate) => Math.abs(candidate.lat - lat) < 0.001 && Math.abs(candidate.lon - lon) < 0.001);
      const timestamp = Math.floor(now() / 1000);
      const start = Math.floor(timestamp / 10800) * 10800 + 10800;
      return normalizeWeather(sample(timestamp), {
        city: { timezone: city?.offset || 0 },
        list: Array.from({ length: 40 }, (_, index) => sample(start + index * 10800, index)),
      });
    },
  };
}

module.exports = { createDemoProvider, sample };

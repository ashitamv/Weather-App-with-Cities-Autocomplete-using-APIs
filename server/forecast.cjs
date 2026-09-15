const { ApiError } = require('./errors.cjs');

function invalid() {
  return new ApiError(502, 'INVALID_UPSTREAM_RESPONSE', 'The weather provider returned incomplete data. Please try again.', { transient: true });
}

function conditions(item) {
  const main = item?.main;
  const weather = item?.weather?.[0];
  if (!main || !['temp', 'feels_like', 'humidity', 'pressure'].every((key) => Number.isFinite(main[key])) ||
      !Number.isFinite(item?.wind?.speed) || !weather || typeof weather.description !== 'string') {
    throw invalid();
  }
  return {
    main: { temp: main.temp, feels_like: main.feels_like, humidity: main.humidity, pressure: main.pressure },
    wind: { speed: item.wind.speed },
    clouds: { all: Number.isFinite(item.clouds?.all) ? item.clouds.all : null },
    weather: [{ description: weather.description, icon: /^(01|02|03|04|09|10|11|13|50)[dn]$/.test(weather.icon) ? weather.icon : 'unknown' }],
  };
}

function normalizeWeather(current, forecast) {
  const timezone = forecast?.city?.timezone;
  if (!Number.isInteger(timezone) || Math.abs(timezone) > 14 * 3600 ||
      !Array.isArray(forecast?.list) || !forecast.list.length || forecast.list.length > 40 ||
      !forecast.list.every((item) => Number.isFinite(item?.dt)) ||
      !Number.isFinite(current?.dt)) {
    throw invalid();
  }
  const days = new Map();
  for (const item of [...forecast.list].sort((a, b) => a.dt - b.dt)) {
    const sample = conditions(item);
    if (!Number.isFinite(item.dt) || !Number.isFinite(item.main.temp_min) || !Number.isFinite(item.main.temp_max)) throw invalid();
    const local = new Date((item.dt + timezone) * 1000);
    if (Number.isNaN(local.getTime())) throw invalid();
    const date = local.toISOString().slice(0, 10);
    const distanceToNoon = Math.abs(local.getUTCHours() * 60 + local.getUTCMinutes() - 720);
    let day = days.get(date);
    if (!day) {
      day = { date, min: Infinity, max: -Infinity, slots: 0, distanceToNoon: Infinity };
      days.set(date, day);
    }
    day.min = Math.min(day.min, item.main.temp_min);
    day.max = Math.max(day.max, item.main.temp_max);
    day.slots += 1;
    if (distanceToNoon < day.distanceToNoon) {
      Object.assign(day, { sample, sampleTime: local.toISOString().slice(11, 16), distanceToNoon });
    }
  }
  return {
    current: { ...conditions(current), observedAt: current.dt },
    forecast: [...days.values()].map(({ distanceToNoon, ...day }) => day),
    timezone,
  };
}

module.exports = { normalizeWeather };

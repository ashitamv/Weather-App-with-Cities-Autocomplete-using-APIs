// Provider credentials belong to the server. The browser only calls our API.
async function request(path, signal) {
  const response = await fetch(path, { signal });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('The weather service returned an unreadable response. Please try again.');
  }
  if (!response.ok) {
    throw new Error(body.error?.message || 'The weather service is unavailable. Please try again.');
  }
  return body;
}

export function searchCities(query, signal) {
  return request(`/api/cities?${new URLSearchParams({ q: query })}`, signal);
}

export function fetchWeather(latitude, longitude, signal) {
  return request(`/api/weather?${new URLSearchParams({ lat: latitude, lon: longitude })}`, signal);
}

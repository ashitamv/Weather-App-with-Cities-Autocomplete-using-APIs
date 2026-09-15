import './App.css';
import Search from './components/search/search';
import Forecast from './components/forecast/forecast';
import CurrentWeather from './components/current-weather/current-weather';
import { fetchWeather } from './api';
import { useEffect, useState } from 'react';

function App() {
  const [selection, setSelection] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setResult(null);
    setError('');
    if (!selection) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const [lat, lon] = selection.value.split(' ');
    setLoading(true);
    fetchWeather(lat, lon, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setResult({ ...response, city: selection.label });
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message || 'Unable to load weather. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selection, attempt]);

  return (
    <main className="container">
      <header className="page-header">
        <p className="eyebrow">CITY WEATHER</p>
        <h1>Weather, wherever you are.</h1>
        <p>Search a city for current conditions and a forecast by local day.</p>
      </header>
      <Search onSearchChange={setSelection} />
      {loading && selection && <p className="notice" role="status">Loading weather for {selection.label}…</p>}
      {error && (
        <div className="notice error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </div>
      )}
      {!selection && (
        <section className="empty-state">
          <img src="/icons/02d.png" alt="" width="100" height="100" />
          <h2>Start with a city</h2>
          <p>Try Bengaluru, Hyderabad, or London.</p>
        </section>
      )}
      {result && selection && (
        <>
          {result.meta.mode === 'demo' && <p className="notice demo" role="status">Demo data · Synthetic weather for exploring the app.</p>}
          {result.meta.stale && <p className="notice warning" role="status">Live updates are temporarily unavailable. Showing previously retrieved weather.</p>}
          <CurrentWeather data={{ ...result.weather.current, city: result.city }} />
          <p className="updated">Retrieved {new Date(result.meta.fetchedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} (your local time)</p>
          <Forecast data={result.weather.forecast} />
        </>
      )}
      <footer>{result?.meta.mode === 'demo' ? 'Demo mode · Example cities and synthetic weather' : 'Weather from OpenWeather · City search from GeoDB'}</footer>
    </main>
  );
}

export default App;

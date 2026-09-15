import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { fetchWeather } from './api';

jest.mock('./api', () => ({ fetchWeather: jest.fn() }));
jest.mock('./components/search/search', () => function SearchStub({ onSearchChange }) {
  return <div>
    <button onClick={() => onSearchChange({ value: '17.385 78.4867', label: 'Hyderabad, IN' })}>Select Hyderabad</button>
    <button onClick={() => onSearchChange({ value: '51.5074 -0.1278', label: 'London, GB' })}>Select London</button>
    <button onClick={() => onSearchChange(null)}>Clear city</button>
  </div>;
});

function response(temp = 24, stale = false) {
  return {
    weather: { current: { main: { temp, feels_like: temp, humidity: 65, pressure: 1013 }, wind: { speed: 3 }, weather: [{ description: 'cloudy', icon: '03d' }] }, forecast: [] },
    meta: { mode: 'demo', stale, fetchedAt: '2026-09-15T10:00:00Z' },
  };
}

beforeEach(() => fetchWeather.mockReset());

test('an older response cannot overwrite the city selected more recently', async () => {
  let resolveOld;
  let resolveNew;
  fetchWeather.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));
  render(<App />);
  fireEvent.click(screen.getByText('Select Hyderabad'));
  expect(screen.getByRole('status')).toHaveTextContent('Loading weather for Hyderabad');
  fireEvent.click(screen.getByText('Select London'));
  expect(fetchWeather.mock.calls[0][2].aborted).toBe(true);
  await act(async () => resolveNew(response(12)));
  await act(async () => resolveOld(response(40)));
  expect(screen.getByRole('heading', { name: 'London, GB' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Hyderabad, IN' })).not.toBeInTheDocument();
  expect(screen.queryByText('40°C')).not.toBeInTheDocument();
});

test('a provider error is visible and Try again performs another request', async () => {
  fetchWeather.mockRejectedValueOnce(new Error('Provider temporarily unavailable')).mockResolvedValueOnce(response());
  render(<App />);
  fireEvent.click(screen.getByText('Select Hyderabad'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Provider temporarily unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'Hyderabad, IN' })).toBeInTheDocument();
  expect(fetchWeather).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('clearing a city aborts work and prevents a late result from appearing', async () => {
  let resolve;
  fetchWeather.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  render(<App />);
  fireEvent.click(screen.getByText('Select Hyderabad'));
  fireEvent.click(screen.getByText('Clear city'));
  await act(async () => resolve(response()));
  expect(fetchWeather.mock.calls[0][2].aborted).toBe(true);
  expect(screen.getByRole('heading', { name: 'Start with a city' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Hyderabad, IN' })).not.toBeInTheDocument();
});

test('synthetic data and stale fallback are explicitly labelled', async () => {
  fetchWeather.mockResolvedValueOnce(response(24, true));
  render(<App />);
  fireEvent.click(screen.getByText('Select Hyderabad'));
  expect(await screen.findByText(/Synthetic weather/)).toBeInTheDocument();
  expect(screen.getByText(/Showing previously retrieved weather/)).toBeInTheDocument();
});

test('clearing a completed result returns to the empty state', async () => {
  fetchWeather.mockResolvedValueOnce(response());
  render(<App />);
  fireEvent.click(screen.getByText('Select Hyderabad'));
  await screen.findByRole('heading', { name: 'Hyderabad, IN' });
  fireEvent.click(screen.getByText('Clear city'));
  expect(screen.getByRole('heading', { name: 'Start with a city' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Hyderabad, IN' })).not.toBeInTheDocument();
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Search from './search';
import { searchCities } from '../../api';

jest.mock('../../api', () => ({ searchCities: jest.fn() }));
beforeEach(() => searchCities.mockReset());

test('debounced city search supports selecting a returned option', async () => {
  const onSearchChange = jest.fn();
  searchCities.mockResolvedValue({ cities: [{ label: 'Bengaluru, IN', value: '12.9716 77.5946' }] });
  render(<Search onSearchChange={onSearchChange} />);
  await act(async () => userEvent.type(screen.getByRole('combobox', { name: 'Search for a city' }), 'Bengaluru'));
  fireEvent.click(await screen.findByText('Bengaluru, IN', {}, { timeout: 2500 }));
  expect(onSearchChange).toHaveBeenCalledWith({ label: 'Bengaluru, IN', value: '12.9716 77.5946' });
  expect(searchCities).toHaveBeenCalledTimes(1);
  expect(searchCities.mock.calls[0][0]).toBe('Bengaluru');
});

test('search failures are visible and the same query can be retried after reopening', async () => {
  searchCities.mockRejectedValueOnce(new Error('City provider unavailable'))
    .mockResolvedValueOnce({ cities: [{ label: 'Hyderabad, IN', value: '17.385 78.4867' }] });
  render(<Search onSearchChange={() => {}} />);
  const input = screen.getByRole('combobox');
  await act(async () => userEvent.type(input, 'Hy'));
  expect(await screen.findByRole('alert', {}, { timeout: 2500 })).toHaveTextContent('City provider unavailable');
  fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
  fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
  await act(async () => userEvent.type(input, 'Hy'));
  await waitFor(() => expect(searchCities).toHaveBeenCalledTimes(2), { timeout: 2500 });
  expect(await screen.findByText('Hyderabad, IN')).toBeInTheDocument();
});

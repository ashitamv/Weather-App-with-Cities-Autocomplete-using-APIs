import { useEffect, useRef, useState } from 'react';
import { AsyncPaginate } from 'react-select-async-paginate';
import { searchCities } from '../../api';

const Search = ({ onSearchChange }) => {
  const [search, setSearch] = useState(null);
  const [error, setError] = useState('');
  const activeRequest = useRef(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  const loadOptions = async (inputValue) => {
    activeRequest.current?.abort();
    setError('');
    const query = inputValue.trim();
    if (query.length < 2) return { options: [], hasMore: false };
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const result = await searchCities(query, controller.signal);
      return { options: controller.signal.aborted ? [] : result.cities, hasMore: false };
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message || 'City search is unavailable. Please try again.');
      // AsyncPaginate preserves retryability when a load rejects. Do not cache
      // an outage as a successful empty result for this search string.
      throw failure;
    }
  };

  return (
    <section className="search-section" aria-label="City search">
      <label className="search-label" htmlFor="city-search">Search for a city</label>
      <AsyncPaginate
        inputId="city-search"
        instanceId="city-search"
        placeholder="City name, e.g. Bengaluru"
        debounceTimeout={600}
        value={search}
        isClearable
        onChange={(city) => { setSearch(city); onSearchChange(city); }}
        loadOptions={loadOptions}
        noOptionsMessage={({ inputValue }) => inputValue.trim().length < 2 ? 'Type at least two characters' : 'No matching cities'}
        classNamePrefix="city-select"
        aria-describedby={error ? 'city-search-error' : undefined}
      />
      {error && <p id="city-search-error" className="search-error" role="alert">{error}</p>}
    </section>
  );
};

export default Search;

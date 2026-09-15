import './current-weather.css';

const CurrentWeather = ({ data }) => (
  <section className="weather" aria-labelledby="current-city">
    <div className="weather-overview">
      <p className="weather-caption">CURRENT CONDITIONS</p>
      <h2 className="city" id="current-city">{data.city}</h2>
      <p className="weather-description">{data.weather[0].description}</p>
      <div className="temperature-row">
        <p className="temperature">{Math.round(data.main.temp)}<span>°C</span></p>
        <img alt="" className="weather-icon" src={`/icons/${data.weather[0].icon}.png`} />
      </div>
    </div>
    <dl className="details">
      <div><dt>Feels like</dt><dd>{Math.round(data.main.feels_like)}°C</dd></div>
      <div><dt>Wind</dt><dd>{data.wind.speed} m/s</dd></div>
      <div><dt>Humidity</dt><dd>{data.main.humidity}%</dd></div>
      <div><dt>Pressure</dt><dd>{data.main.pressure} hPa</dd></div>
    </dl>
  </section>
);

export default CurrentWeather;

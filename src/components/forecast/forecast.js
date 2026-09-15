import { Accordion, AccordionItem, AccordionItemButton, AccordionItemHeading, AccordionItemPanel } from 'react-accessible-accordion';
import './forecast.css';

function dateLabel(date) {
  // The server has already grouped slots using the selected city's UTC offset.
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const Forecast = ({ data }) => (
  <section className="forecast" aria-labelledby="forecast-title">
    <h2 id="forecast-title">Forecast by day</h2>
    <p className="forecast-note">Temperature ranges from the available three-hour readings. Dates are local to the city; the first and last days may be partial.</p>
    <Accordion allowZeroExpanded>
      {data.map((day) => (
        <AccordionItem key={day.date} uuid={day.date}>
          <AccordionItemHeading>
            <AccordionItemButton className="daily-item">
              <img alt="" className="icon-small" src={`/icons/${day.sample.weather[0].icon}.png`} />
              <span className="day">{dateLabel(day.date)}</span>
              <span className="description">{day.sample.weather[0].description}</span>
              <span className="min-max">{Math.round(day.min)}° <span>/</span> {Math.round(day.max)}°C</span>
              <span className="expand-symbol" aria-hidden="true">+</span>
            </AccordionItemButton>
          </AccordionItemHeading>
          <AccordionItemPanel className="daily-panel">
            <p>Details at {day.sampleTime} local · {day.slots} three-hour readings available</p>
            <dl className="daily-details-grid">
              <div><dt>Humidity</dt><dd>{day.sample.main.humidity}%</dd></div>
              <div><dt>Pressure</dt><dd>{day.sample.main.pressure} hPa</dd></div>
              <div><dt>Cloud cover</dt><dd>{day.sample.clouds.all === null ? '—' : `${day.sample.clouds.all}%`}</dd></div>
              <div><dt>Wind</dt><dd>{day.sample.wind.speed} m/s</dd></div>
              <div><dt>Feels like</dt><dd>{Math.round(day.sample.main.feels_like)}°C</dd></div>
            </dl>
          </AccordionItemPanel>
        </AccordionItem>
      ))}
    </Accordion>
  </section>
);

export default Forecast;

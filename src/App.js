import './App.css';
import Search from './components/search/search';
import Forecast from './components/forecast/forecast';
import CurrentWeather from './components/current-weather/current-weather';
import { weather_api_url, weather_api_key } from './api';
import { useState } from 'react';

function App() {
  
  const[currentWeather, setCurrentWeather] = useState(null);
  const[forecast, setForecast] = useState(null);

  const handleOnSearchChange = (searchData) =>{
    const[lat,lon] = searchData.value.split(" ");
    const current_weather_fetch = fetch(`${weather_api_url}/weather?lat=${lat}&lon=${lon}&appid=${weather_api_key}&units=metric`);
    const forecast_fetch = fetch(`${weather_api_url}/forecast?lat=${lat}&lon=${lon}&appid=${weather_api_key}`);

    Promise.all([current_weather_fetch, forecast_fetch])
      .then( async (response) => {
        const weather_response = await response[0].json();
        const forecast_response = await response[1].json();

        setCurrentWeather({city: searchData.label, ...weather_response});
        setForecast({city: searchData.label, ...forecast_response});
      })
      .catch((err)=>console.log(err));
  }

  console.log(currentWeather);
  console.log(forecast);
  
  return (
    <div className="Container">
      <Search onSearchChange={handleOnSearchChange} />
      {currentWeather && <CurrentWeather data={currentWeather} />}
      {forecast && <Forecast data = {forecast} />} 
    </div>
  );
}

export default App;

export const COORDS = {
  lat: import.meta.env.PUBLIC_LATITUDE || 40.4168,
  lon: import.meta.env.PUBLIC_LONGITUDE || -3.7038,
};

const OPEN_METEO_AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GLOBAL_WARMING = 'https://global-warming.org/api';

export async function fetchAirQuality() {
  const url = `${OPEN_METEO_AQ}?latitude=${COORDS.lat}&longitude=${COORDS.lon}&current=european_aqi,us_aqi,pm2_5,pm10,uv_index`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo AQ: ${res.status}`);
  return res.json();
}

export async function fetchGlobalTemperature() {
  const res = await fetch(`${GLOBAL_WARMING}/temperature-api`);
  if (!res.ok) throw new Error(`Global Warming temp: ${res.status}`);
  const data = await res.json();
  const result = data.result;
  if (!result || !result.length) throw new Error('No temperature data');
  const latest = result[result.length - 1];
  return {
    anomaly: latest.land_ocean,
    year: latest.time,
  };
}

export async function fetchGlobalCO2() {
  const res = await fetch(`${GLOBAL_WARMING}/co2-api`);
  if (!res.ok) throw new Error(`Global Warming CO2: ${res.status}`);
  const data = await res.json();
  const co2 = data.co2;
  if (!co2 || !co2.length) throw new Error('No CO2 data');
  const latest = co2[co2.length - 1];
  return {
    ppm: latest.trend || latest.average,
    date: `${latest.year}-${latest.month}-${latest.day}`,
  };
}

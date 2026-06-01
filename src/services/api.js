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
    land: latest.land,
    ocean: latest.ocean || null,
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

const WORLD_BANK = 'https://api.worldbank.org/v2/country/1W/indicator';

export async function fetchRenewableEnergy() {
  const url = `${WORLD_BANK}/EG.ELC.RNEW.ZS?format=json&per_page=20&sort=year:desc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`World Bank renewables: ${res.status}`);
  const data = await res.json();
  if (!data[1] || !data[1].length) throw new Error('No renewable energy data');
  const entry = data[1].find(e => e.value != null);
  if (!entry) throw new Error('No non-null renewable energy value');
  return { pct: Number(Number(entry.value).toFixed(1)), year: entry.date };
}

export async function fetchDeforestation() {
  const url = `${WORLD_BANK}/AG.LND.FRST.K2?format=json&per_page=20&sort=year:desc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`World Bank deforestation: ${res.status}`);
  const data = await res.json();
  if (!data[1] || data[1].length < 2) throw new Error('Not enough deforestation data');
  const entries = data[1].filter(e => e.value != null);
  if (entries.length < 2) throw new Error('Not enough non-null deforestation entries');
  const curr = entries[0].value;
  const prev = entries[1].value;
  if (curr == null || prev == null) throw new Error('Null deforestation values');
  const lossMha = (prev - curr) / 10000;
  return { lossMha: Math.round(lossMha * 10) / 10, year: entries[0].date };
}

export async function fetchCarbonFootprint() {
  throw new Error('Carbon footprint only available through proxy');
}

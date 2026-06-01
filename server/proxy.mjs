import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PROXY_PORT || 3001;

const OPEN_METEO_AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const OPEN_METEO_WX = 'https://api.open-meteo.com/v1/forecast';
const GLOBAL_WARMING = 'https://global-warming.org/api';
const WORLD_BANK = 'https://api.worldbank.org/v2/country/1W/indicator';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CITIES_JS = join(__dirname, '..', 'src', 'services', 'cities.js');

let cities = [];
try {
  if (existsSync(CITIES_JS)) {
    const content = readFileSync(CITIES_JS, 'utf-8');
    const match = content.match(/export const CITIES = (\[[\s\S]*?\])/);
    if (match) cities = eval(match[1]);
  }
} catch {}
if (!cities.length) {
  cities = [{ name: 'Madrid', lat: 40.4168, lon: -3.7038 }];
}

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

async function fetchCarbonFootprintFromOWID() {
  const url = 'https://ourworldindata.org/grapher/co-emissions-per-capita.csv?v=1&csvType=filtered&useColumnShortNames=true&format=csv';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OWID carbon: ${res.status}`);
  const csv = await res.text();
  const lines = csv.split('\n').filter(l => l.trim());
  const headerLine = lines.find(l => /^"?((Country)|(Entity))"?/i.test(l));
  if (!headerLine) throw new Error('No CSV header');
  const headers = headerLine.split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const countryCol = headers.findIndex(h => /country|entity/i.test(h));
  const yearCol = headers.findIndex(h => /year/i.test(h));
  const valueCol = headers.findIndex(h => /co2|CO₂|emissions/i.test(h));
  if (countryCol === -1 || yearCol === -1 || valueCol === -1) throw new Error('Columns not found');
  const headerIdx = lines.indexOf(headerLine);
  let latestYear = 0;
  let latestValue = null;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const country = parts[countryCol]?.replace(/^"|"$/g, '');
    if (country !== 'World') continue;
    const year = parseInt(parts[yearCol], 10);
    const val = parseFloat(parts[valueCol]);
    if (!isNaN(year) && !isNaN(val) && year > latestYear) {
      latestYear = year;
      latestValue = val;
    }
  }
  if (latestValue == null) throw new Error('No World carbon data');
  return { per_capita: Number(latestValue.toFixed(3)), year: latestYear };
}

async function fetchAllData() {
  const [tempResult, co2Result, carbonResult, deforestationResult, renewableResult] = await Promise.allSettled([
    fetch(`${GLOBAL_WARMING}/temperature-api`),
    fetch(`${GLOBAL_WARMING}/co2-api`),
    fetchCarbonFootprintFromOWID(),
    fetch(`${WORLD_BANK}/AG.LND.FRST.K2?format=json&per_page=20&sort=year:desc`),
    fetch(`${WORLD_BANK}/EG.ELC.RNEW.ZS?format=json&per_page=20&sort=year:desc`),
  ]);

  const data = { timestamp: Date.now(), global: {}, cities: [] };

  if (tempResult.status === 'fulfilled' && tempResult.value.ok) {
    try {
      const body = await tempResult.value.json();
      const arr = body.result;
      if (arr && arr.length) {
        const t = arr[arr.length - 1];
        data.global.temperature = { land: t.land, ocean: t.ocean || null };
      }
    } catch {}
  }

  if (co2Result.status === 'fulfilled' && co2Result.value.ok) {
    try {
      const body = await co2Result.value.json();
      const arr = body.co2;
      if (arr && arr.length) {
        data.global.co2 = { ppm: arr[arr.length - 1].trend || arr[arr.length - 1].average };
      }
    } catch {}
  }

  if (carbonResult.status === 'fulfilled') {
    data.global.carbon_footprint = carbonResult.value;
  }

  if (deforestationResult.status === 'fulfilled' && deforestationResult.value.ok) {
    try {
      const body = await deforestationResult.value.json();
      if (body[1]?.length >= 2) {
        const entries = body[1].filter(e => e.value != null).map(e => ({ value: e.value, year: e.date }));
        if (entries.length >= 2) {
          const curr = entries[0].value;
          const prev = entries[1].value;
          data.global.deforestation = { lossMha: Math.round(((prev - curr) / 10000) * 10) / 10 };
        }
      }
    } catch {}
  }

  if (renewableResult.status === 'fulfilled' && renewableResult.value.ok) {
    try {
      const body = await renewableResult.value.json();
      if (body[1]?.length) {
        const entry = body[1].find(e => e.value != null);
        if (entry) {
          data.global.renewable_energy = { pct: Number(Number(entry.value).toFixed(1)) };
        }
      }
    } catch {}
  }

  const cityResults = await Promise.allSettled(
    cities.map(city =>
      Promise.allSettled([
        fetch(`${OPEN_METEO_AQ}?latitude=${city.lat}&longitude=${city.lon}&current=european_aqi,us_aqi,pm2_5,pm10,uv_index`),
        fetch(`${OPEN_METEO_WX}?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m`),
      ])
    )
  );

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const entry = { name: city.name, lat: city.lat, lon: city.lon };

    const r = cityResults[i];
    if (r.status === 'fulfilled') {
      const [aqRes, wxRes] = r.value;

      if (aqRes.status === 'fulfilled' && aqRes.value.ok) {
        try {
          const body = await aqRes.value.json();
          const c = body.current || {};
          const aqi = c.european_aqi || c.us_aqi || c.pm2_5;
          if (aqi != null) entry.aqi = Math.round(aqi);
          if (c.uv_index != null) entry.uv = Number(c.uv_index.toFixed(1));
        } catch {}
      }

      if (wxRes.status === 'fulfilled' && wxRes.value.ok) {
        try {
          const body = await wxRes.value.json();
          const t = body.current?.temperature_2m;
          if (t != null) entry.temp = Math.round(t);
        } catch {}
      }
    }

    data.cities.push(entry);
  }

  return data;
}

const server = http.createServer(async (req, res) => {
  const headers = corsHeaders();
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method !== 'GET' || req.url !== '/api/data') {
    res.writeHead(404, headers);
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  if (cache.data && (Date.now() - cache.timestamp) < CACHE_TTL) {
    res.writeHead(200, headers);
    res.end(JSON.stringify(cache.data));
    return;
  }

  try {
    const data = await fetchAllData();
    cache = { data, timestamp: Date.now() };
    res.writeHead(200, headers);
    res.end(JSON.stringify(data));
  } catch (err) {
    if (cache.data) {
      res.writeHead(200, headers);
      res.end(JSON.stringify({ ...cache.data, cached: true }));
    } else {
      res.writeHead(500, headers);
      res.end(JSON.stringify({ error: err.message }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`[planetpulse-proxy] http://localhost:${PORT}/api/data (${cities.length} cities)`);
});

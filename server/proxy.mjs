import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PROXY_PORT || 3001;

const OPEN_METEO_AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const OPEN_METEO_WX = 'https://api.open-meteo.com/v1/forecast';
const GLOBAL_WARMING = 'https://global-warming.org/api';

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

async function fetchAllData() {
  const [tempResult, co2Result] = await Promise.allSettled([
    fetch(`${GLOBAL_WARMING}/temperature-api`),
    fetch(`${GLOBAL_WARMING}/co2-api`),
  ]);

  const data = { timestamp: Date.now(), global: {}, cities: [] };

  if (tempResult.status === 'fulfilled' && tempResult.value.ok) {
    try {
      const body = await tempResult.value.json();
      const arr = body.result;
      if (arr && arr.length) {
        data.global.temperature = { anomaly: arr[arr.length - 1].land_ocean };
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

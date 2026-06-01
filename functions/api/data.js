const CITIES = [
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { name: 'New York', lat: 40.7128, lon: -74.006 },
  { name: 'London', lat: 51.5074, lon: -0.1278 },
  { name: 'Paris', lat: 48.8566, lon: 2.3522 },
  { name: 'Madrid', lat: 40.4168, lon: -3.7038 },
  { name: 'Barcelona', lat: 41.3874, lon: 2.1686 },
  { name: 'Berlin', lat: 52.52, lon: 13.405 },
  { name: 'Moscow', lat: 55.7558, lon: 37.6173 },
  { name: 'Istanbul', lat: 41.0082, lon: 28.9784 },
  { name: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { name: 'Delhi', lat: 28.7041, lon: 77.1025 },
  { name: 'Shanghai', lat: 31.2304, lon: 121.4737 },
  { name: 'Beijing', lat: 39.9042, lon: 116.4074 },
  { name: 'Seoul', lat: 37.5665, lon: 126.978 },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { name: 'Bangkok', lat: 13.7563, lon: 100.5018 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
  { name: 'Mexico City', lat: 19.4326, lon: -99.1332 },
  { name: 'Toronto', lat: 43.6532, lon: -79.3832 },
  { name: 'São Paulo', lat: -23.5505, lon: -46.6333 },
  { name: 'Buenos Aires', lat: -34.6037, lon: -58.3816 },
  { name: 'Cairo', lat: 30.0444, lon: 31.2357 },
  { name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729 },
];

const OPEN_METEO_AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const OPEN_METEO_WX = 'https://api.open-meteo.com/v1/forecast';
const GLOBAL_WARMING = 'https://global-warming.org/api';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
    });
  }

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const [tempResult, co2Result] = await Promise.allSettled([
      fetch(`${GLOBAL_WARMING}/temperature-api`),
      fetch(`${GLOBAL_WARMING}/co2-api`),
    ]);

    const data = { timestamp: Date.now(), global: {}, cities: [] };

    if (tempResult.status === 'fulfilled' && tempResult.value.ok) {
      try {
        const body = await tempResult.value.json();
        const arr = body.result;
        if (arr?.length) {
          data.global.temperature = { anomaly: arr[arr.length - 1].land_ocean };
        }
      } catch {}
    }

    if (co2Result.status === 'fulfilled' && co2Result.value.ok) {
      try {
        const body = await co2Result.value.json();
        const arr = body.co2;
        if (arr?.length) {
          data.global.co2 = { ppm: arr[arr.length - 1].trend || arr[arr.length - 1].average };
        }
      } catch {}
    }

    const cityResults = await Promise.allSettled(
      CITIES.map(city =>
        Promise.allSettled([
          fetch(`${OPEN_METEO_AQ}?latitude=${city.lat}&longitude=${city.lon}&current=european_aqi,us_aqi,pm2_5,pm10,uv_index`),
          fetch(`${OPEN_METEO_WX}?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m`),
        ])
      )
    );

    for (let i = 0; i < CITIES.length; i++) {
      const city = CITIES[i];
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

    return json(data);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

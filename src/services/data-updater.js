import { fetchAirQuality, fetchGlobalTemperature, fetchGlobalCO2 } from './api';
import { CITIES } from './cities';

const COLORS = {
  bueno: { badge: ['bg-green-100', 'text-green-700'], text: 'text-green-700' },
  malo: { badge: ['bg-red-100', 'text-red-600'], text: 'text-red-600' },
  neutral: { badge: ['bg-gray-100', 'text-gray-500'], text: 'text-gray-500' },
};

const ALL_BADGE_CLASSES = ['bg-green-100', 'bg-red-100', 'bg-gray-100', 'text-green-700', 'text-red-600', 'text-gray-500'];
const ALL_TEXT_CLASSES = ['text-green-700', 'text-red-600', 'text-gray-500'];

let activeCity = null;
let cityData = null;

function getCard(index) {
  return document.querySelector(`[data-medidor-index="${index}"]`);
}

function updateCardValue(index, value) {
  const card = getCard(index);
  if (!card) return;
  const el = card.querySelector('[data-medidor-value]');
  if (el) el.textContent = String(value);
}

function updateCardColor(index, colorKey) {
  const card = getCard(index);
  if (!card) return;
  const c = COLORS[colorKey];
  if (!c) return;
  const badge = card.querySelector('[data-medidor-badge]');
  if (badge) {
    badge.classList.remove(...ALL_BADGE_CLASSES);
    badge.classList.add(...c.badge);
  }
  const pct = card.querySelector('[data-medidor-pct]');
  if (pct) {
    pct.classList.remove(...ALL_TEXT_CLASSES);
    pct.classList.add(c.text);
  }
}

function updateCardText(index, selector, text) {
  const card = getCard(index);
  if (!card) return;
  const el = card.querySelector(selector);
  if (el) el.textContent = String(text);
}

function setLiveIndicator(index, success) {
  const card = getCard(index);
  if (!card) return;
  const el = card.querySelector('[data-live-dot]');
  if (el) {
    el.textContent = success ? '●' : '○';
    el.className = success
      ? 'w-2 h-2 rounded-full bg-green-500 inline-block shrink-0'
      : 'w-2 h-2 rounded-full bg-gray-300 inline-block shrink-0';
  }
}

function updateTimestamp() {
  const el = document.querySelector('[data-last-update]');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleString();
  }
}

function updateCardTimestamp(index) {
  const card = getCard(index);
  if (!card) return;
  const el = card.querySelector('[data-card-timestamp]');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleTimeString();
  }
}

function getAQILevel(aqi, isEuropean) {
  if (aqi == null) return { text: '—', color: 'neutral' };
  if (isEuropean) {
    if (aqi <= 20) return { text: 'Good', color: 'bueno' };
    if (aqi <= 40) return { text: 'Fair', color: 'bueno' };
    if (aqi <= 60) return { text: 'Moderate', color: 'neutral' };
    if (aqi <= 80) return { text: 'Poor', color: 'malo' };
    return { text: 'Very Poor', color: 'malo' };
  }
  if (aqi <= 50) return { text: 'Good', color: 'bueno' };
  if (aqi <= 100) return { text: 'Moderate', color: 'neutral' };
  if (aqi <= 150) return { text: 'Unhealthy (Sensitive)', color: 'neutral' };
  return { text: 'Unhealthy', color: 'malo' };
}

function getUVLevel(uv) {
  if (uv == null) return { text: '—', color: 'neutral' };
  if (uv <= 2) return { text: 'Low', color: 'bueno' };
  if (uv <= 5) return { text: 'Moderate', color: 'neutral' };
  if (uv <= 7) return { text: 'High', color: 'malo' };
  if (uv <= 10) return { text: 'Very High', color: 'malo' };
  return { text: 'Extreme', color: 'malo' };
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestCity(lat, lon) {
  let best = CITIES[0];
  let minDist = Infinity;
  for (const c of CITIES) {
    const d = haversine(lat, lon, c.lat, c.lon);
    if (d < minDist) { minDist = d; best = c; }
  }
  return best;
}

function renderCityChips(selectedName) {
  const container = document.querySelector('[data-city-chips]');
  if (!container) return;

  container.innerHTML = CITIES.map(c =>
    `<button class="city-chip${c.name === selectedName ? ' active' : ''}" data-city="${c.name}"><span class="chip-flag">${c.flag}</span> ${c.name}</button>`
  ).join('');

  container.querySelectorAll('.city-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.city;
      setActiveCity(name);
    });
  });
}

function setActiveCity(name) {
  activeCity = name;
  document.querySelectorAll('.city-chip').forEach(b => b.classList.toggle('active', b.dataset.city === name));

  const city = CITIES.find(c => c.name === name);
  const cityContainer = document.querySelector('[data-city-label]');
  if (cityContainer) cityContainer.textContent = city ? `${city.flag} ${name}` : name;

  if (!cityData) return;
  applyCityCards(name);
}

function applyCityCards(name) {
  const c = cityData.find(x => x.name === name);
  if (!c) return;

  if (c.aqi != null) {
    const level = getAQILevel(c.aqi, true);
    updateCardValue(0, c.aqi);
    updateCardColor(0, level.color);
    updateCardText(0, '[data-medidor-pct]', level.text);
    updateCardTimestamp(0);
    setLiveIndicator(0, true);
  }

  if (c.uv != null) {
    const level = getUVLevel(c.uv);
    updateCardValue(1, Number(c.uv).toFixed(1));
    updateCardColor(1, level.color);
    updateCardText(1, '[data-medidor-pct]', level.text);
    updateCardTimestamp(1);
    setLiveIndicator(1, true);
  }

  if (c.temp != null) {
    document.querySelectorAll('[data-city-temp]').forEach(el => {
      el.textContent = `${c.temp}°C`;
    });
  }
}

function initCitySelector() {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const nearest = findNearestCity(pos.coords.latitude, pos.coords.longitude);
        renderCityChips(nearest.name);
        setActiveCity(nearest.name);
      },
      () => {
        renderCityChips(CITIES[0].name);
        setActiveCity(CITIES[0].name);
      },
      { timeout: 5000, enableHighAccuracy: false }
    );
  } else {
    renderCityChips(CITIES[0].name);
    setActiveCity(CITIES[0].name);
  }
}

function applyDirectResults(aqiResult, tempResult, co2Result) {
  if (aqiResult.status === 'fulfilled') {
    const d = aqiResult.value;
    const current = d.current;
    if (current) {
      const eaqi = current.european_aqi;
      const uaqi = current.us_aqi;
      const aqi = eaqi || uaqi || current.pm2_5;
      const uv = current.uv_index;
      const level = getAQILevel(aqi, !!eaqi);
      updateCardValue(0, Math.round(aqi));
      updateCardColor(0, level.color);
      updateCardText(0, '[data-medidor-pct]', level.text);
      updateCardTimestamp(0);
      setLiveIndicator(0, true);

      if (uv != null) {
        const uvLevel = getUVLevel(uv);
        updateCardValue(1, uv.toFixed(1));
        updateCardColor(1, uvLevel.color);
        updateCardText(1, '[data-medidor-pct]', uvLevel.text);
        updateCardTimestamp(1);
        setLiveIndicator(1, true);
      } else {
        setLiveIndicator(1, false);
      }

      const cityName = activeCity || CITIES[0]?.name || 'City';
      cityData = [
        { name: cityName, aqi: aqi ? Math.round(aqi) : null, uv: uv != null ? Number(Number(uv).toFixed(1)) : null, temp: null }
      ];
    }
  } else {
    setLiveIndicator(6, false);
    setLiveIndicator(7, false);
  }

  if (tempResult.status === 'fulfilled') {
    const t = tempResult.value;
    const sign = t.anomaly >= 0 ? '+' : '';
    updateCardValue(2, `${sign}${Number(t.anomaly).toFixed(2)}`);
    updateCardTimestamp(2);
    setLiveIndicator(2, true);
  } else {
    setLiveIndicator(2, false);
  }

  if (co2Result.status === 'fulfilled') {
    const c = co2Result.value;
    updateCardValue(3, Number(c.ppm).toFixed(1));
    updateCardTimestamp(3);
    setLiveIndicator(3, true);
  } else {
    setLiveIndicator(3, false);
  }
}

function applyProxyData(data) {
  const g = data.global || {};

  if (g.temperature && g.temperature.anomaly != null) {
    const sign = g.temperature.anomaly >= 0 ? '+' : '';
    updateCardValue(2, `${sign}${Number(g.temperature.anomaly).toFixed(2)}`);
    updateCardTimestamp(2);
    setLiveIndicator(2, true);
  } else {
    setLiveIndicator(2, false);
  }

  if (g.co2 && g.co2.ppm != null) {
    updateCardValue(3, Number(g.co2.ppm).toFixed(1));
    updateCardTimestamp(3);
    setLiveIndicator(3, true);
  } else {
    setLiveIndicator(3, false);
  }

  cityData = data.cities || [];
  if (activeCity && cityData.length) {
    applyCityCards(activeCity);
  }
}

let refreshing = false;

export async function refreshAllData() {
  if (refreshing) return;
  refreshing = true;

  const refreshBtn = document.querySelector('[data-refresh-btn]');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '...';
  }

  const proxyUrl = import.meta.env.PUBLIC_API_PROXY;
  let proxyOk = false;

  if (proxyUrl) {
    try {
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const data = await res.json();
        applyProxyData(data);
        proxyOk = true;
      }
    } catch {}
  }

  if (!proxyOk) {
    const results = await Promise.allSettled([
      fetchAirQuality(),
      fetchGlobalTemperature(),
      fetchGlobalCO2(),
    ]);
    applyDirectResults(results[0], results[1], results[2]);
  }

  updateTimestamp();

  if (refreshBtn) {
    refreshBtn.disabled = false;
    refreshBtn.textContent = '';
  }

  refreshing = false;
}

export function initDataUpdater() {
  function boot() {
    initCitySelector();
    refreshAllData();
    const btn = document.querySelector('[data-refresh-btn]');
    if (btn) btn.addEventListener('click', refreshAllData);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

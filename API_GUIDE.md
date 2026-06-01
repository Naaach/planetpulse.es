# Guía de APIs / API Setup Guide

## Resumen / Overview

Planet Pulse obtiene datos de APIs gratuitas para mostrar métricas ambientales de 25 ciudades globales + datos planetarios. Todo se sirve desde un **proxy server** con caché de 5 minutos.

---

## APIs Integradas

| API | Datos | Frecuencia | Key | Uso |
|-----|-------|-----------|-----|-----|
| Open-Meteo Air Quality | AQI, UV, PM2.5, PM10 | Horaria | ❌ | Tarjetas AQI + UV (por ciudad) |
| Open-Meteo Weather | Temperatura | Horaria | ❌ | Temperatura local (por ciudad) |
| Global Warming API | CO₂ (Mauna Loa), anomalía temp. global | Mensual | ❌ | Tarjetas globales CO₂ + temperatura |

---

## Configuración

```bash
cp .env.example .env
```

```env
PUBLIC_API_PROXY=http://localhost:3001/api/data
PROXY_PORT=3001
```

⚠️ **`.env` no se sube al repo** — ya está en `.gitignore`. Solo se sube `.env.example`.

---

## Proxy Server

Para evitar 50+ peticiones externas por visitante, el proxy cachea todo 5 minutos:

```
Cliente ──► /api/data (1 petición cada 5 min, compartida entre todos los visitantes)
Proxy:
  ├── Open-Meteo AQ  × 25 ciudades
  ├── Open-Meteo Wx  × 25 ciudades
  └── Global Warming (CO₂ + temperatura global)
  └── Caché en memoria (5 min)
```

### Local

```bash
# Terminal 1: Proxy
npm run proxy    # → http://localhost:3001/api/data

# Terminal 2: Astro
npm run dev
```

### Producción (Cloudflare Workers)

Adaptación mínima para Workers — cambiar `http.createServer` por:

```js
export default {
  async fetch(request, env) {
    // ... misma lógica, devolver Response
  }
}
```

---

## Ciudades / Cities

25 ciudades fijas definidas en `src/services/cities.js`:

Tokyo, New York, London, Paris, Shanghai, Beijing, Mumbai, São Paulo, Delhi, Cairo, Los Angeles, Moscow, Dubai, Sydney, Singapore, Istanbul, Mexico City, Jakarta, Rio de Janeiro, Lagos, Berlin, Bangkok, Toronto, Seoul, Buenos Aires.

**Geolocalización**: El navegador detecta tu ubicación y selecciona automáticamente la ciudad más cercana.

---

## Arquitectura

```
src/
├── services/
│   ├── api.js             # Fetch functions (fallback directo)
│   ├── cities.js          # 25 ciudades con coordenadas
│   └── data-updater.js    # Lógica cliente: proxy/city selector/chips/DOM
├── components/
│   ├── Medidor.astro      # Tarjeta individual
│   └── MedidorGrid.astro  # Grid de 8 medidores + import del updater
└── pages/
    └── index.astro        # Layout, chips, botón refresh
server/
└── proxy.mjs              # Proxy server (Node 18+, zero deps)
```

**Flujo**:
1. Build genera HTML estático con mock data
2. `data-updater.js` detecta ubicación → renderiza chips de ciudades
3. Fetch al proxy `/api/data` (o directo si no hay proxy)
4. Actualiza medidores globales + tarjetas AQI/UV con datos de la ciudad seleccionada
5. Click en otro chip → cambia ciudad sin recargar

---

## Notas Técnicas

- **Proxy**: Node 18+ nativo (http + fetch), cero dependencias
- **Fallback**: Sin proxy, llama directo a las APIs (solo 1 ciudad por defecto)
- **Mock data**: Mientras no hay datos live, se ven valores estáticos
- **PUBLIC_API_PROXY**: Variable de entorno cliente para apuntar al proxy
- **Geolocation**: Solo funciona en HTTPS (producción) o localhost

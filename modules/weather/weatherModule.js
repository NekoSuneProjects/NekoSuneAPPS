// modules/weather/weatherModule.js
// Current weather via Open-Meteo (free, no API key). Geocodes a city name to
// lat/lon, then polls current conditions. Emits { ok, temp, feels, desc, wind,
// unit, city }. Feeds the chatbox {weather} token. Runs in the MAIN process.

const axios = require('axios')

const GEO = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const POLL_MS = 15 * 60 * 1000 // 15 minutes — weather doesn't change fast
const REQ = { validateStatus: () => true, timeout: 15000 }

// Condensed WMO weather-code → text + emoji.
const WMO = {
  0: '☀️ Clear', 1: '🌤 Mainly clear', 2: '⛅ Partly cloudy', 3: '☁️ Overcast',
  45: '🌫 Fog', 48: '🌫 Rime fog',
  51: '🌦 Light drizzle', 53: '🌦 Drizzle', 55: '🌦 Heavy drizzle',
  56: '🌧 Freezing drizzle', 57: '🌧 Freezing drizzle',
  61: '🌧 Light rain', 63: '🌧 Rain', 65: '🌧 Heavy rain',
  66: '🌧 Freezing rain', 67: '🌧 Freezing rain',
  71: '🌨 Light snow', 73: '🌨 Snow', 75: '🌨 Heavy snow', 77: '🌨 Snow grains',
  80: '🌦 Light showers', 81: '🌦 Showers', 82: '⛈ Violent showers',
  85: '🌨 Snow showers', 86: '🌨 Snow showers',
  95: '⛈ Thunderstorm', 96: '⛈ Thunderstorm + hail', 99: '⛈ Thunderstorm + hail'
}

let timer = null
let onUpdate = null
let cfg = { city: '', units: 'celsius' }
let geo = null // cached { lat, lon, name }
let last = { ok: false }

function emit () { if (typeof onUpdate === 'function') onUpdate(Object.assign({ at: Date.now() }, last)) }

async function geocode (city) {
  const res = await axios.get(GEO, Object.assign({ params: { name: city, count: 1 } }, REQ))
  const r = res.data && res.data.results && res.data.results[0]
  if (!r) return null
  return { lat: r.latitude, lon: r.longitude, name: [r.name, r.admin1, r.country_code].filter(Boolean).join(', ') }
}

async function poll () {
  try {
    if (!cfg.city) return
    if (!geo) { geo = await geocode(cfg.city); if (!geo) { last = { ok: false, error: 'City not found' }; emit(); return } }
    const fahrenheit = cfg.units === 'fahrenheit'
    const res = await axios.get(FORECAST, Object.assign({
      params: {
        latitude: geo.lat,
        longitude: geo.lon,
        current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
        temperature_unit: cfg.units,
        wind_speed_unit: fahrenheit ? 'mph' : 'kmh'
      }
    }, REQ))
    const c = res.data && res.data.current
    if (!c) { last = { ok: false, error: 'No data' }; emit(); return }
    last = {
      ok: true,
      city: geo.name,
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      desc: WMO[c.weather_code] || 'Unknown',
      wind: Math.round(c.wind_speed_10m),
      unit: fahrenheit ? '°F' : '°C',
      windUnit: fahrenheit ? 'mph' : 'km/h'
    }
    emit()
  } catch (err) {
    last = { ok: false, error: err.message }
    emit()
  }
}

function startWeather (opts = {}, listener) {
  onUpdate = listener
  const cityChanged = opts.city !== cfg.city
  cfg = { city: String(opts.city || '').trim(), units: opts.units === 'fahrenheit' ? 'fahrenheit' : 'celsius' }
  if (cityChanged) geo = null // re-geocode on city change
  stopWeather()
  if (!cfg.city) { last = { ok: false }; emit(); return }
  poll()
  timer = setInterval(poll, POLL_MS)
}

function stopWeather () { if (timer) { clearInterval(timer); timer = null } }
function getWeather () { return last }

module.exports = { startWeather, stopWeather, getWeather }

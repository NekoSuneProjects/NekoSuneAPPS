// modules/heartrate/pulsoidModule.js
// Streams live heart rate from Pulsoid over their realtime WebSocket API.
// Get a token at https://pulsoid.net/ui/keys (Manual token, "data:heart_rate:read").
// Runs in the MAIN process; pushes { bpm, online } to a listener.

const WebSocket = require('ws')

const PULSOID_WS = 'wss://dev.pulsoid.net/api/v1/data/real_time'

let ws = null
let token = ''
let onUpdate = null
let reconnectTimer = null
let manualClose = false
let lastBpm = 0
let online = false

// session stats (reset when a stream starts)
let sumBpm = 0
let countBpm = 0
let maxBpm = 0
let minBpm = 0

function resetSession () { sumBpm = 0; countBpm = 0; maxBpm = 0; minBpm = 0 }

function recordBpm (bpm) {
  sumBpm += bpm; countBpm += 1
  maxBpm = maxBpm ? Math.max(maxBpm, bpm) : bpm
  minBpm = minBpm ? Math.min(minBpm, bpm) : bpm
}

function emit () {
  if (typeof onUpdate === 'function') {
    onUpdate({
      bpm: lastBpm,
      online,
      avg: countBpm ? Math.round(sumBpm / countBpm) : 0,
      max: maxBpm,
      min: minBpm,
      at: Date.now()
    })
  }
}

function scheduleReconnect () {
  if (manualClose || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 5000)
}

function connect () {
  if (!token) return
  cleanupSocket()
  manualClose = false

  const url = `${PULSOID_WS}?access_token=${encodeURIComponent(token)}`
  ws = new WebSocket(url)

  ws.on('open', () => {
    online = true
    emit()
  })

  ws.on('message', raw => {
    try {
      const payload = JSON.parse(raw.toString())
      // Pulsoid sends: { "measured_at": <ms>, "data": { "heart_rate": <bpm> } }
      const bpm = payload?.data?.heart_rate
      if (Number.isFinite(bpm)) {
        lastBpm = bpm
        online = true
        recordBpm(bpm)
        emit()
      }
    } catch (err) {
      console.warn('Pulsoid parse error:', err.message)
    }
  })

  ws.on('close', () => {
    online = false
    emit()
    scheduleReconnect()
  })

  ws.on('error', err => {
    console.error('Pulsoid socket error:', err.message)
    online = false
    emit()
  })
}

function cleanupSocket () {
  if (ws) {
    try {
      ws.removeAllListeners()
      ws.close()
    } catch (_) { /* ignore */ }
    ws = null
  }
}

function startPulsoid (accessToken, listener) {
  token = String(accessToken || '').trim()
  onUpdate = listener
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (!token) {
    stopPulsoid()
    return
  }
  resetSession()
  connect()
}

function stopPulsoid () {
  manualClose = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  cleanupSocket()
  online = false
  emit()
}

function getHeartRate () {
  return { bpm: lastBpm, online }
}

module.exports = {
  startPulsoid,
  stopPulsoid,
  getHeartRate
}

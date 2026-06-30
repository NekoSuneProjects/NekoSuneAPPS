// modules/heartrate/providers/hyperate/client.js
// Streams live heart rate from HypeRate.io over their realtime WebSocket (a
// Phoenix Channels socket). Needs a HypeRate API key (request one from HypeRate)
// and your HypeRate device/session ID (the bit after hyperate.io/<id>).
// Emits the shared provider shape: { bpm, online, avg, max, min, at }.
// Runs in the MAIN process.

const WebSocket = require('ws')

const HYPERATE_WS = 'wss://app.hyperate.io/socket/websocket'
const HEARTBEAT_MS = 10000 // Phoenix keepalive

let ws = null
let apiKey = ''
let deviceId = ''
let onUpdate = null
let reconnectTimer = null
let heartbeatTimer = null
let manualClose = false
let lastBpm = 0
let online = false
let ref = 0

// session stats (reset when a stream starts)
let sumBpm = 0; let countBpm = 0; let maxBpm = 0; let minBpm = 0
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

function send (obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)) } catch (_) { /* ignore */ }
  }
}

function topic () { return `hr:${deviceId}` }

function scheduleReconnect () {
  if (manualClose || reconnectTimer) return
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect() }, 5000)
}

function startHeartbeat () {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) })
  }, HEARTBEAT_MS)
}
function stopHeartbeat () { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null } }

function connect () {
  if (!apiKey || !deviceId) return
  cleanupSocket()
  manualClose = false

  const url = `${HYPERATE_WS}?token=${encodeURIComponent(apiKey)}`
  ws = new WebSocket(url)

  ws.on('open', () => {
    // Join the per-device heart-rate channel, then keep the socket alive.
    send({ topic: topic(), event: 'phx_join', payload: {}, ref: String(++ref) })
    startHeartbeat()
  })

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.event === 'hr_update' && msg.payload && Number.isFinite(msg.payload.hr)) {
        lastBpm = msg.payload.hr
        online = true
        recordBpm(lastBpm)
        emit()
      } else if (msg.event === 'phx_reply' && msg.topic === topic()) {
        // Joined successfully — mark online even before the first reading.
        if (msg.payload && msg.payload.status === 'ok') { online = true; emit() }
      }
    } catch (err) {
      console.warn('HypeRate parse error:', err.message)
    }
  })

  ws.on('close', () => { online = false; stopHeartbeat(); emit(); scheduleReconnect() })
  ws.on('error', err => { console.error('HypeRate socket error:', err.message); online = false; emit() })
}

function cleanupSocket () {
  stopHeartbeat()
  if (ws) {
    try { ws.removeAllListeners(); ws.close() } catch (_) { /* ignore */ }
    ws = null
  }
}

function startHyperate (key, device, listener) {
  apiKey = String(key || '').trim()
  deviceId = String(device || '').trim()
  onUpdate = listener
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (!apiKey || !deviceId) { stopHyperate(); return }
  resetSession()
  connect()
}

function stopHyperate () {
  manualClose = true
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  cleanupSocket()
  online = false
  emit()
}

function getHeartRate () { return { bpm: lastBpm, online } }

module.exports = { startHyperate, stopHyperate, getHeartRate }

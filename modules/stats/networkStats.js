// modules/stats/networkStats.js
// Network up/down throughput + ping, using systeminformation. Runs in MAIN process.

const si = require('systeminformation')

let pollTimer = null
let onUpdate = null
let last = { downMbps: 0, upMbps: 0, pingMs: 0, iface: '', at: 0 }

function mbps (bytesPerSec) {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 0) return 0
  return Math.round((bytesPerSec * 8) / 1e6 * 10) / 10
}

let tickCount = 0
let ticking = false
async function tick (pingHost) {
  if (ticking) return
  ticking = true
  try {
    const stats = await si.networkStats().catch(() => [])
    const primary = stats?.[0]
    if (primary) {
      last.downMbps = mbps(primary.rx_sec)
      last.upMbps = mbps(primary.tx_sec)
      last.iface = primary.iface || ''
    }
    // inetLatency spawns a ping process, so only check it every 5th tick.
    if (pingHost && tickCount % 5 === 0) {
      const latency = await si.inetLatency(pingHost).catch(() => 0)
      last.pingMs = Math.round(latency) || 0
    }
    tickCount++
    last.at = Date.now()
    if (typeof onUpdate === 'function') onUpdate({ ...last })
  } catch (err) {
    console.error('Network stats error:', err.message)
  } finally {
    ticking = false
  }
}

function startNetworkStats (listener, { intervalMs = 3000, pingHost = '1.1.1.1' } = {}) {
  onUpdate = listener
  stopNetworkStats()
  tick(pingHost)
  pollTimer = setInterval(() => tick(pingHost), Math.max(1000, intervalMs))
}

function stopNetworkStats () {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function getNetworkStats () {
  return { ...last }
}

module.exports = { startNetworkStats, stopNetworkStats, getNetworkStats }

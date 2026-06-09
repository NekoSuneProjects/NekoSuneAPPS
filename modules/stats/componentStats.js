// modules/stats/componentStats.js
// Polls system component stats (CPU / GPU / RAM / VRAM / FPS-ish) using `systeminformation`.
// Runs in the MAIN process and pushes snapshots to a listener; the renderer turns
// the snapshot into a chatbox line.

const si = require('systeminformation')
const { acquireSiShell, releaseSiShell } = require('./siShell')

let pollTimer = null
let onUpdate = null
let lastSnapshot = null

const DEFAULT_INTERVAL_MS = 5000

function round (value, digits = 0) {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

// graphics() and cpuTemperature() spawn external WMI/PowerShell queries on Windows
// and are very expensive, so refresh them only occasionally and cache the result.
const SLOW_EVERY = 6 // refresh GPU + temps every 6th tick
let tickCount = 0
const slowCache = { cpuTemp: 0, gpuName: '', gpuLoad: 0, gpuTemp: 0, vramUsedMb: 0, vramTotalMb: 0 }

async function refreshSlow () {
  const [cpuTemp, graphics] = await Promise.all([
    si.cpuTemperature().catch(() => null),
    si.graphics().catch(() => null)
  ])
  const gpu = graphics?.controllers?.find(c => Number.isFinite(c.utilizationGpu)) ||
    graphics?.controllers?.[0] || null
  slowCache.cpuTemp = round(cpuTemp?.main ?? slowCache.cpuTemp)
  slowCache.gpuName = gpu?.model || slowCache.gpuName
  slowCache.gpuLoad = round(gpu?.utilizationGpu ?? slowCache.gpuLoad)
  slowCache.gpuTemp = round(gpu?.temperatureGpu ?? slowCache.gpuTemp)
  slowCache.vramUsedMb = round(gpu?.memoryUsed ?? slowCache.vramUsedMb)
  slowCache.vramTotalMb = round(gpu?.memoryTotal ?? slowCache.vramTotalMb)
}

async function readSnapshot () {
  // Cheap reads every tick; expensive GPU/temp only every SLOW_EVERY ticks.
  const [load, mem] = await Promise.all([
    si.currentLoad().catch(() => null),
    si.mem().catch(() => null)
  ])
  if (tickCount % SLOW_EVERY === 0) await refreshSlow()
  tickCount++

  const snapshot = {
    cpuLoad: round(load?.currentLoad ?? 0),
    cpuTemp: slowCache.cpuTemp,
    ramUsedGb: mem ? round((mem.active ?? (mem.total - mem.available)) / 1024 ** 3, 1) : 0,
    ramTotalGb: mem ? round(mem.total / 1024 ** 3, 1) : 0,
    ramPct: mem ? round(((mem.active ?? (mem.total - mem.available)) / mem.total) * 100) : 0,
    gpuName: slowCache.gpuName,
    gpuLoad: slowCache.gpuLoad,
    gpuTemp: slowCache.gpuTemp,
    vramUsedMb: slowCache.vramUsedMb,
    vramTotalMb: slowCache.vramTotalMb,
    at: Date.now()
  }

  lastSnapshot = snapshot
  return snapshot
}

let ticking = false
async function tick () {
  if (ticking) return // never let a slow query stack up
  ticking = true
  try {
    const snapshot = await readSnapshot()
    if (typeof onUpdate === 'function') onUpdate(snapshot)
  } catch (err) {
    console.error('Component stats error:', err)
  } finally {
    ticking = false
  }
}

function startComponentStats (listener, intervalMs = DEFAULT_INTERVAL_MS) {
  onUpdate = listener
  stopComponentStats()
  acquireSiShell() // reuse one PowerShell for all WMI queries instead of spawning per call
  tick()
  pollTimer = setInterval(tick, Math.max(2000, intervalMs))
}

function stopComponentStats () {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
    releaseSiShell()
  }
}

function getLastSnapshot () {
  return lastSnapshot
}

module.exports = {
  startComponentStats,
  stopComponentStats,
  readSnapshot,
  getLastSnapshot
}

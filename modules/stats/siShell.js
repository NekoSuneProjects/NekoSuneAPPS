// modules/stats/siShell.js
// Ref-counted persistent PowerShell session for `systeminformation` (Windows only).
//
// By default systeminformation spawns a brand-new powershell.exe (and an
// accompanying conhost.exe / "Console Window") for EVERY WMI query — CPU load,
// GPU, temps, network stats, ping, etc. With the stats + network pollers running
// on a few-second interval that produces a constant churn of shell processes,
// which is the "too many programs running" lag.
//
// powerShellStart() keeps a SINGLE powershell.exe alive and pipes every query
// through it instead, so the per-tick spawn cost disappears. We ref-count it so
// the shell is created when the first poller starts and released only when the
// last one stops.

const si = require('systeminformation')

let refs = 0

function acquireSiShell () {
  if (process.platform !== 'win32') return
  if (refs === 0) {
    try { si.powerShellStart() } catch (err) { console.warn('siShell start failed:', err.message) }
  }
  refs++
}

function releaseSiShell () {
  if (process.platform !== 'win32') return
  if (refs === 0) return
  refs--
  if (refs === 0) {
    try { si.powerShellRelease() } catch (err) { console.warn('siShell release failed:', err.message) }
  }
}

module.exports = { acquireSiShell, releaseSiShell }

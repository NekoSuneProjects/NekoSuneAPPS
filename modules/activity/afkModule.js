// modules/activity/afkModule.js
// Auto-AFK detection using Electron's powerMonitor system idle timer. Polls how
// long the user has been idle (no keyboard/mouse) and flips an AFK flag once the
// idle time crosses a threshold; flips back on the first activity. The renderer
// turns these transitions into a chatbox / OSC message. Runs in the MAIN process.

const { powerMonitor } = require('electron')

const POLL_MS = 2000

let timer = null
let onUpdate = null
let thresholdSec = 120
let afk = false
let sinceMs = null

function emit () {
  if (typeof onUpdate === 'function') onUpdate({ afk, since: sinceMs, at: Date.now() })
}

function poll () {
  let idle
  try { idle = powerMonitor.getSystemIdleTime() } catch (_) { return } // seconds
  if (!afk && idle >= thresholdSec) {
    afk = true
    // Mark the start of AFK as when idleness actually began, not "now".
    sinceMs = Date.now() - idle * 1000
    emit()
  } else if (afk && idle < thresholdSec) {
    afk = false
    sinceMs = null
    emit()
  }
}

function startAfk (opts = {}, listener) {
  onUpdate = listener
  thresholdSec = Math.max(10, parseInt(opts.thresholdSec, 10) || 120)
  stopAfk(true)
  afk = false
  sinceMs = null
  timer = setInterval(poll, POLL_MS)
  emit()
  return true
}

function stopAfk (keepState) {
  if (timer) { clearInterval(timer); timer = null }
  if (!keepState) {
    if (afk) { afk = false; sinceMs = null; emit() }
  }
}

function getAfk () { return { afk, since: sinceMs } }

module.exports = { startAfk, stopAfk, getAfk }

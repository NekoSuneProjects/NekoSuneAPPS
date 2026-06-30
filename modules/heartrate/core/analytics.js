// modules/heartrate/core/analytics.js
// Persists heart-rate SESSIONS so you can review past activity. A session starts
// when streaming begins and is saved when it stops, recording duration + avg/min/
// max/samples. Stored via electron-store (settings). Provider-agnostic — both
// Pulsoid and HypeRate feed the same recorder. Runs in the MAIN process.

const settings = require('../../../settings')

const KEY = 'hrSessions'
const MAX_SESSIONS = 50

let current = null // { provider, startedAt, sum, count, min, max }

function begin (provider) {
  current = { provider: provider || 'pulsoid', startedAt: Date.now(), sum: 0, count: 0, min: 0, max: 0 }
}

function record (bpm) {
  if (!current || !Number.isFinite(bpm) || bpm <= 0) return
  current.sum += bpm
  current.count += 1
  current.min = current.min ? Math.min(current.min, bpm) : bpm
  current.max = Math.max(current.max, bpm)
}

// Finalize the current session, persist it, and return the summary (or null if
// nothing was recorded). Capped to the most recent MAX_SESSIONS.
function end () {
  if (!current || current.count === 0) { current = null; return null }
  const summary = {
    provider: current.provider,
    startedAt: current.startedAt,
    endedAt: Date.now(),
    durationSec: Math.max(0, Math.round((Date.now() - current.startedAt) / 1000)),
    avg: Math.round(current.sum / current.count),
    min: current.min,
    max: current.max,
    samples: current.count
  }
  current = null
  const listed = settings.get(KEY, [])
  listed.unshift(summary)
  settings.set(KEY, listed.slice(0, MAX_SESSIONS))
  return summary
}

function list () { return settings.get(KEY, []) }
function clear () { settings.set(KEY, []) }

module.exports = { begin, record, end, list, clear }

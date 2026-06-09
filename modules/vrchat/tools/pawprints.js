// modules/vrchat/tools/pawprints.js
// Pawprints — local per-world time tracking. Accumulates how long you've spent in
// each VRChat world (by name) from the world tracker. Fully local, persisted via
// electron-store. Runs in the MAIN process.

const settings = require('../../../settings')

const KEY = 'pawprints'
let curWorld = ''
let enteredAt = 0

// Commit elapsed time for the current world and reset the timer baseline.
function tickCommit () {
  if (curWorld && enteredAt) {
    const now = Date.now()
    const secs = Math.round((now - enteredAt) / 1000)
    if (secs > 0) {
      const map = settings.get(KEY, {})
      map[curWorld] = (map[curWorld] || 0) + secs
      settings.set(KEY, map)
      enteredAt = now
    }
  }
}

// Called whenever the current world changes (or you leave: worldName = '').
function setWorld (worldName) {
  worldName = worldName || ''
  if (worldName === curWorld) return
  tickCommit()
  curWorld = worldName
  enteredAt = worldName ? Date.now() : 0
}

function list () { return settings.get(KEY, {}) }
function clear () { settings.set(KEY, {}); curWorld && (enteredAt = Date.now()) }

module.exports = { setWorld, tickCommit, list, clear }

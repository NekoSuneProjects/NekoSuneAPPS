// modules/vrchat/vrchatWorld.js
// Detects the VRChat world you're currently in by tailing VRChat's rolling
// output log (VRChat does NOT expose world info over OSC). From the log we pull:
//   - current world id + instance id  -> a clickable "launch/join" URL
//   - the world's display name
//   - your own user id (usr_...)       -> your VRChat profile URL
// Used to enrich the Discord Rich Presence. Runs in the MAIN process.
//
// Log location:  %USERPROFILE%\AppData\LocalLow\VRChat\VRChat\output_log_*.txt

const fs = require('fs')
const os = require('os')
const path = require('path')

const LOG_DIR = path.join(os.homedir(), 'AppData', 'LocalLow', 'VRChat', 'VRChat')
const POLL_MS = 5000

let timer = null
let onUpdate = null
let currentFile = null
let readPos = 0
let tail = '' // carry an unfinished last line between reads

const state = {
  inWorld: false,
  worldId: '',
  instanceId: '',
  worldName: '',
  userId: '',
  joinUrl: '', // launch straight into this instance
  worldUrl: '', // the world's public page
  profileUrl: '', // your VRChat profile
  players: [], // RADAR: display names currently in your instance (from the log)
  lastVideo: '' // last video URL played in the instance (from the log)
}

// Radar player set, kept in sync with state.players.
const playerSet = new Set()
function syncPlayers () { state.players = Array.from(playerSet) }

function buildUrls () {
  state.worldUrl = state.worldId ? `https://vrchat.com/home/world/${state.worldId}` : ''
  state.joinUrl = (state.worldId && state.instanceId)
    ? `https://vrchat.com/home/launch?worldId=${state.worldId}&instanceId=${encodeURIComponent(state.instanceId)}`
    : ''
  state.profileUrl = state.userId ? `https://vrchat.com/home/user/${state.userId}` : ''
}

function emit () {
  buildUrls()
  if (typeof onUpdate === 'function') onUpdate({ ...state, at: Date.now() })
}

// Parse a single log line and fold any world/user info into state.
// Returns true if something relevant changed.
function processLine (line) {
  // "[Behaviour] Joining wrld_xxxx-...:12345~region(use)~nonce(...)"
  let m = line.match(/Joining (wrld_[^\s:]+):(\S+)/)
  if (m) {
    state.worldId = m[1]
    state.instanceId = m[2]
    state.inWorld = true
    playerSet.clear(); syncPlayers() // new instance — radar resets
    return true
  }
  // RADAR: "[Behaviour] OnPlayerJoined <DisplayName> (usr_...)"
  m = line.match(/OnPlayerJoined\s+(.+)$/)
  if (m && !/OnPlayerJoinComplete/.test(line)) {
    playerSet.add(m[1].replace(/\s*\(usr_[^)]+\)\s*$/, '').trim())
    syncPlayers()
    return true
  }
  // "[Behaviour] OnPlayerLeft <DisplayName> (usr_...)"
  m = line.match(/OnPlayerLeft\s+(.+)$/)
  if (m) {
    playerSet.delete(m[1].replace(/\s*\(usr_[^)]+\)\s*$/, '').trim())
    syncPlayers()
    return true
  }
  // "[Behaviour] Joining or Creating Room: <World Name>"
  m = line.match(/Joining or Creating Room:\s*(.+?)\s*$/)
  if (m) {
    state.worldName = m[1]
    state.inWorld = true
    return true
  }
  // "[Behaviour] OnLeftRoom"
  if (/OnLeftRoom\b/.test(line)) {
    state.inWorld = false
    state.worldId = ''
    state.instanceId = ''
    state.worldName = ''
    playerSet.clear(); syncPlayers()
    return true
  }
  // Video player URLs (for media-link history).
  m = line.match(/\[Video Playback\][^']*resolve URL '([^']+)'/) || line.match(/added URL '([^']+)'/)
  if (m) { state.lastVideo = m[1]; return true }
  // "User Authenticated: DisplayName (usr_xxxx-...)"
  m = line.match(/User Authenticated:.*\((usr_[^)]+)\)/)
  if (m) {
    state.userId = m[1]
    return true
  }
  return false
}

function newestLogFile () {
  let files
  try {
    files = fs.readdirSync(LOG_DIR).filter(f => /^output_log_.*\.txt$/i.test(f))
  } catch (_) {
    return null // VRChat never run / dir missing
  }
  if (!files.length) return null
  let best = null
  let bestMtime = -1
  for (const f of files) {
    try {
      const mt = fs.statSync(path.join(LOG_DIR, f)).mtimeMs
      if (mt > bestMtime) { bestMtime = mt; best = f }
    } catch (_) { /* file vanished mid-scan */ }
  }
  return best ? path.join(LOG_DIR, best) : null
}

function consume (chunk) {
  tail += chunk
  const lines = tail.split(/\r?\n/)
  tail = lines.pop() // last element is the (possibly partial) trailing line
  let changed = false
  for (const line of lines) {
    if (line && processLine(line)) changed = true
  }
  return changed
}

function poll () {
  const newest = newestLogFile()
  if (!newest) return

  // A new VRChat session started -> switch to the fresh log, read it whole.
  if (newest !== currentFile) {
    currentFile = newest
    readPos = 0
    tail = ''
  }

  let size
  try { size = fs.statSync(currentFile).size } catch (_) { return }
  if (size < readPos) { readPos = 0; tail = '' } // log truncated/rotated
  if (size === readPos) return // nothing new

  let fd
  try {
    fd = fs.openSync(currentFile, 'r')
    const len = size - readPos
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, readPos)
    readPos = size
    if (consume(buf.toString('utf8'))) emit()
  } catch (_) {
    /* ignore transient read errors */
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd) } catch (_) {}
  }
}

function startVrcWorld (listener) {
  onUpdate = listener
  stopVrcWorld()
  // Prime state from the current log immediately, then poll for changes.
  poll()
  emit()
  timer = setInterval(poll, POLL_MS)
  return true
}

function stopVrcWorld () {
  if (timer) { clearInterval(timer); timer = null }
}

function getVrcWorld () { return { ...state } }

module.exports = { startVrcWorld, stopVrcWorld, getVrcWorld }

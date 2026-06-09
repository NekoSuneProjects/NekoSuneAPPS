// modules/integrations/tonModule.js
// Integration with ToNSaveManager (Terrors of Nowhere save manager / tracker).
//
// ToNSaveManager exposes a local WebSocket API (Settings -> "WebSocket API",
// default ws://127.0.0.1:11398, "WebTracker compatibility" on). It broadcasts a
// full state snapshot on connect (the CONNECTED message's `Args` array) and then
// individual events as the game progresses: round type, current terror, map,
// alive/opted-in status, item, players in the instance, and lifetime stats
// (rounds / deaths / survivals / damage taken / stuns).
//
// We connect as a read-only client, keep a flat `state` the renderer turns into
// chatbox tokens (a `{ton*}` family) and a status line, and auto-reconnect when
// ToNSaveManager is closed or restarted. Runs in the MAIN process.

const WebSocket = require('ws')

const DEFAULT_PORT = 11398
const RECONNECT_MS = 5000

let ws = null
let reconnectTimer = null
let emitTimer = null
let onUpdate = null
let onRound = null
let running = false
let port = DEFAULT_PORT
let currentRound = null // in-progress round snapshot, finalised on round end

const state = {
  connected: false, // WebSocket actually connected to ToNSaveManager
  error: '',
  displayName: '',
  // live round
  roundActive: false,
  roundType: '',
  terror: '',
  terrorColor: 0,
  map: '',
  item: '',
  alive: true,
  optedIn: false,
  saboteur: false,
  players: 0,
  instance: '',
  pageCount: 0,
  // lifetime stats
  rounds: 0,
  deaths: 0,
  survivals: 0,
  damageTaken: 0,
  stuns: 0,
  stunsAll: 0,
  topStuns: 0,
  topStunsAll: 0,
  // this-session ("lobby") stats — reset by ToNSaveManager per instance
  sessionRounds: 0,
  sessionSurvivals: 0,
  sessionDeaths: 0,
  sessionStuns: 0,
  sessionDamage: 0,
  lastRound: null, // { roundType, terror, map, result, durationSec, at }
  at: 0
}

// Coalesce bursts of events (e.g. the CONNECTED snapshot, or a death spree) into
// a single update so we don't spam the renderer.
function scheduleEmit () {
  if (emitTimer) return
  emitTimer = setTimeout(() => {
    emitTimer = null
    state.at = Date.now()
    if (typeof onUpdate === 'function') onUpdate({ ...state })
  }, 200)
}

const STATS_KEYS = {
  Rounds: 'rounds',
  Deaths: 'deaths',
  Survivals: 'survivals',
  DamageTaken: 'damageTaken',
  Stuns: 'stuns',
  StunsAll: 'stunsAll',
  TopStuns: 'topStuns',
  TopStunsAll: 'topStunsAll',
  PlayersOnline: 'players',
  PageCount: 'pageCount',
  // per-session ("lobby") counters
  LobbyRounds: 'sessionRounds',
  LobbySurvivals: 'sessionSurvivals',
  LobbyDeaths: 'sessionDeaths',
  LobbyStunsAll: 'sessionStuns',
  LobbyDamageTaken: 'sessionDamage'
}

function applyEvent (ev) {
  if (!ev || typeof ev !== 'object') return
  switch (ev.Type) {
    case 'ALIVE': state.alive = !!ev.Value; break
    case 'ROUND_ACTIVE': state.roundActive = !!ev.Value; break
    case 'OPTED_IN': state.optedIn = !!ev.Value; break
    case 'IS_SABOTEUR': state.saboteur = !!ev.Value; break
    case 'ROUND_TYPE':
      // Prefer the readable name (DisplayName/Name like "Classic"/"Unbound") over
      // the numeric Value. "Intermission" (Command 0) is the between-rounds lobby.
      state.roundType = String(ev.DisplayName || ev.Name || ev.Value || '').trim()
      break
    case 'TERRORS': {
      let name = ''
      if (Array.isArray(ev.Names)) name = ev.Names.filter(Boolean).join(' & ')
      if (!name && ev.DisplayName && ev.DisplayName !== '???') name = ev.DisplayName
      state.terror = name
      state.terrorColor = Number.isFinite(ev.DisplayColor) ? ev.DisplayColor : 0
      break
    }
    case 'LOCATION': state.map = String(ev.Name || '').trim(); break
    case 'ITEM': state.item = String(ev.Name || '').trim(); break
    case 'INSTANCE': state.instance = String(ev.Value || '').trim(); break
    case 'STATS': {
      const key = STATS_KEYS[ev.Name]
      if (key && Number.isFinite(ev.Value)) state[key] = ev.Value
      break
    }
    // PLAYER_JOIN / PLAYER_LEAVE / TRACKER are covered by STATS.PlayersOnline and
    // the round events above, so we don't need to track them individually.
    default: break
  }
}

// Watch ROUND_ACTIVE transitions to bracket each round, capturing the round type,
// terror and map as they're revealed (ToN may reset them to "???" at round end, so
// we snapshot continuously) and finalising a record the renderer/main can persist.
function trackRound () {
  if (state.roundActive) {
    if (!currentRound) currentRound = { startAt: Date.now(), roundType: '', terror: '', map: '', died: false }
    if (state.roundType && state.roundType !== 'Intermission') currentRound.roundType = state.roundType
    if (state.terror) currentRound.terror = state.terror
    if (state.map) currentRound.map = state.map
    if (!state.alive) currentRound.died = true
  } else if (currentRound) {
    const endAt = Date.now()
    const rec = {
      roundType: currentRound.roundType || (state.roundType !== 'Intermission' ? state.roundType : '') || 'Round',
      terror: currentRound.terror || '',
      map: currentRound.map || state.map || '',
      result: (currentRound.died || !state.alive) ? 'Died' : 'Survived',
      durationSec: Math.max(0, Math.round((endAt - currentRound.startAt) / 1000)),
      at: endAt
    }
    state.lastRound = rec
    currentRound = null
    if (typeof onRound === 'function') { try { onRound(rec) } catch (_) { /* ignore */ } }
  }
}

function handleMessage (raw) {
  let msg
  try { msg = JSON.parse(raw) } catch { return }
  if (!msg || typeof msg !== 'object') return
  if (msg.Type === 'CONNECTED') {
    state.displayName = String(msg.DisplayName || '').trim()
    if (Array.isArray(msg.Args)) msg.Args.forEach(applyEvent)
  } else {
    applyEvent(msg)
  }
  trackRound()
  scheduleEmit()
}

function scheduleReconnect () {
  if (!running || reconnectTimer) return
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect() }, RECONNECT_MS)
}

function connect () {
  if (!running) return
  try {
    ws = new WebSocket(`ws://127.0.0.1:${port}`)
  } catch (err) {
    state.connected = false
    state.error = err.message
    scheduleEmit()
    scheduleReconnect()
    return
  }

  ws.on('open', () => {
    state.connected = true
    state.error = ''
    scheduleEmit()
  })
  ws.on('message', data => handleMessage(data.toString()))
  ws.on('error', err => {
    // ECONNREFUSED simply means ToNSaveManager (or its API) isn't running yet.
    state.error = /ECONNREFUSED/.test(err.message) ? 'ToNSaveManager not running / WebSocket API off' : err.message
  })
  ws.on('close', () => {
    state.connected = false
    ws = null
    currentRound = null // drop any partial round; don't log a bogus result on reconnect
    scheduleEmit()
    scheduleReconnect()
  })
}

function startTon (listener, { port: p, onRound: roundCb } = {}) {
  onUpdate = listener
  onRound = typeof roundCb === 'function' ? roundCb : null
  port = Number(p) > 0 ? Number(p) : DEFAULT_PORT
  stopTon()
  running = true
  connect()
}

function stopTon () {
  running = false
  currentRound = null
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (emitTimer) { clearTimeout(emitTimer); emitTimer = null }
  if (ws) {
    try { ws.removeAllListeners(); ws.terminate() } catch { /* ignore */ }
    ws = null
  }
  state.connected = false
}

function getTonState () { return { ...state } }

module.exports = { startTon, stopTon, getTonState }

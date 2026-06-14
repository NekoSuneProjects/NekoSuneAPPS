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
let onAchievement = null
let onSave = null
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
  roundTypeId: 0, // numeric Value from ROUND_TYPE — forwarded raw to ToN_RoundType
  terror: '',
  terrorColor: 0,
  terrorIds: [0, 0, 0], // numeric terror ids — forwarded raw to ToN_Terror1/2/3
  map: '',
  mapId: 0, // numeric Value from LOCATION — forwarded raw to ToN_Map
  season: 0, // numeric season id if ToNSaveManager sends one
  item: '',
  itemId: 0, // numeric Value from ITEM — forwarded raw to ToN_Item
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

// First finite number from a list of candidate fields (0 if none).
function firstNumber (cands) {
  for (const v of cands) { const n = Number(v); if (Number.isFinite(n)) return n }
  return 0
}
// Extract up to 3 numeric terror ids from a TERRORS event, whatever shape it uses.
function terrorIdArray (ev) {
  for (const k of ['Ids', 'Values', 'Indexes', 'Indices']) {
    if (Array.isArray(ev[k]) && ev[k].length) {
      return [0, 1, 2].map(i => Number.isFinite(Number(ev[k][i])) ? Number(ev[k][i]) : 0)
    }
  }
  const single = firstNumber([ev.Value, ev.Id, ev.Index])
  return [single, 0, 0]
}

// Ring buffer of the most recent raw WS messages — powers the debug view so the
// exact ToNSaveManager field names/values can be verified against the avatar.
const rawLog = []
function pushRaw (msg) {
  rawLog.unshift({ at: Date.now(), msg })
  if (rawLog.length > 60) rawLog.length = 60
}
function getTonRaw () { return rawLog.slice() }

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
      // Raw numeric id forwarded straight to the avatar's ToN_RoundType (Int).
      state.roundTypeId = firstNumber([ev.Value, ev.Command, ev.Id])
      break
    case 'TERRORS': {
      let name = ''
      if (Array.isArray(ev.Names)) name = ev.Names.filter(Boolean).join(' & ')
      if (!name && ev.DisplayName && ev.DisplayName !== '???') name = ev.DisplayName
      state.terror = name
      state.terrorColor = Number.isFinite(ev.DisplayColor) ? ev.DisplayColor : 0
      // Raw terror ids → ToN_Terror1/2/3. Different ToNSaveManager builds expose
      // these as an array (Ids/Values/Indexes) or a single Value; cover them all.
      state.terrorIds = terrorIdArray(ev)
      break
    }
    case 'LOCATION':
      state.map = String(ev.Name || '').trim()
      state.mapId = firstNumber([ev.Value, ev.Index, ev.Id])
      break
    case 'ITEM':
      state.item = String(ev.Name || '').trim()
      state.itemId = firstNumber([ev.Value, ev.Index, ev.Id])
      break
    case 'SEASON': state.season = firstNumber([ev.Value, ev.Index, ev.Id]); break
    case 'INSTANCE': state.instance = String(ev.Value || '').trim(); break
    case 'STATS': {
      const key = STATS_KEYS[ev.Name]
      if (key && Number.isFinite(ev.Value)) state[key] = ev.Value
      break
    }
    case 'TRACKER': {
      // ToNSaveManager fires { event:"achievement", args:["<Name>"] } when the
      // player unlocks one in-game — the live auto-unlock signal for the board.
      if (ev.event === 'achievement' && Array.isArray(ev.args) && ev.args[0]) {
        const name = String(ev.args[0]).trim()
        if (name && typeof onAchievement === 'function') { try { onAchievement(name) } catch (_) { /* ignore */ } }
      }
      break
    }
    case 'SAVED': {
      // The game's full save code — auto-backed up with a timestamp.
      const code = String(ev.Value || '').trim()
      if (code && typeof onSave === 'function') { try { onSave(code) } catch (_) { /* ignore */ } }
      break
    }
    // PLAYER_JOIN / PLAYER_LEAVE are covered by STATS.PlayersOnline.
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
  pushRaw(msg)
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

function startTon (listener, { port: p, onRound: roundCb, onAchievement: achCb, onSave: saveCb } = {}) {
  onUpdate = listener
  onRound = typeof roundCb === 'function' ? roundCb : null
  onAchievement = typeof achCb === 'function' ? achCb : null
  onSave = typeof saveCb === 'function' ? saveCb : null
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

module.exports = { startTon, stopTon, getTonState, getTonRaw }

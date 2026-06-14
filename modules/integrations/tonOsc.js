// modules/integrations/tonOsc.js
// "ToN Tablet" avatar OSC proxy. Forwards the core ToNSaveManager state the app
// already reads (round type, terror, map, item, alive/opted-in/saboteur) to the
// avatar's ToN_ parameters via OSC — the same names the Terror Tablet expects.
//
// Scope: CORE params only. ToNSaveManager's own OSC still drives the full 134-float
// terror-grid buffer (ToN_T0..) — we don't replicate that. Numeric ids are forwarded
// RAW (as the WebSocket reports them); a debug view lets the values be verified
// in-game. Runs in MAIN.

const { sendParam } = require('../vrchat/osc/oscModule')

let enabled = false
let lastSent = {} // param -> last value, so we only send on change

// Map of avatar parameter -> how to derive its value from the ToN state.
// type is the OSC arg type. Edit here if your avatar uses different names.
const PARAMS = [
  { name: 'ToN_RoundType', type: 'int', get: s => s.roundTypeId | 0 },
  { name: 'ToN_Terror1', type: 'int', get: s => (s.terrorIds && s.terrorIds[0]) | 0 },
  { name: 'ToN_Terror2', type: 'int', get: s => (s.terrorIds && s.terrorIds[1]) | 0 },
  { name: 'ToN_Terror3', type: 'int', get: s => (s.terrorIds && s.terrorIds[2]) | 0 },
  { name: 'ToN_Map', type: 'int', get: s => s.mapId | 0 },
  { name: 'ToN_Season', type: 'int', get: s => s.season | 0 },
  { name: 'ToN_Item', type: 'int', get: s => s.itemId | 0 },
  { name: 'ToN_ItemStatus', type: 'bool', get: s => !!s.item },
  // Booleans the avatar may or may not use — harmless if absent (VRChat ignores
  // unknown params). Faithful to ToNSaveManager's core state.
  { name: 'ToN_IsAlive', type: 'bool', get: s => !!s.alive },
  { name: 'ToN_Optedin', type: 'bool', get: s => !!s.optedIn },
  { name: 'ToN_IsSaboteur', type: 'bool', get: s => !!s.saboteur },
  { name: 'ToN_RoundActive', type: 'bool', get: s => !!s.roundActive }
]

function setEnabled (on) {
  enabled = !!on
  if (!enabled) lastSent = {}
}
function isEnabled () { return enabled }

// Push the current ToN state to OSC. Only changed params are sent.
function apply (state) {
  if (!enabled || !state) return []
  const sent = []
  for (const p of PARAMS) {
    let v
    try { v = p.get(state) } catch (_) { continue }
    if (p.type === 'int') v = v | 0
    if (p.type === 'bool') v = !!v
    if (lastSent[p.name] === v) continue
    lastSent[p.name] = v
    sendParam('/avatar/parameters/' + p.name, v, p.type)
    sent.push({ name: p.name, type: p.type, value: v })
  }
  return sent
}

// A snapshot of what WOULD be sent (for the debug view), regardless of change-gating.
function preview (state) {
  return PARAMS.map(p => {
    let v
    try { v = p.get(state || {}) } catch (_) { v = null }
    return { name: p.name, type: p.type, value: p.type === 'bool' ? !!v : (v | 0) }
  })
}

// Re-send everything next apply() (e.g. after toggling on, or avatar reload).
function resync () { lastSent = {} }

module.exports = { setEnabled, isEnabled, apply, preview, resync, PARAMS }

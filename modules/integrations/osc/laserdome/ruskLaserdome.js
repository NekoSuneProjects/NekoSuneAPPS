'use strict'

// Native port of CartoonishVillain/RuskLaserdomeOSC (MIT).
// Reads VRChat log interaction lines and restores common Laserdome/avatar OSC parameters.

const fs = require('fs')
const os = require('os')
const path = require('path')
const osc = require('../../../vrchat/osc/oscModule')

const FEATURES = {
  dead: { parameter: 'LD/Dead', type: 'bool', initial: false },
  team: { parameter: 'LD/Team', type: 'int', initial: 0 },
  pistol: { parameter: 'IR/Pistol', type: 'bool', initial: false },
  fire: { parameter: 'IR/Fire', type: 'bool', initial: false },
  weld: { parameter: 'IR/Weld', type: 'bool', initial: false },
  duoRight: { parameter: 'Duo/Right', type: 'bool', initial: false },
  duoLeft: { parameter: 'Duo/Left', type: 'bool', initial: false },
  aviWeapon: { parameter: 'Avi/Weapon', type: 'bool', initial: false },
  uasrfWeapon: { parameter: 'UASRF/Weapon', type: 'bool', initial: false }
}

const DEFAULT_FEATURES = Object.fromEntries(Object.keys(FEATURES).map(key => [key, true]))

let timer = null
let currentLog = ''
let offset = 0
let remainder = ''
let config = null
let onUpdate = null
let lastError = ''
let lastLogCheck = 0
let state = initialState()

function initialState () {
  return Object.fromEntries(Object.entries(FEATURES).map(([key, feature]) => [key, feature.initial]))
}

function defaultLogDirectory () {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Low', 'VRChat', 'VRChat')
}

function latestLog (directory) {
  if (!fs.existsSync(directory)) return ''
  const files = fs.readdirSync(directory)
    .filter(name => /^output_log_.*\.txt$/i.test(name) || /^output_log.*\.txt$/i.test(name))
    .map(name => ({ file: path.join(directory, name), modified: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified)
  return files[0]?.file || ''
}

function setValue (key, value, changed) {
  if (!(config?.features || DEFAULT_FEATURES)[key] || state[key] === value) return
  state[key] = value
  changed.add(key)
}

function parseLogLine (line) {
  const changed = new Set()
  if (line.includes('[AvatarInteraction] Alive')) setValue('dead', false, changed)
  if (line.includes('[AvatarInteraction] Dead')) setValue('dead', true, changed)

  const teamMatch = line.match(/\[AvatarInteraction\] Team changed to \{?([0-5])\}?/)
  if (teamMatch) setValue('team', Number(teamMatch[1]), changed)

  const pickupRules = [
    ['pistol', 'Pistol'],
    ['fire', 'Firepickup'],
    ['weld', 'Welder'],
    ['duoRight', 'GunP'],
    ['duoLeft', 'GunB'],
    ['aviWeapon', 'Weapon'],
    ['uasrfWeapon', 'Trigger']
  ]
  for (const [key, objectName] of pickupRules) {
    if (line.includes(`[Behaviour] Pickup object: '${objectName}`)) setValue(key, true, changed)
    if (line.includes(`[Behaviour] Drop object: '${objectName}`)) setValue(key, false, changed)
  }
  return changed
}

function sendFeature (key) {
  const feature = FEATURES[key]
  osc.sendParam(`/avatar/parameters/${feature.parameter}`, state[key], feature.type)
}

function emit (event = '') {
  if (typeof onUpdate === 'function') onUpdate(getState(event))
}

function switchLogIfNeeded (force = false) {
  const now = Date.now()
  if (!force && now - lastLogCheck < 5000) return
  lastLogCheck = now
  const next = latestLog(config.logDirectory)
  if (!next || next === currentLog) return
  currentLog = next
  offset = config.scanExisting ? 0 : fs.statSync(currentLog).size
  remainder = ''
  emit('log-changed')
}

function poll () {
  try {
    switchLogIfNeeded()
    if (!currentLog || !fs.existsSync(currentLog)) return
    const size = fs.statSync(currentLog).size
    if (size < offset) { offset = 0; remainder = '' }
    if (size === offset) return
    const length = size - offset
    const buffer = Buffer.alloc(length)
    const fd = fs.openSync(currentLog, 'r')
    try { fs.readSync(fd, buffer, 0, length, offset) } finally { fs.closeSync(fd) }
    offset = size
    const lines = (remainder + buffer.toString('utf8')).split(/\r?\n/)
    remainder = lines.pop() || ''
    const changed = new Set()
    for (const line of lines) for (const key of parseLogLine(line)) changed.add(key)
    if (changed.size) {
      for (const key of changed) sendFeature(key)
      emit('state-changed')
    }
    lastError = ''
  } catch (err) {
    lastError = err.message
    emit('error')
  }
}

function start (options = {}, listener) {
  stop(false)
  config = {
    logDirectory: String(options.logDirectory || defaultLogDirectory()),
    pollMs: Math.max(100, Number(options.pollMs) || 250),
    scanExisting: !!options.scanExisting,
    oscPort: Math.max(1, Math.min(65535, Number(options.oscPort) || 9000)),
    features: { ...DEFAULT_FEATURES, ...(options.features || {}) }
  }
  onUpdate = listener
  state = initialState()
  lastError = ''
  lastLogCheck = 0
  osc.setOscPort(config.oscPort)
  switchLogIfNeeded(true)
  for (const key of Object.keys(FEATURES)) if (config.features[key]) sendFeature(key)
  timer = setInterval(poll, config.pollMs)
  poll()
  emit('started')
  return getState()
}

function stop (notify = true) {
  if (timer) clearInterval(timer)
  timer = null
  if (notify) emit('stopped')
  onUpdate = null
  return getState()
}

function getState (event = '') {
  return {
    running: !!timer,
    event,
    currentLog,
    logDirectory: config?.logDirectory || defaultLogDirectory(),
    features: { ...(config?.features || DEFAULT_FEATURES) },
    values: { ...state },
    lastError
  }
}

module.exports = { start, stop, getState, defaultLogDirectory, FEATURES, _test: { parseLogLine, initialState } }

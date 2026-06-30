'use strict' // Heart-rate OSC profile registry and normalized output adapters.

const PATHS = Object.freeze({
  heartEchoes: {
    value: '/avatar/parameters/HeartEchoes_Heart_Beat',
    active: '/avatar/parameters/isHRActive',
    connected: '/avatar/parameters/isHRConnected',
    beat: '/avatar/parameters/isHRBeat',
    toggle: '/avatar/parameters/HeartBeatToggle'
  },
  vrcosc: {
    connected: '/avatar/parameters/VRCOSC/Heartrate/Connected',
    value: '/avatar/parameters/VRCOSC/Heartrate/Value',
    enabled: '/avatar/parameters/VRCOSC/Heartrate/Enabled',
    beat: '/avatar/parameters/VRCOSC/Heartrate/Beat',
    normalised: '/avatar/parameters/VRCOSC/Heartrate/Normalised',
    average: '/avatar/parameters/VRCOSC/Heartrate/Average',
    units: '/avatar/parameters/VRCOSC/Heartrate/Units',
    tens: '/avatar/parameters/VRCOSC/Heartrate/Tens',
    hundreds: '/avatar/parameters/VRCOSC/Heartrate/Hundreds'
  },
  bekoLegacy: {
    value: '/avatar/parameters/HR'
  },
  akaryu: {
    percent: '/avatar/parameters/hr_percent',
    connected: '/avatar/parameters/hr_connected',
    beat: '/avatar/parameters/hr_beat'
  }
})

const DEFAULTS = Object.freeze({ heartEchoes: true, vrcosc: true, bekoLegacy: false, akaryu: true, akaryuMaxBpm: 200 })

function options (value = {}) {
  return {
    heartEchoes: value.heartEchoes !== false,
    vrcosc: value.vrcosc !== false,
    bekoLegacy: value.bekoLegacy === true,
    akaryu: value.akaryu !== false,
    akaryuMaxBpm: Math.max(40, Math.min(255, Number(value.akaryuMaxBpm) || 200))
  }
}

function send (sendParam, address, value, type) {
  sendParam(address, value, type)
}

function sendStatus (sendParam, value, status = {}) {
  const profile = options(value)
  if (profile.heartEchoes) {
    send(sendParam, PATHS.heartEchoes.active, !!status.active, 'bool')
    send(sendParam, PATHS.heartEchoes.connected, !!status.connected, 'bool')
  }
  if (profile.vrcosc) {
    send(sendParam, PATHS.vrcosc.connected, !!status.connected, 'bool')
    send(sendParam, PATHS.vrcosc.enabled, !!status.connected, 'bool')
  }
  if (profile.akaryu) send(sendParam, PATHS.akaryu.connected, !!status.connected, 'bool')
}

function sendReading (sendParam, value, bpmValue, averageValue = bpmValue) {
  const profile = options(value)
  const bpm = Math.max(0, Math.min(255, Math.round(Number(bpmValue) || 0)))
  const average = Math.max(0, Math.min(255, Math.round(Number(averageValue) || 0)))
  if (profile.heartEchoes) send(sendParam, PATHS.heartEchoes.value, bpm, 'int')
  if (profile.bekoLegacy) send(sendParam, PATHS.bekoLegacy.value, bpm, 'int')
  if (profile.akaryu) send(sendParam, PATHS.akaryu.percent, bpm / profile.akaryuMaxBpm, 'float')
  if (profile.vrcosc) {
    send(sendParam, PATHS.vrcosc.value, bpm, 'int')
    send(sendParam, PATHS.vrcosc.normalised, Math.min(1, bpm / 240), 'float')
    send(sendParam, PATHS.vrcosc.average, average, 'int')
    send(sendParam, PATHS.vrcosc.units, (bpm % 10) / 10, 'float')
    send(sendParam, PATHS.vrcosc.tens, (Math.floor(bpm / 10) % 10) / 10, 'float')
    send(sendParam, PATHS.vrcosc.hundreds, (Math.floor(bpm / 100) % 10) / 10, 'float')
  }
  return bpm
}

function sendBeat (sendParam, value, beat, toggle) {
  const profile = options(value)
  if (profile.heartEchoes) {
    send(sendParam, PATHS.heartEchoes.beat, !!beat, 'bool')
    if (typeof toggle === 'boolean') send(sendParam, PATHS.heartEchoes.toggle, toggle, 'bool')
  }
  // Synced avatar beat parameters use an alternating value so a beat cannot be lost
  // between network updates. The common isHRBeat path above remains a short pulse.
  if (typeof toggle === 'boolean' && profile.vrcosc) send(sendParam, PATHS.vrcosc.beat, toggle, 'bool')
  if (typeof toggle === 'boolean' && profile.akaryu) send(sendParam, PATHS.akaryu.beat, toggle, 'bool')
}

module.exports = { PATHS, DEFAULTS, options, sendStatus, sendReading, sendBeat }

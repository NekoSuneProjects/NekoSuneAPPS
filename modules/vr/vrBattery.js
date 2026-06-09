// modules/vr/vrBattery.js
// VR Gear Battery - reports battery % for HMD / controllers / trackers.
//
// HONEST STATUS: VR battery is exposed by the native OpenVR runtime
// (openvr_api.dll). There is no well-maintained pure-Node OpenVR binding, so this
// module currently reports "unavailable" and is a clearly-marked extension point.
//
// To make it real, two practical options:
//   1. Ship a tiny native helper (C#/C++ using OpenVR) that prints device battery
//      JSON, and spawn it from here with child_process.
//   2. Read SteamVR's lighthouse battery from the OpenVR `Prop_DeviceBatteryPercentage_Float`
//      property via a node-gyp addon.
// Until then, `getVrBattery()` returns { available: false }.

let onUpdate = null
let pollTimer = null
const last = { available: false, devices: [], at: 0 }

function tick () {
  // Placeholder: when a helper is wired in, populate `last.devices` with
  // [{ role: 'hmd'|'left'|'right'|'tracker', battery: 0..1, charging: bool }]
  last.at = Date.now()
  if (typeof onUpdate === 'function') onUpdate({ ...last })
}

function startVrBattery (listener, intervalMs = 15000) {
  onUpdate = listener
  stopVrBattery()
  tick()
  pollTimer = setInterval(tick, Math.max(5000, intervalMs))
}

function stopVrBattery () {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function getVrBattery () {
  return { ...last }
}

module.exports = { startVrBattery, stopVrBattery, getVrBattery }

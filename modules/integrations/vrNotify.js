// modules/integrations/vrNotify.js
// Alert system for ToN achievements / unlocks via the `vrnotications` package.
// Auto-detects whether you're in VR and routes the notification to the right place:
//   • XSOverlay running        -> XSOverlay overlay toast
//   • OVR Toolkit running      -> OVR Toolkit overlay toast
//   • SteamVR but neither app  -> try both overlays (best effort)
//   • not in VR                -> Windows desktop notification
// Mode can be forced (xsoverlay / ovrtoolkit / windows / off) or left on 'auto'.
// Runs in the MAIN process. Loads the library lazily so a missing dep never crashes.

const { execFile } = require('child_process')

let lib = null
let loaded = false
function load () {
  if (loaded) return lib
  loaded = true
  try { lib = require('vrnotications') } catch (err) { console.warn('vrnotications unavailable:', err.message); lib = null }
  return lib
}

function procRunning (name) {
  if (process.platform !== 'win32') return Promise.resolve(false)
  return new Promise(res => {
    try {
      execFile('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/NH'], (err, out) =>
        res(!err && new RegExp(name.replace(/[.]/g, '\\.'), 'i').test(out || '')))
    } catch (_) { res(false) }
  })
}

// XSOverlay needs an explicit connect() then an open socket before sending.
function sendXS (title, content) {
  const L = load(); if (!L) return Promise.resolve(false)
  return new Promise(resolve => {
    let done = false
    const finish = ok => { if (done) return; done = true; resolve(ok) }
    let xs
    try { xs = new L.XSOverlay(); xs.connect() } catch (_) { return finish(false) }
    if (!xs.ws) return finish(false)
    xs.ws.on('open', () => {
      try { xs.sendNotification({ title, content, timeout: 5 }) } catch (_) {}
      setTimeout(() => { try { xs.ws.close() } catch (_) {} finish(true) }, 400)
    })
    xs.ws.on('error', () => finish(false))
    setTimeout(() => { try { xs.ws && xs.ws.close() } catch (_) {} finish(false) }, 3000)
  })
}

function sendOVR (title, body) {
  const L = load(); if (!L) return false
  try {
    const o = new L.OVRToolkit() // connects + queues until open
    o.ws.on('error', () => {}) // swallow if OVR Toolkit isn't running
    o.sendNotification(title, body)
    setTimeout(() => { try { o.ws.close() } catch (_) {} }, 1500)
    return true
  } catch (_) { return false }
}

function sendWin (title, message) {
  const L = load(); if (!L) return false
  try { new L.WindowsNotifications().sendNotification(title, message, null); return true } catch (_) { return false }
}

// mode: 'auto' | 'xsoverlay' | 'ovrtoolkit' | 'windows' | 'off'
async function notify (title, content, mode = 'auto') {
  if (mode === 'off') return { sent: [] }
  const sent = []
  try {
    if (mode === 'windows') { sendWin(title, content); sent.push('windows') } else if (mode === 'xsoverlay') { await sendXS(title, content); sent.push('xsoverlay') } else if (mode === 'ovrtoolkit') { sendOVR(title, content); sent.push('ovrtoolkit') } else {
      // auto — route to whatever's actually running
      if (await procRunning('XSOverlay.exe')) { await sendXS(title, content); sent.push('xsoverlay') } else if (await procRunning('OVR Toolkit.exe')) { sendOVR(title, content); sent.push('ovrtoolkit') } else if (await procRunning('vrserver.exe') || await procRunning('vrmonitor.exe')) { sendOVR(title, content); await sendXS(title, content); sent.push('vr') } else { sendWin(title, content); sent.push('windows') }
    }
  } catch (err) { console.warn('vrNotify:', err.message) }
  return { sent }
}

async function detect () {
  return {
    xsoverlay: await procRunning('XSOverlay.exe'),
    ovrtoolkit: await procRunning('OVR Toolkit.exe'),
    steamvr: (await procRunning('vrserver.exe')) || (await procRunning('vrmonitor.exe'))
  }
}

module.exports = { notify, detect }

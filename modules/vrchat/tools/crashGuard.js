// modules/vrchat/tools/crashGuard.js
// Crash recovery / auto-rejoin — watches whether VRChat.exe is running; if it was
// running and disappears while you had a current instance, relaunch into it.
// Opt-in (can't perfectly tell a crash from a normal quit). Windows. MAIN process.

const { exec } = require('child_process')
const { shell } = require('electron')

let timer = null
let enabled = false
let wasRunning = false
let getLocation = null

function isVrchatRunning (cb) {
  exec('tasklist /FI "IMAGENAME eq VRChat.exe" /NH', (err, out) => cb(!err && /VRChat\.exe/i.test(out || '')))
}

function tick () {
  isVrchatRunning(running => {
    if (enabled && wasRunning && !running) {
      const loc = getLocation && getLocation()
      if (loc) {
        const [worldId, ...rest] = loc.split(':')
        shell.openExternal(`https://vrchat.com/home/launch?worldId=${worldId}&instanceId=${encodeURIComponent(rest.join(':'))}`)
      }
    }
    wasRunning = running
  })
}

function start (opts = {}) {
  enabled = !!opts.enabled
  if (opts.getLocation) getLocation = opts.getLocation
  stop()
  tick()
  timer = setInterval(tick, 15000)
}
function setEnabled (v) { enabled = !!v }
function stop () { if (timer) { clearInterval(timer); timer = null } }

module.exports = { start, stop, setEnabled }

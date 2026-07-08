// modules/vrchat/tools/crashGuard.js
// Crash recovery / auto-rejoin — watches whether VRChat.exe is running; if it
// actually CRASHED while you had a current instance, relaunch into it.
// Windows. MAIN process.
//
// "The process is no longer running" is true for a crash AND for closing
// VRChat normally, so that alone can't tell them apart (this used to just
// fire on any disappearance, which is exactly the false-positive reported:
// a normal close looked identical to a crash). A real crash - an unhandled
// exception, access violation, etc. - is instead confirmed against Windows'
// own crash reporter (WER), which logs an "Application Error" event
// (Application log, Event ID 1000) for the crashing process; a normal
// ExitProcess/quit never generates one. Only rejoin if one shows up for
// VRChat.exe around the time it disappeared.

const { exec } = require('child_process')
const { shell } = require('electron')

let timer = null
let enabled = false
let wasRunning = false
let getLocation = null

function isVrchatRunning (cb) {
  exec('tasklist /FI "IMAGENAME eq VRChat.exe" /NH', (err, out) => cb(!err && /VRChat\.exe/i.test(out || '')))
}

function hadRecentCrashEvent (cb) {
  const psCommand = "Get-WinEvent -FilterHashtable @{LogName='Application'; Id=1000; StartTime=(Get-Date).AddMinutes(-3)} -ErrorAction SilentlyContinue " +
    "| Where-Object { $_.Message -match 'VRChat\\.exe' } | Select-Object -First 1 | ForEach-Object { 'CRASH_FOUND' }"
  exec(`powershell -NoProfile -NonInteractive -Command "${psCommand}"`, { windowsHide: true }, (err, out) => {
    // Ignore exit code - Get-WinEvent's own PS exit status when nothing
    // matches is inconsistent across versions even with SilentlyContinue;
    // the marker string in stdout is the reliable signal either way.
    cb(/CRASH_FOUND/.test(out || ''))
  })
}

function tick () {
  isVrchatRunning(running => {
    if (enabled && wasRunning && !running) {
      hadRecentCrashEvent(crashed => {
        if (!crashed) return // closed normally - nothing to recover from
        const loc = getLocation && getLocation()
        if (loc) {
          const [worldId, ...rest] = loc.split(':')
          shell.openExternal(`https://vrchat.com/home/launch?worldId=${worldId}&instanceId=${encodeURIComponent(rest.join(':'))}`)
        }
      })
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

// modules/vrchat/osc/keyHookPs.js
// Node wrapper around keyHook.ps1 - spawns a global low-level keyboard hook
// (WH_KEYBOARD_LL) as a child PowerShell process and streams keydown/keyup
// events back. Runs in the MAIN process (Windows only). No third-party
// binary is bundled - only the system's own signed powershell.exe runs,
// following the same shell-out pattern as mediaKeys.js.
//
// Only ever started while a feature that needs it is actively enabled
// (e.g. Avatar Scaling connected, or a "record key" prompt is open) -
// never at app launch - to keep the hook's footprint as small as possible.

const { spawn } = require('child_process')
const path = require('path')
const readline = require('readline')

let proc = null
let listeners = new Set()

function isRunning () {
  return !!proc
}

function start () {
  if (proc || process.platform !== 'win32') return

  const scriptPath = path.join(__dirname, 'keyHook.ps1')
  proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    windowsHide: true
  })

  const rl = readline.createInterface({ input: proc.stdout })
  rl.on('line', line => {
    let evt
    try { evt = JSON.parse(line) } catch (_) { return }
    if (!evt || (evt.t !== 'down' && evt.t !== 'up') || !Number.isFinite(evt.vk)) return
    listeners.forEach(fn => { try { fn(evt) } catch (_) {} })
  })

  proc.on('exit', () => { proc = null })
  proc.on('error', () => { proc = null })
}

function stop () {
  if (!proc) return
  try { proc.kill() } catch (_) {}
  proc = null
}

// Subscribe to key events while the hook is running. Returns an
// unsubscribe function. Starts the hook on first subscriber, stops it when
// the last subscriber leaves.
function subscribe (fn) {
  listeners.add(fn)
  start()
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0) stop()
  }
}

module.exports = { subscribe, isRunning }

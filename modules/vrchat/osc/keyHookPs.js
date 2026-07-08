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
let lastError = null

function isRunning () {
  return !!proc
}

// Surfaced by the "record key" flow so a hook that never actually installs
// (blocked by antivirus, restrictive PowerShell execution policy, no .NET,
// etc.) shows a real reason instead of just silently timing out and looking
// like "recording never saves".
function getLastError () {
  return lastError
}

function start () {
  if (proc || process.platform !== 'win32') return
  lastError = null

  const scriptPath = path.join(__dirname, 'keyHook.ps1')
  let stderrBuf = ''
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
  proc.stderr.on('data', chunk => { stderrBuf += chunk.toString() })

  proc.on('exit', code => {
    if (code) lastError = `Keyboard hook exited unexpectedly (code ${code}). ${stderrBuf.trim().slice(-300) || 'Check that PowerShell can run scripts and that antivirus isn\'t blocking it.'}`
    proc = null
  })
  proc.on('error', err => { lastError = err.message; proc = null })
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

module.exports = { subscribe, isRunning, getLastError }

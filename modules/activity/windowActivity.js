// modules/activity/windowActivity.js
// "Window Activity" - reports the currently focused window title/app.
// Pure-JS / no native module (was node-window-manager, which needed a native
// build and broke cross-platform CI). On Windows we ask PowerShell for the
// foreground window via user32; on macOS/Linux we use the platform's own CLI.
// Read-only: we never modify other windows. Runs in the MAIN process.

const { execFile } = require('child_process')

let pollTimer = null
let onUpdate = null
let last = { title: '', app: '', at: 0 }
let busy = false

// PowerShell: foreground window title + owning process name, as "title|app".
const PS_SCRIPT = `
$sig = '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);'
Add-Type -MemberDefinition $sig -Name U -Namespace W -ErrorAction SilentlyContinue
$h = [W.U]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[void][W.U]::GetWindowText($h, $sb, 512)
$pid2 = 0
[void][W.U]::GetWindowThreadProcessId($h, [ref]$pid2)
$p = ''
try { $p = (Get-Process -Id $pid2 -ErrorAction Stop).ProcessName } catch {}
Write-Output ($sb.ToString() + '|' + $p)
`.trim()

function parseAndEmit (out) {
  const line = String(out || '').split(/\r?\n/).find(Boolean) || ''
  const idx = line.lastIndexOf('|')
  const title = (idx >= 0 ? line.slice(0, idx) : line).trim()
  const app = (idx >= 0 ? line.slice(idx + 1) : '').trim()
  if (!title && !app) return
  if (title !== last.title || app !== last.app) {
    last = { title, app, at: Date.now() }
    if (typeof onUpdate === 'function') onUpdate({ ...last })
  }
}

function tick () {
  if (busy) return // don't pile up spawns if one is slow
  busy = true
  if (process.platform === 'win32') {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
      { windowsHide: true, timeout: 4000 }, (err, stdout) => { busy = false; if (!err) parseAndEmit(stdout) })
  } else if (process.platform === 'darwin') {
    // Frontmost app name (title needs accessibility perms; app name is enough).
    execFile('osascript', ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true'],
      { timeout: 4000 }, (err, stdout) => { busy = false; if (!err) parseAndEmit('|' + String(stdout).trim()) })
  } else {
    // Linux (X11): xdotool if present; otherwise this feature is a no-op.
    execFile('xdotool', ['getactivewindow', 'getwindowname'],
      { timeout: 4000 }, (err, stdout) => { busy = false; if (!err) parseAndEmit(String(stdout).trim() + '|') })
  }
}

function startWindowActivity (listener, intervalMs = 3000) {
  onUpdate = listener
  stopWindowActivity()
  tick()
  pollTimer = setInterval(tick, Math.max(2000, intervalMs))
}

function stopWindowActivity () {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function getWindowActivity () {
  return { ...last }
}

module.exports = { startWindowActivity, stopWindowActivity, getWindowActivity }

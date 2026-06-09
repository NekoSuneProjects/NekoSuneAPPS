// modules/activity/windowActivity.js
// "Window Activity" - reports the currently focused window title/app.
// Uses node-window-manager. Runs in the MAIN process.

let windowManager
try {
  ({ windowManager } = require('node-window-manager'))
} catch (err) {
  console.warn('node-window-manager not available:', err.message)
}

let pollTimer = null
let onUpdate = null
let last = { title: '', app: '', at: 0 }

function appNameFromPath (path) {
  if (!path) return ''
  const parts = String(path).split(/[\\/]/)
  return parts[parts.length - 1].replace(/\.exe$/i, '')
}

function tick () {
  if (!windowManager) return
  try {
    const win = windowManager.getActiveWindow()
    if (!win) return
    const title = (typeof win.getTitle === 'function' ? win.getTitle() : '') || ''
    const app = appNameFromPath(win.path)
    if (title !== last.title || app !== last.app) {
      last = { title, app, at: Date.now() }
      if (typeof onUpdate === 'function') onUpdate({ ...last })
    }
  } catch (err) {
    // getActiveWindow can throw transiently; ignore.
  }
}

function startWindowActivity (listener, intervalMs = 3000) {
  onUpdate = listener
  stopWindowActivity()
  tick()
  pollTimer = setInterval(tick, Math.max(1000, intervalMs))
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

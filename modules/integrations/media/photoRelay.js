// modules/integrations/media/photoRelay.js
// Watches your VRChat photos folder and auto-uploads new screenshots to a Discord
// channel via webhook. Local-only; nothing else leaves your PC. Runs in MAIN.

const fs = require('fs')
const path = require('path')
const axios = require('axios')
const { resolvePhotosDir } = require('../../vrchat/tools/vrcTools')

let watcher = null
let cfg = { enabled: false, webhook: '' }
const seen = new Set()
let onEvent = null

function start (opts = {}, listener) {
  if (listener) onEvent = listener
  cfg = { enabled: !!opts.enabled, webhook: String(opts.webhook || '').trim() }
  stop()
  if (!cfg.enabled || !cfg.webhook) return
  const photosDir = resolvePhotosDir()
  if (!fs.existsSync(photosDir)) { if (onEvent) onEvent({ error: 'VRChat photos folder not found' }); return }
  try {
    watcher = fs.watch(photosDir, { recursive: true }, (evt, fname) => {
      if (fname && /\.png$/i.test(fname)) queue(path.join(photosDir, String(fname)))
    })
    if (onEvent) onEvent({ watching: true })
  } catch (e) { console.warn('photoRelay watch:', e.message); if (onEvent) onEvent({ error: e.message }) }
}

function queue (file) {
  if (seen.has(file)) return
  seen.add(file)
  // Give VRChat time to finish writing the file before uploading.
  setTimeout(() => send(file), 2500)
}

async function send (file) {
  try {
    if (!fs.existsSync(file)) return
    const buf = fs.readFileSync(file)
    const fd = new FormData()
    fd.append('file', new Blob([buf]), path.basename(file))
    await axios.post(cfg.webhook, fd)
    if (onEvent) onEvent({ sent: path.basename(file) })
  } catch (e) {
    console.warn('photoRelay send:', e.message)
    if (onEvent) onEvent({ error: e.message })
  }
}

function stop () { if (watcher) { try { watcher.close() } catch (_) {} watcher = null } }

module.exports = { start, stop }

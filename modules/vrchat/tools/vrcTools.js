// modules/vrchat/tools/vrcTools.js
// ToS-safe VRChat maintenance utilities (inspired by VRCNext) — all EXTERNAL,
// file-based only. Nothing here injects into or modifies the VRChat game.
//   - YouTube fix: download the latest yt-dlp.exe into VRChat's Tools folder
//     (VRChat's video players use yt-dlp; updating it is the standard fix).
//   - Cache: report / clear the VRChat asset cache.
//   - Folder shortcuts: resolve the common VRChat folders to open.
// Runs in the MAIN process (Windows paths).

const axios = require('axios')
const fs = require('fs')
const os = require('os')
const path = require('path')

const VRCHAT_DIR = path.join(os.homedir(), 'AppData', 'LocalLow', 'VRChat', 'VRChat')
const TOOLS_DIR = path.join(VRCHAT_DIR, 'Tools')
const CACHE_DIR = path.join(VRCHAT_DIR, 'Cache-WindowsPlayer')
const PHOTOS_DIR = path.join(os.homedir(), 'Pictures', 'VRChat')

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'

// Download the latest yt-dlp.exe into VRChat's Tools folder (the YouTube fix).
async function updateYtDlp () {
  try {
    fs.mkdirSync(TOOLS_DIR, { recursive: true })
    const res = await axios.get(YTDLP_URL, { responseType: 'arraybuffer', timeout: 180000, maxRedirects: 5 })
    const dest = path.join(TOOLS_DIR, 'yt-dlp.exe')
    fs.writeFileSync(dest, Buffer.from(res.data))
    return { ok: true, path: dest, bytes: res.data.byteLength }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

function dirSize (dir) {
  let total = 0
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (_) { return 0 }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) total += dirSize(p)
    else { try { total += fs.statSync(p).size } catch (_) {} }
  }
  return total
}

function cacheSize () {
  return { ok: true, bytes: dirSize(CACHE_DIR), exists: fs.existsSync(CACHE_DIR) }
}

// Clear the asset cache (safe — VRChat re-downloads as needed). Never touches
// config, logs, or saved data.
function clearCache () {
  const before = dirSize(CACHE_DIR)
  let removed = 0
  try {
    for (const name of fs.readdirSync(CACHE_DIR)) {
      try { fs.rmSync(path.join(CACHE_DIR, name), { recursive: true, force: true }); removed++ } catch (_) {}
    }
    return { ok: true, freedBytes: before, removed }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// Resolve a named folder to its path (the renderer asks main to open it).
function folderPath (which) {
  switch (which) {
    case 'data': return VRCHAT_DIR
    case 'tools': return TOOLS_DIR
    case 'cache': return CACHE_DIR
    case 'photos': return PHOTOS_DIR
    default: return ''
  }
}

// List VRChat screenshots (newest first) for the Media Library.
function listPhotos (limit = 200) {
  const out = []
  const walk = dir => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (_) { return }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(png|jpg|jpeg)$/i.test(e.name)) { try { out.push({ path: p, name: e.name, mtime: fs.statSync(p).mtimeMs }) } catch (_) {} }
    }
  }
  walk(PHOTOS_DIR)
  out.sort((a, b) => b.mtime - a.mtime)
  return out.slice(0, limit)
}

module.exports = { updateYtDlp, cacheSize, clearCache, folderPath, listPhotos, VRCHAT_DIR, TOOLS_DIR, CACHE_DIR, PHOTOS_DIR }

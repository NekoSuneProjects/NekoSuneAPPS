// modules/integrations/maintenance/updater.js
// Update checker + installer for NekoSuneAPPS - asks the GitHub Releases API
// for the latest release and compares it to the running version. The actual
// install downloads the .msi asset, then hands off to applyUpdate.ps1 (a
// detached helper, since this process needs to fully exit before msiexec can
// replace its own files) which runs msiexec and relaunches the app once it's
// done. Runs in the MAIN process.

const axios = require('axios')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const REPO = 'NekoSuneProjects/NekoSuneAPPS'
const API = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASES_PAGE = `https://github.com/${REPO}/releases`

// Compare dotted versions; returns >0 if a>b, <0 if a<b, 0 if equal.
function cmp (a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

async function check (currentVersion) {
  try {
    const { data } = await axios.get(API, {
      timeout: 12000,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'NekoSuneAPPS-Updater' }
    })
    const latest = String(data.tag_name || data.name || '').replace(/^v/i, '')
    if (!latest) return { ok: true, available: false, current: currentVersion }
    const assets = Array.isArray(data.assets) ? data.assets : []
    // Prefer the Windows NSIS installer, then MSI, then any asset.
    const pick = re => assets.find(a => re.test(a.name || ''))
    const installer = pick(/Setup.*\.exe$/i) || pick(/\.exe$/i) || pick(/\.msi$/i)
    // The in-app update flow specifically wants the .msi (msiexec supports a
    // silent/passive install and a clean way to detect the app is closed),
    // separate from installerUrl above which is only used as a manual
    // open-in-browser fallback when no .msi asset was published.
    const msi = pick(/\.msi$/i)
    return {
      ok: true,
      available: cmp(latest, currentVersion) > 0,
      current: currentVersion,
      latest,
      notes: String(data.body || '').slice(0, 4000),
      url: data.html_url || RELEASES_PAGE,
      installerUrl: installer ? installer.browser_download_url : (data.html_url || RELEASES_PAGE),
      msiUrl: msi ? msi.browser_download_url : null,
      msiName: msi ? msi.name : null,
      msiSize: msi ? msi.size : null
    }
  } catch (err) {
    return { ok: false, error: err.message, current: currentVersion }
  }
}

// Downloads the .msi asset. Prefers saving it next to the running exe (the
// current install location, per how the user wants updates handled) - that
// directory doesn't need to be writable for msiexec to work, it's only
// where the downloaded file itself lands, so this falls back to a temp
// folder if the install dir isn't writable without elevation (e.g. a
// per-machine install under Program Files).
async function downloadMsi (url, fileName, onProgress) {
  const res = await axios.get(url, {
    responseType: 'stream', timeout: 60000, headers: { 'User-Agent': 'NekoSuneAPPS-Updater' }
  })
  const total = parseInt(res.headers['content-length'] || '0', 10)
  let received = 0

  const installDir = path.dirname(process.execPath)
  let outDir = installDir
  try {
    fs.accessSync(outDir, fs.constants.W_OK)
  } catch (_) {
    outDir = os.tmpdir()
  }
  const outPath = path.join(outDir, fileName || 'NekoSuneAPPS-Update.msi')

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outPath)
    res.data.on('data', chunk => {
      received += chunk.length
      if (onProgress) onProgress({ received, total })
    })
    res.data.on('error', reject)
    writer.on('error', reject)
    writer.on('finish', resolve)
    res.data.pipe(writer)
  })

  return outPath
}

// Hands off to a detached helper script (applyUpdate.ps1) and quits - this
// process needs to fully exit before msiexec can replace the files it has
// open, so it can't just run msiexec directly and wait. The helper waits for
// this process to exit, installs, then relaunches the app.
function applyUpdate (msiPath, quitApp) {
  const scriptPath = path.join(__dirname, 'applyUpdate.ps1')
  const child = spawn('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
    '-MsiPath', msiPath, '-ExePath', process.execPath, '-WaitProcessId', String(process.pid)
  ], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  quitApp()
}

// Static collaborators who may not yet appear in GitHub's contributor API
// (e.g. contributors via fork/PR before merge, or invited collaborators).
const STATIC_COLLABORATORS = [
  { login: 'FumikoEcho', url: 'https://github.com/FumikoEcho', avatar: 'https://github.com/FumikoEcho.png', commits: 0 }
]

// Auto-detect contributors/collaborators from the GitHub repo (for the About page).
async function contributors () {
  try {
    const { data } = await axios.get(`https://api.github.com/repos/${REPO}/contributors?per_page=30`, {
      timeout: 12000, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'NekoSuneAPPS-About' }
    })
    if (!Array.isArray(data)) return { ok: true, contributors: STATIC_COLLABORATORS }
    const fromApi = data
      .filter(c => c.type === 'User' && !/\[bot\]$/i.test(c.login || ''))
      .map(c => ({ login: c.login, url: c.html_url, avatar: c.avatar_url, commits: c.contributions }))
    // Merge: keep API entries (authoritative commit count), append static ones not already present.
    const seen = new Set(fromApi.map(c => c.login.toLowerCase()))
    const merged = [...fromApi, ...STATIC_COLLABORATORS.filter(c => !seen.has(c.login.toLowerCase()))]
    return { ok: true, contributors: merged }
  } catch (err) {
    // Offline/error — still show static collaborators so the tab isn't empty.
    return { ok: true, contributors: STATIC_COLLABORATORS, error: err.message }
  }
}

module.exports = { check, cmp, contributors, downloadMsi, applyUpdate, RELEASES_PAGE }

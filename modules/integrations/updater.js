// modules/integrations/updater.js
// Lightweight update checker — asks the GitHub Releases API for the latest release
// of NekoSuneAPPS and compares it to the running version. No auto-install (the app
// isn't wired to electron-updater feeds); "Install update" opens the installer asset
// so the user runs it. Runs in the MAIN process.

const axios = require('axios')

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
    return {
      ok: true,
      available: cmp(latest, currentVersion) > 0,
      current: currentVersion,
      latest,
      notes: String(data.body || '').slice(0, 4000),
      url: data.html_url || RELEASES_PAGE,
      installerUrl: installer ? installer.browser_download_url : (data.html_url || RELEASES_PAGE)
    }
  } catch (err) {
    return { ok: false, error: err.message, current: currentVersion }
  }
}

// Auto-detect contributors/collaborators from the GitHub repo (for the About page).
async function contributors () {
  try {
    const { data } = await axios.get(`https://api.github.com/repos/${REPO}/contributors?per_page=30`, {
      timeout: 12000, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'NekoSuneAPPS-About' }
    })
    if (!Array.isArray(data)) return { ok: true, contributors: [] }
    const list = data
      .filter(c => c.type === 'User' && !/\[bot\]$/i.test(c.login || ''))
      .map(c => ({ login: c.login, url: c.html_url, avatar: c.avatar_url, commits: c.contributions }))
    return { ok: true, contributors: list }
  } catch (err) { return { ok: false, error: err.message, contributors: [] } }
}

module.exports = { check, cmp, contributors, RELEASES_PAGE }

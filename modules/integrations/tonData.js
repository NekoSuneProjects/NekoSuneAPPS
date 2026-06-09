// modules/integrations/tonData.js
// Caches the Terrors of Nowhere reference data (achievements + terrors) from the
// terror.moe fan database into a local JSON file so the app has an offline,
// searchable board with unlock hints. Refreshes on a schedule (and on demand);
// re-fetching naturally picks up anything new the site has added.
//
// Achievements live inline in the achievements page as onmouseover handlers:
//   achname('...'); achflavor('...'); achunlock('...'); achtip('...'); achimg('../img/a/x.jpg')
// Terrors live in the terrors page as:
//   <th class="normal" onmouseover="hover('Name'); terrorimg('../img/n/preview/N.jpg')">
//     <a href="page.html"><img src='../img/n/t/tN.png'></a>
// Runs in the MAIN process.

const fs = require('fs')
const path = require('path')
const axios = require('axios')

const BASE = 'https://terror.moe'
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // refresh at most once a day on launch
const UA = { 'User-Agent': 'Mozilla/5.0 (NekoSuneAPPS ToN cache)' }

let cachePath = ''
let cache = null // { version, fetchedAt, achievements:[], terrors:[] }
let refreshing = false

function abs (rel) {
  if (!rel) return ''
  return rel.replace(/^\.\.\//, BASE + '/').replace(/^\//, BASE + '/')
}
// Un-escape the JS string literals the site uses (\' and the like) and keep <br/> as newlines.
function clean (s) {
  return String(s || '').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/<br\s*\/?>/gi, '\n').replace(/\\r|\\n|\\t/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

function parseAchievements (html) {
  const re = /achname\('((?:[^'\\]|\\.)*)'\)[\s\S]*?achflavor\('((?:[^'\\]|\\.)*)'\)[\s\S]*?achunlock\('((?:[^'\\]|\\.)*)'\)[\s\S]*?achtip\('((?:[^'\\]|\\.)*)'\)[\s\S]*?achimg\('((?:[^'\\]|\\.)*)'\)/g
  const out = []
  let m
  while ((m = re.exec(html)) !== null) {
    const name = clean(m[1])
    if (!name || /^\?\?\?$/.test(name)) continue // skip hidden placeholders
    out.push({ name, flavor: clean(m[2]), unlock: clean(m[3]), tip: clean(m[4]), img: abs(clean(m[5])) })
  }
  return out
}

function parseTerrors (html) {
  // class + hover('name') + terrorimg('preview') ... <a href="page"><img src='thumb'>
  const re = /<th[^>]*class=["']([^"']*)["'][^>]*onmouseover=["']hover\('((?:[^'\\]|\\.)*)'\);\s*terrorimg\('((?:[^'\\]|\\.)*)'\)["'][\s\S]*?<a href=["']([^"']+)["'][\s\S]*?<img src=['"]([^'"]+)['"]/g
  const out = []
  let m
  while ((m = re.exec(html)) !== null) {
    const name = clean(m[2])
    if (!name) continue
    out.push({
      name,
      category: clean(m[1]) || 'normal',
      page: m[4].startsWith('http') ? m[4] : `${BASE}/terrors/${m[4]}`,
      img: abs(clean(m[5])),
      preview: abs(clean(m[3]))
    })
  }
  return out
}

async function fetchText (url) {
  const { data } = await axios.get(url, { timeout: 20000, headers: UA, responseType: 'text' })
  return String(data || '')
}

async function refresh () {
  if (refreshing) return cache
  refreshing = true
  try {
    const [achHtml, terHtml] = await Promise.all([
      fetchText(`${BASE}/achievements/`).catch(() => ''),
      fetchText(`${BASE}/terrors/`).catch(() => '')
    ])
    const achievements = parseAchievements(achHtml)
    const terrors = parseTerrors(terHtml)
    // Don't clobber a good cache with an empty fetch (site down / blocked).
    if (!achievements.length && !terrors.length && cache) return cache
    cache = {
      version: 1,
      fetchedAt: Date.now(),
      source: BASE,
      achievements: achievements.length ? achievements : (cache?.achievements || []),
      terrors: terrors.length ? terrors : (cache?.terrors || [])
    }
    if (cachePath) { try { fs.writeFileSync(cachePath, JSON.stringify(cache)) } catch (e) { console.warn('ton-cache write failed:', e.message) } }
    return cache
  } finally {
    refreshing = false
  }
}

function init (userDataDir) {
  cachePath = path.join(userDataDir || '.', 'ton-cache.json')
  try { if (fs.existsSync(cachePath)) cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) } catch (_) { cache = null }
  // Refresh in the background if we have nothing cached or it's stale.
  const stale = !cache || !cache.fetchedAt || (Date.now() - cache.fetchedAt) > MAX_AGE_MS
  if (stale) refresh().catch(err => console.warn('ton-cache refresh:', err.message))
  return cache
}

function get () {
  return cache || { version: 1, fetchedAt: 0, achievements: [], terrors: [] }
}

module.exports = { init, refresh, get, parseAchievements, parseTerrors }

// modules/integrations/tonData.js
// Caches the Terrors of Nowhere reference data into a local JSON file so the app
// has a fully native, offline, searchable board (no iframes / no embeds).
// Refreshes on a schedule and on demand; re-fetching picks up anything new.
//
// Two sources, merged:
//  • terror.moe — achievements (with unlock HINTS + tips + art) and the terror
//    roster (names + thumbnails), parsed from inline onmouseover handlers.
//  • tontrack.me/js/script.js — structured `window.X = {...}` datasets for
//    locations, items and round types (titles only; no per-item art).
// Runs in the MAIN process.

const fs = require('fs')
const path = require('path')
const axios = require('axios')

const BASE = 'https://terror.moe'
const TRACK = 'https://tontrack.me/js/script.js'
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const UA = { 'User-Agent': 'Mozilla/5.0 (NekoSuneAPPS ToN cache)' }

let cachePath = ''
let cache = null
let refreshing = false

function abs (rel) {
  if (!rel) return ''
  return rel.replace(/^\.\.\//, BASE + '/').replace(/^\//, BASE + '/')
}
function clean (s) {
  return String(s || '').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/<br\s*\/?>/gi, '\n').replace(/\\r|\\n|\\t/g, ' ').replace(/&amp;/g, '&').replace(/\s{2,}/g, ' ').trim()
}
// Strip "[Prefix] " labels tontrack adds to some titles (e.g. "[Location] Hub").
function stripTag (s) { return String(s || '').replace(/^\[[^\]]+\]\s*/, '').trim() }

function parseAchievements (html) {
  const re = /achname\('((?:[^'\\]|\\.)*)'\)[\s\S]*?achflavor\('((?:[^'\\]|\\.)*)'\)[\s\S]*?achunlock\('((?:[^'\\]|\\.)*)'\)[\s\S]*?achtip\('((?:[^'\\]|\\.)*)'\)[\s\S]*?achimg\('((?:[^'\\]|\\.)*)'\)/g
  const out = []
  let m
  while ((m = re.exec(html)) !== null) {
    const name = clean(m[1])
    if (!name || name === '???') continue
    out.push({ name, flavor: clean(m[2]), unlock: clean(m[3]), tip: clean(m[4]), img: abs(clean(m[5])) })
  }
  return out
}

function parseTerrors (html) {
  const re = /<th[^>]*class=["']([^"']*)["'][^>]*onmouseover=["']hover\('((?:[^'\\]|\\.)*)'\);\s*terrorimg\('((?:[^'\\]|\\.)*)'\)["'][\s\S]*?<a href=["']([^"']+)["'][\s\S]*?<img src=['"]([^'"]+)['"]/g
  const out = []
  let m
  while ((m = re.exec(html)) !== null) {
    const name = clean(m[2])
    if (!name) continue
    out.push({ name, category: clean(m[1]) || 'normal', page: m[4].startsWith('http') ? m[4] : `${BASE}/terrors/${m[4]}`, img: abs(clean(m[5])), preview: abs(clean(m[3])) })
  }
  return out
}

// Pull `window.<key> = { ... }` JSON blobs out of the tontrack bundle by brace matching.
function extractBlob (js, key) {
  const at = js.indexOf(`window.${key}`)
  if (at < 0) return null
  const start = js.indexOf('{', at)
  if (start < 0) return null
  let depth = 0; let inStr = false; let esc = false
  for (let i = start; i < js.length; i++) {
    const c = js[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(js.slice(start, i + 1)) } catch (_) { return null } } }
  }
  return null
}

function parseTrack (js) {
  const itemsOf = key => { const b = extractBlob(js, key); return (b && Array.isArray(b.items)) ? b.items : [] }
  const locations = itemsOf('locations').map(i => ({ name: stripTag(clean(i.title)), value: i.value, colors: i.colors || [] })).filter(x => x.name)
  const items = ['items_survival', 'items_enkephalin', 'items_event', 'items_special']
    .flatMap(k => itemsOf(k).map(i => ({ name: stripTag(clean(i.title)), entity: i.entity_name || '', type: k.replace('items_', '') })))
    .filter(x => x.name && x.name !== '????????')
  const rounds = itemsOf('rounds').map(i => ({ name: stripTag(clean(i.title)), value: i.value, colors: i.colors || [] })).filter(x => x.name)
  return { locations, items, rounds }
}

async function fetchText (url) {
  const { data } = await axios.get(url, { timeout: 20000, headers: UA, responseType: 'text' })
  return String(data || '')
}

async function refresh () {
  if (refreshing) return cache
  refreshing = true
  try {
    const [achHtml, terHtml, trackJs] = await Promise.all([
      fetchText(`${BASE}/achievements/`).catch(() => ''),
      fetchText(`${BASE}/terrors/`).catch(() => ''),
      fetchText(TRACK).catch(() => '')
    ])
    const achievements = parseAchievements(achHtml)
    const terrors = parseTerrors(terHtml)
    const track = trackJs ? parseTrack(trackJs) : { locations: [], items: [], rounds: [] }
    const prev = cache || {}
    const pick = (fresh, old) => (fresh && fresh.length ? fresh : (old || []))
    if (!achievements.length && !terrors.length && !track.locations.length && cache) return cache
    cache = {
      version: 2,
      fetchedAt: Date.now(),
      sources: [BASE, 'https://tontrack.me'],
      achievements: pick(achievements, prev.achievements),
      terrors: pick(terrors, prev.terrors),
      locations: pick(track.locations, prev.locations),
      items: pick(track.items, prev.items),
      rounds: pick(track.rounds, prev.rounds)
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
  const stale = !cache || !cache.fetchedAt || (Date.now() - cache.fetchedAt) > MAX_AGE_MS
  if (stale) refresh().catch(err => console.warn('ton-cache refresh:', err.message))
  return cache
}

function get () {
  return cache || { version: 2, fetchedAt: 0, achievements: [], terrors: [], locations: [], items: [], rounds: [] }
}

module.exports = { init, refresh, get, parseAchievements, parseTerrors, parseTrack }

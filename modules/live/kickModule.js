// modules/live/kickModule.js
// Kick.com follower counter. Kick has no official public API, so we read the
// channel JSON endpoint (https://kick.com/api/v2/channels/{slug}).
//
// NOTE: Kick sits behind Cloudflare and may return 403 to non-browser clients.
// If polling starts failing with 403, the channel JSON needs to be fetched
// through a browser-like request path (e.g. a hidden BrowserWindow) - see the
// fallbackViaBrowser hook below. Runs in the MAIN process.

const axios = require('axios')

let pollTimer = null
let onUpdate = null
let slug = ''
let browserFetch = null // optional: (url) => Promise<object> using a real browser

const state = {
  connected: false,
  slug: '',
  followers: 0,
  live: false,
  viewers: 0,
  error: '',
  at: 0
}

function emit () {
  state.at = Date.now()
  if (typeof onUpdate === 'function') onUpdate({ ...state })
}

function readFollowers (data) {
  return (
    data?.followers_count ??
    data?.followersCount ??
    data?.follower_count ??
    state.followers ??
    0
  )
}

async function fetchChannel () {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`
  // Try a direct request with browser-ish headers first.
  try {
    const res = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json'
      }
    })
    return res.data
  } catch (err) {
    if (browserFetch) {
      return browserFetch(url) // Cloudflare fallback supplied by main process
    }
    throw err
  }
}

async function tick () {
  try {
    const data = await fetchChannel()
    state.followers = readFollowers(data)
    state.live = Boolean(data?.livestream)
    state.viewers = data?.livestream?.viewer_count ?? 0
    state.connected = true
    state.error = ''
    emit()
  } catch (err) {
    state.connected = false
    state.error = err?.response?.status === 403
      ? 'Blocked by Cloudflare (403) - browser fallback needed'
      : err.message
    emit()
  }
}

function startKick (channelSlug, listener, { intervalMs = 60000, fetchViaBrowser = null } = {}) {
  onUpdate = listener
  browserFetch = typeof fetchViaBrowser === 'function' ? fetchViaBrowser : null
  slug = String(channelSlug || '').trim().toLowerCase().replace(/^.*kick\.com\//, '')
  state.slug = slug
  stopKick()

  if (!slug) {
    state.error = 'Enter a Kick channel slug'
    state.connected = false
    emit()
    return
  }

  tick()
  pollTimer = setInterval(tick, Math.max(30000, intervalMs))
}

function stopKick () {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  state.connected = false
}

function getKickState () {
  return { ...state }
}

module.exports = { startKick, stopKick, getKickState }

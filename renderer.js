/* NekoSuneAPPS renderer - wires the themed UI to the OSC layer and all modules. */
const { loadAudioDevices, setupAudioAnalysis, stopAudioAnalysis } = require('./modules/vrchat/audio/audioModule')
const {
  setOscPort, setOscReceiverPort, sendOsc, sendParam, sendBeat, sendChatboxMessage,
  startOscReceiver, stopOscReceiver, addOscListener
} = require('./modules/vrchat/osc/oscModule')
const { KatOscText } = require('./modules/vrchat/osc/katOscText')
const { ChatboxComposer } = require('./modules/vrchat/chatbox/chatboxComposer')
const { DEFAULT_PRESETS } = require('./modules/vrchat/status/statusModule')

const api = window.electronAPI
const $ = id => document.getElementById(id)

// No credentials are shipped. Users enter their own Client / Application IDs
// (see Docs / Setup). Never hardcode IDs, secrets, or tokens in the repo.
const DEFAULT_TWITCH_CLIENT_ID = ''
const DEFAULT_DISCORD_APP_ID = '1513908316324233216'

let isAnalyzing = false
let beatState = false
let oscHistory = []
const maxHistory = 100

const composer = new ChatboxComposer({ sendChatboxMessage })

/* ---------------- tabs + theme ---------------- */
document.querySelectorAll('.navbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.tabpanel').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    const tab = btn.dataset.tab
    $(tab).classList.add('active')
    $('pageTitle').textContent = btn.querySelector('.lbl').textContent
  })
})

// Theme is auto-selected by date (seasonal) and is NOT user-switchable.
// Default is green; seasons override it around the holiday.
function easterDate (y) {
  const a = y % 19; const b = Math.floor(y / 100); const c = y % 100
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mo = Math.floor((h + l - 7 * m + 114) / 31); const da = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, mo - 1, da)
}
function seasonalTheme (now) {
  const mo = now.getMonth() + 1; const day = now.getDate()
  if (mo === 10 && day >= 24) return { theme: 'halloween', label: '🎃 Halloween' }
  if (mo === 12) return { theme: 'xmas', label: '🎄 Christmas' }
  if (mo === 6) return { theme: 'rainbow', label: '🏳️‍🌈 Pride' }
  const diff = (now - easterDate(now.getFullYear())) / 86400000
  if (diff >= -7 && diff <= 1) return { theme: 'easter', label: '🐰 Easter' }
  return { theme: 'green', label: '' }
}
const season = seasonalTheme(new Date())
document.documentElement.setAttribute('data-theme', season.theme)
if ($('seasonBadge')) $('seasonBadge').textContent = season.label

/* ---------------- helpers ---------------- */
function setText (id, v) { const el = $(id); if (el) el.textContent = v }
function setPill (id, on, onText, offText) {
  const el = $(id); if (!el) return
  el.textContent = on ? (onText || 'on') : (offText || 'off')
  el.className = 'pill ' + (on ? 'on' : 'off')
}
// Buffered, capped log. VRChat can flood incoming OSC, so we keep only the last
// 200 lines in memory and flush to the textarea at most twice a second, and only
// while the Log tab is visible.
let logBuffer = []
let logDirty = false
function logLine (line) {
  logBuffer.push(`${new Date().toLocaleTimeString()} ${line}`)
  if (logBuffer.length > 200) logBuffer.splice(0, logBuffer.length - 200)
  logDirty = true
}
setInterval(() => {
  if (!logDirty) return
  const t = $('oscLogText')
  if (!t || t.offsetParent === null) { logDirty = false; return }
  t.value = logBuffer.join('\n') + '\n'
  t.scrollTop = t.scrollHeight
  logDirty = false
}, 500)

/* ---------------- OSC log graph ---------------- */
function updateOscGraph () {
  const c = $('oscGraph'); if (!c) return
  if (c.offsetParent === null) return // not visible -> don't draw
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, c.width, c.height)
  const colors = ['#ef4444', '#22c55e', '#3b82f6', '#a855f7']
  const step = c.width / maxHistory
  oscHistory.forEach((levels, i) => levels.forEach((lv, j) => {
    ctx.fillStyle = colors[j]
    ctx.fillRect(i * step, c.height - lv * c.height, step - 1, lv * c.height)
  }))
}

/* ---------------- audio ---------------- */
let graphFrame = 0
function handleAudioLevels (levels) {
  oscHistory.push([...levels]); if (oscHistory.length > maxHistory) oscHistory.shift()
  // OSC goes out every frame (smooth in VRChat); the graph only redraws ~6fps.
  if ((graphFrame = (graphFrame + 1) % 3) === 0) updateOscGraph()
  const peak = Math.max(...levels)
  const newBeat = peak > 0.65
  if (newBeat !== beatState) { beatState = newBeat; sendBeat(beatState ? 1 : 0) }
  sendOsc(levels)
}
async function initAudio () {
  const sel = $('audioDeviceSelect')
  const deviceId = sel.value
  if (!deviceId) { alert('Pick an audio input device.'); return }
  await api.saveSetting('selectedAudioDevice', deviceId)
  await setupAudioAnalysis(deviceId, { onLevels: handleAudioLevels, onError: err => alert('Audio failed: ' + err.message) })
  isAnalyzing = true
  $('toggleAudio').textContent = 'Stop Audio'
}
$('toggleAudio').addEventListener('click', () => {
  if (isAnalyzing) { stopAudioAnalysis(); isAnalyzing = false; $('toggleAudio').textContent = 'Start Audio'; return }
  initAudio()
})
;['gain', 'lowBoost', 'bassBoost', 'midBoost', 'trebleBoost'].forEach(name => {
  const slider = $(name + 'Slider')
  if (!slider) return
  slider.addEventListener('input', async e => {
    setText(name + 'Value', e.target.value)
    await api.saveSetting(name, parseFloat(e.target.value))
  })
})
$('audioDeviceSelect').addEventListener('change', e => api.saveSetting('selectedAudioDevice', e.target.value))

/* ---------------- now playing + KAT ---------------- */
let katText = null
let removeKatListener = null
let lastKatText = ''
let katEnabled = false
let chatboxNpEnabled = false
let lastSongKey = ''

function buildSong (m) {
  if (!m || !m.found || !m.title) return ''
  if (m.status && m.status !== 'Playing') return ''
  return [m.artist, m.title].filter(Boolean).join(' - ')
}
function renderNowPlaying (m) {
  if (!m || !m.found) { setText('nowPlayingTitle', 'No media detected'); setText('nowPlayingMeta', 'No active session'); return }
  setText('nowPlayingTitle', m.title || 'Unknown')
  setText('nowPlayingMeta', [m.artist, m.album, m.status].filter(Boolean).join(' · ') || 'Active')
  setText('nowPlayingSource', m.source || 'Windows')
}
function startKat () {
  if (katText) return
  katText = new KatOscText({ oscPort: getSendPort() })
  katText.onStatus = msg => setText('katNowPlayingStatus', msg)
  removeKatListener = addOscListener((a, args) => katText.handleOscInput(a, args), getRecvPort())
  katText.start(); katText.setText(lastKatText)
}
function stopKat () {
  if (removeKatListener) { removeKatListener(); removeKatListener = null }
  if (katText) { katText.close(); katText = null }
  setText('katNowPlayingStatus', 'KAT output is off')
}
$('enableKatNowPlaying').addEventListener('change', async e => {
  katEnabled = e.target.checked
  await api.saveSetting('katNowPlayingEnabled', katEnabled)
  katEnabled ? startKat() : stopKat()
})
$('enableChatboxNowPlaying').addEventListener('change', async e => {
  chatboxNpEnabled = e.target.checked
  await api.saveSetting('chatboxNowPlayingEnabled', chatboxNpEnabled)
  setText('chatboxNowPlayingStatus', chatboxNpEnabled ? 'Chatbox output is on' : 'Chatbox output is off')
})

let discordConnected = false
function nowPlayingNeeded () {
  // Only spawn the PowerShell media query when something actually consumes it.
  return katEnabled || chatboxNpEnabled ||
    composer.modes.nowPlaying !== 'off' ||
    (composer.modes.status === 'rotate' && /\{(song|artist|title)\}/.test($('presetsText').value)) ||
    (discordConnected && $('discordShowNp') && $('discordShowNp').checked) ||
    ($('nowplaying') && $('nowplaying').offsetParent !== null)
}
async function refreshNowPlaying () {
  if (!nowPlayingNeeded()) return
  try {
    const m = await api.getNowPlaying()
    renderNowPlaying(m)
    const song = buildSong(m)
    composer.update({
      song: song || 'Not playing',
      artist: (m && m.found && m.artist) ? m.artist : '',
      title: (m && m.found && m.title) ? m.title : ''
    })
    lastKatText = song
    if (katText) katText.setText(song)
    if (chatboxNpEnabled && song) {
      const key = song
      if (key !== lastSongKey) { lastSongKey = key; sendChatboxMessage(`Now Playing: ${song}`, false); setText('chatboxNowPlayingStatus', 'Posted current song') }
    }
    // Feed the Discord presence (it shows 🎵 song when no world line is up).
    if (discordConnected) api.discordLive({ nowPlaying: (m && m.found && song) ? song : '' })
  } catch (err) { renderNowPlaying({ found: false }) }
}
// Now Playing spawns a PowerShell query, so poll gently (every 10s). It still
// runs while minimised so the chatbox stays current in VR.
setInterval(refreshNowPlaying, 10000)

/* ---------------- OSC settings ---------------- */
function getSendPort () { const p = parseInt($('portInput').value, 10); return Number.isFinite(p) ? p : 9000 }
function getRecvPort () { const p = parseInt($('receiverPortInput').value, 10); return Number.isFinite(p) ? p : 9001 }
$('portInput').addEventListener('change', async e => {
  const p = parseInt(e.target.value, 10)
  if (!isNaN(p)) { setOscPort(p); if (katText) katText.setOscPort(p); await api.saveSetting('oscPort', p); api.updateOscPort(p) }
})
$('receiverPortInput').addEventListener('change', async e => {
  const p = parseInt(e.target.value, 10)
  if (!isNaN(p)) { setOscReceiverPort(p); await api.saveSetting('receiverPort', p) }
})
$('enableReceive').addEventListener('change', async e => {
  await api.saveSetting('receiveEnabled', e.target.checked)
  e.target.checked ? startOscReceiver(getRecvPort(), (a, args) => logLine(`IN  ${a} ${args.join(',')}`)) : stopOscReceiver()
})
$('clearLog').addEventListener('click', () => { logBuffer = []; logDirty = true; $('oscLogText').value = ''; oscHistory = []; updateOscGraph() })

/* ---------------- chatbox composer ---------------- */
$('chatSend').addEventListener('click', () => {
  const v = $('chatInput').value.trim()
  if (v) { composer.sendNow(v); logLine(`OUT chatbox: ${v}`); $('chatInput').value = '' }
})
$('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('chatSend').click() })

$('aiRun').addEventListener('click', async () => {
  const text = $('chatInput').value.trim()
  if (!text) return
  setText('aiStatus', 'Thinking...')
  try {
    const out = await api.aiRewrite({
      baseUrl: $('aiBaseUrl').value,
      apiKey: $('aiKey').value,
      model: $('aiModel').value,
      mode: $('aiMode').value, text
    })
    $('chatInput').value = out; setText('aiStatus', 'Done')
  } catch (err) { setText('aiStatus', err.message) }
})

// Build the per-source mode grid (Off / Own line / Rotate).
const SOURCES = [
  ['status', 'Status presets'], ['clock', 'Clock'], ['nowPlaying', 'Now playing'],
  ['world', 'World / instance'], ['stats', 'Component stats'], ['network', 'Network'],
  ['heartRate', 'Heart rate'], ['window', 'Window activity'], ['discord', 'Discord voice'],
  ['tiktok', 'TikTok followers'], ['twitch', 'Twitch followers'], ['kick', 'Kick followers']
]
function buildModeGrid (savedModes) {
  const grid = $('modeGrid')
  grid.innerHTML = ''
  SOURCES.forEach(([key, label]) => {
    const mode = (savedModes && savedModes[key]) || composer.modes[key] || 'off'
    composer.setMode(key, mode)
    const wrap = document.createElement('div'); wrap.className = 'switch'
    wrap.innerHTML = `<span style="flex:1">${label}</span>`
    const sel = document.createElement('select'); sel.style.width = '120px'
    ;[['off', 'Off'], ['line', 'Own line'], ['rotate', 'Rotate']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.text = t; if (v === mode) o.selected = true; sel.appendChild(o)
    })
    sel.addEventListener('change', async () => {
      composer.setMode(key, sel.value)
      await api.saveSetting('chatModes', currentModes())
      updatePreview()
    })
    sel.dataset.key = key
    wrap.appendChild(sel); grid.appendChild(wrap)
  })
}
function currentModes () {
  const m = {}
  $('modeGrid').querySelectorAll('select').forEach(s => { m[s.dataset.key] = s.value })
  return m
}
// Non-mutating preview of the multi-line chatbox.
function updatePreview () {
  composer.setPresets($('presetsText').value.split('\n'))
  const fixed = composer.fixedLines()
  const rot = composer.rotationItems()
  let lines = []
  const rotLine = rot[0] || ''
  if (rotLine && composer.rotationPosition === 'top') lines.push(rotLine + (rot.length > 1 ? '  ⟳' : ''))
  lines = lines.concat(fixed)
  if (rotLine && composer.rotationPosition === 'bottom') lines.push(rotLine + (rot.length > 1 ? '  ⟳' : ''))
  $('chatPreview').textContent = lines.join('\n') || '(nothing enabled)'
}

$('rotationPos').addEventListener('change', async e => {
  composer.setRotationPosition(e.target.value)
  await api.saveSetting('rotationPos', e.target.value); updatePreview()
})
$('rotateInterval').addEventListener('change', e => api.saveSetting('rotateInterval', parseInt(e.target.value, 10) || 4000))

let composerRunning = false
$('composerToggle').addEventListener('click', () => {
  composerRunning = !composerRunning
  if (composerRunning) {
    composer.setPresets($('presetsText').value.split('\n'))
    composer.start(parseInt($('rotateInterval').value, 10))
    $('composerToggle').textContent = 'Stop'; setPill('composerState', true, 'live')
  } else {
    composer.stop(); $('composerToggle').textContent = 'Start'; setPill('composerState', false)
  }
})
$('savePresets').addEventListener('click', async () => {
  await api.saveSetting('presets', $('presetsText').value)
  composer.setPresets($('presetsText').value.split('\n')); updatePreview()
})
// Auto-save status presets (debounced) so they persist without pressing Save.
let presetSaveTimer = null
$('presetsText').addEventListener('input', () => {
  composer.setPresets($('presetsText').value.split('\n'))
  if ($('chatPreview').offsetParent !== null) updatePreview()
  clearTimeout(presetSaveTimer)
  presetSaveTimer = setTimeout(() => api.saveSetting('presets', $('presetsText').value), 800)
})
// Refresh the preview only while the Chatbox tab is actually visible.
setInterval(() => {
  if (!composerRunning && $('chatPreview') && $('chatPreview').offsetParent !== null) updatePreview()
}, 2500)

/* ---------------- live: TikTok / Twitch / Kick ---------------- */
api.on('tiktok:update', s => {
  setPill('tiktokState', s.connected, 'live', s.error ? 'error' : 'offline')
  setText('tiktokFollowers', (s.followers || 0).toLocaleString())
  setText('tiktokMeta', `${s.viewers || 0} viewers · +${s.newFollows || 0} new${s.error ? ' · ' + s.error : ''}`)
  composer.update({
    tiktokFollowers: s.followers || 0, tiktokViewers: s.viewers || 0,
    tiktokLikes: s.likes || 0, tiktokNew: s.newFollows || 0, tiktokLive: !!s.connected
  })
})
$('tiktokConnect').addEventListener('click', async () => {
  await api.saveSetting('tiktokUser', $('tiktokUser').value)
  await api.saveSetting('tiktokSignKey', $('tiktokSignKey').value)
  api.tiktokConnect($('tiktokUser').value, $('tiktokSignKey').value)
})
$('tiktokDisconnect').addEventListener('click', () => api.tiktokDisconnect())

// Follower count without being live (reads the public profile).
api.on('tiktok:followers', s => {
  setText('tiktokFollowers', (s.followers || 0).toLocaleString())
  setText('tiktokMeta', s.connected ? `followers · ${(s.likes || 0).toLocaleString()} likes · ${s.videos || 0} videos` : (s.error || 'followers'))
  if (s.followers) {
    setPill('tiktokState', true, 'tracking')
    composer.update({ tiktokFollowers: s.followers, tiktokLikes: s.likes || 0, tiktokVideos: s.videos || 0 })
  }
})
$('tiktokFollowersStart').addEventListener('click', async () => {
  await api.saveSetting('tiktokUser', $('tiktokUser').value)
  api.tiktokFollowersStart($('tiktokUser').value)
})
$('tiktokFollowersStop').addEventListener('click', () => api.tiktokFollowersStop())

api.on('twitch:update', s => {
  setPill('twitchState', s.connected, 'on', s.error ? 'error' : 'offline')
  setText('twitchFollowers', (s.followers || 0).toLocaleString())
  composer.update({ twitchFollowers: s.followers || 0, twitchViewers: s.viewers || 0, twitchLive: !!s.connected })
  // the module may have auto-refreshed the access token; persist the new pair.
  if (s.token && (s.token !== $('twitchToken').value || s.refreshToken !== twitchRefreshToken)) {
    $('twitchToken').value = s.token
    twitchRefreshToken = s.refreshToken || twitchRefreshToken
    setTwitchTokenState()
    api.saveSetting('twitch', currentTwitchCfg())
  }
})
function setTwitchTokenState () {
  const has = !!$('twitchToken').value
  setPill('twitchTokenState', has, 'token ✓', 'no token')
}
let twitchRefreshToken = ''
$('twitchLogin2').addEventListener('click', async () => {
  const clientId = $('twitchClientId').value.trim()
  const clientSecret = $('twitchClientSecret').value.trim() // optional: blank = implicit (no refresh)
  if (!clientId) { alert('Enter your Twitch Client ID first.'); return }
  await api.saveSetting('twitch', currentTwitchCfg())
  setText('twitchTokenState', 'logging in...')
  const r = await api.twitchOauth(clientId, clientSecret, 'moderator:read:followers')
  if (r.ok) {
    $('twitchToken').value = r.token
    twitchRefreshToken = r.refreshToken || ''
    await api.saveSetting('twitch', currentTwitchCfg())
    setTwitchTokenState()
  } else {
    setText('twitchTokenState', 'login failed')
    alert('Twitch login failed: ' + r.error)
  }
})
function currentTwitchCfg () {
  return {
    login: $('twitchLogin').value,
    clientId: $('twitchClientId').value,
    clientSecret: $('twitchClientSecret').value,
    token: $('twitchToken').value,
    refreshToken: twitchRefreshToken
  }
}
$('twitchConnect').addEventListener('click', async () => {
  const cfg = currentTwitchCfg()
  if (!cfg.token) { alert('Login with Twitch first.'); return }
  await api.saveSetting('twitch', cfg); api.twitchStart(cfg)
})
$('twitchDisconnect').addEventListener('click', () => api.twitchStop())

api.on('kick:update', s => {
  setPill('kickState', s.connected, s.live ? 'live' : 'on', s.error ? 'error' : 'offline')
  setText('kickFollowers', (s.followers || 0).toLocaleString())
  composer.update({ kickFollowers: s.followers || 0, kickViewers: s.viewers || 0, kickLive: !!s.live })
})
$('kickConnect').addEventListener('click', async () => { await api.saveSetting('kickSlug', $('kickSlug').value); api.kickStart($('kickSlug').value) })
$('kickDisconnect').addEventListener('click', () => api.kickStop())

/* ---------------- TikTok TTS ---------------- */
api.tiktokVoices().then(voices => {
  const sel = $('ttsVoice')
  voices.forEach(v => { const o = document.createElement('option'); o.value = v.apiName; o.text = v.label; sel.appendChild(o) })
})
$('ttsSpeak').addEventListener('click', async () => {
  const text = $('ttsText').value.trim(); if (!text) return
  setText('ttsStatus', 'Fetching audio...')
  const b64 = await api.tiktokTts(text, $('ttsVoice').value)
  if (!b64) { setText('ttsStatus', 'TTS failed (gesserit.co may be down)'); return }
  const audio = new Audio('data:audio/mpeg;base64,' + b64)
  audio.play(); setText('ttsStatus', 'Playing')
})

/* ---------------- stats / network / hr / window / vr ---------------- */
api.on('stats:update', s => {
  setText('statsOut', `CPU ${s.cpuLoad}% ${s.cpuTemp ? s.cpuTemp + '°C ' : ''}| GPU ${s.gpuLoad}% ${s.gpuTemp ? s.gpuTemp + '°C ' : ''}| RAM ${s.ramUsedGb}/${s.ramTotalGb}GB (${s.ramPct}%)`)
  composer.update({
    cpu: s.cpuLoad, cpuTemp: s.cpuTemp, gpu: s.gpuLoad, gpuTemp: s.gpuTemp,
    ramPct: s.ramPct, ramUsed: s.ramUsedGb, ramTotal: s.ramTotalGb
  })
})
$('enableStats').addEventListener('change', e => {
  setPill('statsState', e.target.checked, 'on'); e.target.checked ? api.statsStart(3000) : api.statsStop()
  api.saveSetting('statsEnabled', e.target.checked)
})
api.on('net:update', s => {
  setText('netOut', `↓ ${s.downMbps} Mbps · ↑ ${s.upMbps} Mbps${s.pingMs ? ' · ' + s.pingMs + 'ms' : ''} (${s.iface})`)
  composer.update({ down: s.downMbps, up: s.upMbps, ping: s.pingMs })
})
$('enableNet').addEventListener('change', e => { setPill('netState', e.target.checked, 'on'); e.target.checked ? api.netStart({ intervalMs: 3000 }) : api.netStop(); api.saveSetting('netEnabled', e.target.checked) })

api.on('hr:update', s => {
  setPill('hrState', s.online, 'live'); setText('hrOut', s.bpm || '—')
  setText('hrSub', s.online ? `bpm · avg ${s.avg || 0} · max ${s.max || 0} · min ${s.min || 0}` : 'bpm')
  composer.update({ hr: s.bpm, hrOnline: s.online, hrAvg: s.avg, hrMax: s.max, hrMin: s.min })
})
function hrCfg () {
  return { provider: $('hrProvider').value, token: $('pulsoidToken').value, apiKey: $('hyperateKey').value, deviceId: $('hyperateDevice').value }
}
function syncHrFields () {
  const hy = $('hrProvider').value === 'hyperate'
  $('hrHyperateFields').style.display = hy ? '' : 'none'
  $('hrPulsoidFields').style.display = hy ? 'none' : ''
}
$('hrProvider').addEventListener('change', () => { syncHrFields(); api.saveSetting('hrProvider', $('hrProvider').value) })
$('hrStart').addEventListener('click', async () => {
  const c = hrCfg()
  await api.saveSetting('pulsoidToken', c.token)
  await api.saveSetting('hrProvider', c.provider)
  await api.saveSetting('hyperate', { apiKey: c.apiKey, deviceId: c.deviceId })
  api.hrStart(c)
})
$('hrStop').addEventListener('click', () => api.hrStop())
$('hrClear').addEventListener('click', async () => { await api.hrClearSessions(); renderHrSessions([]) })

function fmtDur (sec) { const m = Math.floor(sec / 60); const s = sec % 60; return `${m}m ${s}s` }
function renderHrSessions (list) {
  const el = $('hrSessions')
  if (!list || !list.length) { el.textContent = 'No saved sessions yet.'; return }
  el.innerHTML = list.map(x => {
    const d = new Date(x.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    return `<div style="padding:2px 0">❤️ ${d} · ${fmtDur(x.durationSec)} · avg ${x.avg} · ${x.min}–${x.max} <span style="opacity:.55">(${x.provider})</span></div>`
  }).join('')
}
api.on('hr:sessions', renderHrSessions)

api.on('window:update', s => {
  setText('winOut', `${s.app || ''}${s.title ? ' — ' + s.title : ''}`)
  composer.update({ window: s.title, windowApp: s.app })
})
$('enableWindow').addEventListener('change', e => { setPill('winState', e.target.checked, 'on'); e.target.checked ? api.windowStart() : api.windowStop(); api.saveSetting('windowEnabled', e.target.checked) })

api.on('vr:update', s => {
  setPill('vrState', s.available, 'on')
  setText('vrOut', s.available ? s.devices.map(d => `${d.role}: ${Math.round(d.battery * 100)}%`).join(' · ') : 'No VR devices — needs a VR headset + SteamVR running (does not work on desktop).')
})
$('enableVr').addEventListener('change', e => { e.target.checked ? api.vrStart() : api.vrStop() })

/* ---------------- discord ---------------- */
let discordAccessToken = ''
function currentDiscordCfg () {
  return {
    clientId: $('discordAppId').value,
    clientSecret: $('discordSecret').value,
    accessToken: discordAccessToken,
    enableRichPresence: $('discordRP').checked,
    enableVoice: $('discordVoice').checked,
    sendVoiceStateOsc: $('discordVoiceOsc').checked,
    sendMuteDeafenOsc: $('discordMuteOsc').checked,
    vrcStatus: $('discordVrcStatus').value,
    showWorld: $('discordShowWorld').checked,
    vrcProfileUrl: $('discordVrcProfile').value.trim(),
    showHeartRate: $('discordShowHr').checked,
    showNowPlaying: $('discordShowNp').checked
  }
}
$('discordStart').addEventListener('click', async () => {
  const cfg = currentDiscordCfg()
  await api.saveSetting('discord', cfg)
  setText('discordOut', 'Connecting...')
  const r = await api.discordStart(cfg)
  setPill('discordState', r.ok, r.voice ? 'voice' : 'on')
  if (!r.ok) setText('discordOut', 'Error: ' + (r.error || 'failed'))
  else if (r.note) setText('discordOut', r.note) // e.g. voice needs allowlist
})
$('discordStop').addEventListener('click', async () => { await api.discordStop(); setPill('discordState', false); setText('discordOut', 'Not connected') })
;['discordRP', 'discordVoice', 'discordVoiceOsc', 'discordMuteOsc'].forEach(id =>
  $(id).addEventListener('change', () => api.saveSetting('discord', currentDiscordCfg())))

// VRChat status / world-visibility / presence-content changes apply instantly.
;['discordVrcStatus', 'discordShowWorld', 'discordVrcProfile', 'discordShowHr', 'discordShowNp'].forEach(id =>
  $(id).addEventListener('change', () => {
    const cfg = currentDiscordCfg()
    api.saveSetting('discord', cfg)
    api.discordVrc({ vrcStatus: cfg.vrcStatus, showWorld: cfg.showWorld, vrcProfileUrl: cfg.vrcProfileUrl, showHeartRate: cfg.showHeartRate, showNowPlaying: cfg.showNowPlaying })
  }))

// Live world readout + radar from the VRChat log tracker. NOTE: this fires every
// few seconds — only touch the DOM when something actually changed (perf).
let _lastLoc = ''
let _lastRadarSig = ''
api.on('vrc:world', w => {
  if (w && w.inWorld && w.worldName) setText('discordWorldOut', `World: ${w.worldName}`)
  else if (w && w.inWorld) setText('discordWorldOut', 'World: (joining…)')
  else setText('discordWorldOut', 'World: not in a world')
  renderRadar(w)
  if (w) {
    composer.update({ players: (w.players || []).length })
    const loc = (w.worldId && w.instanceId) ? `${w.worldId}:${w.instanceId}` : ''
    window.__myLocation = loc
    if ($('rbWorld')) {
      setText('rbWorld', w.inWorld ? (w.worldName || 'In a world') : 'Not in a world')
      setText('rbInstCount', w.inWorld ? `${(w.players || []).length} player(s) in instance` : '—')
    }
    // Re-render the friends panel only when our instance actually changes.
    if (loc !== _lastLoc) { _lastLoc = loc; if (typeof renderRightbar === 'function' && rbFriendsCache.online && rbFriendsCache.online.length) renderRightbar() }
  }
})
function renderRadar (w) {
  const players = (w && w.players) || []
  const sig = (w && w.inWorld ? '1' : '0') + ':' + players.join('|')
  if (sig === _lastRadarSig) return // nothing changed — skip DOM work
  _lastRadarSig = sig
  setText('radarCount', String(players.length))
  const el = $('radarList'); if (!el) return
  if (!w || !w.inWorld) { el.textContent = 'Not in a world.' } else if (!players.length) { el.textContent = 'No other players detected.' } else {
    el.innerHTML = players.map(p => `<div style="padding:2px 0">🧍 ${p.replace(/</g, '&lt;')}</div>`).join('')
  }
}

/* ---------------- tools: stopwatch ---------------- */
let swRunning = false; let swAccum = 0; let swStart = 0; let swTick = 0
const swElapsed = () => swAccum + (swRunning ? Date.now() - swStart : 0)
function fmtSw (ms) {
  const t = Math.max(0, ms)
  const h = Math.floor(t / 3600000); const m = Math.floor(t % 3600000 / 60000)
  const s = Math.floor(t % 60000 / 1000); const d = Math.floor(t % 1000 / 100)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`
}
setInterval(() => {
  if (!swRunning) return // idle — don't touch the DOM 10×/sec
  setText('swDisplay', fmtSw(swElapsed()))
  // Live-post once a second (10th 100ms tick) to respect VRChat's chatbox rate.
  if ($('swLiveChatbox').checked && (++swTick % 10 === 0)) sendChatboxMessage(`⏱ ${fmtSw(swElapsed())}`, false)
}, 100)
$('swStartStop').addEventListener('click', () => {
  if (swRunning) { swAccum = swElapsed(); swRunning = false; $('swStartStop').textContent = 'Start'; setText('swOut', 'Paused') } else { swStart = Date.now(); swRunning = true; $('swStartStop').textContent = 'Stop'; setText('swOut', 'Running') }
})
$('swReset').addEventListener('click', () => { swRunning = false; swAccum = 0; $('swStartStop').textContent = 'Start'; setText('swDisplay', fmtSw(0)); setText('swOut', 'Stopped') })
$('swSend').addEventListener('click', () => { const v = `⏱ ${fmtSw(swElapsed())}`; sendChatboxMessage(v, false); logLine(`OUT chatbox: ${v}`) })

/* ---------------- tools: calculator ---------------- */
let _mathEval = null
function calcEval () {
  const expr = $('calcInput').value.trim()
  if (!expr) return
  try {
    if (!_mathEval) _mathEval = require('mathjs').evaluate
    setText('calcResult', String(_mathEval(expr)))
  } catch (_) { setText('calcResult', 'Error') }
}
$('calcEval').addEventListener('click', calcEval)
$('calcInput').addEventListener('keydown', e => { if (e.key === 'Enter') calcEval() })
$('calcClear').addEventListener('click', () => { $('calcInput').value = ''; setText('calcResult', '0') })
$('calcSend').addEventListener('click', () => { const v = `${$('calcInput').value} = ${$('calcResult').textContent}`; sendChatboxMessage(v, false); logLine(`OUT chatbox: ${v}`) })

/* ---------------- tools: Param Lab ---------------- */
$('paramSend').addEventListener('click', () => {
  const addr = $('paramAddr').value.trim()
  if (!addr) { setText('paramOut', 'Enter a parameter address.'); return }
  const type = $('paramType').value
  const raw = $('paramValue').value.trim()
  let val = raw
  if (type === 'bool') val = /^(1|true|on|yes|t)$/i.test(raw)
  else if (type === 'int') val = parseInt(raw, 10) || 0
  else val = Number(raw) || 0
  try { sendParam(addr, val, type); setText('paramOut', `Sent ${type} ${addr} = ${val}`); logLine(`OUT ${addr} ${val}`) } catch (e) { setText('paramOut', 'Error: ' + e.message) }
})

/* ---------------- tools: Photo Relay ---------------- */
function applyPhotoRelay () {
  const cfg = { enabled: $('photoRelayEnable').checked, webhook: $('photoWebhook').value.trim() }
  api.saveSetting('photoRelay', cfg)
  api.photoRelaySet(cfg)
  setText('photoRelayOut', cfg.enabled ? (cfg.webhook ? 'Watching for new VRChat photos…' : 'Enter a webhook URL.') : 'Off')
}
;['photoRelayEnable', 'photoWebhook'].forEach(id => $(id).addEventListener('change', applyPhotoRelay))
api.on('photoRelay:event', s => {
  if (s.sent) setText('photoRelayOut', '✅ Sent ' + s.sent)
  else if (s.error) setText('photoRelayOut', 'Error: ' + s.error)
  else if (s.watching) setText('photoRelayOut', 'Watching for new VRChat photos…')
})

/* ---------------- tools: auto-afk ---------------- */
function afkCfg () {
  return {
    enabled: $('afkEnable').checked,
    thresholdSec: parseInt($('afkThreshold').value, 10) || 120,
    toChatbox: $('afkToChatbox').checked,
    message: $('afkMessage').value || '💤 AFK since {time} ({mins}m)',
    backMessage: $('afkBackMessage').value || '👋 Back!'
  }
}
function applyAfk () {
  const c = afkCfg()
  api.saveSetting('afk', c)
  if (c.enabled) api.afkStart({ thresholdSec: c.thresholdSec })
  else { api.afkStop(); setPill('afkState', false); setText('afkOut', 'Active') }
}
;['afkEnable', 'afkThreshold', 'afkToChatbox', 'afkMessage', 'afkBackMessage'].forEach(id => $(id).addEventListener('change', applyAfk))
api.on('afk:update', s => {
  const c = afkCfg()
  setPill('afkState', s.afk, 'on')
  if (s.afk) {
    const since = s.since || Date.now()
    const mins = Math.max(0, Math.round((Date.now() - since) / 60000))
    const time = new Date(since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const msg = c.message.replace(/\{mins\}/g, mins).replace(/\{time\}/g, time)
    setText('afkOut', `AFK — ${msg}`)
    if (c.toChatbox && c.enabled) { sendChatboxMessage(msg, false); logLine(`OUT chatbox: ${msg}`) }
  } else {
    setText('afkOut', 'Active')
    if (c.toChatbox && c.enabled && c.backMessage) { sendChatboxMessage(c.backMessage, false); logLine(`OUT chatbox: ${c.backMessage}`) }
  }
})

/* ---------------- vrchat account (auto status) ---------------- */
let vrc2faMethod = 'totp'
function setAcctState (loggedIn, txt) {
  setPill('vrcAcctState', loggedIn, 'on')
  $('vrcAcctState').textContent = loggedIn ? 'logged in' : 'logged out'
  if (txt) setText('vrcAcctOut', txt)
}
$('vrcLogin').addEventListener('click', async () => {
  const u = $('vrcUser').value.trim(); const p = $('vrcPass').value
  if (!u || !p) { setText('vrcAcctOut', 'Enter username + password'); return }
  setText('vrcAcctOut', 'Logging in…')
  const r = await api.vrchatLogin(u, p)
  $('vrcPass').value = ''
  if (r.ok && r.needs2fa) {
    vrc2faMethod = (r.methods || []).includes('emailOtp') ? 'emailotp' : 'totp'
    $('vrc2faRow').style.display = ''
    setText('vrc2faHint', vrc2faMethod === 'emailotp' ? '(emailed code)' : '(authenticator app)')
    setText('vrcAcctOut', '2FA required — enter your code')
  } else if (r.ok && r.user) {
    $('vrc2faRow').style.display = 'none'
    setAcctState(true, `Logged in as ${r.user.displayName} · status: ${r.user.status}`)
    await api.saveSetting('vrcUser', u)
    if ($('vrcAutoStatus').checked) api.vrchatAutoStatus(true)
    loadRightbar(); loadNotifications(); loadProfileEditor()
  } else setText('vrcAcctOut', 'Error: ' + (r.error || 'login failed'))
})
$('vrc2faVerify').addEventListener('click', async () => {
  const code = $('vrc2faCode').value.trim(); if (!code) return
  setText('vrcAcctOut', 'Verifying…')
  const r = await api.vrchatVerify2fa(code, vrc2faMethod)
  if (r.ok && r.user) {
    $('vrc2faRow').style.display = 'none'; $('vrc2faCode').value = ''
    setAcctState(true, `Logged in as ${r.user.displayName} · status: ${r.user.status}`)
    await api.saveSetting('vrcUser', $('vrcUser').value.trim())
    if ($('vrcAutoStatus').checked) api.vrchatAutoStatus(true)
    loadRightbar(); loadNotifications(); loadProfileEditor()
  } else setText('vrcAcctOut', 'Error: ' + (r.error || '2FA failed'))
})
$('vrcLogout').addEventListener('click', async () => { await api.vrchatLogout(); setAcctState(false, 'Logged out'); $('vrcAutoStatus').checked = false; api.saveSetting('vrcAutoStatus', false) })
$('vrcAutoStatus').addEventListener('change', e => { api.saveSetting('vrcAutoStatus', e.target.checked); api.vrchatAutoStatus(e.target.checked); $('discordVrcStatus').disabled = e.target.checked })
const STATUS_KEY = { 'join me': 'join', active: 'active', 'ask me': 'ask', busy: 'busy', offline: 'busy' }
api.on('vrchat:account', s => {
  if (s.ok) {
    setAcctState(true, `${s.displayName} · ${s.status}${s.statusDescription ? ' — ' + s.statusDescription : ''}`)
    // Reflect the live VRChat status in the gate dropdown + profile editor.
    const key = STATUS_KEY[String(s.status || '').toLowerCase()]
    if (key && $('vrcAutoStatus').checked) $('discordVrcStatus').value = key
    if (s.status) $('peStatus').value = s.status
    if (s.statusDescription != null) $('peStatusDesc').value = s.statusDescription
  } else if (s.needs2fa) { $('vrc2faRow').style.display = ''; setText('vrcAcctOut', '2FA required') } else if (s.error) setText('vrcAcctOut', 'Error: ' + s.error)
})

/* ---------------- weather ---------------- */
function weatherCfg () { return { city: $('weatherCity').value.trim(), units: $('weatherUnits').value } }
function applyWeather () {
  const c = weatherCfg()
  api.saveSetting('weather', { enabled: $('weatherEnable').checked, city: c.city, units: c.units })
  if ($('weatherEnable').checked && c.city) { setPill('weatherState', true, 'on'); api.weatherStart(c) } else { setPill('weatherState', false); api.weatherStop(); setText('weatherOut', '—') }
}
;['weatherEnable', 'weatherCity', 'weatherUnits'].forEach(id => $(id).addEventListener('change', applyWeather))
api.on('weather:update', s => {
  if (s && s.ok) {
    setText('weatherOut', `${s.desc} · ${s.temp}${s.unit} (feels ${s.feels}${s.unit})`)
    setText('weatherSub', `${s.city} · wind ${s.wind} ${s.windUnit} · use {weather} in a preset`)
    composer.update({ weather: `${s.desc} ${s.temp}${s.unit}` })
  } else { setText('weatherOut', '—'); if (s && s.error) setText('weatherSub', s.error) }
})

/* ---------------- discord voice bot ---------------- */
function botCfg () { return { token: $('botToken').value.trim(), userId: $('botUserId').value.trim(), appId: $('botAppId').value.trim() } }
$('botStart').addEventListener('click', async () => {
  const c = botCfg()
  await api.saveSetting('discordBotToken', c.token)
  await api.saveSetting('discordBot', { userId: c.userId, appId: c.appId })
  setText('botOut', 'Connecting…')
  const r = await api.botStart(c)
  if (!r.ok) setText('botOut', 'Error: ' + (r.error || 'failed'))
})
$('botStop').addEventListener('click', async () => { await api.botStop(); setPill('botState', false); setText('botOut', 'Stopped') })
$('botInvite').addEventListener('click', async () => {
  const url = await api.botInvite($('botAppId').value.trim())
  setText('botOut', url ? ('Invite (copy): ' + url) : 'Connect first, or enter the Application ID for the invite link.')
})
api.on('bot:update', s => {
  setPill('botState', s.connected, 'on')
  if (!s.connected) { if (s.error) setText('botOut', 'Error: ' + s.error); return }
  const bits = []
  bits.push(s.inVoice ? `🔊 ${s.channelName} (${s.userCount})` : 'not in voice')
  if (s.selfMute) bits.push('🔇 muted')
  if (s.selfDeaf) bits.push('🔈 deafened')
  setText('botOut', bits.join(' · '))
  composer.update({ discordChannel: s.inVoice ? s.channelName : '', discordUsers: s.userCount || 0, discordMute: !!s.selfMute, discordDeaf: !!s.selfDeaf })
  if (s.callEvent === 'started') { logLine('Discord call started'); setText('oscControlOut', '📞 Call started') }
  if (s.callEvent === 'ended') { logLine('Discord call ended'); setText('oscControlOut', '📞 Call ended') }
})

/* ---------------- soundpad ---------------- */
function spOut (r) {
  const ok = !!(r && r.ok)
  setPill('soundpadState', ok, 'on'); $('soundpadState').textContent = ok ? 'ok' : 'error'
  setText('soundpadOut', ok ? 'OK' : ('Error: ' + ((r && r.error) || 'Soundpad not running?')))
}
$('soundpadPlay').addEventListener('click', async () => spOut(await api.soundpadCmd('play', parseInt($('soundpadIndex').value, 10) || 1)))
$('soundpadStop').addEventListener('click', async () => spOut(await api.soundpadCmd('stop')))
$('soundpadNext').addEventListener('click', async () => spOut(await api.soundpadCmd('next')))
$('soundpadPrev').addEventListener('click', async () => spOut(await api.soundpadCmd('previous')))
$('soundpadPause').addEventListener('click', async () => spOut(await api.soundpadCmd('pause')))
$('soundpadRandom').addEventListener('click', async () => spOut(await api.soundpadCmd('random')))
$('soundpadRefresh').addEventListener('click', async () => {
  const r = await api.soundpadList()
  if (r.ok) {
    $('soundpadList').innerHTML = r.list.map(x => `<div class="row" style="justify-content:space-between;padding:2px 0"><span>#${x.index} ${String(x.title).replace(/</g, '&lt;')}</span><button class="btn ghost sp-play" data-i="${x.index}" style="padding:2px 8px;font-size:.72rem">Play</button></div>`).join('') || 'Empty'
    spOut({ ok: true })
  } else spOut(r)
})
$('soundpadList').addEventListener('click', async e => { const b = e.target.closest('.sp-play'); if (b) spOut(await api.soundpadCmd('play', parseInt(b.dataset.i, 10))) })

/* ---------------- SpotiOSC + DiscordOSC (OSC-in → action) ---------------- */
;['spotiOscEnable', 'discordOscEnable'].forEach(id => $(id).addEventListener('change', () => api.saveSetting(id, $(id).checked)))
const SPOTI_MAP = {
  '/avatar/parameters/VRCOSC/Spotify/PlayPause': 'playpause',
  '/avatar/parameters/VRCOSC/Spotify/Next': 'next',
  '/avatar/parameters/VRCOSC/Spotify/Previous': 'previous',
  '/avatar/parameters/VRCOSC/Spotify/Stop': 'stop'
}
addOscListener((address, args) => {
  const val = args && args[0]
  if ($('spotiOscEnable') && $('spotiOscEnable').checked && SPOTI_MAP[address] && val === true) {
    api.mediaKey(SPOTI_MAP[address]); setText('oscControlOut', `🎵 Spotify: ${SPOTI_MAP[address]}`)
  }
  if ($('discordOscEnable') && $('discordOscEnable').checked) {
    if (address === '/avatar/parameters/VRCOSC/Discord/Mute') { api.botSetMute(!!val); setText('oscControlOut', `🎙 mute: ${!!val}`) }
    if (address === '/avatar/parameters/VRCOSC/Discord/Deafen') { api.botSetDeaf(!!val); setText('oscControlOut', `🎙 deafen: ${!!val}`) }
  }
}, getRecvPort())

/* ---------------- vrchat maintenance tools ---------------- */
function fmtBytes (b) {
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++ }
  return b.toFixed(i ? 1 : 0) + ' ' + u[i]
}
$('ytFix').addEventListener('click', async () => {
  setText('ytFixOut', 'Downloading latest yt-dlp…'); $('ytFix').disabled = true
  const r = await api.vrcToolsYtDlp()
  $('ytFix').disabled = false
  setText('ytFixOut', r.ok ? `✅ Updated yt-dlp (${fmtBytes(r.bytes)}). Restart any open VRChat video player.` : ('Error: ' + (r.error || 'failed')))
})
$('cacheCheck').addEventListener('click', async () => {
  const r = await api.vrcToolsCacheSize()
  setText('cacheOut', r.exists ? `Cache size: ${fmtBytes(r.bytes)}` : 'No cache folder found')
})
$('cacheClear').addEventListener('click', async () => {
  setText('cacheOut', 'Clearing…')
  const r = await api.vrcToolsClearCache()
  setText('cacheOut', r.ok ? `✅ Cleared ${fmtBytes(r.freedBytes)}` : ('Error: ' + (r.error || 'failed')))
})
document.querySelectorAll('[data-folder]').forEach(b => b.addEventListener('click', () => api.vrcToolsOpenFolder(b.dataset.folder)))

/* ---------------- Friend Den ---------------- */
const STATUS_DOT = { 'join me': '🔵', active: '🟢', 'ask me': '🟠', busy: '🔴', offline: '⚫' }
function fmtLocation (loc) {
  if (!loc || loc === 'offline') return 'Offline'
  if (loc === 'private') return '🔒 Private'
  if (loc === 'traveling') return '✈️ Traveling'
  if (String(loc).startsWith('wrld_')) return '🌐 In a world'
  return loc
}
async function loadFriends () {
  const el = $('friendList'); el.textContent = 'Loading…'
  const r = await api.vrchatFriends()
  if (!r.ok) { el.textContent = 'Error: ' + (r.error || 'failed') + ' — log in on the VRChat tab.'; setText('friendCount', '0'); return }
  const fr = r.friends.sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')))
  setText('friendCount', String(fr.length))
  el.innerHTML = fr.map(f => {
    const dot = STATUS_DOT[String(f.status || '').toLowerCase()] || '⚫'
    const name = String(f.displayName || '?').replace(/</g, '&lt;')
    const desc = f.statusDescription ? ' · ' + String(f.statusDescription).replace(/</g, '&lt;') : ''
    return `<div class="fd-friend" data-id="${f.id}" style="padding:3px 0;cursor:pointer">${dot} <b>${name}</b> — ${fmtLocation(f.location)}${desc}</div>`
  }).join('') || 'No online friends.'
}
$('friendList').addEventListener('click', e => { const row = e.target.closest('.fd-friend'); if (row && row.dataset.id) openUserModal(row.dataset.id) })
let friendTimer = null
function syncFriendAuto () {
  if ($('friendAuto').checked) { if (!friendTimer) friendTimer = setInterval(() => { if ($('friendden').offsetParent !== null) loadFriends() }, 60000) } else if (friendTimer) { clearInterval(friendTimer); friendTimer = null }
}
$('friendRefresh').addEventListener('click', loadFriends)
$('friendAuto').addEventListener('change', () => { api.saveSetting('friendAuto', $('friendAuto').checked); syncFriendAuto() })
document.querySelector('[data-tab="friendden"]').addEventListener('click', loadFriends)

/* ---------------- Event Scout (multi-group) ---------------- */
let trackedGroups = []
async function loadGroups () {
  const el = $('eventGroups'); el.textContent = 'Loading…'
  const r = await api.vrchatGroups()
  if (!r.ok) { el.textContent = 'Error: ' + (r.error || 'failed') + ' — log in on the VRChat tab.'; return }
  el.innerHTML = r.groups.map(g => `<label class="switch" style="margin:4px 0"><input type="checkbox" class="evgrp" data-id="${g.id}" ${trackedGroups.includes(g.id) ? 'checked' : ''}> ${String(g.name || g.id).replace(/</g, '&lt;')}</label>`).join('') || 'You are in no groups.'
  el.querySelectorAll('.evgrp').forEach(c => c.addEventListener('change', () => {
    trackedGroups = Array.from(el.querySelectorAll('.evgrp')).filter(x => x.checked).map(x => x.dataset.id)
    api.saveSetting('eventGroups', trackedGroups); loadEvents()
  }))
}
async function loadEvents () {
  const el = $('eventList')
  if (!trackedGroups.length) { el.textContent = 'Load your groups and tick one or more to track.'; return }
  el.textContent = 'Loading…'
  let all = []
  for (const gid of trackedGroups) { const r = await api.vrchatGroupEvents(gid); if (r.ok) all = all.concat(r.events) }
  all.sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0))
  el.innerHTML = all.length
    ? all.map(e => {
      const when = e.startsAt ? new Date(e.startsAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBA'
      return `<div style="padding:3px 0">🔭 <b>${String(e.title || 'Event').replace(/</g, '&lt;')}</b> — ${when}</div>`
    }).join('')
    : 'No upcoming events for the selected groups.'
}
$('eventLoadGroups').addEventListener('click', loadGroups)
$('eventRefresh').addEventListener('click', loadEvents)

/* ---------------- Pawprints ---------------- */
function fmtDuration (secs) { const h = Math.floor(secs / 3600); const m = Math.floor(secs % 3600 / 60); return h ? `${h}h ${m}m` : `${m}m` }
async function loadPawprints () {
  const map = await api.pawprintsList()
  const el = $('pawList')
  const entries = Object.entries(map || {}).sort((a, b) => b[1] - a[1])
  el.innerHTML = entries.length
    ? entries.map(([w, secs]) => `<div class="row" style="justify-content:space-between;padding:3px 0"><span>🐾 ${String(w).replace(/</g, '&lt;')}</span><span>${fmtDuration(secs)}</span></div>`).join('')
    : 'No data yet — spend time in a world.'
}
$('pawRefresh').addEventListener('click', loadPawprints)
$('pawClear').addEventListener('click', async () => { await api.pawprintsClear(); loadPawprints() })
document.querySelector('[data-tab="pawprints"]').addEventListener('click', loadPawprints)

/* ---------------- My Groups + My Content pages ---------------- */
async function loadMyGroups () {
  const el = $('myGroupsList'); el.textContent = 'Loading…'
  const r = await api.vrchatGroups()
  if (!r.ok) { el.textContent = (r.error || 'Could not load') + ' — log in on the VRChat tab.'; return }
  el.innerHTML = r.groups.length ? `<div class="card-grid">${r.groups.map(groupCard).join('')}</div>` : 'You are in no groups.'
}
$('myGroupsRefresh').addEventListener('click', loadMyGroups)
document.querySelector('[data-tab="groups"]').addEventListener('click', loadMyGroups)

async function loadMyContent (kind) {
  const el = $('myContentBody'); el.textContent = 'Loading…'
  if (kind === 'avatars') {
    const r = await api.vrchatMyAvatars()
    if (!r.ok) { el.textContent = (r.error || 'Could not load') + ' — log in on the VRChat tab.'; return }
    el.innerHTML = r.avatars.length ? `<div class="card-grid">${r.avatars.map(a => `<div class="mini-card" style="flex-direction:column;align-items:stretch"><div style="display:flex;gap:9px;align-items:center"><img src="${a.image || 'assets/logo.png'}" referrerpolicy="no-referrer" /><div style="min-width:0"><div class="nm">${esc(a.name)}</div><div class="muted" style="font-size:.72rem">${esc(a.releaseStatus || '')}</div></div></div><div class="row" style="margin-top:6px;gap:6px"><button class="btn av-switch" data-id="${a.id}" style="padding:3px 10px;font-size:.72rem">Wear</button><button class="btn danger av-del" data-id="${a.id}" data-name="${esc(a.name)}" style="padding:3px 10px;font-size:.72rem">Delete</button></div></div>`).join('')}</div>` : 'No avatars.'
  } else {
    const r = await api.vrchatMyWorlds()
    if (!r.ok) { el.textContent = (r.error || 'Could not load') + ' — log in on the VRChat tab.'; return }
    el.innerHTML = r.worlds.length ? `<div class="card-grid">${r.worlds.map(worldCard).join('')}</div>` : 'No worlds uploaded.'
  }
}
document.querySelectorAll('[data-ctab]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-ctab]').forEach(x => x.classList.toggle('active', x === b))
  loadMyContent(b.dataset.ctab)
}))
document.querySelector('[data-tab="content"]').addEventListener('click', () => loadMyContent('worlds'))
// Avatar Wear / Delete actions
$('myContentBody').addEventListener('click', async e => {
  const sw = e.target.closest('.av-switch'); const del = e.target.closest('.av-del')
  if (sw) { sw.textContent = '…'; const r = await api.vrchatSelectAvatar(sw.dataset.id); sw.textContent = r.ok ? '✓ Worn' : '✗'; if (!r.ok) console.warn(r.error) }
  if (del) {
    const ok = await confirmDialog(`Delete avatar “${del.dataset.name}”? This cannot be undone.`)
    if (!ok) return
    del.textContent = '…'; const r = await api.vrchatDeleteAvatar(del.dataset.id)
    if (r.ok) loadMyContent('avatars'); else { del.textContent = 'Delete'; alert('Delete failed: ' + (r.error || '')) }
  }
})

/* ---------------- Search + ID/URL loader + detail modals ---------------- */
async function doSearch () {
  const q = $('searchQuery').value.trim(); if (!q) return
  const type = $('searchType').value
  const el = $('searchResults'); el.textContent = 'Searching…'
  if (type === 'users') {
    const r = await api.vrchatSearchUsers(q)
    if (!r.ok) { el.textContent = r.error || 'Search failed'; return }
    el.innerHTML = r.users.length ? `<div class="card-grid">${r.users.map(u => `<div class="mini-card" data-kind="user" data-id="${u.id}" style="cursor:pointer"><img src="${u.image || 'assets/logo.png'}" referrerpolicy="no-referrer" /><div style="min-width:0"><div class="nm">${esc(u.displayName)}</div><div class="muted" style="font-size:.72rem">${esc(u.statusDescription || u.status || '')}</div></div></div>`).join('')}</div>` : 'No users found.'
  } else if (type === 'worlds') {
    const r = await api.vrchatSearchWorlds(q)
    if (!r.ok) { el.textContent = r.error || 'Search failed'; return }
    el.innerHTML = r.worlds.length ? `<div class="card-grid">${r.worlds.map(worldCard).join('')}</div>` : 'No worlds found.'
  } else {
    const r = await api.vrchatSearchGroups(q)
    if (!r.ok) { el.textContent = r.error || 'Search failed'; return }
    el.innerHTML = r.groups.length ? `<div class="card-grid">${r.groups.map(groupCard).join('')}</div>` : 'No groups found.'
  }
}
$('searchBtn').addEventListener('click', doSearch)
$('searchQuery').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch() })
// user result cards open the user modal
$('searchResults').addEventListener('click', e => { const c = e.target.closest('.mini-card[data-kind="user"]'); if (c) openUserModal(c.dataset.id) })

/* ---------------- History page ---------------- */
const HIST_ICON = { join: '➡️', leave: '⬅️', friend_add: '➕', friend_remove: '➖', name_change: '✏️', world: '🌐', alert: '🔔', group: '👥' }
async function loadHistory () {
  const el = $('histList'); el.textContent = 'Loading…'
  const rows = await api.historyList({ type: $('histType').value || undefined, limit: 300 })
  if (!rows || !rows.length) { el.textContent = 'No history yet — it fills as you use VRChat with the app open.'; return }
  el.innerHTML = rows.map(r => {
    const when = new Date(r.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    return `<div style="display:flex;gap:8px;padding:5px 0;border-top:1px solid var(--border)"><span>${HIST_ICON[r.type] || '•'}</span><div class="grow" style="min-width:0"><div><b>${esc(r.name || r.type)}</b> <span class="muted">${esc(r.detail || '')}</span></div><div class="muted" style="font-size:.72rem">${when}${r.world ? ' · ' + esc(r.world) : ''}</div></div></div>`
  }).join('')
}
$('histRefresh').addEventListener('click', loadHistory)
$('histType').addEventListener('change', loadHistory)
$('histClear').addEventListener('click', async () => { await api.historyClear(); loadHistory() })
$('histImport').addEventListener('click', async () => {
  $('histList').textContent = 'Importing from VRCX…'
  const r = await api.historyImportVrcx()
  if (r.ok) { setText('histList', `✅ Imported ${r.imported} VRCX events.`); loadHistory() } else setText('histList', 'Import failed: ' + (r.error || ''))
})
document.querySelector('[data-tab="history"]').addEventListener('click', loadHistory)

/* ---------------- Auto-Greeter ---------------- */
function greeterCfg () { return { enabled: $('greeterEnable').checked, mode: $('greeterMode').value, allow: $('greeterAllow').value.split(',').map(s => s.trim()).filter(Boolean) } }
function applyGreeter () { const c = greeterCfg(); api.saveSetting('greeter', c); api.greeterSet(c); setText('greeterOut', c.enabled ? 'On — watching for friend requests.' : 'Off') }
;['greeterEnable', 'greeterMode', 'greeterAllow'].forEach(id => $(id).addEventListener('change', applyGreeter))
api.on('greeter:accepted', s => setText('greeterOut', '✅ Auto-accepted ' + (s.name || 'a request')))

function parseVrcId (s) {
  s = String(s || '').trim()
  let m
  if ((m = s.match(/usr_[0-9a-fA-F-]+/))) return { type: 'user', id: m[0] }
  if ((m = s.match(/wrld_[0-9a-fA-F-]+/))) return { type: 'world', id: m[0] }
  if ((m = s.match(/grp_[0-9a-fA-F-]+/))) return { type: 'group', id: m[0] }
  if ((m = s.match(/avtr_[0-9a-fA-F-]+/))) return { type: 'avatar', id: m[0] }
  return null
}
$('idLoadBtn').addEventListener('click', () => {
  const p = parseVrcId($('idLoadInput').value)
  if (!p) { setText('idLoadOut', 'No usr_/wrld_/grp_ id found in that text.'); return }
  setText('idLoadOut', `Opening ${p.type}…`)
  if (p.type === 'user') openUserModal(p.id)
  else if (p.type === 'world') openWorldModal(p.id)
  else if (p.type === 'group') openGroupModal(p.id)
  else setText('idLoadOut', 'Avatars of other users can’t be opened (VRChat API restricts them).')
})
$('idLoadInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('idLoadBtn').click() })

function closeDetailModal () { $('detailModal').style.display = 'none' }
$('detailModalClose').addEventListener('click', closeDetailModal)
$('detailModal').addEventListener('click', e => { if (e.target === $('detailModal')) closeDetailModal() })
// Favorite / unfavorite buttons inside the detail modal
$('dmActions').addEventListener('click', async e => {
  const b = e.target.closest('[data-fav]'); if (!b) return
  const orig = b.textContent; b.textContent = '…'; b.disabled = true
  const r = b.dataset.fav === 'add' ? await api.vrchatAddFav(b.dataset.type || 'world', b.dataset.id) : await api.vrchatRemoveFav(b.dataset.id)
  b.disabled = false; b.textContent = r.ok ? '✓ Done' : '✗ ' + (r.error || 'failed')
  setTimeout(() => { b.textContent = orig }, 2500)
})
function dmInfo (rows) { return `<div class="um-sec">Info</div><div class="um-info">${rows.filter(r => r[1] !== '' && r[1] != null).map(r => `<div><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('')}</div>` }
async function openWorldModal (id) {
  $('detailModal').style.display = 'flex'
  $('dmName').textContent = 'Loading…'; setText('dmSub', ''); $('dmActions').innerHTML = ''; $('dmBody').innerHTML = ''
  const r = await api.vrchatWorld(id)
  if (!r.ok) { $('dmName').textContent = 'Error'; $('dmBody').innerHTML = `<div class="muted">${esc(r.error)}</div>`; return }
  const w = r.world
  $('dmName').textContent = w.name || '—'
  setText('dmSub', 'World by ' + (w.authorName || '?'))
  $('dmImage').src = w.thumbnailImageUrl || w.imageUrl || 'assets/logo.png'
  $('dmBanner').style.backgroundImage = (w.imageUrl || w.thumbnailImageUrl) ? `url("${w.imageUrl || w.thumbnailImageUrl}")` : ''
  $('dmActions').innerHTML = `<a class="btn" href="https://vrchat.com/home/world/${w.id}" target="_blank">Open on VRChat</a><button class="btn ghost" data-fav="add" data-type="world" data-id="${w.id}">⭐ Favorite</button><button class="btn ghost" data-fav="rm" data-id="${w.id}">✖ Unfavorite</button>`
  $('dmBody').innerHTML = (w.description ? `<div class="um-bio">${esc(w.description)}</div>` : '') + dmInfo([
    ['Players', w.occupants || 0], ['Capacity', w.capacity || '?'], ['Visits', w.visits || 0],
    ['Favorites', w.favorites || 0], ['Status', w.releaseStatus || ''],
    ['Updated', w.updated_at ? new Date(w.updated_at).toLocaleDateString() : '']
  ]) +
    `<div class="um-sec">Create instance</div>
     <div class="row" style="flex-wrap:wrap;gap:8px">
       <select id="instAccess" style="max-width:150px"><option value="public">Public</option><option value="friends+">Friends+</option><option value="friends">Friends</option><option value="invite+">Invite+</option><option value="invite">Invite</option></select>
       <button class="btn" id="instCreate">Create + Self-invite</button>
       <button class="btn ghost" id="instInvite">Invite friends…</button>
     </div>
     <div class="muted" id="instOut" style="margin-top:6px;font-size:.78rem;word-break:break-all"></div>`
  bindWorldInstance(w.id)
}
let lastInstance = null
function bindWorldInstance (worldId) {
  lastInstance = null
  $('instCreate').addEventListener('click', async () => {
    setText('instOut', 'Creating instance…')
    const r = await api.vrchatCreateInstance(worldId, $('instAccess').value)
    if (!r.ok) { setText('instOut', 'Error: ' + (r.error || 'failed')); return }
    lastInstance = r
    await api.vrchatInviteSelf(r.location)
    setText('instOut', `✅ Created + self-invited. Link: https://vrchat.com/home/launch?worldId=${worldId}&instanceId=${encodeURIComponent(r.instanceId)}`)
  })
  $('instInvite').addEventListener('click', async () => {
    let loc = lastInstance && lastInstance.location
    if (!loc) { const r = await api.vrchatCreateInstance(worldId, $('instAccess').value); if (!r.ok) { setText('instOut', 'Error: ' + (r.error || 'failed')); return } lastInstance = r; loc = r.location }
    const ids = await pickFriends('Invite to instance')
    if (!ids.length) return
    setText('instOut', `Inviting ${ids.length}…`)
    let ok = 0
    for (const id of ids) { const res = await api.vrchatInvite(id, loc); if (res.ok) ok++ }
    setText('instOut', `✅ Invited ${ok}/${ids.length}`)
  })
}
async function openGroupModal (id) {
  $('detailModal').style.display = 'flex'
  $('dmName').textContent = 'Loading…'; setText('dmSub', ''); $('dmActions').innerHTML = ''; $('dmBody').innerHTML = ''
  const r = await api.vrchatGroup(id)
  if (!r.ok) { $('dmName').textContent = 'Error'; $('dmBody').innerHTML = `<div class="muted">${esc(r.error)}</div>`; return }
  const g = r.group
  $('dmName').textContent = g.name || '—'
  setText('dmSub', (g.shortCode ? '@' + g.shortCode + ' · ' : '') + (g.memberCount || 0) + ' members')
  $('dmImage').src = g.iconUrl || 'assets/logo.png'
  $('dmBanner').style.backgroundImage = g.bannerUrl ? `url("${g.bannerUrl}")` : ''
  $('dmActions').innerHTML = `<a class="btn" href="https://vrchat.com/home/group/${g.id}" target="_blank">Open on VRChat</a><button class="btn ghost" id="grpInvite">Invite people…</button>`
  $('grpInvite').addEventListener('click', async () => {
    const ids = await pickFriends('Invite to ' + (g.name || 'group'))
    if (!ids.length) return
    let ok = 0
    for (const id of ids) { const r = await api.vrchatGroupInvite(g.id, id); if (r.ok) ok++ }
    setText('dmSub', `Invited ${ok}/${ids.length} to the group`)
  })
  $('dmBody').innerHTML = (g.description ? `<div class="um-bio">${esc(g.description)}</div>` : '') + dmInfo([
    ['Members', g.memberCount || 0], ['Code', g.shortCode ? '@' + g.shortCode : ''],
    ['Privacy', g.privacy || ''], ['Created', g.createdAt ? new Date(g.createdAt).toLocaleDateString() : '']
  ])
}

/* ---------------- rail clock + launch ---------------- */
function tickRailClock () { if ($('railClock')) $('railClock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
tickRailClock(); setInterval(tickRailClock, 15000)
$('launchVrc').addEventListener('click', () => api.launchVRChat())

/* ---------------- notifications flyout ---------------- */
const notifPanel = $('notifPanel')
$('notifBell').addEventListener('click', e => {
  e.stopPropagation()
  const show = notifPanel.style.display === 'none'
  notifPanel.style.display = show ? 'block' : 'none'
  if (show) loadNotifications()
})
document.addEventListener('click', e => {
  if (notifPanel.style.display !== 'none' && !notifPanel.contains(e.target) && !$('notifBell').contains(e.target)) notifPanel.style.display = 'none'
})
$('notifRefresh').addEventListener('click', loadNotifications)
$('notifRefreshPage').addEventListener('click', loadNotifications)
$('notifClearAll').addEventListener('click', async () => { await api.notifClear(); loadNotifications() })
document.querySelector('[data-tab="notify"]').addEventListener('click', loadNotifications)
function setNotifCount (n) { const c = $('notifCount'); if (n > 0) { c.style.display = 'flex'; c.textContent = n > 99 ? '99+' : String(n) } else c.style.display = 'none' }
function notifItemHtml (n) {
  const when = new Date(n.ts || Date.now()).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  let title
  if (n.type === 'friendRequest') title = `Friend request from <b>${esc(n.sender)}</b>`
  else if (n.type === 'invite') title = `<b>${esc(n.sender)}</b> invited you${n.world ? ` to <b>${esc(n.world)}</b>` : ''}`
  else if (n.type === 'requestInvite') title = `<b>${esc(n.sender)}</b> requested an invite`
  else if (n.type === 'boop') title = `<b>${esc(n.sender)}</b> booped you 👉`
  else title = `<b>${esc(n.sender || n.type)}</b> ${esc(n.message || '')}`
  const sub = (n.message && n.type !== 'friendRequest' && n.type !== 'boop') ? `<div class="muted" style="font-size:.74rem">${esc(n.message)}</div>` : ''
  const accept = n.type === 'friendRequest' ? `<button class="btn nf-accept" data-id="${n.id}" style="padding:3px 9px;font-size:.72rem">Accept</button>` : ''
  const join = (n.link) ? `<a class="btn nf-join" href="${n.link}" target="_blank" style="padding:3px 9px;font-size:.72rem">Join</a>` : ''
  return `<div class="notif-item"><div class="grow">${title}${sub}<div class="when">${when}</div></div>${accept}${join}<button class="btn ghost nf-dismiss" data-id="${n.id}" title="Dismiss" style="padding:3px 8px;font-size:.72rem">×</button></div>`
}
async function loadNotifications () {
  const list = await api.notifList()
  setNotifCount(list.length)
  const html = list.length ? list.map(notifItemHtml).join('') : '<div class="muted">No notifications.</div>'
  if ($('notifList')) $('notifList').innerHTML = html
  if ($('notifPageList')) $('notifPageList').innerHTML = html
}
// Delegated accept/dismiss for notification items (flyout + page).
document.addEventListener('click', async e => {
  const acc = e.target.closest('.nf-accept'); const dis = e.target.closest('.nf-dismiss')
  if (acc) { acc.disabled = true; acc.textContent = '…'; await api.notifAccept(acc.dataset.id); loadNotifications() }
  if (dis) { dis.disabled = true; await api.notifDismiss(dis.dataset.id); loadNotifications() }
})
api.on('notif:new', n => { toast(`<b>🔔 ${esc(n.sender || 'VRChat')}</b><br>${esc((n.type === 'invite' ? 'invited you' + (n.world ? ' to ' + n.world : '') : n.type === 'boop' ? 'booped you 👉' : n.type === 'friendRequest' ? 'friend request' : n.message || n.type))}`) })
api.on('notif:update', () => loadNotifications())

/* ---------------- right friends panel ---------------- */
const RB_COLOR = { 'join me': '#3b82f6', active: '#22c55e', 'ask me': '#f59e0b', busy: '#ef4444', offline: '#6b7280' }
let rbFriendsCache = { online: [], offline: [] }
let favFriendIds = new Set()
let myUserId = ''
const rbCollapsed = { fav: false, same: false, online: false, web: false, offline: true } // offline collapsed by default
function rbFriendRow (f) {
  const onWeb = f.state === 'active' && (!f.location || f.location === 'offline')
  const color = onWeb ? '#f59e0b' : (RB_COLOR[String(f.status || '').toLowerCase()] || '#6b7280')
  const name = String(f.displayName || '?').replace(/</g, '&lt;')
  const loc = (onWeb ? '🌐 On the website' : fmtLocation(f.location)).replace(/</g, '&lt;')
  const ava = f.image ? `<img class="ava" src="${f.image}" referrerpolicy="no-referrer" />` : '<div class="ava"></div>'
  return `<div class="rb-friend" data-id="${f.id}">${ava}<span class="dot" style="background:${color}"></span><div class="meta grow"><div class="nm">${name}</div><div class="lo">${loc}</div></div></div>`
}
function rbSection (key, title, friends) {
  if (!friends.length && key !== 'offline') return ''
  const collapsed = rbCollapsed[key]
  const rows = collapsed ? '' : (friends.map(rbFriendRow).join('') || '<div class="muted" style="padding:4px 6px;font-size:.78rem">None</div>')
  return `<div class="rb-group rb-toggle" data-grp="${key}">${collapsed ? '▸' : '▾'} ${title} — ${friends.length}</div>${rows}`
}
function renderRightbar () {
  const q = ($('rbSearch').value || '').toLowerCase()
  const myLoc = window.__myLocation || ''
  const match = f => !q || String(f.displayName || '').toLowerCase().includes(q)
  const online = (rbFriendsCache.online || []).filter(match)
  const offline = (rbFriendsCache.offline || []).filter(match)
  const onWeb = f => f.state === 'active' && (!f.location || f.location === 'offline')
  const favList = [...online, ...offline].filter(f => favFriendIds.has(f.id))
  const same = online.filter(f => myLoc && f.location === myLoc)
  const inGame = online.filter(f => !onWeb(f) && !(myLoc && f.location === myLoc))
  const web = online.filter(f => onWeb(f))
  $('rbFriends').innerHTML =
    rbSection('fav', '⭐ Favorites', favList) +
    rbSection('same', '🏠 Same World', same) +
    rbSection('online', '🟢 In-Game', inGame) +
    rbSection('web', '🌐 On Web', web) +
    rbSection('offline', '⚫ Offline', offline)
}
async function loadRightbar () {
  if (!await api.vrchatIsLoggedIn()) { $('rbFriends').textContent = 'Log in on the VRChat tab.'; return }
  const [frOn, frOff, me] = await Promise.all([api.vrchatFriends(false), api.vrchatFriends(true), api.vrchatStatus()])
  if (me && me.ok && me.user) {
    myUserId = me.user.id || ''
    setText('rbName', me.user.displayName || '—')
    setText('rbStatus', me.user.statusDescription || me.user.status || '')
    if (me.user.userIcon || me.user.currentAvatarThumbnailImageUrl) $('rbAvatar').src = me.user.userIcon || me.user.currentAvatarThumbnailImageUrl
  }
  if (frOn && frOn.ok) rbFriendsCache.online = frOn.friends
  if (frOff && frOff.ok) rbFriendsCache.offline = frOff.friends
  try { const fav = await api.vrchatFavFriendIds(); if (fav.ok) favFriendIds = new Set(fav.ids) } catch (_) {}
  if ((frOn && frOn.ok) || (frOff && frOff.ok)) renderRightbar()
  else $('rbFriends').textContent = (frOn && frOn.error) || 'Could not load friends.'
}
$('rbSearch').addEventListener('input', renderRightbar)
$('rbFriends').addEventListener('click', e => {
  const toggle = e.target.closest('.rb-toggle')
  if (toggle) { const k = toggle.dataset.grp; rbCollapsed[k] = !rbCollapsed[k]; renderRightbar(); return }
  const row = e.target.closest('.rb-friend')
  if (row && row.dataset.id) openUserModal(row.dataset.id)
})
// Click your own profile header to open your full profile.
const rbProfileEl = document.querySelector('.rb-profile')
if (rbProfileEl) { rbProfileEl.style.cursor = 'pointer'; rbProfileEl.addEventListener('click', () => { if (myUserId) openUserModal(myUserId) }) }
setInterval(loadRightbar, 90000)

/* ---------------- user profile modal ---------------- */
function trustRank (tags) {
  tags = tags || []
  if (tags.includes('system_trust_veteran')) return { label: 'Trusted User', color: '#8b5cf6' }
  if (tags.includes('system_trust_trusted')) return { label: 'Known User', color: '#f59e0b' }
  if (tags.includes('system_trust_known')) return { label: 'User', color: '#22c55e' }
  if (tags.includes('system_trust_basic')) return { label: 'New User', color: '#3b82f6' }
  return { label: 'Visitor', color: '#9ca3af' }
}
function esc (s) { return String(s == null ? '' : s).replace(/</g, '&lt;') }
let umCurrentId = null
let umUser = null
function closeUserModal () { $('userModal').style.display = 'none' }
$('userModalClose').addEventListener('click', closeUserModal)
$('userModal').addEventListener('click', e => { if (e.target === $('userModal')) closeUserModal() })
function umLocationLine (u) {
  if (u.location && u.location !== 'offline') return `📍 ${fmtLocation(u.location)}`
  return u.state === 'online' ? '🟢 Active on the website' : '⚫ Offline'
}
async function openUserModal (id) {
  umCurrentId = id; umUser = null
  $('userModal').style.display = 'flex'
  $('umName').textContent = 'Loading…'
  setText('umStatusDesc', ''); $('umTags').innerHTML = ''; setText('umActionOut', '')
  $('umTabBody').innerHTML = '<div class="muted">Loading…</div>'
  const r = await api.vrchatUser(id)
  if (!r.ok) { $('umName').textContent = 'Error'; setText('umActionOut', r.error || 'Could not load user'); $('umTabBody').innerHTML = ''; return }
  umUser = r.user
  const u = umUser
  $('umName').textContent = u.displayName || '—'
  setText('umStatusDesc', u.statusDescription || u.status || '')
  $('umAvatar').src = u.userIcon || u.profilePicOverride || u.currentAvatarThumbnailImageUrl || 'assets/logo.png'
  // Banner: VRC+ users' custom profile image if set, otherwise their avatar image.
  const isVrcPlus = (u.tags || []).includes('system_supporter')
  const bannerUrl = (isVrcPlus && u.profilePicOverride) ? u.profilePicOverride : (u.currentAvatarImageUrl || u.profilePicOverride || '')
  $('umBanner').style.backgroundImage = bannerUrl ? `url("${bannerUrl}")` : ''
  const tr = trustRank(u.tags)
  const chips = [`<span class="tagchip" style="border-color:${tr.color};color:${tr.color}">${tr.label}</span>`]
  if (u.last_platform) chips.push(`<span class="tagchip">${u.last_platform === 'standalonewindows' ? 'PC' : (u.last_platform === 'android' ? 'Quest' : u.last_platform)}</span>`)
  if ((u.tags || []).includes('system_supporter')) chips.push('<span class="tagchip">VRC+</span>')
  if (u.ageVerified || (u.tags || []).includes('system_age_verified')) chips.push('<span class="tagchip">18+</span>')
  $('umTags').innerHTML = chips.join('')
  $('umAddFriend').textContent = u.isFriend ? '➖ Unfriend' : '➕ Add Friend'
  $('umAddFriend').classList.toggle('danger', !!u.isFriend)
  // On your OWN profile, hide friend/invite/boop actions (they don't apply to you).
  if (!myUserId) { try { const me = await api.vrchatStatus(); if (me && me.ok) myUserId = me.user.id } catch (_) {} }
  const isMe = u.id === myUserId
  ;['umAddFriend', 'umInvite', 'umRequestInvite', 'umFav', 'umBoop', 'umMute', 'umBlock'].forEach(k => { $(k).style.display = isMe ? 'none' : '' })
  _umBlocked = false; _umMuted = false
  $('umBlock').textContent = '🚫 Block'; $('umMute').textContent = '🔇 Mute'
  renderMTab('info')
}
async function renderMTab (tab) {
  document.querySelectorAll('.mtab').forEach(t => t.classList.toggle('active', t.dataset.mtab === tab))
  const body = $('umTabBody'); const u = umUser; if (!u) return
  if (tab === 'info') {
    const links = (u.bioLinks || []).filter(Boolean).map(l => { let h = l; try { h = new URL(l).hostname } catch (_) {} return `<a href="${l}" target="_blank" class="btn ghost" style="padding:3px 10px;font-size:.74rem">🔗 ${esc(h)}</a>` }).join('')
    const badges = (u.badges || []).filter(b => b.badgeImageUrl).map(b => `<img class="badge-img" src="${b.badgeImageUrl}" title="${esc(b.badgeName)}${b.badgeDescription ? ' — ' + esc(b.badgeDescription) : ''}" referrerpolicy="no-referrer" />`).join('')
    const rows = [['Platform', u.last_platform === 'standalonewindows' ? 'PC' : (u.last_platform || '—')]]
    if (u.date_joined) rows.push(['Joined', u.date_joined])
    if (u.last_login) { try { rows.push(['Last login', new Date(u.last_login).toLocaleDateString()]) } catch (_) {} }
    rows.push(['Age verified', u.ageVerified ? 'Yes' : 'No'])
    rows.push(['Avatar cloning', u.allowAvatarCopying ? 'On' : 'Off'])
    const noteBlock = (u.id !== myUserId)
      ? `<div class="um-sec">Your note</div><textarea id="umNote" rows="2" placeholder="Private note about this user">${esc(u.note || '')}</textarea><div class="row" style="margin-top:6px"><button class="btn ghost" id="umNoteSave" style="padding:4px 10px;font-size:.75rem">Save note</button><span class="muted" id="umNoteOut" style="font-size:.74rem"></span></div>`
      : ''
    body.innerHTML =
      `<div class="rb-card">${umLocationLine(u)}</div>` +
      (u.bio ? `<div class="um-bio">${esc(u.bio)}</div>` : '') +
      (links ? `<div class="row" style="flex-wrap:wrap;gap:8px">${links}</div>` : '') +
      (badges ? `<div class="um-sec">Badges</div><div class="badge-grid">${badges}</div>` : '') +
      `<div class="um-sec">Info</div><div class="um-info">${rows.map(r => `<div><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('')}</div>` +
      noteBlock
    const ns = $('umNoteSave')
    if (ns) ns.addEventListener('click', async () => { setText('umNoteOut', 'Saving…'); const r = await api.vrchatSetNote(u.id, $('umNote').value); setText('umNoteOut', r.ok ? '✅ Saved' : 'Error: ' + (r.error || 'failed')) })
  } else if (tab === 'groups') {
    body.innerHTML = '<div class="muted">Loading groups…</div>'
    const r = await api.vrchatUserGroups(u.id)
    if (!r.ok) { body.innerHTML = `<div class="muted">${esc(r.error)}</div>`; return }
    if (!r.groups.length) { body.innerHTML = '<div class="muted">No groups.</div>'; return }
    const own = r.groups.filter(g => g.ownerId === u.id)
    const mem = r.groups.filter(g => g.ownerId !== u.id)
    let html = ''
    if (own.length) html += `<div class="mgroup">Own Groups — ${own.length}</div><div class="card-grid">${own.map(groupCard).join('')}</div>`
    if (mem.length) html += `<div class="mgroup">Groups — ${mem.length}</div><div class="card-grid">${mem.map(groupCard).join('')}</div>`
    body.innerHTML = html
  } else if (tab === 'content') {
    body.innerHTML = '<div class="muted">Loading worlds…</div>'
    const r = await api.vrchatUserWorlds(u.id)
    body.innerHTML = !r.ok ? `<div class="muted">${esc(r.error)}</div>` : (r.worlds.length ? `<div class="card-grid">${r.worlds.map(w => `<div class="mini-card"><img src="${w.image || 'assets/logo.png'}" referrerpolicy="no-referrer" /><div style="min-width:0"><div class="nm">${esc(w.name)}</div><div class="muted" style="font-size:.72rem">👤 ${w.visits || 0} · ⭐ ${w.favorites || 0}</div></div></div>`).join('')}</div>` : '<div class="muted">No public worlds.</div>')
  } else if (tab === 'mutuals') {
    body.innerHTML = '<div class="modal-tabs" style="padding:0 0 10px"><button class="mtab active" data-msub="friends">Friends</button><button class="mtab" data-msub="groups">Groups</button></div><div id="umMutBody"></div>'
    body.querySelectorAll('[data-msub]').forEach(b => b.addEventListener('click', () => { body.querySelectorAll('[data-msub]').forEach(x => x.classList.toggle('active', x === b)); renderMutSub(b.dataset.msub) }))
    renderMutSub('friends')
  } else if (tab === 'favs') {
    if (umUser.id !== myUserId) { body.innerHTML = '<div class="muted">No public favorite worlds. (A user’s favorites are only visible if they’ve made them public.)</div>'; return }
    body.innerHTML = '<div class="muted">Loading favorites…</div>'
    const [r, gr] = await Promise.all([api.vrchatFavWorlds(), api.vrchatFavGroups('world')])
    if (!r.ok) { body.innerHTML = `<div class="muted">${esc(r.error)}</div>`; return }
    if (!r.worlds.length) { body.innerHTML = '<div class="muted">No favorite worlds.</div>'; return }
    const names = {}; if (gr.ok) gr.groups.forEach(g => { names[g.name] = g.displayName || g.name })
    const byGroup = {}
    for (const w of r.worlds) { const k = w.group || 'worlds1'; (byGroup[k] = byGroup[k] || []).push(w) }
    body.innerHTML = Object.keys(byGroup).map(k => `<div class="mgroup mfav-toggle" data-grp="${k}">▾ ${esc(names[k] || k)} — ${byGroup[k].length}</div><div class="card-grid" data-grpbody="${k}">${byGroup[k].map(worldCard).join('')}</div>`).join('')
    body.querySelectorAll('.mfav-toggle').forEach(t => t.addEventListener('click', () => {
      const gb = body.querySelector(`[data-grpbody="${t.dataset.grp}"]`)
      const hidden = gb.style.display === 'none'
      gb.style.display = hidden ? '' : 'none'
      t.textContent = (hidden ? '▾' : '▸') + t.textContent.slice(1)
    }))
  }
}
function worldCard (w) {
  return `<div class="mini-card" data-kind="world" data-id="${w.id}" style="cursor:pointer"><img src="${w.image || 'assets/logo.png'}" referrerpolicy="no-referrer" /><div style="min-width:0"><div class="nm">${esc(w.name)}</div><div class="muted" style="font-size:.72rem">👤 ${w.visits || w.occupants || 0} · ⭐ ${w.favorites || 0}</div></div></div>`
}
function groupCard (g) {
  return `<div class="mini-card" data-kind="group" data-id="${g.id}" style="cursor:pointer"><img src="${g.icon || 'assets/logo.png'}" referrerpolicy="no-referrer" /><div style="min-width:0"><div class="nm">${esc(g.name)}</div><div class="muted" style="font-size:.72rem">${g.members ? g.members + ' members' : (g.shortCode ? '@' + esc(g.shortCode) : '')}</div></div></div>`
}
// Any clickable world/group mini-card opens its detail modal.
document.addEventListener('click', e => {
  const c = e.target.closest('.mini-card[data-id]')
  if (!c) return
  if (c.dataset.kind === 'world') openWorldModal(c.dataset.id)
  else if (c.dataset.kind === 'group') openGroupModal(c.dataset.id)
})
async function renderMutSub (sub) {
  const el = $('umMutBody'); if (!el || !umUser) return
  el.innerHTML = '<div class="muted">Loading…</div>'
  if (sub === 'friends') {
    const r = await api.vrchatMutuals(umUser.id)
    if (r.off) { el.innerHTML = '<div class="muted">This user has Shared Connections turned off.</div>'; return }
    if (!r.ok) { el.innerHTML = `<div class="muted">${esc(r.error)}</div>`; return }
    el.innerHTML = r.friends.length ? r.friends.map(f => `<div class="rb-friend" data-id="${f.id}"><img class="ava" src="${f.image || 'assets/logo.png'}" referrerpolicy="no-referrer" /><div class="meta grow"><div class="nm">${esc(f.displayName)}</div></div></div>`).join('') : '<div class="muted">No mutual friends.</div>'
    el.querySelectorAll('.rb-friend').forEach(row => row.addEventListener('click', () => openUserModal(row.dataset.id)))
  } else {
    const [tg, mg] = await Promise.all([api.vrchatUserGroups(umUser.id), api.vrchatGroups()])
    if (!tg.ok) { el.innerHTML = `<div class="muted">${esc(tg.error)}</div>`; return }
    const mine = new Set((mg.ok ? mg.groups : []).map(g => g.id))
    const shared = tg.groups.filter(g => mine.has(g.id))
    el.innerHTML = shared.length ? `<div class="card-grid">${shared.map(groupCard).join('')}</div>` : '<div class="muted">No mutual groups.</div>'
  }
}
document.querySelectorAll('.mtab[data-mtab]').forEach(t => t.addEventListener('click', () => renderMTab(t.dataset.mtab)))
$('umAddFriend').addEventListener('click', async () => {
  if (!umCurrentId || !umUser) return
  const isFriend = umUser.isFriend
  setText('umActionOut', isFriend ? 'Removing friend…' : 'Sending friend request…')
  const r = isFriend ? await api.vrchatUnfriend(umCurrentId) : await api.vrchatFriendRequest(umCurrentId)
  if (r.ok && isFriend) { umUser.isFriend = false; $('umAddFriend').textContent = '➕ Add Friend'; $('umAddFriend').classList.remove('danger') }
  setText('umActionOut', r.ok ? (isFriend ? '✅ Unfriended' : '✅ Friend request sent') : 'Error: ' + (r.error || 'failed'))
})
$('umInvite').addEventListener('click', async () => {
  if (!umCurrentId) return
  const myLoc = window.__myLocation || ''
  if (!myLoc) { setText('umActionOut', 'You must be in a VRChat world to invite someone to your instance.'); return }
  setText('umActionOut', 'Inviting…')
  const r = await api.vrchatInvite(umCurrentId, myLoc)
  setText('umActionOut', r.ok ? '✅ Invite sent' : 'Error: ' + (r.error || 'failed'))
})
$('umRequestInvite').addEventListener('click', async () => {
  if (!umCurrentId) return
  setText('umActionOut', 'Requesting invite…')
  const r = await api.vrchatRequestInvite(umCurrentId)
  setText('umActionOut', r.ok ? '✅ Invite requested' : 'Error: ' + (r.error || 'failed'))
})
$('umBoop').addEventListener('click', async () => {
  if (!umCurrentId) return
  setText('umActionOut', 'Booping…')
  const r = await api.vrchatBoop(umCurrentId)
  setText('umActionOut', r.ok ? '👉 Booped!' : 'Error: ' + (r.error || 'failed'))
})
$('umFav').addEventListener('click', async () => {
  if (!umCurrentId) return
  setText('umActionOut', 'Favoriting…')
  const r = await api.vrchatAddFav('friend', umCurrentId)
  setText('umActionOut', r.ok ? '⭐ Added to favorites' : 'Error: ' + (r.error || 'failed'))
})
let _umBlocked = false; let _umMuted = false
$('umBlock').addEventListener('click', async () => {
  if (!umCurrentId) return
  setText('umActionOut', _umBlocked ? 'Unblocking…' : 'Blocking…')
  const r = _umBlocked ? await api.vrchatUnmoderate(umCurrentId, 'block') : await api.vrchatModerate(umCurrentId, 'block')
  if (r.ok) { _umBlocked = !_umBlocked; $('umBlock').textContent = _umBlocked ? '✅ Unblock' : '🚫 Block' }
  setText('umActionOut', r.ok ? (_umBlocked ? '🚫 Blocked' : 'Unblocked') : 'Error: ' + (r.error || 'failed'))
})
$('umMute').addEventListener('click', async () => {
  if (!umCurrentId) return
  setText('umActionOut', _umMuted ? 'Unmuting…' : 'Muting…')
  const r = _umMuted ? await api.vrchatUnmoderate(umCurrentId, 'mute') : await api.vrchatModerate(umCurrentId, 'mute')
  if (r.ok) { _umMuted = !_umMuted; $('umMute').textContent = _umMuted ? '🔊 Unmute' : '🔇 Mute' }
  setText('umActionOut', r.ok ? (_umMuted ? '🔇 Muted' : 'Unmuted') : 'Error: ' + (r.error || 'failed'))
})

/* ---------------- shared: confirm + friend picker ---------------- */
let _confirmResolve = null
function confirmDialog (text) {
  $('confirmText').textContent = text || 'Are you sure?'
  $('confirmModal').style.display = 'flex'
  return new Promise(res => { _confirmResolve = res })
}
function _confirmEnd (v) { $('confirmModal').style.display = 'none'; if (_confirmResolve) _confirmResolve(v); _confirmResolve = null }
$('confirmYes').addEventListener('click', () => _confirmEnd(true))
$('confirmNo').addEventListener('click', () => _confirmEnd(false))
$('confirmModal').addEventListener('click', e => { if (e.target === $('confirmModal')) _confirmEnd(false) })

let _pickerResolve = null
let _pickerSel = new Set()
async function pickFriends (title) {
  $('pickerTitle').textContent = title || 'Invite friends'
  $('pickerModal').style.display = 'flex'; _pickerSel = new Set(); $('pickerSearch').value = ''
  $('pickerList').textContent = 'Loading…'
  const r = await api.vrchatFriends(false)
  const friends = r.ok ? r.friends.slice().sort((a, b) => String(a.displayName).localeCompare(String(b.displayName))) : []
  const render = () => {
    const q = $('pickerSearch').value.toLowerCase()
    $('pickerList').innerHTML = friends.filter(f => !q || String(f.displayName).toLowerCase().includes(q)).map(f => `<label class="rb-friend" style="cursor:pointer"><input type="checkbox" class="pk" data-id="${f.id}" ${_pickerSel.has(f.id) ? 'checked' : ''} style="width:auto" /> <span class="nm">${esc(f.displayName)}</span></label>`).join('') || '<div class="muted">No online friends.</div>'
    $('pickerList').querySelectorAll('.pk').forEach(c => c.addEventListener('change', () => { c.checked ? _pickerSel.add(c.dataset.id) : _pickerSel.delete(c.dataset.id) }))
  }
  render(); $('pickerSearch').oninput = render
  return new Promise(res => { _pickerResolve = res })
}
function _pickerEnd (arr) { $('pickerModal').style.display = 'none'; if (_pickerResolve) _pickerResolve(arr); _pickerResolve = null }
$('pickerConfirm').addEventListener('click', () => _pickerEnd(Array.from(_pickerSel)))
$('pickerCancel').addEventListener('click', () => _pickerEnd([]))
$('pickerClose').addEventListener('click', () => _pickerEnd([]))
$('pickerModal').addEventListener('click', e => { if (e.target === $('pickerModal')) _pickerEnd([]) })

/* ---------------- profile editor (own) ---------------- */
async function loadProfileEditor () {
  const me = await api.vrchatStatus()
  if (!me.ok) { setText('peOut', me.error || 'Log in on the VRChat tab.'); return }
  $('peStatus').value = me.user.status || 'active'
  $('peStatusDesc').value = me.user.statusDescription || ''
  if (me.user.bio != null) $('peBio').value = me.user.bio
  setText('peOut', '')
}
$('peLoad').addEventListener('click', loadProfileEditor)
$('peSave').addEventListener('click', async () => {
  setText('peOut', 'Saving…')
  const r = await api.vrchatUpdateProfile({ status: $('peStatus').value, statusDescription: $('peStatusDesc').value, bio: $('peBio').value })
  setText('peOut', r.ok ? '✅ Profile updated' : 'Error: ' + (r.error || 'failed'))
})

/* ---------------- status presets ---------------- */
async function loadStatusPresets () {
  const presets = await api.getSetting('statusPresets', [])
  $('pePreset').innerHTML = '<option value="">— saved presets —</option>' + presets.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('')
}
$('pePresetSave').addEventListener('click', async () => {
  const name = prompt('Preset name:')
  if (!name) return
  const presets = await api.getSetting('statusPresets', [])
  presets.push({ name, status: $('peStatus').value, desc: $('peStatusDesc').value })
  await api.saveSetting('statusPresets', presets)
  loadStatusPresets()
})
$('pePresetApply').addEventListener('click', async () => {
  const i = $('pePreset').value; if (i === '') return
  const p = (await api.getSetting('statusPresets', []))[i]; if (!p) return
  $('peStatus').value = p.status; $('peStatusDesc').value = p.desc || ''
  const r = await api.vrchatUpdateProfile({ status: p.status, statusDescription: p.desc || '' })
  setText('peOut', r.ok ? `✅ Applied "${p.name}"` : 'Error: ' + (r.error || 'failed'))
})
$('pePresetDel').addEventListener('click', async () => {
  const i = $('pePreset').value; if (i === '') return
  const presets = await api.getSetting('statusPresets', [])
  presets.splice(i, 1); await api.saveSetting('statusPresets', presets); loadStatusPresets()
})

/* ---------------- media library ---------------- */
async function loadMedia () {
  const el = $('mediaGrid'); el.textContent = 'Loading…'
  const r = await api.mediaPhotos()
  if (!r.ok) { el.textContent = 'Error: ' + (r.error || 'no photos'); return }
  if (!r.photos.length) { el.textContent = 'No VRChat screenshots found.'; return }
  el.innerHTML = r.photos.map(p => `<div class="mini-card" data-path="${esc(p.path)}" style="cursor:pointer;flex-direction:column;align-items:stretch;padding:0;overflow:hidden"><img src="file:///${esc(p.path.replace(/\\/g, '/'))}" referrerpolicy="no-referrer" style="width:100%;height:120px;object-fit:cover" /><div class="muted" style="font-size:.68rem;padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div></div>`).join('')
}
$('mediaRefresh').addEventListener('click', loadMedia)
$('mediaGrid').addEventListener('click', e => { const c = e.target.closest('[data-path]'); if (c) api.mediaOpen(c.dataset.path) })
document.querySelector('[data-tab="media"]').addEventListener('click', loadMedia)

/* ---------------- server status (online count) ---------------- */
async function loadOnlineCount () {
  try { const r = await api.vrchatOnline(); if (r.ok) setText('onlineCount', `🌐 ${r.count.toLocaleString()} online`) } catch (_) {}
}
setInterval(loadOnlineCount, 300000)

/* ---------------- configured start ---------------- */
$('startLaunch').addEventListener('click', async () => {
  const paths = $('startApps').value.split('\n').map(s => s.trim()).filter(Boolean)
  api.saveSetting('startApps', $('startApps').value)
  api.saveSetting('startWithVrc', $('startWithVrc').checked)
  setText('startOut', 'Launching…')
  const r = await api.appsLaunch(paths, $('startWithVrc').checked)
  setText('startOut', r.ok ? `✅ Launched ${r.launched} app(s)` : 'Error')
})

/* ---------------- data export / import ---------------- */
$('dataExport').addEventListener('click', async () => { const r = await api.dataExport(); setText('dataOut', r.ok ? '✅ Saved to ' + r.path : (r.error === 'cancelled' ? 'Cancelled' : 'Error: ' + r.error)) })
$('dataImport').addEventListener('click', async () => { const r = await api.dataImport(); setText('dataOut', r.ok ? '✅ Imported — restart to apply.' : (r.error === 'cancelled' ? 'Cancelled' : 'Error: ' + r.error)) })

/* ---------------- toasts + group alerts ---------------- */
function toast (html, ms = 6000) {
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = html
  $('toastWrap').appendChild(t)
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300) }, ms)
}
api.on('alert:group', s => { toast(`<b>📣 Group post</b><br>${esc(s.title || '')}${s.text ? '<br>' + esc(String(s.text).slice(0, 120)) : ''}`); setNotifCount((parseInt($('notifCount').textContent, 10) || 0) + 1) })

api.on('discord:update', s => {
  discordConnected = !!s.connected
  setPill('discordState', s.connected, s.voiceAuthorized ? 'voice' : 'on')
  // persist the access token so we don't re-authorize on every launch
  if (s.accessToken && s.accessToken !== discordAccessToken) {
    discordAccessToken = s.accessToken
    api.saveSetting('discord', currentDiscordCfg())
  }
  if (!s.connected) { if (s.error) setText('discordOut', 'Error: ' + s.error); return }
  const bits = []
  if (s.inVoice) bits.push(`🔊 ${s.channelName} (${s.userCount})`)
  else bits.push('not in voice')
  if (s.selfMute) bits.push('🔇 muted')
  if (s.selfDeaf) bits.push('🔈 deafened')
  if (s.speaking) bits.push('🗣 speaking')
  setText('discordOut', bits.join(' · '))
  composer.update({
    discordChannel: s.inVoice ? s.channelName : '',
    discordUsers: s.userCount || 0,
    discordMute: !!s.selfMute, discordDeaf: !!s.selfDeaf
  })
})

/* ---------------- overlay ---------------- */
function renderOverlay (state) {
  $('overlayUrlInput').value = state?.url || ''
  if (state?.running) { setText('overlayStatus', `Overlay running at ${state.url}`); $('overlayPreview').src = state.url }
  else { setText('overlayStatus', 'Overlay server is off'); $('overlayPreview').src = 'about:blank' }
}
async function applyOverlay () {
  const s = { enabled: $('enableOverlay').checked, port: parseInt($('overlayPortInput').value, 10), style: $('overlayStyleSelect').value }
  await api.saveSetting('overlayEnabled', s.enabled); await api.saveSetting('overlayPort', s.port); await api.saveSetting('overlayStyle', s.style)
  try { renderOverlay(await api.updateOverlaySettings(s)) } catch (err) { setText('overlayStatus', 'Overlay error: ' + err.message) }
}
;['enableOverlay', 'overlayStyleSelect', 'overlayPortInput'].forEach(id => $(id).addEventListener('change', applyOverlay))

/* ---------------- boot ---------------- */
async function init () {
  await loadAudioDevices()

  // restore settings
  $('portInput').value = await api.getSetting('oscPort', 9000); setOscPort(getSendPort())
  $('receiverPortInput').value = await api.getSetting('receiverPort', 9001)
  $('enableReceive').checked = await api.getSetting('receiveEnabled', false)
  for (const name of ['gain', 'lowBoost', 'bassBoost', 'midBoost', 'trebleBoost']) {
    const def = { gain: 2.0, lowBoost: 2.6, bassBoost: 3.0, midBoost: 2.0, trebleBoost: 3.4 }[name]
    const v = await api.getSetting(name, def); $(name + 'Slider').value = v; setText(name + 'Value', v)
  }
  katEnabled = await api.getSetting('katNowPlayingEnabled', false); $('enableKatNowPlaying').checked = katEnabled
  chatboxNpEnabled = await api.getSetting('chatboxNowPlayingEnabled', false); $('enableChatboxNowPlaying').checked = chatboxNpEnabled
  $('presetsText').value = await api.getSetting('presets', DEFAULT_PRESETS.join('\n'))
  composer.setPresets($('presetsText').value.split('\n'))
  composer.setRotationPosition(await api.getSetting('rotationPos', 'top'))
  $('rotationPos').value = composer.rotationPosition
  $('rotateInterval').value = await api.getSetting('rotateInterval', 4000)
  buildModeGrid(await api.getSetting('chatModes', null))
  updatePreview()

  // restore + auto-start the stat pollers that were left enabled
  if (await api.getSetting('statsEnabled', false)) { $('enableStats').checked = true; setPill('statsState', true, 'on'); api.statsStart(3000) }
  if (await api.getSetting('netEnabled', false)) { $('enableNet').checked = true; setPill('netState', true, 'on'); api.netStart({ intervalMs: 3000 }) }
  if (await api.getSetting('windowEnabled', false)) { $('enableWindow').checked = true; setPill('winState', true, 'on'); api.windowStart() }
  $('tiktokUser').value = await api.getSetting('tiktokUser', '')
  $('tiktokSignKey').value = await api.getSetting('tiktokSignKey', '')
  $('kickSlug').value = await api.getSetting('kickSlug', '')
  const tw = await api.getSetting('twitch', {})
  $('twitchLogin').value = tw.login || ''
  $('twitchClientId').value = tw.clientId || DEFAULT_TWITCH_CLIENT_ID
  $('twitchClientSecret').value = tw.clientSecret || ''
  $('twitchToken').value = tw.token || ''
  twitchRefreshToken = tw.refreshToken || ''
  setTwitchTokenState()
  try { const rdir = await api.twitchRedirect(); if ($('docsTwitchRedirect')) $('docsTwitchRedirect').textContent = rdir } catch (_) {}
  $('pulsoidToken').value = await api.getSetting('pulsoidToken', '')
  $('hrProvider').value = await api.getSetting('hrProvider', 'pulsoid')
  const hy = await api.getSetting('hyperate', {})
  $('hyperateKey').value = hy.apiKey || ''
  $('hyperateDevice').value = hy.deviceId || ''
  syncHrFields()
  try { renderHrSessions(await api.hrSessions()) } catch (_) {}
  const dc = await api.getSetting('discord', {})
  discordAccessToken = dc.accessToken || ''
  // Migrate the old NekoSuneOSC app id to the current NekoSuneAPPS default.
  const OLD_DISCORD_APP_IDS = ['1513880249409208462']
  let savedAppId = dc.clientId || ''
  if (!savedAppId || OLD_DISCORD_APP_IDS.includes(savedAppId)) {
    savedAppId = DEFAULT_DISCORD_APP_ID
    dc.clientId = savedAppId
    await api.saveSetting('discord', dc) // persist so it sticks + auto-start uses it
  }
  $('discordAppId').value = savedAppId
  $('discordSecret').value = dc.clientSecret || ''
  $('discordRP').checked = dc.enableRichPresence !== false
  $('discordVoice').checked = !!dc.enableVoice
  $('discordVoiceOsc').checked = dc.sendVoiceStateOsc !== false
  $('discordMuteOsc').checked = dc.sendMuteDeafenOsc !== false
  $('discordVrcStatus').value = dc.vrcStatus || 'active'
  $('discordShowWorld').checked = dc.showWorld !== false
  $('discordVrcProfile').value = dc.vrcProfileUrl || ''
  $('discordShowHr').checked = dc.showHeartRate !== false
  $('discordShowNp').checked = dc.showNowPlaying !== false
  try { const w = await api.vrcGet(); if (w && w.inWorld && w.worldName) setText('discordWorldOut', `World: ${w.worldName}`) } catch (_) {}

  // Auto-AFK restore
  const af = await api.getSetting('afk', {})
  $('afkEnable').checked = !!af.enabled
  $('afkThreshold').value = af.thresholdSec || 120
  $('afkToChatbox').checked = af.toChatbox !== false
  $('afkMessage').value = af.message || '💤 AFK since {time} ({mins}m)'
  $('afkBackMessage').value = af.backMessage || '👋 Back!'
  if (af.enabled) api.afkStart({ thresholdSec: af.thresholdSec || 120 })

  // Photo Relay restore
  const pr = await api.getSetting('photoRelay', {})
  $('photoWebhook').value = pr.webhook || ''
  $('photoRelayEnable').checked = !!pr.enabled
  if (pr.enabled && pr.webhook) api.photoRelaySet(pr)

  // Configured Start + presets + server status
  $('startApps').value = await api.getSetting('startApps', '')
  $('startWithVrc').checked = await api.getSetting('startWithVrc', false)
  loadStatusPresets()
  loadOnlineCount()

  // VRChat account restore
  $('vrcUser').value = await api.getSetting('vrcUser', '')
  const vrcLoggedIn = await api.vrchatIsLoggedIn()
  const vrcAuto = await api.getSetting('vrcAutoStatus', false)
  $('vrcAutoStatus').checked = !!vrcAuto
  $('discordVrcStatus').disabled = !!vrcAuto
  if (vrcLoggedIn) { setAcctState(true, 'Session restored'); if (vrcAuto) api.vrchatAutoStatus(true); loadRightbar(); loadNotifications() } else setAcctState(false, 'Not logged in')

  // Weather restore
  const wx = await api.getSetting('weather', {})
  $('weatherCity').value = wx.city || ''
  $('weatherUnits').value = wx.units || 'celsius'
  $('weatherEnable').checked = !!wx.enabled
  if (wx.enabled && wx.city) { setPill('weatherState', true, 'on'); api.weatherStart({ city: wx.city, units: wx.units }) }

  // Discord bot + OSC control restore
  $('botToken').value = await api.getSetting('discordBotToken', '')
  const bcfg = await api.getSetting('discordBot', {})
  $('botUserId').value = bcfg.userId || ''
  $('botAppId').value = bcfg.appId || ''
  $('spotiOscEnable').checked = await api.getSetting('spotiOscEnable', false)
  $('discordOscEnable').checked = await api.getSetting('discordOscEnable', false)

  // Friend Den + Event Scout restore
  trackedGroups = await api.getSetting('eventGroups', [])
  $('friendAuto').checked = await api.getSetting('friendAuto', true)
  syncFriendAuto()

  // Auto-Greeter restore
  const gr = await api.getSetting('greeter', {})
  $('greeterEnable').checked = !!gr.enabled
  $('greeterMode').value = gr.mode || 'all'
  $('greeterAllow').value = (gr.allow || []).join(', ')
  if (gr.enabled) api.greeterSet(gr)

  await setupAiProviders()
  $('overlayEnabled') // overlay restore
  $('enableOverlay').checked = await api.getSetting('overlayEnabled', true)
  $('overlayPortInput').value = await api.getSetting('overlayPort', 39530)
  $('overlayStyleSelect').value = await api.getSetting('overlayStyle', 'default')

  if ($('enableReceive').checked) startOscReceiver(getRecvPort(), (a, args) => logLine(`IN  ${a} ${args.join(',')}`))
  if (katEnabled) startKat()
  try { renderOverlay(await api.getOverlayState()) } catch (_) {}

  // ---- Startup / auto-start ----
  const as = await api.getSetting('autostart', {})
  const AUTO_IDS = ['autoMinimized', 'autoDiscord', 'autoHeartrate', 'autoStats', 'autoNet', 'autoWindow', 'autoTwitch', 'autoKick']
  AUTO_IDS.forEach(id => { $(id).checked = !!as[id] })
  try { $('autoLaunch').checked = await api.getLaunchOnLogin() } catch (_) {}

  const saveAutostart = () => {
    const out = {}
    AUTO_IDS.forEach(id => { out[id] = $(id).checked })
    api.saveSetting('autostart', out)
  }
  AUTO_IDS.forEach(id => $(id).addEventListener('change', saveAutostart))
  $('autoLaunch').addEventListener('change', e => api.setLaunchOnLogin(e.target.checked))

  // Drive the existing controls so saved tokens/IDs are reused (no manual clicks).
  const fireToggle = id => { if (!$(id).checked) { $(id).checked = true; $(id).dispatchEvent(new Event('change')) } }
  if (as.autoDiscord && $('discordAppId').value) $('discordStart').click()
  if (as.autoHeartrate && ($('pulsoidToken').value || $('hyperateDevice').value)) $('hrStart').click()
  if (as.autoStats) fireToggle('enableStats')
  if (as.autoNet) fireToggle('enableNet')
  if (as.autoWindow) fireToggle('enableWindow')
  if (as.autoTwitch) $('twitchConnect').click()
  if (as.autoKick) $('kickConnect').click()

  refreshNowPlaying()
}

// ---- AI provider picker ----
async function setupAiProviders () {
  const providers = await api.aiProviders()
  const sel = $('aiProvider')
  sel.innerHTML = ''
  Object.entries(providers).forEach(([key, p]) => {
    const o = document.createElement('option'); o.value = key; o.text = p.label; sel.appendChild(o)
  })
  const saved = await api.getSetting('ai', { provider: 'openai', baseUrl: providers.openai.baseUrl, model: providers.openai.model, key: '' })
  sel.value = saved.provider || 'openai'
  $('aiBaseUrl').value = saved.baseUrl || providers[sel.value]?.baseUrl || ''
  $('aiModel').value = saved.model || providers[sel.value]?.model || ''
  $('aiKey').value = saved.key || ''

  sel.addEventListener('change', async () => {
    const p = providers[sel.value]
    if (p && sel.value !== 'custom') { $('aiBaseUrl').value = p.baseUrl; $('aiModel').value = p.model }
    await saveAi()
  })
  ;['aiBaseUrl', 'aiModel', 'aiKey'].forEach(id => $(id).addEventListener('change', saveAi))
}
async function saveAi () {
  await api.saveSetting('ai', {
    provider: $('aiProvider').value, baseUrl: $('aiBaseUrl').value,
    model: $('aiModel').value, key: $('aiKey').value
  })
}

init()

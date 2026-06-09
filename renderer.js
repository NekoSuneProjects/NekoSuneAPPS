/* NekoSuneOSC renderer - wires the themed UI to the OSC layer and all modules. */
const { loadAudioDevices, setupAudioAnalysis, stopAudioAnalysis } = require('./modules/audio/audioModule')
const {
  setOscPort, setOscReceiverPort, sendOsc, sendBeat, sendChatboxMessage,
  startOscReceiver, stopOscReceiver, addOscListener
} = require('./modules/vrchatosc/oscModule')
const { KatOscText } = require('./modules/vrchatosc/katOscText')
const { ChatboxComposer } = require('./modules/chatbox/chatboxComposer')
const { DEFAULT_PRESETS } = require('./modules/status/statusModule')

const api = window.electronAPI
const $ = id => document.getElementById(id)

// No credentials are shipped. Users enter their own Client / Application IDs
// (see Docs / Setup). Never hardcode IDs, secrets, or tokens in the repo.
const DEFAULT_TWITCH_CLIENT_ID = ''
const DEFAULT_DISCORD_APP_ID = ''

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

const themeSelect = $('themeSelect')
const savedTheme = localStorage.getItem('theme') || 'midnight'
document.documentElement.setAttribute('data-theme', savedTheme)
themeSelect.value = savedTheme
themeSelect.addEventListener('change', e => {
  document.documentElement.setAttribute('data-theme', e.target.value)
  localStorage.setItem('theme', e.target.value)
})

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

function nowPlayingNeeded () {
  // Only spawn the PowerShell media query when something actually consumes it.
  return katEnabled || chatboxNpEnabled ||
    composer.modes.nowPlaying !== 'off' ||
    (composer.modes.status === 'rotate' && /\{(song|artist|title)\}/.test($('presetsText').value)) ||
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
  composer.update({ hr: s.bpm, hrOnline: s.online, hrAvg: s.avg, hrMax: s.max, hrMin: s.min })
})
$('hrStart').addEventListener('click', async () => { await api.saveSetting('pulsoidToken', $('pulsoidToken').value); api.hrStart($('pulsoidToken').value) })
$('hrStop').addEventListener('click', () => api.hrStop())

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
    sendMuteDeafenOsc: $('discordMuteOsc').checked
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

api.on('discord:update', s => {
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
  const dc = await api.getSetting('discord', {})
  discordAccessToken = dc.accessToken || ''
  $('discordAppId').value = dc.clientId || DEFAULT_DISCORD_APP_ID
  $('discordSecret').value = dc.clientSecret || ''
  $('discordRP').checked = dc.enableRichPresence !== false
  $('discordVoice').checked = !!dc.enableVoice
  $('discordVoiceOsc').checked = dc.sendVoiceStateOsc !== false
  $('discordMuteOsc').checked = dc.sendMuteDeafenOsc !== false
  await setupAiProviders()
  $('overlayEnabled') // overlay restore
  $('enableOverlay').checked = await api.getSetting('overlayEnabled', true)
  $('overlayPortInput').value = await api.getSetting('overlayPort', 39530)
  $('overlayStyleSelect').value = await api.getSetting('overlayStyle', 'default')

  if ($('enableReceive').checked) startOscReceiver(getRecvPort(), (a, args) => logLine(`IN  ${a} ${args.join(',')}`))
  if (katEnabled) startKat()
  try { renderOverlay(await api.getOverlayState()) } catch (_) {}

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

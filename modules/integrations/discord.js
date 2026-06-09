// modules/integrations/discord.js
// Discord integration with two halves:
//   1. Rich Presence  - shows your VRChat status on your Discord profile.
//   2. Voice detection - reads your current voice channel (name, user count),
//      who is speaking, and your own mute/deafen state, then exposes it to the
//      chatbox and sends it to VRChat as avatar OSC parameters.
//
// Voice needs Discord's private "rpc"/"rpc.voice.read" scope, which Discord only
// grants to approved apps. If it's rejected we fall back to basic auth (Rich
// Presence only) instead of failing. Runs in the MAIN process.
//
// Create an app at https://discord.com/developers/applications, copy the
// Application (Client) ID (and a Client Secret if you want voice detection).

const dgram = require('dgram')

let RPC
try { RPC = require('discord-rpc') } catch (err) { console.warn('discord-rpc not installed yet:', err.message) }

/* ---- minimal OSC encoder (avatar params to VRChat) ---- */
const oscSocket = dgram.createSocket('udp4')
function encodeOscString (v) {
  const data = Buffer.from(`${v}\0`, 'utf8')
  const pad = (4 - (data.length % 4)) % 4
  return Buffer.concat([data, Buffer.alloc(pad)])
}
function oscBool (address, value) {
  return Buffer.concat([encodeOscString(address), encodeOscString(value ? ',T' : ',F')])
}
function oscInt (address, value) {
  const buf = Buffer.alloc(4); buf.writeInt32BE(value | 0, 0)
  return Buffer.concat([encodeOscString(address), encodeOscString(',i'), buf])
}

const PARAM = {
  speaking: '/avatar/parameters/VRCOSC/Discord/Speaking',
  muted: '/avatar/parameters/VRCOSC/Discord/Muted',
  deafened: '/avatar/parameters/VRCOSC/Discord/Deafened',
  inVoice: '/avatar/parameters/VRCOSC/Discord/InVoice',
  userCount: '/avatar/parameters/VRCOSC/Discord/UserCount'
}

let client = null
let onUpdate = null
let currentChannelId = null
let selfId = null

const config = {
  clientId: '', // set by the user in the Discord card (no ID is shipped)
  clientSecret: '',
  accessToken: '', // persisted so we don't re-authorize every launch
  oscIp: '127.0.0.1',
  oscPort: 9000,
  enableRichPresence: true,
  rpDetails: 'In VRChat',
  rpState: 'via NekoSuneOSC',
  enableVoice: false,
  sendVoiceStateOsc: true,
  sendMuteDeafenOsc: true
}

const state = {
  connected: false,
  voiceAuthorized: false,
  inVoice: false,
  channelName: '',
  userCount: 0,
  selfMute: false,
  selfDeaf: false,
  speaking: false,
  accessToken: '', // emitted so the renderer can persist it (avoids re-auth)
  error: ''
}

let startTimestamp = null

function emit () {
  if (typeof onUpdate === 'function') onUpdate({ ...state, at: Date.now() })
}

function sendOsc (buffer) {
  oscSocket.send(buffer, config.oscPort, config.oscIp, err => { if (err) console.warn('Discord OSC error:', err.message) })
}

function pushVoiceOsc () {
  if (config.sendMuteDeafenOsc) {
    sendOsc(oscBool(PARAM.muted, state.selfMute))
    sendOsc(oscBool(PARAM.deafened, state.selfDeaf))
  }
  if (config.sendVoiceStateOsc) {
    sendOsc(oscBool(PARAM.inVoice, state.inVoice))
    sendOsc(oscBool(PARAM.speaking, state.speaking))
    sendOsc(oscInt(PARAM.userCount, state.userCount))
  }
}

function setActivity ({ details, state: st } = {}) {
  if (!client || !state.connected || !config.enableRichPresence) return
  client.setActivity({
    details: (details || config.rpDetails || 'In VRChat').slice(0, 128),
    state: (st || config.rpState || '').slice(0, 128),
    startTimestamp,
    largeImageKey: 'logo', // upload a 'logo' art asset in the Discord portal
    largeImageText: 'NekoSuneOSC',
    smallImageKey: 'vrchat', // optional small badge art asset named 'vrchat'
    smallImageText: 'VRChat',
    instance: false
  }).catch(err => console.warn('Discord setActivity:', err.message))
}

async function refreshChannel (channelId) {
  currentChannelId = channelId
  if (!channelId) {
    state.inVoice = false; state.channelName = ''; state.userCount = 0
    emit(); pushVoiceOsc(); return
  }
  try {
    const ch = await client.getChannel(channelId)
    state.inVoice = true
    state.channelName = ch?.name || 'Voice'
    state.userCount = Array.isArray(ch?.voice_states) ? ch.voice_states.length : 0
    // (re)subscribe to per-channel voice events
    const args = { channel_id: channelId }
    client.subscribe('VOICE_STATE_CREATE', args).catch(() => {})
    client.subscribe('VOICE_STATE_DELETE', args).catch(() => {})
    client.subscribe('VOICE_STATE_UPDATE', args).catch(() => {})
    client.subscribe('SPEAKING_START', args).catch(() => {})
    client.subscribe('SPEAKING_STOP', args).catch(() => {})
  } catch (err) {
    console.warn('Discord getChannel:', err.message)
  }
  emit(); pushVoiceOsc()
}

async function wireVoice () {
  try {
    // self mute/deafen
    const vs = await client.getVoiceSettings().catch(() => null)
    if (vs) { state.selfMute = !!vs.mute; state.selfDeaf = !!vs.deaf }

    client.subscribe('VOICE_SETTINGS_UPDATE').catch(() => {})
    client.subscribe('VOICE_CHANNEL_SELECT').catch(() => {})

    client.on('VOICE_SETTINGS_UPDATE', d => {
      state.selfMute = !!d.mute; state.selfDeaf = !!d.deaf
      emit(); pushVoiceOsc()
    })
    client.on('VOICE_CHANNEL_SELECT', d => refreshChannel(d?.channel_id || null))
    client.on('VOICE_STATE_CREATE', () => refreshChannel(currentChannelId))
    client.on('VOICE_STATE_DELETE', () => refreshChannel(currentChannelId))
    // SPEAKING_* fire for everyone in the channel; only track our own voice.
    client.on('SPEAKING_START', d => { if (!selfId || d?.user_id === selfId) { state.speaking = true; emit(); pushVoiceOsc() } })
    client.on('SPEAKING_STOP', d => { if (!selfId || d?.user_id === selfId) { state.speaking = false; emit(); pushVoiceOsc() } })

    // jump straight into the channel we're already in, if any
    const sel = await client.getSelectedVoiceChannel().catch(() => null)
    if (sel?.id) await refreshChannel(sel.id)

    state.voiceAuthorized = true
    emit()
  } catch (err) {
    state.voiceAuthorized = false
    console.warn('Discord voice wiring failed:', err.message)
  }
}

async function startDiscord (opts = {}, listener) {
  Object.assign(config, opts)
  onUpdate = listener
  if (!RPC) { state.error = 'discord-rpc not installed (run npm install)'; emit(); return { ok: false, error: state.error } }
  if (!config.clientId) { state.error = 'No Discord Application ID set'; emit(); return { ok: false, error: state.error } }

  await stopDiscord()
  startTimestamp = null // set after ready (Date.now not allowed at module top)

  const makeClient = () => {
    const c = new RPC.Client({ transport: 'ipc' })
    c.on('ready', () => {
      state.connected = true
      startTimestamp = c.startTime || undefined
      setActivity()
      emit()
    })
    c.on('disconnected', () => { state.connected = false; emit() })
    return c
  }

  const wantVoice = !!(config.enableVoice && config.clientSecret)

  // 1) Voice path: reuse a saved access token if we have one (no prompt),
  //    otherwise run the authorize flow once.
  if (wantVoice) {
    client = makeClient()
    try {
      let authed = false
      if (config.accessToken) {
        try { await client.login({ clientId: config.clientId, accessToken: config.accessToken }); authed = true } catch (e) {
          console.warn('Discord saved token rejected, re-authorizing:', e.message)
        }
      }
      if (!authed) {
        await client.login({
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          scopes: ['rpc', 'rpc.voice.read'],
          redirectUri: 'http://localhost:3737/oauth2/discord/callback'
        })
      }
      if (client.accessToken) { state.accessToken = client.accessToken; config.accessToken = client.accessToken }
      selfId = client.user?.id || null
      await wireVoice()
      state.error = ''
      emit()
      return { ok: true, voice: state.voiceAuthorized }
    } catch (err) {
      // rpc.voice.read is an allowlist-only Discord scope; unapproved apps get
      // invalid_scope. Fall back to Rich Presence and explain clearly (no retry spam).
      const scopeBlocked = /invalid_scope|unauthorized|access/i.test(err.message || '')
      state.error = scopeBlocked
        ? 'Voice needs Discord RPC allowlist approval — running Rich Presence only'
        : 'Voice unavailable: ' + err.message
      if (scopeBlocked) {
        console.log('[discord] rpc.voice.read is not allowlisted for this app — using Rich Presence only (this is expected unless Discord approved your app).')
      } else {
        console.warn('[discord] voice login error, using Rich Presence only:', err.message)
      }
      try { await client.destroy() } catch (_) {}
      client = null
    }
  }

  // 2) Basic Rich Presence (no secret, no prompt, always works).
  client = makeClient()
  try {
    await client.login({ clientId: config.clientId })
    emit()
    return { ok: true, voice: false, note: state.error || undefined }
  } catch (err) {
    state.connected = false
    state.error = err.message
    emit()
    return { ok: false, error: err.message }
  }
}

async function stopDiscord () {
  state.connected = false
  state.voiceAuthorized = false
  currentChannelId = null
  if (client) {
    try { await client.destroy() } catch (_) {}
    client = null
  }
  emit()
}

function updateActivity (activity) { setActivity(activity) }
function getDiscordState () { return { ...state } }

module.exports = { startDiscord, stopDiscord, updateActivity, getDiscordState }

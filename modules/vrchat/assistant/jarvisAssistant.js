'use strict'

// Wake-word voice assistant. Continuously captures short clips from an
// actual MICROPHONE (getUserMedia, with a selectable input device - same
// enumerateDevices()/deviceId pattern as the AudioLink mic picker), since
// this is meant to hear the user's own spoken voice, not desktop/speaker
// output. Transcribes each clip and only acts on speech that starts with
// the configured wake word - everything else is ignored except for a
// passive lexical emotional-cue check (see emotionCues.js), which never
// acts on its own, only prompts the user with a check-in question.
//
// The instant-replay SOS clip is a SEPARATE, optional capture
// (getDisplayMedia, screen+audio - same technique as
// DesktopSttController/ShazamOscController) that only starts if the user
// opts in, since it needs its own screen-share prompt and isn't required
// for voice commands to work at all.
//
// Commands are interpreted by an LLM (assistantBrain.js, main process) into
// one small JSON action, then executed here against the real VRChat API
// surface the app already exposes (friends list, current location, profile
// update, invite), the app's own Weather feature, or a self-hosted SearXNG
// instance for anything else factual/current. The assistant NEVER changes
// the user's bio - only statusDescription, and only via an explicit
// "set_status" command. Responses are spoken via TTS ONLY - never posted to
// the VRChat chatbox, since a voice reply has no reason to also be text.
//
// SOS is manual-only (an explicit spoken "sos" command, matched by the LLM
// interpreter, or a UI button) - never auto-triggered by the emotional-cue
// check. On trigger: invites everyone in the configured trusted-friends list
// to the user's current instance, and (if instant-replay is enabled)
// uploads the rolling replay clip to a configured webhook so those friends
// can see what happened before they arrive.

const path = require('path')
const fs = require('fs')
const { detectCue, CHECK_IN_MESSAGES } = require('./emotionCues')

// How often the instant-replay recorder rotates to a fresh, independently
// valid segment (see startReplayBuffer below).
const REPLAY_SEGMENT_MS = 10000

const INSTANCE_SPEECH = {
  public: 'a public instance',
  friends: 'a friends-only instance',
  'friends+': 'a friends-plus instance',
  invite: 'an invite-only instance',
  'invite+': 'an invite-plus instance',
  group: 'a group instance',
  'group+': 'a group-plus instance',
  groupMembers: 'a group members instance'
}

class JarvisAssistant {
  constructor ({
    transcribeCloud, transcribeLocal, interpretCommand, summarizeSearch, searchWeb,
    speakText,
    getFriends, getMyLocation, resolveWorldName, getStatus, updateStatus, invite, saveClip,
    getWeather,
    onUpdate = () => {}, getUserMedia, getDisplayMedia
  } = {}) {
    this.transcribeCloud = transcribeCloud
    this.transcribeLocal = transcribeLocal
    this.interpretCommand = interpretCommand
    this.summarizeSearch = summarizeSearch
    this.searchWeb = searchWeb
    this.speakText = speakText
    this.getFriends = getFriends
    this.getMyLocation = getMyLocation
    this.resolveWorldName = resolveWorldName
    this.getStatus = getStatus
    this.updateStatus = updateStatus
    this.invite = invite
    this.saveClip = saveClip
    this.getWeather = getWeather
    this.onUpdate = onUpdate
    this.getUserMedia = getUserMedia || (c => navigator.mediaDevices.getUserMedia(c))
    this.getDisplayMedia = getDisplayMedia || (c => navigator.mediaDevices.getDisplayMedia(c))

    this.config = {
      wakeWord: 'nova',
      micDeviceId: '',
      engine: 'cloud', cloudBaseUrl: '', cloudApiKey: '', cloudModel: '', localModel: 'tiny',
      aiBaseUrl: '', aiApiKey: '', aiModel: '',
      searchProvider: 'searxng', // 'searxng' | 'duckduckgo'
      searxngEndpoint: 'https://searxng.nekosunevr.co.uk/',
      clipSeconds: 4,
      trustedFriends: [],
      enableReplayBuffer: false,
      sosWebhook: '',
      replayMinutes: 5
    }

    this.micStream = null
    this.replayStream = null
    this.live = false
    this.busy = false
    this.timer = null
    this.status = 'Stopped'
    this.error = ''
    this.lastHeard = ''
    this.lastReply = ''
    this.lastCue = null

    this.replayRecorder = null
    this.replaySegments = []
    this.replayBufferActive = false
    this.replaySegmentTimer = null
  }

  configure (config = {}) {
    this.config = {
      ...this.config,
      ...config,
      trustedFriends: Array.isArray(config.trustedFriends) ? config.trustedFriends : this.config.trustedFriends
    }
    return this.getState()
  }

  async ensureMic () {
    if (this.micStream?.active && this.micStream.getAudioTracks().length) return
    this.status = 'Requesting microphone access…'
    this.emit('sharing')
    const constraints = { audio: this.config.micDeviceId ? { deviceId: { exact: this.config.micDeviceId } } : true }
    this.micStream = await this.getUserMedia(constraints)
    this.micStream.getAudioTracks().forEach(track => track.addEventListener('ended', () => this.setLive(false)))
  }

  // Optional, separate from the mic: screen+system-audio capture used only
  // to feed the rolling instant-replay buffer for SOS clips. A failure or
  // cancellation here should never block wake-word listening, since it's
  // opt-in extra functionality, not required for voice commands.
  async ensureReplayCapture () {
    if (this.replayStream?.active && this.replayStream.getVideoTracks().length) return
    this.replayStream = await this.getDisplayMedia({ video: true, audio: true })
    this.replayStream.getTracks().forEach(track => track.addEventListener('ended', () => {
      this.stopReplayBuffer()
      if (this.replayStream) { this.replayStream.getTracks().forEach(t => t.stop()); this.replayStream = null }
    }))
  }

  // Catches the single most common cause of "the assistant never responds
  // to anything" - the cloud STT engine is selected but no API key was ever
  // entered (a very likely fresh-install state). Without this, every single
  // clip would fail transcription with a generic 401 buried in this.error,
  // which looks identical to "the wake word doesn't match" from the outside.
  validateConfig () {
    if (this.config.engine === 'cloud' && !this.config.cloudApiKey) {
      throw new Error('No cloud speech-to-text API key is set. Add one in the Desktop Speech-to-Text card above, or switch this to the local engine.')
    }
    if (!this.config.wakeWord) {
      throw new Error('Set a wake word first.')
    }
    // A blank base URL + blank key means the IntelliChat AI provider was
    // never configured at all (as opposed to deliberately pointed at a
    // keyless local provider like Ollama, which would have a non-empty
    // base URL) - that combination always fails against the real OpenAI
    // default endpoint, which requires a key.
    if (!this.config.aiBaseUrl && !this.config.aiApiKey) {
      throw new Error('No AI provider is configured for command interpretation. Set one up in Settings → IntelliChat first (any OpenAI-compatible provider works).')
    }
  }

  async setLive (enabled) {
    this.live = !!enabled
    if (this.live) {
      try {
        this.validateConfig()
        await this.ensureMic()
      } catch (err) {
        this.live = false
        this.error = err.name === 'NotAllowedError' ? 'Microphone access was denied.' : err.message
        this.status = 'Could not start listening'
        this.emit('error')
        return this.getState()
      }

      if (this.config.enableReplayBuffer) {
        try {
          await this.ensureReplayCapture()
          this.startReplayBuffer()
        } catch (err) {
          // Non-fatal: replay is optional extra functionality, mic-based
          // wake-word listening still works without it.
          this.error = `Instant-replay capture failed (voice commands still work): ${err.message}`
          this.emit('error')
        }
      }

      this.status = `Listening for the wake word "${this.config.wakeWord}"…`
      this.scheduleListen(0)
    } else {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      this.stopReplayBuffer()
      if (this.micStream) this.micStream.getTracks().forEach(track => track.stop())
      this.micStream = null
      if (this.replayStream) this.replayStream.getTracks().forEach(track => track.stop())
      this.replayStream = null
      this.status = 'Stopped'
    }
    this.emit('live-changed')
    return this.getState()
  }

  scheduleListen (delay = 400) {
    if (this.timer) clearTimeout(this.timer)
    if (!this.live) return
    this.timer = setTimeout(async () => {
      await this.listenOnce()
      this.scheduleListen()
    }, delay)
  }

  async listenOnce () {
    if (this.busy || !this.live) return
    this.busy = true
    try {
      const blob = await this.captureClip()
      const text = await this.transcribe(blob)
      if (text) await this.handleUtterance(text)
    } catch (err) {
      this.error = err.message
      this.emit('error')
    } finally {
      this.busy = false
    }
  }

  async captureClip () {
    const audioStream = new MediaStream(this.micStream.getAudioTracks())
    const preferred = ['audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)) || ''
    const recorder = new MediaRecorder(audioStream, preferred ? { mimeType: preferred } : undefined)
    const chunks = []
    recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data) }
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve
      recorder.onerror = e => reject(e.error || new Error('Recording failed'))
    })
    recorder.start(500)
    await new Promise(resolve => setTimeout(resolve, this.config.clipSeconds * 1000))
    recorder.stop()
    await stopped
    return new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
  }

  async decodeTo16kMono (blob) {
    const arrayBuffer = await blob.arrayBuffer()
    const AudioContext = window.AudioContext || window.webkitAudioContext
    const decodeCtx = new AudioContext()
    let decoded
    try { decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0)) } finally { decodeCtx.close().catch(() => {}) }
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0)
  }

  async transcribe (blob) {
    if (this.config.engine === 'local') {
      const samples = await this.decodeTo16kMono(blob)
      const r = await this.transcribeLocal({ samples, model: this.config.localModel })
      return String(r?.text || '').trim()
    }
    const audioBase64 = await blobToBase64(blob)
    const r = await this.transcribeCloud({
      audioBase64, mimeType: blob.type,
      baseUrl: this.config.cloudBaseUrl, apiKey: this.config.cloudApiKey, model: this.config.cloudModel
    })
    return String(r?.text || '').trim()
  }

  async handleUtterance (text) {
    const lower = text.toLowerCase()
    const wake = String(this.config.wakeWord || '').toLowerCase().trim()
    const idx = wake ? lower.indexOf(wake) : -1

    if (idx === -1) {
      // Not addressed to the assistant, but surface what was transcribed
      // anyway - otherwise there's no visible difference between "STT isn't
      // hearing anything" and "STT heard you fine, it just didn't match the
      // wake word", which is by far the most common source of confusion.
      this.status = `Heard (no wake word): "${text.slice(0, 60)}"`
      this.emit('overheard')
      this.maybeCheckIn(text)
      return
    }

    const command = text.slice(idx + wake.length).replace(/^[,:\s]+/, '').trim()
    this.lastHeard = command || text
    this.emit('heard')

    if (!command) { await this.respond('Yes?'); return }

    const action = await this.interpretCommand({
      baseUrl: this.config.aiBaseUrl, apiKey: this.config.aiApiKey, model: this.config.aiModel, text: command
    }).catch(() => ({ action: 'chat', reply: "Sorry, I couldn't reach my brain just now." }))

    await this.dispatch(action)
    this.maybeCheckIn(command)
  }

  maybeCheckIn (text) {
    const cue = detectCue(text)
    if (!cue || cue === this.lastCue) { if (!cue) this.lastCue = null; return }
    this.lastCue = cue
    this.respond(CHECK_IN_MESSAGES[cue])
  }

  async dispatch (action) {
    switch (action?.action) {
      case 'friend_status': return this.handleFriendStatus(action.name)
      case 'who_is_online': return this.handleWhoIsOnline()
      case 'my_status': return this.handleMyStatus()
      case 'set_status': return this.handleSetStatus(action.text)
      case 'sos': return this.triggerSos()
      case 'get_weather': return this.handleGetWeather()
      case 'get_time': return this.handleGetTime()
      case 'search_web': return this.handleSearchWeb(action.query)
      default: return this.respond(action?.reply || "Sorry, I didn't catch that.")
    }
  }

  async handleGetWeather () {
    const w = await this.getWeather?.().catch(() => null)
    if (w?.ok) {
      return this.respond(`It's ${w.temp}${w.unit} and ${w.desc.replace(/^[^\w]*/, '')} in ${w.city}, feels like ${w.feels}${w.unit}.`)
    }
    // Weather feature isn't configured with a city - fall back to a web
    // search so the question still gets answered.
    return this.handleSearchWeb('current weather')
  }

  // Answered locally from the system clock, never by the LLM - a language
  // model has no way to actually know the current time, only to guess from
  // whatever's in its training data or the request timestamp, either of
  // which can be wrong.
  async handleGetTime () {
    const now = new Date()
    const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
    return this.respond(`It's ${time} on ${date}.`)
  }

  async handleSearchWeb (query) {
    if (!query) return this.respond("What do you want me to look up?")
    if (!this.searchWeb) return this.respond("Web search isn't available right now.")
    try {
      const results = await this.searchWeb({ query, provider: this.config.searchProvider, endpoint: this.config.searxngEndpoint })
      if (!results?.length) return this.respond(`I couldn't find anything about "${query}".`)
      const answer = await this.summarizeSearch({
        baseUrl: this.config.aiBaseUrl, apiKey: this.config.aiApiKey, model: this.config.aiModel,
        query, results
      })
      return this.respond(answer || `I found some results for "${query}" but couldn't summarize them.`)
    } catch (err) {
      return this.respond(`I couldn't search the web just now (${err.message}).`)
    }
  }

  async handleFriendStatus (name) {
    if (!name) return this.respond('Who do you mean?')
    const friends = await this.getFriends().catch(() => [])
    const match = friends.find(f => f.displayName?.toLowerCase().includes(String(name).toLowerCase()))
    if (!match) return this.respond(`I couldn't find ${name} in your friends list.`)
    return this.respond(await this.describeFriend(match))
  }

  async describeFriend (f) {
    if (!f.online) return `${f.displayName} is offline.`
    if (!f.location || f.location === 'offline') return `${f.displayName} is online, but not in a world right now.`
    if (f.private || f.location === 'private' || f.location === 'traveling') return `${f.displayName} is online, in a private or traveling instance - I can't see which world.`
    const worldName = await this.resolveWorldName(f.worldId).catch(() => '') || 'a world'
    const type = INSTANCE_SPEECH[f.instanceType] || 'an instance'
    return `${f.displayName} is online in ${worldName}, in ${type}.`
  }

  async handleWhoIsOnline () {
    const friends = await this.getFriends().catch(() => [])
    const online = friends.filter(f => f.online)
    if (!online.length) return this.respond('None of your friends are online right now.')
    const names = online.slice(0, 10).map(f => f.displayName)
    const extra = online.length > 10 ? `, and ${online.length - 10} more` : ''
    return this.respond(`${names.join(', ')}${extra} ${online.length === 1 ? 'is' : 'are'} online.`)
  }

  async handleMyStatus () {
    const s = await this.getStatus().catch(() => null)
    if (!s) return this.respond("I couldn't check your status.")
    const status = s.status || s.user?.status || 'unknown'
    const desc = s.statusDescription || s.user?.statusDescription || ''
    return this.respond(`Your status is ${status}${desc ? `, "${desc}"` : ''}.`)
  }

  async handleSetStatus (text) {
    if (!text) return this.respond('What should I set your status to?')
    try {
      await this.updateStatus({ statusDescription: text })
      return this.respond(`Done - your status now says "${text}".`)
    } catch (_) {
      return this.respond("I couldn't update your status.")
    }
  }

  async triggerSos () {
    this.emit('sos-triggered')

    // Figure out exactly why a clip might not exist, instead of just
    // silently having none - this was previously indistinguishable from a
    // working-but-empty buffer, which made "the clip never shows up" hard
    // to diagnose.
    let clip = null
    let clipNote = ''
    if (!this.config.enableReplayBuffer) {
      clipNote = "Instant-replay isn't enabled, so no clip was captured."
    } else if (!this.replayStream || !this.replayRecorder) {
      clipNote = 'Instant-replay never started capturing (the screen-share prompt may have been cancelled or denied) - no clip available.'
    } else {
      clip = await this.exportReplayClip().catch(() => null)
      if (!clip) clipNote = "The instant-replay buffer hasn't captured any footage yet - no clip available."
    }

    // Always save the clip to disk (Videos/NekoSuneAPPS) regardless of
    // whether a Discord webhook is configured, so it isn't lost if the
    // upload fails or no webhook is set. The main process just stitches the
    // segments together - if they're already mp4/h264 (the normal case,
    // hardware-encoded) that's a near-free remux, not a re-encode.
    let savedPath = null
    if (clip && this.saveClip) {
      try {
        const segments = await Promise.all(clip.map(async blob => ({ base64: await blobToBase64(blob), mime: blob.type })))
        savedPath = await this.saveClip({ segments })
      } catch (err) {
        clipNote = `Clip was captured but saving it failed: ${err.message}.`
      }
    }

    let invited = 0
    const names = this.config.trustedFriends || []
    if (names.length) {
      const [friends, location] = await Promise.all([
        this.getFriends().catch(() => []),
        this.getMyLocation().catch(() => null)
      ])
      if (location?.worldId && location?.instanceId) {
        for (const name of names) {
          const match = friends.find(f => f.displayName?.toLowerCase() === String(name).toLowerCase())
          if (!match) continue
          try { await this.invite(match.id, `${location.worldId}:${location.instanceId}`); invited++ } catch (_) {}
        }
      }
    }

    // Upload the same finished .mp4 that got saved to disk, not the raw
    // segments - uploading the pre-stitch segments would hit the exact same
    // "no container header" problem this whole rework fixes.
    if (savedPath && this.config.sosWebhook) { await this.uploadClip(savedPath).catch(() => {}) }

    const parts = [invited
      ? `SOS sent to ${invited} friend${invited === 1 ? '' : 's'}.`
      : "I tried to send SOS, but couldn't reach your trusted friends - check they're online and on your friends list."]
    if (savedPath) parts.push(`Clip saved to ${savedPath}.`)
    else if (clipNote) parts.push(clipNote)
    await this.respond(parts.join(' '))
  }

  async uploadClip (filePath) {
    const buffer = fs.readFileSync(filePath)
    const blob = new Blob([buffer], { type: 'video/mp4' })
    const form = new FormData()
    form.append('file', blob, path.basename(filePath))
    form.append('content', `SOS triggered - last ${this.config.replayMinutes} minute(s) before the alert.`)
    await fetch(this.config.sosWebhook, { method: 'POST', body: form })
  }

  // A single continuously-recorded MediaRecorder stream only has ONE valid
  // container header, in its very first chunk. Pruning old chunks by time
  // (the previous approach) eventually drops that header chunk, so anything
  // exported afterwards is a webm file missing its header - most players
  // either refuse it outright or show a single static/garbage frame, which
  // is exactly the "broken clip" symptom this replaces. Instead, the
  // recorder is rotated every REPLAY_SEGMENT_MS: each rotation is its own
  // complete start()->stop() cycle, so every segment is independently valid
  // and it's whole segments (not chunks) that get pruned by age.
  startReplayBuffer () {
    if (!this.replayStream) return
    this.replaySegments = []
    this.replayBufferActive = true
    this.recordReplaySegment()
  }

  recordReplaySegment () {
    if (!this.replayBufferActive || !this.replayStream) return
    // Prefer mp4/h264+aac: on Windows this is hardware-encoded (Media
    // Foundation), unlike vp8/webm which Chromium only encodes in software -
    // that software encode was what pegged CPU for the entire time replay
    // was live, not just at export. Falls back to webm on older systems that
    // don't expose a hardware mp4 encoder to Chromium.
    const preferred = [
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ].find(t => MediaRecorder.isTypeSupported(t)) || ''
    const recorder = new MediaRecorder(this.replayStream, preferred ? { mimeType: preferred } : undefined)
    this.replayRecorder = recorder
    const chunks = []
    recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data) }
    recorder.onstop = () => {
      if (chunks.length) {
        this.replaySegments.push({ blob: new Blob(chunks, { type: recorder.mimeType || 'video/webm' }), ts: Date.now() })
        const cutoff = Date.now() - this.config.replayMinutes * 60000
        this.replaySegments = this.replaySegments.filter(s => s.ts >= cutoff)
      }
      if (this.replayBufferActive) this.recordReplaySegment()
    }
    recorder.start()
    this.replaySegmentTimer = setTimeout(() => { try { recorder.stop() } catch (_) {} }, REPLAY_SEGMENT_MS)
  }

  stopReplayBuffer () {
    this.replayBufferActive = false
    if (this.replaySegmentTimer) { clearTimeout(this.replaySegmentTimer); this.replaySegmentTimer = null }
    if (this.replayRecorder && this.replayRecorder.state !== 'inactive') {
      this.replayRecorder.onstop = null
      try { this.replayRecorder.stop() } catch (_) {}
    }
    this.replayRecorder = null
    this.replaySegments = []
  }

  // Returns the segments covering the configured window, oldest first, each
  // one an independently-decodable webm blob - the caller (main process,
  // which has ffmpeg) stitches them into a single real clip.
  async exportReplayClip () {
    if (!this.replaySegments.length) return null
    return this.replaySegments.map(s => s.blob)
  }

  // TTS only - the assistant deliberately never posts to the VRChat chatbox.
  async respond (text) {
    this.lastReply = text
    this.emit('reply')
    if (this.speakText) { try { await this.speakText(text) } catch (_) {} }
  }

  emit (event) { this.onUpdate(this.getState(event)) }

  getState (event = '') {
    return {
      event, live: this.live, busy: this.busy, status: this.status, error: this.error,
      lastHeard: this.lastHeard, lastReply: this.lastReply,
      // Lets the UI show at a glance whether an SOS trigger will actually
      // have footage to attach, instead of only finding out after the fact.
      replayActive: !!(this.replayStream && this.replayRecorder),
      config: { ...this.config, cloudApiKey: this.config.cloudApiKey ? '••••••••' : '', aiApiKey: this.config.aiApiKey ? '••••••••' : '' }
    }
  }

  destroy () { this.setLive(false) }
}

function blobToBase64 (blob) {
  return blob.arrayBuffer().then(buffer => Buffer.from(buffer).toString('base64'))
}

module.exports = { JarvisAssistant }

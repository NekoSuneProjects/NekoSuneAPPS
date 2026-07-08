'use strict'

// Wake-word voice assistant. Continuously captures short clips of shared
// desktop audio (same technique as DesktopSttController/ShazamOscController),
// transcribes each one, and only acts on speech that starts with the
// configured wake word - everything else is ignored except for a passive
// lexical emotional-cue check (see emotionCues.js), which never acts on its
// own, only prompts the user with a check-in question.
//
// Commands are interpreted by an LLM (assistantBrain.js, main process) into
// one small JSON action, then executed here against the real VRChat API
// surface the app already exposes (friends list, current location, profile
// update, invite). The assistant NEVER changes the user's bio - only
// statusDescription, and only via an explicit "set_status" command.
//
// SOS is manual-only (an explicit spoken "sos" command, matched by the LLM
// interpreter, or a UI button) - never auto-triggered by the emotional-cue
// check. On trigger: invites everyone in the configured trusted-friends list
// to the user's current instance, and uploads a rolling instant-replay clip
// (last N minutes of shared desktop video+audio) to a configured webhook so
// those friends can see what happened before they arrive.

const { detectCue, CHECK_IN_MESSAGES } = require('./emotionCues')

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
    transcribeCloud, transcribeLocal, interpretCommand,
    sendChatboxMessage, speakText,
    getFriends, getMyLocation, resolveWorldName, getStatus, updateStatus, invite, saveClip,
    onUpdate = () => {}, getDisplayMedia
  } = {}) {
    this.transcribeCloud = transcribeCloud
    this.transcribeLocal = transcribeLocal
    this.interpretCommand = interpretCommand
    this.sendChatboxMessage = sendChatboxMessage
    this.speakText = speakText
    this.getFriends = getFriends
    this.getMyLocation = getMyLocation
    this.resolveWorldName = resolveWorldName
    this.getStatus = getStatus
    this.updateStatus = updateStatus
    this.invite = invite
    this.saveClip = saveClip
    this.onUpdate = onUpdate
    this.getDisplayMedia = getDisplayMedia || (c => navigator.mediaDevices.getDisplayMedia(c))

    this.config = {
      wakeWord: 'nova',
      engine: 'cloud', cloudBaseUrl: '', cloudApiKey: '', cloudModel: '', localModel: 'tiny',
      aiBaseUrl: '', aiApiKey: '', aiModel: '',
      clipSeconds: 4,
      trustedFriends: [],
      sosWebhook: '',
      replayMinutes: 5
    }

    this.stream = null
    this.live = false
    this.busy = false
    this.timer = null
    this.status = 'Stopped'
    this.error = ''
    this.lastHeard = ''
    this.lastReply = ''
    this.lastCue = null

    this.replayRecorder = null
    this.replayChunks = []
  }

  configure (config = {}) {
    this.config = {
      ...this.config,
      ...config,
      trustedFriends: Array.isArray(config.trustedFriends) ? config.trustedFriends : this.config.trustedFriends
    }
    return this.getState()
  }

  async ensureAudio () {
    if (this.stream?.active && this.stream.getAudioTracks().length) return
    this.status = 'Choose a screen and enable system audio…'
    this.emit('sharing')
    this.stream = await this.getDisplayMedia({ video: true, audio: true })
    if (!this.stream.getAudioTracks().length) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
      throw new Error('No system audio was shared. Choose a screen and enable Share system audio.')
    }
    this.stream.getTracks().forEach(track => track.addEventListener('ended', () => this.setLive(false)))
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
  }

  async setLive (enabled) {
    this.live = !!enabled
    if (this.live) {
      try {
        this.validateConfig()
        await this.ensureAudio()
        this.startReplayBuffer()
        this.status = `Listening for the wake word "${this.config.wakeWord}"…`
        this.scheduleListen(0)
      } catch (err) {
        this.live = false
        this.error = err.name === 'NotAllowedError' ? 'Desktop-audio sharing was cancelled.' : err.message
        this.status = 'Could not start listening'
        this.emit('error')
        return this.getState()
      }
    } else {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      this.stopReplayBuffer()
      if (this.stream) this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
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
    const audioStream = new MediaStream(this.stream.getAudioTracks())
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
      default: return this.respond(action?.reply || "Sorry, I didn't catch that.")
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
    const clip = await this.exportReplayClip().catch(() => null)

    // Always save the clip to disk (Videos/NekoSuneAPPS) regardless of
    // whether a Discord webhook is configured, so it isn't lost if the
    // upload fails or no webhook is set.
    let savedPath = null
    if (clip && this.saveClip) {
      try {
        const base64 = await blobToBase64(clip)
        savedPath = await this.saveClip({ base64, mime: clip.type })
      } catch (_) {}
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

    if (clip && this.config.sosWebhook) { await this.uploadClip(clip).catch(() => {}) }

    const parts = [invited
      ? `SOS sent to ${invited} friend${invited === 1 ? '' : 's'}.`
      : "I tried to send SOS, but couldn't reach your trusted friends - check they're online and on your friends list."]
    if (savedPath) parts.push(`Clip saved to ${savedPath}.`)
    await this.respond(parts.join(' '))
  }

  async uploadClip (blob) {
    const form = new FormData()
    form.append('file', blob, 'sos-clip.webm')
    form.append('content', `SOS triggered - last ${this.config.replayMinutes} minute(s) before the alert.`)
    await fetch(this.config.sosWebhook, { method: 'POST', body: form })
  }

  startReplayBuffer () {
    this.replayChunks = []
    const preferred = ['video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || ''
    this.replayRecorder = new MediaRecorder(this.stream, preferred ? { mimeType: preferred } : undefined)
    this.replayRecorder.ondataavailable = e => {
      if (!e.data || !e.data.size) return
      this.replayChunks.push({ blob: e.data, ts: Date.now() })
      const cutoff = Date.now() - this.config.replayMinutes * 60000
      this.replayChunks = this.replayChunks.filter(c => c.ts >= cutoff)
    }
    this.replayRecorder.start(5000)
  }

  stopReplayBuffer () {
    if (this.replayRecorder && this.replayRecorder.state !== 'inactive') { try { this.replayRecorder.stop() } catch (_) {} }
    this.replayRecorder = null
    this.replayChunks = []
  }

  async exportReplayClip () {
    if (!this.replayChunks.length) return null
    return new Blob(this.replayChunks.map(c => c.blob), { type: this.replayChunks[0].blob.type || 'video/webm' })
  }

  async respond (text) {
    this.lastReply = text
    this.emit('reply')
    if (this.sendChatboxMessage) { try { this.sendChatboxMessage(String(text).slice(0, 144), false) } catch (_) {} }
    if (this.speakText) { try { await this.speakText(text) } catch (_) {} }
  }

  emit (event) { this.onUpdate(this.getState(event)) }

  getState (event = '') {
    return {
      event, live: this.live, busy: this.busy, status: this.status, error: this.error,
      lastHeard: this.lastHeard, lastReply: this.lastReply,
      config: { ...this.config, cloudApiKey: this.config.cloudApiKey ? '••••••••' : '', aiApiKey: this.config.aiApiKey ? '••••••••' : '' }
    }
  }

  destroy () { this.setLive(false) }
}

function blobToBase64 (blob) {
  return blob.arrayBuffer().then(buffer => Buffer.from(buffer).toString('base64'))
}

module.exports = { JarvisAssistant }

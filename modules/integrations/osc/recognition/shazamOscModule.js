'use strict'

const ROOT = '/avatar/parameters/ShazamOSC/'
const METADATA = '/avatar/parameters/VRCOSC/Metadata/Modules/YUCP.VIRA.yeusepesmodules.shazamosc'

function trackId (match = {}) {
  const text = `${match.artist || ''}|${match.title || ''}`.toLowerCase()
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash | 0)
}

class ShazamOscController {
  constructor ({ sendParam, recognize, onUpdate = () => {}, onRecognized = () => {}, getDisplayMedia } = {}) {
    if (typeof sendParam !== 'function' || typeof recognize !== 'function') throw new TypeError('ShazamOSC requires sendParam and recognize callbacks')
    this.sendParam = sendParam
    this.recognize = recognize
    this.onUpdate = onUpdate
    this.onRecognized = onRecognized
    this.getDisplayMedia = getDisplayMedia || (constraints => navigator.mediaDevices.getDisplayMedia(constraints))
    this.config = { provider: 'auto', token: '', acrHost: '', acrAccessKey: '', acrAccessSecret: '', clipSeconds: 10, liveSeconds: 25, toChatbox: false }
    this.stream = null
    this.audioContext = null
    this.analyser = null
    this.bassTimer = null
    this.liveTimer = null
    this.live = false
    this.busy = false
    this.listening = false
    this.lastMatch = null
    this.saved = []
    this.status = 'Ready'
    this.error = ''
  }

  configure (config = {}) {
    this.config = {
      provider: ['auto', 'audd', 'acrcloud', 'node-shazam'].includes(config.provider) ? config.provider : 'auto',
      token: String(config.token || ''),
      acrHost: String(config.acrHost || ''),
      acrAccessKey: String(config.acrAccessKey || ''),
      acrAccessSecret: String(config.acrAccessSecret || ''),
      clipSeconds: Math.max(5, Math.min(12, Number(config.clipSeconds) || 10)),
      liveSeconds: Math.max(15, Math.min(300, Number(config.liveSeconds) || 25)),
      toChatbox: !!config.toChatbox
    }
    if (Array.isArray(config.saved)) this.saved = config.saved.slice(0, 50)
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
    this.stream.getTracks().forEach(track => track.addEventListener('ended', () => this.stopAudio()))
    this.startBassAnalysis()
    this.sendParam(METADATA, true, 'bool')
  }

  startBassAnalysis () {
    if (this.audioContext) return
    const AudioContext = window.AudioContext || window.webkitAudioContext
    this.audioContext = new AudioContext()
    const audioStream = new MediaStream(this.stream.getAudioTracks())
    const source = this.audioContext.createMediaStreamSource(audioStream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 512
    source.connect(this.analyser)
    const bins = new Uint8Array(this.analyser.frequencyBinCount)
    this.bassTimer = setInterval(() => {
      if (!this.analyser) return
      this.analyser.getByteFrequencyData(bins)
      const count = Math.max(4, Math.round(bins.length * 0.08))
      let total = 0
      for (let index = 0; index < count; index++) total += bins[index]
      const level = Math.min(1, total / count / 255)
      this.sendParam(`${ROOT}BassLevel`, level, 'float')
    }, 150)
  }

  async captureClip () {
    await this.ensureAudio()
    const audioStream = new MediaStream(this.stream.getAudioTracks())
    const preferred = ['audio/webm;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type)) || ''
    const recorder = new MediaRecorder(audioStream, preferred ? { mimeType: preferred } : undefined)
    const chunks = []
    recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data) }
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve
      recorder.onerror = event => reject(event.error || new Error('Desktop audio recording failed.'))
    })
    recorder.start(500)
    await new Promise(resolve => setTimeout(resolve, this.config.clipSeconds * 1000))
    recorder.stop()
    await stopped
    return new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
  }

  async recognizeNow () {
    if (this.busy) return this.getState()
    if (this.config.provider === 'audd' && !this.config.token.trim()) {
      this.error = 'Enter an AudD API token first.'
      this.status = 'Recognition is not configured'
      this.sendParam(`${ROOT}Error`, true, 'bool')
      this.emit('error')
      return this.getState()
    }
    if (this.config.provider === 'acrcloud' && !(this.config.acrHost.trim() && this.config.acrAccessKey.trim() && this.config.acrAccessSecret.trim())) {
      this.error = 'Enter the ACRCloud host, access key and access secret first.'
      this.status = 'Recognition is not configured'
      this.sendParam(`${ROOT}Error`, true, 'bool')
      this.emit('error')
      return this.getState()
    }
    this.busy = true
    this.listening = true
    this.error = ''
    this.status = `Listening for ${this.config.clipSeconds} seconds…`
    this.sendParam(`${ROOT}Listening`, true, 'bool')
    this.sendParam(`${ROOT}Error`, false, 'bool')
    this.emit('listening')
    try {
      const blob = await this.captureClip()
      this.status = 'Identifying song…'
      this.emit('recognizing')
      const audioBase64 = await blobToBase64(blob)
      const response = await this.recognize({
        audioBase64,
        mimeType: blob.type,
        provider: this.config.provider,
        token: this.config.token,
        acrHost: this.config.acrHost,
        acrAccessKey: this.config.acrAccessKey,
        acrAccessSecret: this.config.acrAccessSecret
      })
      if (!response?.match) {
        this.status = 'No song match found'
        this.emit('no-match')
        return this.getState()
      }
      const match = { ...response.match, provider: response.provider, recognizedAt: Date.now(), trackId: trackId(response.match) }
      this.lastMatch = match
      this.saved = [match, ...this.saved.filter(item => item.trackId !== match.trackId)].slice(0, 50)
      this.status = `${match.artist || 'Unknown artist'} — ${match.title || 'Unknown song'} · ${response.provider}`
      this.sendParam(`${ROOT}OSCTrackID`, match.trackId, 'int')
      this.pulse('Recognized', 700)
      this.onRecognized(match, this.config)
      this.emit('recognized')
    } catch (err) {
      this.error = err.message
      this.status = 'Recognition failed'
      this.sendParam(`${ROOT}Error`, true, 'bool')
      this.emit('error')
    } finally {
      this.busy = false
      this.listening = false
      this.sendParam(`${ROOT}Listening`, false, 'bool')
    }
    return this.getState()
  }

  async setLive (enabled) {
    this.live = !!enabled
    if (this.live) {
      try {
        await this.ensureAudio()
        this.sendParam(METADATA, true, 'bool')
        this.scheduleLive(0)
      } catch (err) {
        this.live = false
        this.error = err.name === 'NotAllowedError' ? 'Desktop-audio sharing was cancelled.' : err.message
        this.status = 'Could not start live listening'
        this.sendParam(`${ROOT}Error`, true, 'bool')
        this.emit('error')
        return this.getState()
      }
    } else {
      if (this.liveTimer) clearTimeout(this.liveTimer)
      this.liveTimer = null
    }
    this.emit('live-changed')
    return this.getState()
  }

  scheduleLive (delay = this.config.liveSeconds * 1000) {
    if (this.liveTimer) clearTimeout(this.liveTimer)
    if (!this.live) return
    this.liveTimer = setTimeout(async () => {
      await this.recognizeNow()
      this.scheduleLive()
    }, delay)
  }

  async handleOsc (address, args = []) {
    const value = args[0] === true || Number(args[0]) > 0
    if (address === `${ROOT}Recognize` && value) {
      if (this.stream) this.recognizeNow()
      else { this.status = 'Click Recognize once to grant desktop-audio permission.'; this.emit('permission-required') }
      return true
    }
    if (address === `${ROOT}LiveListening`) {
      if (!this.stream && value) { this.status = 'Enable Live listening in the app once to grant permission.'; this.emit('permission-required') }
      else this.setLive(value)
      return true
    }
    if (address === '/avatar/change' && (this.stream || this.live)) this.sendParam(METADATA, true, 'bool')
    return false
  }

  pulse (name, duration = 180) {
    this.sendParam(`${ROOT}${name}`, true, 'bool')
    setTimeout(() => this.sendParam(`${ROOT}${name}`, false, 'bool'), duration)
  }

  clearSaved () { this.saved = []; this.emit('saved-cleared') }

  stopAudio () {
    if (this.liveTimer) clearTimeout(this.liveTimer)
    if (this.bassTimer) clearInterval(this.bassTimer)
    this.liveTimer = null
    this.bassTimer = null
    this.live = false
    if (this.stream) this.stream.getTracks().forEach(track => track.stop())
    this.stream = null
    if (this.audioContext) this.audioContext.close().catch(() => {})
    this.audioContext = null
    this.analyser = null
    this.sendParam(`${ROOT}BassLevel`, 0, 'float')
    this.sendParam(METADATA, false, 'bool')
    this.status = 'Desktop audio sharing stopped'
    this.emit('stopped')
  }

  emit (event) { this.onUpdate(this.getState(event)) }

  getState (event = '') {
    return {
      event,
      live: this.live,
      busy: this.busy,
      listening: this.listening,
      sharing: !!this.stream,
      status: this.status,
      error: this.error,
      lastMatch: this.lastMatch ? { ...this.lastMatch } : null,
      saved: this.saved.map(item => ({ ...item })),
      config: {
        ...this.config,
        token: this.config.token ? '••••••••' : '',
        acrAccessKey: this.config.acrAccessKey ? '••••••••' : '',
        acrAccessSecret: this.config.acrAccessSecret ? '••••••••' : ''
      }
    }
  }

  destroy () { this.stopAudio() }
}

function blobToBase64 (blob) {
  return blob.arrayBuffer().then(buffer => Buffer.from(buffer).toString('base64'))
}

module.exports = { ShazamOscController, trackId, ROOT, METADATA }

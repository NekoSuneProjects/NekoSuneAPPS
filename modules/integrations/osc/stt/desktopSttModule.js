'use strict'

// Desktop-audio speech-to-text: captures short clips of shared desktop/
// system audio (same getDisplayMedia({audio:true}) technique already used
// by ShazamOscController), sends them for transcription (cloud OpenAI/Groq
// Whisper, or a fully local WASM Whisper model), then optionally translates
// the result and pushes it to the chatbox and/or speaks it aloud. Runs in
// the RENDERER process (needs the DOM/Web Audio APIs for capture+decode).

class DesktopSttController {
  constructor ({ transcribeCloud, transcribeLocal, translate, sendChatboxMessage, speakText, onUpdate = () => {}, getDisplayMedia } = {}) {
    if (typeof transcribeCloud !== 'function' || typeof transcribeLocal !== 'function') {
      throw new TypeError('DesktopSttController requires transcribeCloud and transcribeLocal callbacks')
    }
    this.transcribeCloud = transcribeCloud
    this.transcribeLocal = transcribeLocal
    this.translate = typeof translate === 'function' ? translate : null
    this.sendChatboxMessage = typeof sendChatboxMessage === 'function' ? sendChatboxMessage : null
    this.speakText = typeof speakText === 'function' ? speakText : null
    this.onUpdate = onUpdate
    this.getDisplayMedia = getDisplayMedia || (constraints => navigator.mediaDevices.getDisplayMedia(constraints))

    this.config = {
      engine: 'cloud', // 'cloud' | 'local'
      cloudBaseUrl: '', cloudApiKey: '', cloudModel: '',
      localModel: 'tiny',
      sourceLang: 'auto',
      clipSeconds: 6,
      toChatbox: false,
      speakTranslation: false
    }

    this.stream = null
    this.liveTimer = null
    this.live = false
    this.busy = false
    this.lastText = ''
    this.lastTranslated = ''
    this.status = 'Ready'
    this.error = ''
  }

  configure (config = {}) {
    this.config = {
      engine: config.engine === 'local' ? 'local' : 'cloud',
      cloudBaseUrl: String(config.cloudBaseUrl || ''),
      cloudApiKey: String(config.cloudApiKey || ''),
      cloudModel: String(config.cloudModel || ''),
      localModel: String(config.localModel || 'tiny'),
      sourceLang: String(config.sourceLang || 'auto'),
      clipSeconds: Math.max(3, Math.min(15, Number(config.clipSeconds) || 6)),
      toChatbox: !!config.toChatbox,
      speakTranslation: !!config.speakTranslation
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
    this.stream.getTracks().forEach(track => track.addEventListener('ended', () => this.stop()))
  }

  async captureClip () {
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

  // Decode a compressed audio Blob down to mono 16kHz Float32 PCM, the input
  // shape local Whisper (transformers.js) expects. Cloud transcription skips
  // this entirely - OpenAI/Groq accept the original webm clip directly.
  async decodeTo16kMono (blob) {
    const arrayBuffer = await blob.arrayBuffer()
    const AudioContext = window.AudioContext || window.webkitAudioContext
    const decodeCtx = new AudioContext()
    let decoded
    try {
      decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0))
    } finally {
      decodeCtx.close().catch(() => {})
    }
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0)
  }

  async transcribeNow () {
    if (this.busy) return this.getState()
    this.busy = true
    this.error = ''
    this.status = `Listening for ${this.config.clipSeconds}s…`
    this.emit('listening')
    try {
      await this.ensureAudio()
      const blob = await this.captureClip()
      this.status = 'Transcribing…'
      this.emit('transcribing')

      let text = ''
      if (this.config.engine === 'local') {
        const samples = await this.decodeTo16kMono(blob)
        const result = await this.transcribeLocal({ samples, model: this.config.localModel, language: this.config.sourceLang })
        text = result?.text || ''
      } else {
        const audioBase64 = await blobToBase64(blob)
        const result = await this.transcribeCloud({
          audioBase64, mimeType: blob.type,
          baseUrl: this.config.cloudBaseUrl, apiKey: this.config.cloudApiKey, model: this.config.cloudModel,
          language: this.config.sourceLang
        })
        text = result?.text || ''
      }

      text = String(text || '').trim()
      if (!text) {
        this.status = 'Heard nothing'
        this.emit('no-speech')
        return this.getState()
      }

      this.lastText = text
      this.status = `Heard: ${text.slice(0, 80)}`
      let translated = ''
      if (this.translate) {
        try { translated = await this.translate(text) } catch (_) { translated = '' }
      }
      this.lastTranslated = translated

      if (this.config.toChatbox && this.sendChatboxMessage) this.sendChatboxMessage((translated || text).slice(0, 144), false)
      if (this.config.speakTranslation && this.speakText) { try { await this.speakText(translated || text) } catch (_) {} }

      this.emit('heard')
    } catch (err) {
      this.error = err.name === 'NotAllowedError' ? 'Desktop-audio sharing was cancelled.' : err.message
      this.status = 'Transcription failed'
      this.emit('error')
    } finally {
      this.busy = false
    }
    return this.getState()
  }

  async setLive (enabled) {
    this.live = !!enabled
    if (this.live) {
      this.scheduleLive(0)
    } else if (this.liveTimer) {
      clearTimeout(this.liveTimer)
      this.liveTimer = null
    }
    this.emit('live-changed')
    return this.getState()
  }

  scheduleLive (delay = 400) {
    if (this.liveTimer) clearTimeout(this.liveTimer)
    if (!this.live) return
    this.liveTimer = setTimeout(async () => {
      await this.transcribeNow()
      this.scheduleLive()
    }, delay)
  }

  stop () {
    this.live = false
    if (this.liveTimer) clearTimeout(this.liveTimer)
    this.liveTimer = null
    if (this.stream) this.stream.getTracks().forEach(track => track.stop())
    this.stream = null
    this.status = 'Stopped'
    this.emit('stopped')
  }

  emit (event) { this.onUpdate(this.getState(event)) }

  getState (event = '') {
    return {
      event,
      live: this.live,
      busy: this.busy,
      sharing: !!this.stream,
      status: this.status,
      error: this.error,
      lastText: this.lastText,
      lastTranslated: this.lastTranslated,
      config: { ...this.config, cloudApiKey: this.config.cloudApiKey ? '••••••••' : '' }
    }
  }

  destroy () { this.stop() }
}

function blobToBase64 (blob) {
  return blob.arrayBuffer().then(buffer => Buffer.from(buffer).toString('base64'))
}

module.exports = { DesktopSttController }

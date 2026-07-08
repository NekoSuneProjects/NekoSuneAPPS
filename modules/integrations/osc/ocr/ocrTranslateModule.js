'use strict'

// OCR screen-translate: reads text from a shared screen/window (VRChat's
// own window, typically) via Tesseract.js, then optionally translates it
// and pushes it to the chatbox. Reuses the same getDisplayMedia -> video ->
// canvas -> pixel-data capture scaffolding as OscQrController, swapping
// jsQR for Tesseract's recognize(). Runs in the RENDERER process.

const { createWorker } = require('tesseract.js')

// tesseract.js computes its worker script path internally via its own
// __dirname, which resolves to a path inside app.asar in a packaged build.
// Unlike require()/fs, worker_threads can't load a script from inside an
// asar archive at all (confirmed by a real "worker script...must be an
// absolute path" failure) - tesseract.js IS in asarUnpack (package.json),
// so the real file exists on disk, just not at this computed path. Patch
// it to the unpacked copy; a no-op in dev where there's no asar at all.
function getWorkerPath () {
  try {
    const defaultPath = require('tesseract.js/src/worker/node/defaultOptions.js').workerPath
    return defaultPath.replace('app.asar', 'app.asar.unpacked')
  } catch (_) {
    return null
  }
}

class OcrTranslateController {
  constructor ({ translate, sendChatboxMessage, onUpdate = () => {}, getDisplayMedia } = {}) {
    this.translate = typeof translate === 'function' ? translate : null
    this.sendChatboxMessage = typeof sendChatboxMessage === 'function' ? sendChatboxMessage : null
    this.onUpdate = onUpdate
    this.getDisplayMedia = getDisplayMedia || (constraints => navigator.mediaDevices.getDisplayMedia(constraints))

    this.config = { intervalMs: 3000, tesseractLang: 'eng', toChatbox: false }
    this.enabled = false
    this.stream = null
    this.video = null
    this.canvas = null
    this.context = null
    this.timer = null
    this.worker = null
    this.workerLang = null
    this.busy = false
    this.lastText = ''
    this.lastTranslated = ''
    this.status = 'Stopped'
    this.error = ''
  }

  configure (config = {}) {
    this.config = {
      intervalMs: Math.max(1000, Math.min(15000, Number(config.intervalMs) || 3000)),
      tesseractLang: String(config.tesseractLang || 'eng'),
      toChatbox: !!config.toChatbox
    }
    if (this.enabled) this.startTimer()
    return this.getState()
  }

  async ensureWorker () {
    if (this.worker && this.workerLang === this.config.tesseractLang) return this.worker
    if (this.worker) { try { await this.worker.terminate() } catch (_) {} }
    const workerPath = getWorkerPath()
    this.worker = await createWorker(this.config.tesseractLang, undefined, workerPath ? { workerPath } : {})
    this.workerLang = this.config.tesseractLang
    return this.worker
  }

  async start () {
    if (this.enabled && this.stream) return this.getState()
    this.status = 'Choose the screen or window to read…'
    this.error = ''
    this.emit('starting')
    try {
      this.stream = await this.getDisplayMedia({ video: { frameRate: 5 }, audio: false })
      this.video = document.createElement('video')
      this.video.muted = true
      this.video.playsInline = true
      this.video.srcObject = this.stream
      await this.video.play()
      this.canvas = document.createElement('canvas')
      this.context = this.canvas.getContext('2d', { willReadFrequently: true })
      this.stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stop())
      this.status = 'Loading OCR model…'
      this.emit('loading')
      await this.ensureWorker()
      this.enabled = true
      this.status = 'Reading the shared screen'
      this.startTimer()
      this.emit('started')
    } catch (err) {
      this.error = err.name === 'NotAllowedError' ? 'Screen sharing was cancelled.' : err.message
      this.status = 'Could not start screen capture'
      this.enabled = false
      this.emit('error')
    }
    return this.getState()
  }

  stop () {
    this.stopTimer()
    if (this.stream) this.stream.getTracks().forEach(track => track.stop())
    this.stream = null
    this.video = null
    this.canvas = null
    this.context = null
    this.enabled = false
    this.status = 'Stopped'
    this.emit('stopped')
    return this.getState()
  }

  startTimer () {
    this.stopTimer()
    this.timer = setInterval(() => this.scanFrame(), this.config.intervalMs)
  }

  stopTimer () {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async scanFrame () {
    if (this.busy || !this.enabled || !this.video || this.video.readyState < 2 || !this.context || !this.worker) return
    const sourceWidth = this.video.videoWidth
    const sourceHeight = this.video.videoHeight
    if (!sourceWidth || !sourceHeight) return
    if (this.canvas.width !== sourceWidth || this.canvas.height !== sourceHeight) {
      this.canvas.width = sourceWidth
      this.canvas.height = sourceHeight
    }
    this.context.drawImage(this.video, 0, 0, sourceWidth, sourceHeight)

    this.busy = true
    try {
      const { data } = await this.worker.recognize(this.canvas)
      await this.handleText(String(data?.text || '').trim())
    } catch (err) {
      this.error = err.message
      this.emit('error')
    } finally {
      this.busy = false
    }
  }

  async handleText (text) {
    if (!text || text === this.lastText) return
    this.lastText = text
    this.status = 'Text detected'

    let translated = ''
    if (this.translate) {
      try { translated = await this.translate(text) } catch (_) { translated = '' }
    }
    this.lastTranslated = translated

    if (this.config.toChatbox && this.sendChatboxMessage) {
      this.sendChatboxMessage((translated || text).slice(0, 144), false)
    }
    this.emit('detected')
  }

  emit (event) { this.onUpdate(this.getState(event)) }

  getState (event = '') {
    return {
      event,
      enabled: this.enabled,
      status: this.status,
      error: this.error,
      lastText: this.lastText,
      lastTranslated: this.lastTranslated,
      config: { ...this.config }
    }
  }

  async destroy () {
    this.stop()
    if (this.worker) { try { await this.worker.terminate() } catch (_) {} }
    this.worker = null
  }
}

module.exports = { OcrTranslateController }

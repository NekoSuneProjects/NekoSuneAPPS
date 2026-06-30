'use strict'

const jsQR = require('jsqr')

const ROOT = '/avatar/parameters/OSCQR/'
const METADATA = '/avatar/parameters/VRCOSC/Metadata/Modules/YUCP.VIRA.yeusepesmodules.oscqr'

class OscQrController {
  constructor ({ sendParam, onUpdate = () => {}, onDetected = () => {}, getDisplayMedia } = {}) {
    if (typeof sendParam !== 'function') throw new TypeError('OSCQR requires sendParam(address, value, type)')
    this.sendParam = sendParam
    this.onUpdate = onUpdate
    this.onDetected = onDetected
    this.getDisplayMedia = getDisplayMedia || (constraints => navigator.mediaDevices.getDisplayMedia(constraints))
    this.config = { intervalMs: 500, saveHistory: true }
    this.enabled = false
    this.stream = null
    this.video = null
    this.canvas = null
    this.context = null
    this.timer = null
    this.history = []
    this.lastData = ''
    this.lastDetectedAt = 0
    this.status = 'Stopped'
    this.error = ''
  }

  configure (config = {}) {
    this.config = {
      intervalMs: Math.max(200, Math.min(5000, Number(config.intervalMs) || 500)),
      saveHistory: config.saveHistory !== false
    }
    if (Array.isArray(config.history)) this.history = config.history.slice(0, 50)
    if (this.enabled) this.startTimer()
    return this.getState()
  }

  async start () {
    if (this.enabled && this.stream) return this.getState()
    this.status = 'Choose the screen or window to scan…'
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
      this.enabled = true
      this.status = 'Scanning the shared screen'
      this.sendParam(METADATA, true, 'bool')
      this.sendParam(`${ROOT}Error`, false, 'bool')
      this.startTimer()
      this.emit('started')
      return this.getState()
    } catch (err) {
      this.error = err.name === 'NotAllowedError' ? 'Screen sharing was cancelled.' : err.message
      this.status = 'Could not start screen capture'
      this.enabled = false
      this.sendParam(`${ROOT}Error`, true, 'bool')
      this.emit('error')
      return this.getState()
    }
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
    this.sendParam(METADATA, false, 'bool')
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

  scanFrame () {
    if (!this.enabled || !this.video || this.video.readyState < 2 || !this.context) return null
    const sourceWidth = this.video.videoWidth
    const sourceHeight = this.video.videoHeight
    if (!sourceWidth || !sourceHeight) return null
    const scale = Math.min(1, 1280 / sourceWidth)
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    this.context.drawImage(this.video, 0, 0, width, height)
    const image = this.context.getImageData(0, 0, width, height)
    const result = jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' })
    if (!result?.data) return null
    this.detect(result.data)
    return result.data
  }

  detect (value) {
    const data = String(value || '').trim()
    if (!data) return
    const now = Date.now()
    if (data === this.lastData && now - this.lastDetectedAt < 5000) return
    this.lastData = data
    this.lastDetectedAt = now
    const spotify = /^(spotify:|https?:\/\/(?:open\.)?spotify\.com\/)/i.test(data)
    const item = { data, spotify, at: now }
    if (this.config.saveHistory) {
      this.history = [item, ...this.history.filter(entry => entry.data !== data)].slice(0, 50)
    }
    this.status = spotify ? 'Spotify code detected' : 'QR code detected'
    this.pulse('QRCodeFound')
    if (spotify) this.pulse('SpotifyCodeFound')
    this.onDetected(item)
    this.emit('detected')
  }

  pulse (name, duration = 180) {
    this.sendParam(`${ROOT}${name}`, true, 'bool')
    setTimeout(() => this.sendParam(`${ROOT}${name}`, false, 'bool'), duration)
  }

  async handleOsc (address, args = []) {
    const value = args[0] === true || Number(args[0]) > 0
    if (address === `${ROOT}StartRecording`) {
      if (!value) this.stop()
      else if (this.stream) return this.start()
      else {
        this.status = 'Click Start scan once to grant screen permission.'
        this.emit('permission-required')
      }
      return true
    }
    if (address === `${ROOT}ReadQRCode` && value) {
      this.scanFrame()
      return true
    }
    if (address === '/avatar/change' && this.enabled) this.sendParam(METADATA, true, 'bool')
    return false
  }

  clearHistory () {
    this.history = []
    this.emit('history-cleared')
  }

  emit (event) { this.onUpdate(this.getState(event)) }

  getState (event = '') {
    return {
      event,
      enabled: this.enabled,
      status: this.status,
      error: this.error,
      lastData: this.lastData,
      history: this.history.map(item => ({ ...item })),
      config: { ...this.config }
    }
  }

  destroy () { this.stop() }
}

module.exports = { OscQrController, ROOT, METADATA }

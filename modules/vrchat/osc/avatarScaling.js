// modules/vrchat/osc/avatarScaling.js
// VRChat's native OSC avatar-height-scaling API - works on ANY avatar,
// no avatar-specific exposed parameters needed (unlike KAT/PhysBone-style
// params). Ported from a working C# AvatarScalingController reference:
// sends /avatar/eyeheight (float meters) + /avatar/eyeheightmin/max (safety
// bounds) + /avatar/eyeheightscalingallowed (bool), and listens for
// VRChat's own /avatar/eyeheight echo (radial-menu scale changes) to stay
// in sync. Runs in the RENDERER process, alongside KatOscText, and
// subscribes to the shared OSC receiver (oscModule.addOscListener) instead
// of opening a second socket on the receive port.

const dgram = require('dgram')
const { createOscMessage } = require('./oscEncode')

const DEFAULT_CONFIG = {
  oscIp: '127.0.0.1',
  oscPort: 9000,
  useSafety: true,
  saveScaleBetweenWorlds: false,
  smoothing: 50, // 0 = fast/large step, 100 = slow/small step
  resendIntervalMs: 5000
}

const SAFETY_MIN = 0.1
const SAFETY_MAX = 100
const UNSAFE_MIN = 0.01
const UNSAFE_MAX = 10000

const EYEHEIGHT_PATH = '/avatar/eyeheight'
const EYEHEIGHT_MIN_PATH = '/avatar/eyeheightmin'
const EYEHEIGHT_MAX_PATH = '/avatar/eyeheightmax'
const EYEHEIGHT_ALLOWED_PATH = '/avatar/eyeheightscalingallowed'

class AvatarScalingController {
  constructor (config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.oscIp = this.config.oscIp
    this.oscPort = this.config.oscPort
    this.useSafety = this.config.useSafety
    this.saveScaleBetweenWorlds = this.config.saveScaleBetweenWorlds
    this.smoothing = this.config.smoothing
    this.currentScale = Number.isFinite(this.config.scale) ? this.config.scale : 1
    this.connected = false
    this.resendTimer = null
    this.client = this.config.client || dgram.createSocket('udp4')
    this.ownsClient = !this.config.client
    this.onStatus = null
    this.onError = null
  }

  minMax () {
    return this.useSafety ? { min: SAFETY_MIN, max: SAFETY_MAX } : { min: UNSAFE_MIN, max: UNSAFE_MAX }
  }

  clampScale (value) {
    const { min, max } = this.minMax()
    return Math.max(min, Math.min(max, value))
  }

  start () {
    if (this.connected) return
    this.connected = true
    this.sendAllParams()
    this.startResendTimerIfNeeded()
    this.emitState()
  }

  stop () {
    this.stopResendTimer()
    this.connected = false
    this.emitState()
  }

  close () {
    this.stop()
    if (this.ownsClient) this.client.close()
  }

  setScale (value) {
    this.currentScale = this.clampScale(value)
    if (this.connected) this.sendAllParams()
    this.emitState()
  }

  applyScaleDelta (dir) {
    const t = Math.max(0, Math.min(1, this.smoothing / 100))
    const step = (0.05 * (1 - t) + 0.001 * t) * dir
    this.setScale(this.currentScale + step)
  }

  setUseSafety (on) {
    this.useSafety = !!on
    this.setScale(this.currentScale) // re-clamp under the new bounds
  }

  setSaveScaleBetweenWorlds (on) {
    this.saveScaleBetweenWorlds = !!on
    this.startResendTimerIfNeeded()
  }

  setSmoothing (value) {
    if (Number.isFinite(value)) this.smoothing = value
  }

  // Feed incoming OSC messages here (subscribe via oscModule.addOscListener).
  // Keeps currentScale in sync with in-game radial-menu changes.
  handleOscInput (address, args = []) {
    if (address !== EYEHEIGHT_PATH) return
    const value = args[0]
    if (typeof value !== 'number') return
    const clamped = this.clampScale(value)
    if (Math.abs(clamped - this.currentScale) < 0.0001) return
    this.currentScale = clamped
    this.emitState()
  }

  startResendTimerIfNeeded () {
    this.stopResendTimer()
    if (this.connected && this.saveScaleBetweenWorlds) {
      this.resendTimer = setInterval(() => { if (this.connected) this.sendAllParams() }, this.config.resendIntervalMs)
    }
  }

  stopResendTimer () {
    if (this.resendTimer) { clearInterval(this.resendTimer); this.resendTimer = null }
  }

  sendAllParams () {
    const { min, max } = this.minMax()
    this.sendBool(EYEHEIGHT_ALLOWED_PATH, true)
    this.sendFloat(EYEHEIGHT_PATH, this.currentScale)
    this.sendFloat(EYEHEIGHT_MIN_PATH, min)
    this.sendFloat(EYEHEIGHT_MAX_PATH, max)
  }

  sendFloat (address, value) {
    this.sendOsc(address, [{ type: 'float', value }])
  }

  sendBool (address, value) {
    this.sendOsc(address, [{ type: 'bool', value }])
  }

  sendOsc (address, args) {
    const message = createOscMessage(address, args)
    this.client.send(message, this.oscPort, this.oscIp, error => {
      if (error && typeof this.onError === 'function') this.onError(error)
    })
  }

  emitState () {
    if (typeof this.onStatus === 'function') {
      this.onStatus({
        connected: this.connected,
        scale: this.currentScale,
        useSafety: this.useSafety,
        saveScaleBetweenWorlds: this.saveScaleBetweenWorlds,
        smoothing: this.smoothing
      })
    }
  }
}

module.exports = { AvatarScalingController, EYEHEIGHT_PATH, SAFETY_MIN, SAFETY_MAX, UNSAFE_MIN, UNSAFE_MAX }

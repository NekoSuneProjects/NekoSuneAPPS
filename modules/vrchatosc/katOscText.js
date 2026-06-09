const dgram = require('dgram')

const DEFAULT_CONFIG = {
  oscIp: '127.0.0.1',
  oscPort: 9000,
  oscDelayMs: 250,
  syncParams: 0,
  fallbackSyncParams: 4,
  syncParamsMax: 16,
  lineLength: 32,
  lineCount: 4,
  visibleRefreshMs: 3000,
  parameterPrefix: '/avatar/parameters/',
  avatarChangePath: '/avatar/change',
  paramVisible: 'KAT_Visible',
  paramPointer: 'KAT_Pointer',
  paramSync: 'KAT_CharSync'
}

function encodeOscString (value) {
  const data = Buffer.from(`${value}\0`, 'utf8')
  const padding = (4 - (data.length % 4)) % 4
  return Buffer.concat([data, Buffer.alloc(padding)])
}

function createOscMessage (address, args = []) {
  const payloads = []
  let typeTags = ','

  args.forEach(arg => {
    switch (arg.type) {
      case 'bool':
        typeTags += arg.value ? 'T' : 'F'
        break
      case 'int': {
        const payload = Buffer.alloc(4)
        payload.writeInt32BE(arg.value, 0)
        payloads.push(payload)
        typeTags += 'i'
        break
      }
      case 'float': {
        const payload = Buffer.alloc(4)
        payload.writeFloatBE(arg.value, 0)
        payloads.push(payload)
        typeTags += 'f'
        break
      }
      case 'string':
        payloads.push(encodeOscString(arg.value))
        typeTags += 's'
        break
      default:
        throw new Error(`Unsupported OSC argument type: ${arg.type}`)
    }
  })

  return Buffer.concat([
    encodeOscString(address),
    encodeOscString(typeTags),
    ...payloads
  ])
}

function toKatCharValue (char) {
  const code = char.charCodeAt(0)

  if (code >= 32 && code <= 126) {
    return code - 32
  }

  return 31
}

function toKatFloatValue (char) {
  let value = toKatCharValue(char)
  if (value > 127.5) value -= 256
  return value / 127
}

function normalizeKatText (text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\x20-\x7E\n]/g, '?')
}

function getPaddedLength (text, lineLength) {
  return Math.max(Math.ceil(text.length / lineLength), 1) * lineLength
}

function prepareKatText (text, lineLength, textLength) {
  const normalized = normalizeKatText(text)
  const lines = normalized.split('\n')
  const paddedLines = lines.map(line => line.padEnd(getPaddedLength(line, lineLength)))
  return paddedLines.join('').slice(0, textLength).padEnd(textLength)
}

class KatOscText {
  constructor (config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.oscIp = this.config.oscIp
    this.oscPort = this.config.oscPort
    this.textLength = this.config.lineLength * this.config.lineCount
    this.autoDetect = this.config.syncParams === 0
    this.syncParams = this.config.syncParams
    this.syncParamsLast = this.config.fallbackSyncParams
    this.detectedSyncParams = 0
    this.pointerCount = this.getPointerCount()
    this.pointerClear = 255
    this.pointerIndexResync = 0
    this.syncParamsTestValue = 97 / 127
    this.targetText = ''
    this.oscText = ''.padEnd(this.textLength)
    this.testStep = 0
    this.timer = null
    this.running = false
    this.visible = false
    this.lastVisibleSendAt = 0
    this.cleared = true
    this.client = this.config.client || dgram.createSocket('udp4')
    this.ownsClient = !this.config.client
    this.onStatus = null
    this.onError = null
  }

  start () {
    if (this.running) return

    this.running = true
    this.clear(true)
    this.hide(true)

    if (this.autoDetect) {
      this.requestAutoDetect()
    } else {
      this.emitStatus(`KAT sync params: ${this.syncParams}`)
    }

    this.timer = setInterval(() => this.tick(), this.config.oscDelayMs)
    this.tick()
  }

  stop () {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    this.clear()
    this.hide()
    this.running = false
    this.emitStatus('KAT output is off')
  }

  close () {
    this.stop()
    if (this.ownsClient) {
      this.client.close()
    }
  }

  setText (text) {
    this.targetText = normalizeKatText(text).slice(0, this.textLength)
  }

  setOscPort (port) {
    if (Number.isFinite(port)) {
      this.oscPort = port
    }
  }

  setSyncParams (syncParams) {
    if (syncParams === 0) {
      this.autoDetect = true
      this.requestAutoDetect()
      return
    }

    this.autoDetect = false
    this.syncParams = Math.max(1, Math.min(this.config.syncParamsMax, syncParams))
    this.syncParamsLast = this.syncParams
    this.pointerCount = this.getPointerCount()
    this.oscText = ''.padEnd(this.textLength)
    this.resetSyncParams()
    this.emitStatus(`KAT sync params: ${this.syncParams}`)
  }

  handleOscInput (address, args = []) {
    if (typeof address !== 'string') return

    if (address.startsWith(this.config.avatarChangePath)) {
      this.handleAvatarReset()
      return
    }

    const visiblePath = this.config.parameterPrefix + this.config.paramVisible
    if (address === visiblePath) {
      this.handleVisibleInput(args[0])
      return
    }

    if (this.testStep <= 0) return

    const syncPath = this.config.parameterPrefix + this.config.paramSync
    if (!address.startsWith(syncPath)) return

    const index = Number.parseInt(address.slice(syncPath.length), 10)
    if (!Number.isInteger(index) || index < 0) return

    this.detectedSyncParams = Math.max(
      this.detectedSyncParams,
      Math.min(index + 1, this.config.syncParamsMax)
    )
  }

  requestAutoDetect () {
    if (!this.autoDetect && this.config.syncParams !== 0) return

    this.autoDetect = true
    this.syncParams = 0
    this.detectedSyncParams = 0
    this.testStep = 1
    this.emitStatus('KAT detecting sync params...')
  }

  handleAvatarReset () {
    this.visible = false
    this.lastVisibleSendAt = 0
    this.cleared = true
    this.oscText = ''.padEnd(this.textLength)

    if (this.autoDetect || this.config.syncParams === 0) {
      this.requestAutoDetect()
    }
  }

  handleVisibleInput (value) {
    if (value === true) {
      this.visible = true
      this.lastVisibleSendAt = Date.now()
      return
    }

    if (value !== false) return

    this.visible = false
    this.lastVisibleSendAt = 0

    if (this.hasTargetText()) {
      this.emitStatus('KAT was hidden by VRChat; restoring...')
    }
  }

  tick () {
    if (!this.running) return

    if (this.testStep > 0) {
      this.runAutoDetectStep()
      return
    }

    if (this.syncParams <= 0) return

    const guiText = prepareKatText(this.targetText, this.config.lineLength, this.textLength)

    if (guiText.trim() === '') {
      this.clear()
      this.hide()
      return
    }

    this.show()

    const oscText = this.oscText.padEnd(this.textLength)
    const oscChars = [...oscText]

    if (guiText !== oscText) {
      for (let pointerIndex = 0; pointerIndex < this.pointerCount; pointerIndex++) {
        if (!this.pointerTextMatches(pointerIndex, guiText, oscText)) {
          this.updatePointer(pointerIndex, guiText, oscChars)
          return
        }
      }
    }

    this.pointerIndexResync = (this.pointerIndexResync + 1) % this.pointerCount
    this.updatePointer(this.pointerIndexResync, guiText, oscChars)
  }

  runAutoDetectStep () {
    this.sendPointer(this.pointerClear)

    if (this.testStep === 1) {
      this.syncParams = 0
      this.detectedSyncParams = 0
      this.resetSyncParams()
      this.testStep = 2
      return
    }

    if (this.testStep === 2) {
      for (let i = 0; i < this.config.syncParamsMax; i++) {
        this.sendSyncParam(i, this.syncParamsTestValue)
      }
      this.testStep = 3
      return
    }

    if (this.testStep === 3) {
      this.resetSyncParams()
      this.testStep = 4
      return
    }

    if (this.testStep === 4) {
      this.syncParams = this.detectedSyncParams || this.syncParamsLast
      this.syncParamsLast = this.syncParams
      this.pointerCount = this.getPointerCount()
      this.oscText = ''.padEnd(this.textLength)
      this.testStep = 0
      this.emitStatus(`KAT sync params: ${this.syncParams}`)
    }
  }

  pointerTextMatches (pointerIndex, guiText, oscText) {
    for (let charIndex = 0; charIndex < this.syncParams; charIndex++) {
      const index = (pointerIndex * this.syncParams) + charIndex
      if (guiText[index] !== oscText[index]) return false
    }

    return true
  }

  updatePointer (pointerIndex, guiText, oscChars) {
    this.sendPointer(pointerIndex + 1)
    this.cleared = false

    for (let charIndex = 0; charIndex < this.syncParams; charIndex++) {
      const index = (pointerIndex * this.syncParams) + charIndex
      const char = guiText[index] || ' '
      this.sendSyncParam(charIndex, toKatFloatValue(char))
      oscChars[index] = char
    }

    this.oscText = oscChars.join('')
  }

  clear (force = false) {
    if (!force && this.cleared) return

    this.sendPointer(this.pointerClear)
    this.oscText = ''.padEnd(this.textLength)
    this.cleared = true
  }

  resetSyncParams () {
    for (let i = 0; i < this.config.syncParamsMax; i++) {
      this.sendSyncParam(i, 0)
    }
  }

  show (force = false) {
    const now = Date.now()
    const recentlySent = now - this.lastVisibleSendAt < this.config.visibleRefreshMs

    if (!force && this.visible && recentlySent) return

    this.sendParameter(this.config.paramVisible, [{ type: 'bool', value: true }])
    this.visible = true
    this.lastVisibleSendAt = now
  }

  hide (force = false) {
    if (!force && !this.visible) return

    this.sendParameter(this.config.paramVisible, [{ type: 'bool', value: false }])
    this.visible = false
    this.lastVisibleSendAt = 0
  }

  sendPointer (value) {
    this.sendParameter(this.config.paramPointer, [{ type: 'int', value }])
  }

  sendSyncParam (index, value) {
    this.sendParameter(`${this.config.paramSync}${index}`, [{ type: 'float', value }])
  }

  sendParameter (name, args) {
    this.sendOsc(this.config.parameterPrefix + name, args)
  }

  sendOsc (address, args) {
    const message = createOscMessage(address, args)
    this.client.send(message, this.oscPort, this.oscIp, error => {
      if (error && typeof this.onError === 'function') {
        this.onError(error)
      }
    })
  }

  hasTargetText () {
    return normalizeKatText(this.targetText).trim() !== ''
  }

  getPointerCount () {
    const syncParams = this.syncParams || this.syncParamsLast || 1
    return Math.max(1, Math.floor(this.textLength / syncParams))
  }

  emitStatus (message) {
    if (typeof this.onStatus === 'function') {
      this.onStatus(message)
    }
  }
}

module.exports = {
  KatOscText,
  createOscMessage,
  prepareKatText,
  toKatFloatValue
}

const dgram = require('dgram')

const oscClient = dgram.createSocket('udp4')
const oscListeners = new Set()
const OSC_MAX_LEVEL = 0.92

let oscPort = 9000
let oscReceiver = null
let oscReceiveEnabled = false
let receiverPort = 9001
let oscIncomingCallback = null

const OSC_PATHS = {
  low: '/avatar/parameters/VRCOSC/NekoSuneApps/Audiolink/Low',
  bass: '/avatar/parameters/VRCOSC/NekoSuneApps/Audiolink/Bass',
  mid: '/avatar/parameters/VRCOSC/NekoSuneApps/Audiolink/Mid',
  treble: '/avatar/parameters/VRCOSC/NekoSuneApps/Audiolink/Treble',
  volume: '/avatar/parameters/VRCOSC/NekoSuneApps/Audiolink/Volume',
  peak: '/avatar/parameters/VRCOSC/NekoSuneApps/Audiolink/Peak',
  beat: '/avatar/parameters/VRCOSC/NekoSuneApps/Audiolink/Beat'
}

const CHATBOX_INPUT_PATH = '/chatbox/input'

function setOscPort (port) {
  oscPort = port
}

function setOscReceiverPort (port) {
  if (!Number.isFinite(port) || receiverPort === port) return

  receiverPort = port
  if (oscReceiver) {
    closeOscReceiver()
    ensureOscReceiver()
  }
}

function sendOsc (levels) {
  const volume = levels.reduce((a, b) => a + b, 0) / levels.length
  const peak = Math.max(...levels)

  const values = [levels[0], levels[1], levels[2], levels[3], volume, peak].map(clampOscLevel)
  const paths = [
    OSC_PATHS.low,
    OSC_PATHS.bass,
    OSC_PATHS.mid,
    OSC_PATHS.treble,
    OSC_PATHS.volume,
    OSC_PATHS.peak
  ]

  values.forEach((val, i) => {
    const buffer = createOscMessage(paths[i], val)
    oscClient.send(buffer, oscPort, '127.0.0.1', error => {
      if (error) console.error('OSC Error:', error)
    })
  })
}

function sendBeat (value) {
  const buffer = createOscMessage(OSC_PATHS.beat, value)
  oscClient.send(buffer, oscPort, '127.0.0.1', error => {
    if (error) console.error('OSC Beat Error:', error)
  })
}

function sendChatboxMessage (message, notify = false) {
  // send=true bypasses the VRChat keyboard; notify=false avoids the chat SFX.
  const buffer = createChatboxMessage(String(message || '').slice(0, 144), true, notify)
  oscClient.send(buffer, oscPort, '127.0.0.1', error => {
    if (error) console.error('OSC Chatbox Error:', error)
  })
}

function clampOscLevel (value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(OSC_MAX_LEVEL, value))
}

function startOscReceiver (port, onIncoming) {
  if (typeof port === 'number') {
    setOscReceiverPort(port)
  }

  oscIncomingCallback = onIncoming
  oscReceiveEnabled = true
  ensureOscReceiver()
}

function stopOscReceiver () {
  oscIncomingCallback = null
  oscReceiveEnabled = false
  closeOscReceiverIfIdle()
}

function addOscListener (listener, port) {
  if (typeof listener !== 'function') {
    throw new TypeError('OSC listener must be a function')
  }

  if (typeof port === 'number') {
    setOscReceiverPort(port)
  }

  oscListeners.add(listener)
  ensureOscReceiver()

  return () => {
    oscListeners.delete(listener)
    closeOscReceiverIfIdle()
  }
}

function ensureOscReceiver () {
  if (oscReceiver) return

  oscReceiver = dgram.createSocket('udp4')
  oscReceiver.on('error', err => {
    console.error('OSC Receiver Error:', err)
  })

  oscReceiver.on('message', (msg, rinfo) => {
    try {
      const packet = parseOscMessage(msg)
      if (!packet || !packet.address) return

      if (typeof oscIncomingCallback === 'function') {
        oscIncomingCallback(packet.address, packet.args || [])
      }

      oscListeners.forEach(listener => {
        listener(packet.address, packet.args || [], rinfo)
      })
    } catch (err) {
      console.warn('Unable to parse incoming OSC packet:', err)
    }
  })

  oscReceiver.bind(receiverPort, '0.0.0.0', () => {
    console.log(`OSC receiver listening on port ${receiverPort}`)
    if (typeof oscIncomingCallback === 'function') {
      oscIncomingCallback('/_status', [`Receiver listening on ${receiverPort}`])
    }
  })
}

function closeOscReceiverIfIdle () {
  if (!oscReceiveEnabled && oscListeners.size === 0) {
    closeOscReceiver()
  }
}

function closeOscReceiver () {
  if (!oscReceiver) return

  oscReceiver.close()
  oscReceiver = null
}

function align4 (value) {
  return (value + 3) & ~3
}

function readOscString (buffer, offset) {
  let end = offset
  while (end < buffer.length && buffer[end] !== 0) end++
  const str = buffer.toString('utf8', offset, end)
  return { str, next: align4(end + 1) }
}

function parseOscMessage (buffer) {
  const addressData = readOscString(buffer, 0)
  if (!addressData.str) return null

  const typeData = readOscString(buffer, addressData.next)
  if (!typeData.str || !typeData.str.startsWith(',')) {
    return { address: addressData.str, args: [] }
  }

  const args = []
  let offset = typeData.next

  for (let i = 1; i < typeData.str.length; i++) {
    const type = typeData.str[i]
    switch (type) {
      case 'f':
        args.push(buffer.readFloatBE(offset))
        offset += 4
        break
      case 'i':
        args.push(buffer.readInt32BE(offset))
        offset += 4
        break
      case 's': {
        const stringData = readOscString(buffer, offset)
        args.push(stringData.str)
        offset = stringData.next
        break
      }
      case 'T':
        args.push(true)
        break
      case 'F':
        args.push(false)
        break
      default:
        return { address: addressData.str, args }
    }
  }

  return { address: addressData.str, args }
}

function createOscMessage (address, value) {
  const addressBuffer = encodeOscString(address)
  const typeTag = encodeOscString(',f')
  const floatBuffer = Buffer.alloc(4)
  floatBuffer.writeFloatBE(value, 0)
  return Buffer.concat([addressBuffer, typeTag, floatBuffer])
}

function createChatboxMessage (message, send, notify) {
  return Buffer.concat([
    encodeOscString(CHATBOX_INPUT_PATH),
    encodeOscString(`,s${send ? 'T' : 'F'}${notify ? 'T' : 'F'}`),
    encodeOscString(message)
  ])
}

function encodeOscString (value) {
  const data = Buffer.from(`${value}\0`, 'utf8')
  const padding = (4 - (data.length % 4)) % 4
  return Buffer.concat([data, Buffer.alloc(padding)])
}

module.exports = {
  setOscPort,
  setOscReceiverPort,
  sendOsc,
  sendBeat,
  sendChatboxMessage,
  startOscReceiver,
  stopOscReceiver,
  addOscListener,
  parseOscMessage,
  OSC_PATHS,
  CHATBOX_INPUT_PATH
}

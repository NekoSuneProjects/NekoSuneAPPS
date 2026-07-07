// modules/vrchat/osc/oscEncode.js
// Shared raw OSC packet encoding, used by any controller that talks OSC
// directly over dgram (katOscText.js, avatarScaling.js) without pulling in
// the full oscModule.js pipeline.

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

// Decode a single incoming OSC message buffer into { address, args }.
// args are float/int/bool values in type-tag order (string args are skipped
// back as raw strings). Used by avatarScaling.js to read VRChat's
// /avatar/eyeheight echo without needing a full OSC library.
function decodeOscMessage (data) {
  let pos = 0

  const readString = () => {
    const start = pos
    while (pos < data.length && data[pos] !== 0) pos++
    const s = data.toString('utf8', start, pos)
    pos++
    const pad = (4 - (pos % 4)) % 4
    pos += pad
    return s
  }

  const address = readString()
  const typeTags = readString()
  const args = []

  for (let i = 1; i < typeTags.length; i++) {
    const tag = typeTags[i]
    if (tag === 'f') {
      args.push(data.readFloatBE(pos))
      pos += 4
    } else if (tag === 'i') {
      args.push(data.readInt32BE(pos))
      pos += 4
    } else if (tag === 'T') {
      args.push(true)
    } else if (tag === 'F') {
      args.push(false)
    } else if (tag === 's') {
      args.push(readString())
    }
  }

  return { address, args }
}

module.exports = { encodeOscString, createOscMessage, decodeOscMessage }

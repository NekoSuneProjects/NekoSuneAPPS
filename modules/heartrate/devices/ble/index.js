'use strict'

// Adapter registry and normalized BLE BPM relay. Device-specific protocol code
// lives in ./platforms so adding a watch does not grow this core file.

const builtInPlatforms = require('./platforms')

const platforms = new Map()

function registerBleHeartRatePlatform (platform) {
  if (!platform || typeof platform !== 'object') throw new TypeError('BLE heart-rate platform must be an object')
  if (!platform.id || typeof platform.id !== 'string') throw new TypeError('BLE heart-rate platform requires a string id')
  if (typeof platform.parseMeasurement !== 'function') throw new TypeError(`BLE heart-rate platform ${platform.id} requires parseMeasurement()`)
  if (platforms.has(platform.id)) throw new Error(`BLE heart-rate platform already registered: ${platform.id}`)
  platforms.set(platform.id, Object.freeze(platform))
  return platform
}

function getBleHeartRatePlatform (id) {
  return platforms.get(id) || null
}

function getBleHeartRatePlatforms () {
  return Array.from(platforms.values())
}

function getBleHeartRateOptionalServices () {
  return [...new Set(getBleHeartRatePlatforms().flatMap(platform => platform.optionalServices || [platform.serviceUuid]).filter(Boolean))]
}

function findBleHeartRatePlatform (device = {}) {
  // Proprietary adapters are checked first; the standard adapter is the fallback.
  const ordered = getBleHeartRatePlatforms().sort((a, b) => Number(a.id === 'standard') - Number(b.id === 'standard'))
  return ordered.find(platform => typeof platform.matchesDevice === 'function' && platform.matchesDevice(device)) || null
}

function parseBleHeartRateMeasurement (platformId, value) {
  const platform = getBleHeartRatePlatform(platformId)
  return platform ? platform.parseMeasurement(value) : 0
}

function createBleHeartRateRelay (onReading) {
  if (typeof onReading !== 'function') throw new TypeError('BLE heart-rate relay requires an onReading callback')
  return (platformId, value, metadata = {}) => {
    const bpm = parseBleHeartRateMeasurement(platformId, value)
    if (bpm) onReading({ bpm, platformId, receivedAt: Date.now(), ...metadata })
    return bpm
  }
}

for (const platform of builtInPlatforms) registerBleHeartRatePlatform(platform)

module.exports = {
  registerBleHeartRatePlatform,
  getBleHeartRatePlatform,
  getBleHeartRatePlatforms,
  getBleHeartRateOptionalServices,
  findBleHeartRatePlatform,
  parseBleHeartRateMeasurement,
  createBleHeartRateRelay
}

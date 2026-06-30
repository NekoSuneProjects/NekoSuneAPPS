'use strict'

// Bluetooth SIG Heart Rate Service adapter. This covers chest straps, armbands,
// watches, and other devices that implement the public 0x180D/0x2A37 profile.

function parseMeasurement (value) {
  if (!value || typeof value.getUint8 !== 'function' || value.byteLength < 2) return 0
  const flags = value.getUint8(0)
  const isUint16 = !!(flags & 0x01)
  if (isUint16 && value.byteLength < 3) return 0
  const bpm = isUint16 ? value.getUint16(1, true) : value.getUint8(1)
  return bpm > 0 && bpm <= 300 ? bpm : 0
}

module.exports = {
  id: 'standard',
  displayName: 'Bluetooth SIG Heart Rate',
  protocol: 'standard',
  serviceUuid: 'heart_rate',
  notifyCharacteristicUuid: 'heart_rate_measurement',
  optionalServices: ['heart_rate'],
  parseMeasurement,
  matchesDevice ({ serviceUuid } = {}) {
    return serviceUuid === 'heart_rate' || String(serviceUuid || '').toLowerCase() === '0000180d-0000-1000-8000-00805f9b34fb'
  }
}

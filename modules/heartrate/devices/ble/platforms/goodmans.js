'use strict'

// Goodmans 364134 / GMANS WATCH proprietary FunDo/KCT BLE protocol adapter.

const SERVICE_UUID = 'c3e6fea0-e966-1000-8000-be99c223df6a'
const WRITE_CHARACTERISTIC_UUID = 'c3e6fea1-e966-1000-8000-be99c223df6a'
const NOTIFY_CHARACTERISTIC_UUID = 'c3e6fea2-e966-1000-8000-be99c223df6a'
const START_HEART_RATE = Uint8Array.from([0xba, 0x20, 0x00, 0x06, 0x00, 0x3d, 0x00, 0x01, 0x0a, 0x00, 0xa6, 0x00, 0x01, 0x03])

// Captured connect-time FF00 session handshake. It is retained only as an
// experimental fallback because its payload changes between sessions.
const BACKGROUND_HANDSHAKE = Uint8Array.from(Buffer.from(
  'ba20002500ab0000ff0000002057787bef07acaf986dad8e74d16d2d2d11f1b95ab5e74835706c47831a2c56cc',
  'hex'
))

// FunDo/KCT outer frame + CRC-8/ROHC checksum.
function buildCommand (command, key, payload = [], sequence = 0) {
  const data = Uint8Array.from(payload)
  const inner = Uint8Array.from([
    command & 0xff,
    0,
    key & 0xff,
    (data.length >> 8) & 1,
    data.length & 0xff,
    ...data
  ])
  let checksum = 0xff
  for (const byte of inner) {
    checksum ^= byte
    for (let bit = 0; bit < 8; bit++) checksum = (checksum & 1) ? ((checksum >> 1) ^ 0xb8) : (checksum >> 1)
  }
  return Uint8Array.from([
    0xba,
    0x20,
    (inner.length >> 8) & 0xff,
    inner.length & 0xff,
    0,
    checksum & 0xff,
    (sequence >> 8) & 0xff,
    sequence & 0xff,
    ...inner
  ])
}

// Firmware-side scheduled measurement recovered from Goodmans Fit Pro's
// setAutoHeartData implementation (command 09/92).
function buildAutomaticHeartRateCommand ({ enabled = true, startHour = 0, startMinute = 0, endHour = 23, endMinute = 59, intervalMinutes = 5, sequence = 2 } = {}) {
  const byte = (value, min, max) => Math.max(min, Math.min(max, Math.trunc(Number(value) || 0)))
  return buildCommand(0x09, 0x92, [
    enabled ? 1 : 0,
    byte(startHour, 0, 23),
    byte(startMinute, 0, 59),
    byte(endHour, 0, 23),
    byte(endMinute, 0, 59),
    byte(intervalMinutes, 1, 255)
  ], sequence)
}

// Watch -> app: ba 30 ... 0a 00 ab 00 01 <BPM>
function parseMeasurement (value) {
  if (!value || typeof value.getUint8 !== 'function' || value.byteLength < 14) return 0
  if (value.getUint8(0) !== 0xba) return 0
  const command = value.getUint16(8, true)
  const subcommand = value.getUint16(10, true)
  if (command !== 0x000a || subcommand !== 0x00ab) return 0
  const bpm = value.getUint8(13)
  return bpm > 0 && bpm <= 300 ? bpm : 0
}

module.exports = {
  id: 'goodmans',
  displayName: 'Goodmans / GMANS WATCH',
  protocol: 'gmans',
  serviceUuid: SERVICE_UUID,
  writeCharacteristicUuid: WRITE_CHARACTERISTIC_UUID,
  notifyCharacteristicUuid: NOTIFY_CHARACTERISTIC_UUID,
  optionalServices: [SERVICE_UUID],
  startHeartRateCommand: START_HEART_RATE,
  backgroundHandshake: BACKGROUND_HANDSHAKE,
  parseMeasurement,
  buildCommand,
  buildAutomaticHeartRateCommand,
  matchesDevice ({ name, serviceUuid } = {}) {
    return /^GMANS WATCH$/i.test(String(name || '').trim()) || String(serviceUuid || '').toLowerCase() === SERVICE_UUID
  }
}

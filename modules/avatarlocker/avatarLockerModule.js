'use strict'

const { app, safeStorage } = require('electron')
const { createHash, createCipheriv, createDecipheriv, generateKeyPairSync, randomBytes, sign, verify } = require('crypto')
const dgram = require('dgram')
const fs = require('fs')
const os = require('os')
const path = require('path')

const APP_NAME = 'NekoAvatarLocker'
const SCHEMA_VERSION = 1
const VAULT_FILE = 'avatar-locker-vault.nal'
const FALLBACK_PREFIX = 'nal-fallback:'
const OSC_PARAMETERS = {
  unlocked: '/avatar/parameters/NAL_Unlocked',
  avatarIdHash: '/avatar/parameters/NAL_AvatarIdHash',
  avatarHashParts: ['/avatar/parameters/NAL_HashA', '/avatar/parameters/NAL_HashB', '/avatar/parameters/NAL_HashC', '/avatar/parameters/NAL_HashD', '/avatar/parameters/NAL_HashE'],
  lockMode: '/avatar/parameters/NAL_LockMode'
}

function isoNow () { return new Date().toISOString() }

function sortCanonical (value) {
  if (Array.isArray(value)) return value.map(sortCanonical)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = sortCanonical(value[key])
    return result
  }, {})
}

function canonicalJson (value) { return JSON.stringify(sortCanonical(value)) }

function assertOwnershipPackage (value) {
  if (!value || typeof value !== 'object') throw new Error('Ownership package must be an object.')
  if (value.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported ownership schema version: ${value.schemaVersion}.`)
  if (!value.packageId || typeof value.packageId !== 'string') throw new Error('Ownership package is missing packageId.')
  if (!value.creatorPublicKeyPem || typeof value.creatorPublicKeyPem !== 'string') throw new Error('Ownership package is missing creatorPublicKeyPem.')
  if (!value.signatureBase64 || typeof value.signatureBase64 !== 'string') throw new Error('Ownership package is missing signatureBase64.')
  const license = value.license
  if (!license || typeof license !== 'object') throw new Error('Ownership package is missing its license.')
  for (const key of ['avatarId', 'avatarName', 'creatorId', 'creatorDisplayName', 'issuedAt']) {
    if (!license[key] || typeof license[key] !== 'string') throw new Error(`License is missing ${key}.`)
  }
  if (!Array.isArray(license.lockGroups)) throw new Error('License lockGroups must be an array.')
  if (!Array.isArray(license.allowedDeviceIds) || !Array.isArray(license.revokedDeviceIds)) throw new Error('License device lists must be arrays.')
  for (const group of license.lockGroups) {
    if (!group?.id || !group.displayName || !group.oscParameter) throw new Error('Each lock group requires id, displayName, and oscParameter.')
    validateOscAddress(group.oscParameter)
  }
  return value
}

function unsignedOwnershipPayload (pkg) {
  return { schemaVersion: pkg.schemaVersion, packageId: pkg.packageId, license: pkg.license }
}

function verifyOwnershipPackage (pkg) {
  assertOwnershipPackage(pkg)
  if (pkg.creatorPublicKeyPem.includes('replace_with_') || pkg.signatureBase64.includes('replace_with_')) return false
  return verify(null, Buffer.from(canonicalJson(unsignedOwnershipPayload(pkg)), 'utf8'), pkg.creatorPublicKeyPem, Buffer.from(pkg.signatureBase64, 'base64'))
}

function avatarHashParts (avatarId, creatorId, avatarName, unlockSecret = '') {
  const hash = createHash('sha256').update(`${avatarId}|${creatorId}|${avatarName}|${unlockSecret}|NekoAvatarLocker`).digest()
  return [hash[0], hash[7], hash[13], hash[19], hash[31]]
}

function avatarShortHash (avatarId) { return avatarHashParts(avatarId, '', '')[0] }

function vaultPath () { return path.join(app.getPath('userData'), VAULT_FILE) }

function fallbackKey (name = APP_NAME) {
  return createHash('sha256').update(`${name}:${os.hostname()}:${os.userInfo().username}:${app.getPath('home')}`).digest()
}

function encryptVault (json) {
  if (safeStorage.isEncryptionAvailable()) return safeStorage.encryptString(json)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', fallbackKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  return Buffer.concat([Buffer.from(FALLBACK_PREFIX), iv, cipher.getAuthTag(), ciphertext])
}

function decryptVault (data, fallbackName = APP_NAME) {
  if (!data.toString('utf8', 0, FALLBACK_PREFIX.length).startsWith(FALLBACK_PREFIX)) return safeStorage.decryptString(data)
  const offset = Buffer.byteLength(FALLBACK_PREFIX)
  const decipher = createDecipheriv('aes-256-gcm', fallbackKey(fallbackName), data.subarray(offset, offset + 12))
  decipher.setAuthTag(data.subarray(offset + 12, offset + 28))
  return Buffer.concat([decipher.update(data.subarray(offset + 28)), decipher.final()]).toString('utf8')
}

function createEmptyVault () {
  const now = isoNow()
  return {
    metadata: { appName: APP_NAME, vaultVersion: 1, createdAt: now, updatedAt: now },
    deviceId: `device_${randomBytes(16).toString('hex')}`,
    oscSettings: { host: '127.0.0.1', port: 9000, sendIntervalMs: 40 },
    avatars: []
  }
}

function normalizeVault (vault) {
  if (!vault || typeof vault !== 'object') throw new Error('Avatar Locker vault is invalid.')
  vault.metadata ||= createEmptyVault().metadata
  vault.deviceId ||= `device_${randomBytes(16).toString('hex')}`
  vault.oscSettings = { host: '127.0.0.1', port: 9000, sendIntervalMs: 40, ...(vault.oscSettings || {}) }
  vault.avatars = Array.isArray(vault.avatars) ? vault.avatars : []
  return vault
}

function loadVault () {
  const file = vaultPath()
  if (!fs.existsSync(file)) {
    const vault = createEmptyVault()
    saveVault(vault)
    return vault
  }
  return normalizeVault(JSON.parse(decryptVault(fs.readFileSync(file))))
}

function saveVault (vault) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  vault.metadata.updatedAt = isoNow()
  fs.writeFileSync(vaultPath(), encryptVault(JSON.stringify(vault, null, 2)), { mode: 0o600 })
  return vault
}

function decodeNalown (value) {
  const trimmed = String(value || '').replace(/^\uFEFF/, '').trim()
  if (!trimmed.startsWith('NALOWN1:')) return trimmed
  const key = createHash('sha256').update('NekoAvatarLocker nalown pack v1').digest()
  const packed = Buffer.from(trimmed.slice('NALOWN1:'.length), 'base64url')
  const decoded = Buffer.alloc(packed.length)
  for (let index = 0; index < packed.length; index++) decoded[index] = packed[index] ^ key[(index * 32) % key.length]
  return decoded.toString('utf8')
}

function encodeNalown (json) {
  const key = createHash('sha256').update('NekoAvatarLocker nalown pack v1').digest()
  const bytes = Buffer.from(json, 'utf8')
  const encoded = Buffer.alloc(bytes.length)
  for (let index = 0; index < bytes.length; index++) encoded[index] = bytes[index] ^ key[(index * 32) % key.length]
  return `NALOWN1:${encoded.toString('base64url')}`
}

function importOwnershipFile (filePath) {
  const pkg = assertOwnershipPackage(JSON.parse(decodeNalown(fs.readFileSync(filePath, 'utf8'))))
  if (!verifyOwnershipPackage(pkg)) throw new Error('Ownership package signature is invalid or the file is an unsigned template.')
  const vault = loadVault()
  const existing = vault.avatars.findIndex(record => record.ownershipPackage.license.avatarId === pkg.license.avatarId)
  if (existing >= 0) vault.avatars[existing].ownershipPackage = pkg
  else vault.avatars.push({ ownershipPackage: pkg, unlockMode: 'locked', groupIds: [] })
  return saveVault(vault)
}

function exportOwnershipFile (avatarId, filePath) {
  const vault = loadVault()
  const record = vault.avatars.find(item => item.ownershipPackage.license.avatarId === avatarId)
  if (!record) throw new Error(`Avatar not found: ${avatarId}`)
  fs.writeFileSync(filePath, encodeNalown(JSON.stringify(record.ownershipPackage)), { mode: 0o600 })
  return vault
}

function ensureCreatorKeys () {
  const folder = path.join(app.getPath('userData'), 'avatar-locker-creator-keys')
  const privateKeyPath = path.join(folder, 'creator.private.pem')
  const publicKeyPath = path.join(folder, 'creator.public.pem')
  fs.mkdirSync(folder, { recursive: true })
  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    fs.writeFileSync(privateKeyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), { mode: 0o600 })
    fs.writeFileSync(publicKeyPath, publicKey.export({ format: 'pem', type: 'spki' }).toString(), { mode: 0o600 })
  }
  return { folder, publicKeyPem: fs.readFileSync(publicKeyPath, 'utf8'), privateKeyPem: fs.readFileSync(privateKeyPath, 'utf8') }
}

function signOwnershipTemplate (inputPath) {
  const template = JSON.parse(decodeNalown(fs.readFileSync(inputPath, 'utf8')))
  if (!template?.license) throw new Error('Ownership template is missing its license.')
  const keys = ensureCreatorKeys()
  const payload = {
    schemaVersion: template.schemaVersion || SCHEMA_VERSION,
    packageId: template.packageId && !String(template.packageId).includes('replace_me') ? template.packageId : `own_${randomBytes(16).toString('hex')}`,
    license: { ...template.license, issuedAt: template.license.issuedAt || isoNow() }
  }
  const signed = { ...payload, creatorPublicKeyPem: keys.publicKeyPem, signatureBase64: sign(null, Buffer.from(canonicalJson(payload), 'utf8'), keys.privateKeyPem).toString('base64') }
  assertOwnershipPackage(signed)
  const parsed = path.parse(inputPath)
  const outputPath = path.join(parsed.dir, `${parsed.name.replace(/\.signed$/i, '')}.signed.nalown`)
  fs.writeFileSync(outputPath, encodeNalown(JSON.stringify(signed)), { mode: 0o600 })
  return {
    inputPath,
    outputPath,
    keyFolder: keys.folder,
    fileName: path.basename(outputPath),
    avatarName: signed.license.avatarName,
    avatarHashes: avatarHashParts(signed.license.avatarId, signed.license.creatorId, signed.license.avatarName, signed.license.metadata?.nalUnlockSecret || '')
  }
}

function updateOscSettings (updates) {
  const vault = loadVault()
  const host = String(updates?.host || vault.oscSettings.host).trim()
  const port = Math.trunc(Number(updates?.port || vault.oscSettings.port))
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('OSC host or port is invalid.')
  vault.oscSettings = { ...vault.oscSettings, host, port }
  return saveVault(vault)
}

function validateOscAddress (address) {
  if (typeof address !== 'string' || !address.startsWith('/') || address.includes(' ')) throw new Error(`Invalid OSC address: ${address}`)
}

function encodeOscString (value) {
  const raw = Buffer.from(`${value}\0`, 'utf8')
  return Buffer.concat([raw, Buffer.alloc((4 - (raw.length % 4)) % 4)])
}

function encodeOscMessage (address, value, type) {
  validateOscAddress(address)
  const addr = encodeOscString(address)
  if (type === 'bool') return Buffer.concat([addr, encodeOscString(value ? ',T' : ',F')])
  const data = Buffer.alloc(4)
  if (type === 'int') data.writeInt32BE(Math.trunc(Number(value)) || 0)
  else data.writeFloatBE(Number(value) || 0)
  return Buffer.concat([addr, encodeOscString(type === 'int' ? ',i' : ',f'), data])
}

async function sendOscMessages (settings, messages) {
  const socket = dgram.createSocket('udp4')
  try {
    for (const message of messages) {
      const packet = encodeOscMessage(message.address, message.value, message.type)
      await new Promise((resolve, reject) => socket.send(packet, settings.port, settings.host, error => error ? reject(error) : resolve()))
      if (settings.sendIntervalMs > 0) await new Promise(resolve => setTimeout(resolve, settings.sendIntervalMs))
    }
  } finally {
    socket.close()
  }
}

async function setUnlock (avatarId, mode, groupIds = []) {
  if (!['locked', 'partial', 'unlocked'].includes(mode)) throw new Error(`Invalid unlock mode: ${mode}`)
  const vault = loadVault()
  const record = vault.avatars.find(item => item.ownershipPackage.license.avatarId === avatarId)
  if (!record) throw new Error(`Avatar not found: ${avatarId}`)
  const groups = [...new Set(Array.isArray(groupIds) ? groupIds.map(String) : [])]
  record.unlockMode = mode
  record.groupIds = groups
  if (mode !== 'locked') record.lastUnlockedAt = isoNow()
  saveVault(vault)

  const license = record.ownershipPackage.license
  const hashes = avatarHashParts(license.avatarId, license.creatorId, license.avatarName, license.metadata?.nalUnlockSecret || '')
  const messages = [
    { address: OSC_PARAMETERS.unlocked, value: mode !== 'locked', type: 'bool' },
    { address: OSC_PARAMETERS.lockMode, value: mode === 'unlocked' ? 2 : mode === 'partial' ? 1 : 0, type: 'int' },
    { address: OSC_PARAMETERS.avatarIdHash, value: avatarShortHash(avatarId), type: 'int' },
    ...hashes.map((value, index) => ({ address: OSC_PARAMETERS.avatarHashParts[index], value, type: 'int' })),
    ...license.lockGroups.map(group => ({ address: group.oscParameter, value: mode === 'unlocked' || (mode === 'partial' && groups.includes(group.id)), type: 'bool' }))
  ]
  await sendOscMessages(vault.oscSettings, messages)
  return loadVault()
}

function resetVault () {
  const vault = loadVault()
  vault.avatars = []
  return saveVault(vault)
}

function findLegacyVaultPath () {
  const candidates = [
    path.join(app.getPath('appData'), 'NekoAvatarLocker', 'vault.nal'),
    path.join(app.getPath('appData'), 'neko-avatar-locker', 'vault.nal')
  ]
  return candidates.find(fs.existsSync) || null
}

function importLegacyVault () {
  const legacyPath = findLegacyVaultPath()
  if (!legacyPath) throw new Error('No existing NekoAvatarLocker vault was found in AppData.')
  const legacy = normalizeVault(JSON.parse(decryptVault(fs.readFileSync(legacyPath), APP_NAME)))
  const vault = loadVault()
  for (const record of legacy.avatars) {
    if (!record?.ownershipPackage || !verifyOwnershipPackage(record.ownershipPackage)) continue
    const index = vault.avatars.findIndex(item => item.ownershipPackage.license.avatarId === record.ownershipPackage.license.avatarId)
    if (index >= 0) vault.avatars[index] = record
    else vault.avatars.push(record)
  }
  return saveVault(vault)
}

module.exports = {
  getState: loadVault,
  importOwnershipFile,
  exportOwnershipFile,
  signOwnershipTemplate,
  setUnlock,
  updateOscSettings,
  resetVault,
  importLegacyVault,
  findLegacyVaultPath,
  getVaultFolder: () => app.getPath('userData'),
  _test: { canonicalJson, decodeNalown, encodeNalown, avatarHashParts, verifyOwnershipPackage, encodeOscMessage }
}

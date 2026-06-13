// modules/integrations/tonSaveReader.js
// REAL decoder for Terrors of Nowhere / SlenderFortress (tondev//finale) save codes,
// from the decompiled SlenderFortressSystem.cs save engine. Read-only — peels the
// four-layer obfuscation onion and parses the §2 byte schema into game state:
//
//   _convert(Lang->Base64) -> 8-char seed prefix -> unscramble (Unity xorshift128,
//   Range(0,n)=nextUInt()%n) -> base64->bytes -> checksum verify -> field schema.
//
// Validated against real saves (checksum == 0, achievements/stats decode exactly).
// Deterministic: NO bit-order guessing — the achievement state is read directly.
// Runs in the MAIN process. Pure JS, no dependencies.

// ---- Layer 1: the Lang <-> Base64 substitution alphabets ----
const H4 = []
for (let i = 0; i < 26; i++) H4.push(String.fromCharCode(65 + i)) // A-Z
for (let i = 0; i < 26; i++) H4.push(String.fromCharCode(97 + i)) // a-z
for (let i = 0; i < 10; i++) H4.push(String.fromCharCode(48 + i)) // 0-9
H4.push('+'); H4.push('/'); H4.push('=')
const LANG = ['6', '_8', '5', '92', '2', '12', ',', '9,', '4', '72', '7,', '98', '02', '89', '38', '84', '_9', '96', '07', '_5', '09', '91', '82', '0_', '81', '75', '85', '32', '19', '36', '35', '39', '_6', '15', '03', '01', '77', '88', '33', '37', '99', '1,', '0,', '11', '7_', '05', '94', '04', '8_', '8,', '08', '73', '_2', '79', '90', '18', '_0', '3,', '34', '31', '10', '16', '93', '70', '_3']

// Greedy array-order first-prefix match (the bijection is unambiguous).
function langToBase64 (msg) {
  let out = ''; let pos = 0
  while (pos < msg.length) {
    let hit = -1
    for (let i = 0; i < LANG.length; i++) { if (msg.startsWith(LANG[i], pos)) { hit = i; break } }
    if (hit < 0) return null
    out += H4[hit]; pos += LANG[hit].length
  }
  return out
}

// ---- Layer 3: Unity UnityEngine.Random (xorshift128). Range(0,n) == nextUInt() % n.
function makeRng (seed) {
  let s0 = seed >>> 0
  let s1 = (Math.imul(s0, 1812433253) + 1) >>> 0
  let s2 = (Math.imul(s1, 1812433253) + 1) >>> 0
  let s3 = (Math.imul(s2, 1812433253) + 1) >>> 0
  return {
    nextUInt () {
      let t = (s0 ^ (s0 << 11)) >>> 0
      s0 = s1; s1 = s2; s2 = s3
      s3 = (s3 ^ (s3 >>> 19) ^ (t ^ (t >>> 8))) >>> 0
      return s3
    }
  }
}
const mod = (n, m) => ((n % m) + m) % m
const SB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' // 65 chars

// ---- Layers 1-4: external string -> raw saveData bytes (+ seed, +checksum ok) ----
function toBytes (ext) {
  const clean = String(ext || '').trim().replace(/\[START\]|\[END\]/gi, '').replace(/\s+/g, '')
  const b64 = langToBase64(clean)
  if (!b64 || b64.length < 12) return { error: 'not a Lang save string' }
  const pb = Buffer.from(b64.slice(0, 8), 'base64')
  const seed = ((pb[2] << 24) | (pb[1] << 16) | (pb[3] << 8) | pb[0]) >>> 0
  const rng = makeRng(seed)
  let unscr = ''
  for (const c of b64.slice(8)) {
    const idx = SB.indexOf(c)
    if (idx < 0) return { error: 'bad scramble char' }
    unscr += SB[mod(idx - (rng.nextUInt() % 65), 65)]
  }
  const data = Buffer.from(unscr, 'base64')
  let sum = 0
  for (const b of data) sum = (sum + b) & 255
  return { seed, data, checksumOk: sum === 0 }
}

// ---- §2 byte schema ----
function bytesToInt (d, p) { return ((d[p + 2] << 24) | (d[p + 1] << 16) | (d[p + 3] << 8) | d[p]) | 0 }

// Decode a save string into game state. Returns { ok, ... } or { ok:false, error }.
function decode (ext) {
  const b = toBytes(ext)
  if (b.error) return { ok: false, error: b.error }
  const data = b.data
  // Locate body start: garbo is 1..10 bytes after the checksum byte; the typec
  // string ("T<n>...") follows. Pick the garbo length whose typec length is sane
  // and whose first char is 'T' (0x0054). Deterministic, no RNG needed.
  let garbo = -1; let start = -1
  for (let g = 1; g <= 10; g++) {
    const p = 1 + g
    const len = bytesToInt(data, p)
    if (len >= 3 && len <= 64 && data[p + 4] === 0 && data[p + 5] === 0x54) { garbo = g; start = p; break }
  }
  if (start < 0) return { ok: false, error: 'body start not found', checksumOk: b.checksumOk, seed: b.seed }

  let pos = start
  const readInt = () => { const v = bytesToInt(data, pos); pos += 4; return v }
  const readStr = () => { const len = readInt(); let s = ''; for (let i = 0; i < len; i++) { s += String.fromCharCode((data[pos] << 8) | data[pos + 1]); pos += 2 } return s }

  const typec = readStr()
  const isT3 = /^T3/.test(typec)
  const achCount = isT3 ? 128 : 200
  const hasColor = !isT3 // colorslider present on T4/T5/T1LOL
  const hasUnbound = !isT3 // survUnbound present on T4/T5/T1LOL

  if (hasColor) readStr() // colorslider
  readStr() // stag1
  const legit = readInt()
  readStr(); readStr(); readStr() // HasSurvived / Alt / Boss (packed)
  if (hasUnbound) readStr() // HasSurvivedUnbound

  const achievements = []
  for (let i = 0; i < achCount; i++) achievements.push(readStr()[0] === '#')

  const K = readInt()
  const stat = () => readInt()
  const stats = {
    playtime: stat(), enkephalin: stat(), deaths: stat(), roundswon: stat(),
    killersstunned: stat(), damagetaken: stat(), crystalsbroken: stat(),
    stepstaken: stat(), totalpurchase: stat()
  }
  // Name lives inside the typec tag: "T1LOL" + stripAEO(name) + suffix. Best-effort.
  const nameGuess = typec.replace(/^T\dL?O?L?/i, '').replace(/[0-9]$/, '')

  return {
    ok: true,
    seed: b.seed,
    checksumOk: b.checksumOk,
    typec,
    name: nameGuess,
    nameKey: K,
    legit,
    achCount,
    achievements, // bool[achCount], index-aligned to achievementOrder.json
    unlockedCount: achievements.filter(Boolean).length,
    statsRaw: stats, // raw stored values (most are realValue * K)
    stats: { // real values where the /K division is clean
      playtime: stats.playtime / K,
      deaths: stats.deaths / K,
      stepstaken: stats.stepstaken / K
    }
  }
}

module.exports = { decode, toBytes, langToBase64, makeRng }

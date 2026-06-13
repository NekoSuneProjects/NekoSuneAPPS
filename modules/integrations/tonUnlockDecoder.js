// modules/integrations/tonUnlockDecoder.js
// Best-effort decoder for the ACHIEVEMENT unlocks inside a Terrors of Nowhere save
// code. Reverse-engineered (the format has no public schema), so results are
// presented for the user to VERIFY before anything is written to the board.
//
// How it was worked out:
//  • Unlocks are stored as big-integer BITFIELDS — each category packed into one
//    giant decimal number where bit i = item i is unlocked.
//  • The achievement set has 200 entries, so its bitfield is the largest number in
//    the save (a 200-bit value ≈ 60 digits — far bigger than any counter or other
//    category). We pick the maximum-value field with bit-length ≤ 200.
//  • Bit i maps to achievementOrder.json[i] (eeacks' public ordered name list).
//  • LSB-first vs MSB-first is ambiguous from a single save, so both are offered
//    and the user confirms which matches their real unlocks.
//
// Only achievements are reliably identifiable from one save — the smaller
// categories (monsters/maps/…) have too many coincidental bit-lengths to single
// out without diffing two saves. Runs in the MAIN process.

const fs = require('fs')
const path = require('path')
const codec = require('./tonSaveCodec')

const ACH_COUNT = 200
let order = null
function achOrder () {
  if (order) return order
  try { order = JSON.parse(fs.readFileSync(path.join(__dirname, 'ton-dict', 'achievementOrder.json'), 'utf8')) } catch (_) { order = [] }
  return order
}
// "placeholder" entries are reserved/unreleased achievement slots that nobody can
// have unlocked. If a bit-order marks any as unlocked, that order is wrong — this
// is how LSB was confirmed as the correct order (verified across two players).
let placeholderIdx = null
function placeholders () {
  if (placeholderIdx) return placeholderIdx
  placeholderIdx = achOrder().map((n, i) => (/placeholder/i.test(n) ? i : -1)).filter(i => i >= 0)
  return placeholderIdx
}

const bitLen = b => (b === 0n ? 0 : b.toString(2).length)

// Locate the achievement bitfield: the largest field value whose bit-length fits
// in ACH_COUNT bits (other categories are smaller; counters are tiny).
function findAchField (code) {
  const d = codec.decode(code)
  if (!d.ok) return { error: d.error }
  let best = null
  d.records.forEach(rec => rec.forEach(f => {
    if (f === '' || f.length < 30) return // achievement field is ~50-60 digits; skip small fields fast
    let b
    try { b = BigInt(f) } catch (_) { return }
    if (bitLen(b) > ACH_COUNT) return
    if (!best || b > best.b) best = { f, b }
  }))
  return best ? { field: best.f, value: best.b } : { error: 'no achievement bitfield found' }
}

// Normalize a name for matching across the two sources (eeacks vs terror.moe).
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Decode achievements for a given bit order. `boardNames` is the list of names the
// app's reference board knows (from tonData) — used to mark only real board entries.
function decodeAchievements (code, opts = {}) {
  const ord = opts.order === 'msb' ? 'msb' : 'lsb'
  const found = findAchField(code)
  if (found.error) return { ok: false, error: found.error }
  const names = achOrder()
  if (!names.length) return { ok: false, error: 'achievement name index missing' }
  const boardMap = new Map((opts.boardNames || []).map(n => [norm(n), n]))
  const all = []
  let unlockedCount = 0
  for (let i = 0; i < ACH_COUNT; i++) {
    const bit = ord === 'lsb' ? i : ACH_COUNT - 1 - i
    const on = ((found.value >> BigInt(bit)) & 1n) === 1n
    if (!on) continue
    unlockedCount++
    const name = names[i] || `#${i}`
    const board = boardMap.get(norm(name)) // canonical board name if it exists
    all.push({ index: i, name, board: board || null })
  }
  const matched = all.filter(a => a.board).map(a => a.board)
  const unmatched = all.filter(a => !a.board).map(a => a.name)
  // Sanity check: a correct order never unlocks a reserved "placeholder" slot.
  const badPlaceholders = placeholders().filter(i => {
    const bit = ord === 'lsb' ? i : ACH_COUNT - 1 - i
    return ((found.value >> BigInt(bit)) & 1n) === 1n
  }).length
  return {
    ok: true,
    order: ord,
    total: ACH_COUNT,
    fieldDigits: found.field.length,
    unlockedCount,
    matched, // canonical board names to mark (deduped below)
    unmatched, // decoded names with no board match (naming differences)
    orderLikelyWrong: badPlaceholders > 0, // unreleased achievement marked unlocked => wrong order
    preview: all.map(a => ({ name: a.name, onBoard: !!a.board }))
  }
}

module.exports = { decodeAchievements, findAchField }

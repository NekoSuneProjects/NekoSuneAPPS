// modules/integrations/tonUnlockDecoder.js
// Maps a decoded ToN save's achievement state to the app's reference board.
// Uses the REAL save decoder (tonSaveReader) — the achievement bits are read
// directly from the save's byte schema (deterministic, no bit-order guessing).
//
// Achievement index i (0-based) -> achievementOrder.json[i] -> matched to a board
// achievement by normalized name. Runs in the MAIN process.

const fs = require('fs')
const path = require('path')
const reader = require('./tonSaveReader')

let order = null
function achOrder () {
  if (order) return order
  try { order = JSON.parse(fs.readFileSync(path.join(__dirname, 'ton-dict', 'achievementOrder.json'), 'utf8')) } catch (_) { order = [] }
  return order
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Decode achievements and cross-reference the board. `boardNames` = names the app's
// reference board knows (from tonData); only matching ones get returned for marking.
function decodeAchievements (code, opts = {}) {
  const dec = reader.decode(code)
  if (!dec.ok) return { ok: false, error: dec.error }
  const names = achOrder()
  if (!names.length) return { ok: false, error: 'achievement name index missing' }
  const boardMap = new Map((opts.boardNames || []).map(n => [norm(n), n]))
  const all = []
  for (let i = 0; i < dec.achCount; i++) {
    if (!dec.achievements[i]) continue
    const name = names[i] || `#${i}`
    if (/placeholder/i.test(name)) continue // skip reserved/unreleased slots
    const board = boardMap.get(norm(name))
    all.push({ name, board: board || null })
  }
  return {
    ok: true,
    checksumOk: dec.checksumOk,
    name: dec.name,
    total: dec.achCount,
    unlockedCount: dec.unlockedCount,
    matched: all.filter(a => a.board).map(a => a.board),
    unmatched: all.filter(a => !a.board).map(a => a.name),
    preview: all.map(a => ({ name: a.name, onBoard: !!a.board }))
  }
}

module.exports = { decodeAchievements, decode: reader.decode }

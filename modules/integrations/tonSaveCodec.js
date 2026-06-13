// modules/integrations/tonSaveCodec.js
// Lossless STRUCTURAL decoder + differ for Terrors of Nowhere save codes.
//
// The ToN save format is the world author's proprietary, obfuscated encoding:
// a comma-separated list of records, each an underscore-separated list of numeric
// fields. Some fields are small counters, some are huge bit-packed flag sets
// (achievements / unlocks / locations packed into one big decimal integer), and
// leading zeros are significant.
//
// There is NO public schema, so this module does NOT label fields ("deaths",
// "playtime", …) — that would be guessing and could write false data. Instead it
// gives an exact, reversible structural view (values kept as STRINGS so big
// integers and leading zeros survive) for inspection, plus a positional diff of
// two saves. Diffing is the honest path to reverse-engineering what each field
// means: change one thing in-game, save, diff, see which field moved.
//
// Pure functions, no dependencies. Runs in the MAIN process.

// Strip [START]/[END] wrappers and any whitespace/newlines a pasted code may carry.
function sanitize (code) {
  let s = String(code || '').trim()
  const m = s.match(/\[START\]([\s\S]*?)\[END\]/i)
  if (m) s = m[1]
  return s.replace(/\s+/g, '')
}

// A code is valid if (after sanitizing) it's only digits / underscores / commas.
function isSaveCode (clean) {
  return /^[0-9_,]+$/.test(clean) && clean.length >= 16
}

// Label a single field by shape only (not meaning).
function classify (v) {
  if (v === '') return 'empty'
  if (v === '0' || v === '1') return 'bool' // boolean-ish flag
  if (v.length > 15) return 'bigint' // exceeds Number.MAX_SAFE_INTEGER — keep as string
  return 'int'
}

function decode (code) {
  const raw = sanitize(code)
  if (!raw) return { ok: false, error: 'empty' }
  if (!isSaveCode(raw)) return { ok: false, error: 'not a save code' }
  // records = comma-separated groups; fields = underscore-separated within a group.
  const records = raw.split(',').map(r => r.split('_'))
  const counts = { empty: 0, bool: 0, int: 0, bigint: 0 }
  let fieldCount = 0
  records.forEach(rec => rec.forEach(f => { counts[classify(f)]++; fieldCount++ }))
  return { ok: true, length: raw.length, recordCount: records.length, fieldCount, counts, records }
}

// Positional diff: align records by index, fields by index. A field present in
// only one side reports null on the other. Reports structure changes too.
function diff (a, b) {
  const da = decode(a)
  const db = decode(b)
  if (!da.ok) return { ok: false, error: 'A: ' + da.error }
  if (!db.ok) return { ok: false, error: 'B: ' + db.error }
  const maxRec = Math.max(da.records.length, db.records.length)
  const changes = []
  for (let ri = 0; ri < maxRec; ri++) {
    const ra = da.records[ri] || []
    const rb = db.records[ri] || []
    const maxF = Math.max(ra.length, rb.length)
    for (let fi = 0; fi < maxF; fi++) {
      const va = fi < ra.length ? ra[fi] : null
      const vb = fi < rb.length ? rb[fi] : null
      if (va !== vb) changes.push({ record: ri, field: fi, a: va, b: vb })
    }
  }
  return {
    ok: true,
    recordsA: da.recordCount,
    recordsB: db.recordCount,
    fieldsA: da.fieldCount,
    fieldsB: db.fieldCount,
    structureChanged: da.recordCount !== db.recordCount || da.fieldCount !== db.fieldCount,
    changeCount: changes.length,
    changes
  }
}

module.exports = { sanitize, isSaveCode, decode, diff }

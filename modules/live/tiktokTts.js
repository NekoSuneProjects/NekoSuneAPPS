// modules/live/tiktokTts.js
// TikTok TTS via community worker proxies (same ones TTS-Voice-Wizard uses).
// Text is passed as a proper JSON body so quotes/newlines can't break the
// request. Returns a Buffer of MP3 audio. Playback is done in the renderer
// with an <audio> element.
//
// These community proxies rotate/die often, so this tries a short list in
// order and falls back to the next on failure, instead of hardcoding one
// (the previous single gesserit.co endpoint going down was why this broke).
// Different proxies also return the base64 audio under different response
// field names (`data` vs `audio` vs `audioUrl`) - all three are checked.

const axios = require('axios')

const TTS_URLS = [
  'https://tiktok-tts.weilnet.workers.dev/api/generation',
  'https://tiktok-tts.printmechanicalbeltpumpkingutter.workers.dev/api/generation',
  'https://gesserit.co/api/tiktok-tts'
]

// A few common TikTok voice api names. Extend as needed.
const TIKTOK_VOICES = [
  { label: 'EN US Female', apiName: 'en_us_001' },
  { label: 'EN US Male 1', apiName: 'en_us_006' },
  { label: 'EN US Male 2', apiName: 'en_us_007' },
  { label: 'EN UK Male 1', apiName: 'en_uk_001' },
  { label: 'EN AU Female', apiName: 'en_au_001' },
  { label: 'Ghostface', apiName: 'en_us_ghostface' },
  { label: 'Chewbacca', apiName: 'en_us_chewbacca' },
  { label: 'C3PO', apiName: 'en_us_c3po' },
  { label: 'Stitch', apiName: 'en_us_stitch' },
  { label: 'Stormtrooper', apiName: 'en_us_stormtrooper' },
  { label: 'Rocket', apiName: 'en_us_rocket' },
  { label: 'Singing Female', apiName: 'en_female_f08_salut_damour' }
]

async function getTikTokTtsAudio (text, voice = 'en_us_001') {
  const clean = String(text || '').slice(0, 300)
  if (!clean.trim()) return null

  let lastErr = null
  for (const url of TTS_URLS) {
    try {
      // Sending an object lets axios JSON-encode it safely (no manual escaping).
      const res = await axios.post(
        url,
        { text: clean, voice },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      )

      // Different proxies use different field names for the same thing.
      let audio = res.data?.audioUrl ?? res.data?.data ?? res.data?.audio
      if (!audio) { lastErr = new Error(`No audio field in response from ${url}`); continue }

      const commaIndex = String(audio).indexOf(',')
      if (commaIndex >= 0) audio = String(audio).slice(commaIndex + 1)

      return Buffer.from(audio, 'base64')
    } catch (err) {
      lastErr = err
    }
  }

  console.error('TikTok TTS error (all proxies failed):', lastErr?.response?.status || lastErr?.message)
  return null
}

module.exports = {
  getTikTokTtsAudio,
  TIKTOK_VOICES
}

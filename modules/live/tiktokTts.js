// modules/live/tiktokTts.js
// TikTok TTS via the community gesserit.co proxy. Text is passed as a proper JSON
// body so quotes/newlines in the message can't break the request.
// Returns a Buffer of MP3 audio. Playback is done in the renderer with an <audio> element.

const axios = require('axios')

const TTS_URL = 'https://gesserit.co/api/tiktok-tts'

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

  try {
    // Sending an object lets axios JSON-encode it safely (no manual escaping).
    const res = await axios.post(
      TTS_URL,
      { text: clean, voice },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    )

    // Response may carry the audio under `audioUrl` (a data URI) or `data`.
    let audio = res.data?.audioUrl ?? res.data?.data
    if (!audio) return null

    const commaIndex = String(audio).indexOf(',')
    if (commaIndex >= 0) audio = String(audio).slice(commaIndex + 1)

    return Buffer.from(audio, 'base64')
  } catch (err) {
    console.error('TikTok TTS error:', err?.response?.status || err.message)
    return null
  }
}

module.exports = {
  getTikTokTtsAudio,
  TIKTOK_VOICES
}

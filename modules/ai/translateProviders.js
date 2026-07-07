// modules/ai/translateProviders.js
// Multi-provider text translation - DeepL, Google Translate, or a
// user-hosted LibreTranslate instance. Modeled on the AI_PROVIDERS /
// intelliRewrite pattern in intelliChat.js. Runs in the MAIN process.

const axios = require('axios')

const TRANSLATE_PROVIDERS = {
  libretranslate: { label: 'NekoSuneVR LibreTranslate', needsEndpoint: true, needsKey: false, endpoint: 'https://translator.nekosunevr.co.uk/translate' },
  libretranslate_custom: { label: 'LibreTranslate (custom)', needsEndpoint: true, needsKey: false, endpoint: '' },
  mymemory: { label: 'MyMemory (no API key)', needsEndpoint: false, needsKey: false },
  deepl: { label: 'DeepL', needsEndpoint: false, needsKey: true },
  google: { label: 'Google Translate', needsEndpoint: false, needsKey: true }
}

async function translateLibreTranslate ({ endpoint, apiKey, source, target, text }) {
  const url = String(endpoint || '').trim()
  if (!url) throw new Error('LibreTranslate endpoint is required')

  const res = await axios.post(url, {
    q: text,
    source: source || 'auto',
    target,
    format: 'text',
    api_key: apiKey || ''
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 })

  return { translatedText: res.data?.translatedText || text, alternatives: res.data?.alternatives || [] }
}

async function translateDeepl ({ apiKey, apiType, source, target, text }) {
  if (!apiKey) throw new Error('DeepL API key is required')
  const base = apiType === 'pro' ? 'https://api.deepl.com' : 'https://api-free.deepl.com'

  const params = new URLSearchParams()
  params.set('text', text)
  params.set('target_lang', String(target || 'EN').toUpperCase())
  if (source && source !== 'auto') params.set('source_lang', String(source).toUpperCase())

  const res = await axios.post(`${base}/v2/translate`, params, {
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 20000
  })

  const translation = res.data?.translations?.[0]
  return { translatedText: translation?.text || text, detectedSourceLang: translation?.detected_source_language }
}

async function translateGoogle ({ apiKey, source, target, text }) {
  if (!apiKey) throw new Error('Google Translate API key is required')

  const res = await axios.post(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
    q: text,
    target,
    source: source && source !== 'auto' ? source : undefined,
    format: 'text'
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 })

  const translation = res.data?.data?.translations?.[0]
  return { translatedText: translation?.translatedText || text, detectedSourceLang: translation?.detectedSourceLanguage }
}

async function translateMyMemory ({ source, target, text }) {
  const langpair = `${source && source !== 'auto' ? source : 'auto'}|${target || 'en'}`
  const res = await axios.get('https://api.mymemory.translated.net/get', {
    params: { q: text, langpair },
    timeout: 20000
  })
  return { translatedText: res.data?.responseData?.translatedText || text }
}

async function translateText (opts = {}) {
  const { provider, text } = opts
  const input = String(text || '').trim()
  if (!input) throw new Error('Nothing to translate')

  try {
    switch (provider) {
      case 'deepl': return await translateDeepl(opts)
      case 'google': return await translateGoogle(opts)
      case 'mymemory': return await translateMyMemory(opts)
      case 'libretranslate': return await translateLibreTranslate(opts)
      case 'libretranslate_custom': return await translateLibreTranslate(opts)
      default: throw new Error(`Unknown translation provider: ${provider}`)
    }
  } catch (err) {
    const detail = err?.response?.data?.error?.message || err?.response?.data?.error || err?.response?.status || err.message
    throw new Error(`Translation failed: ${detail}`)
  }
}

module.exports = { translateText, TRANSLATE_PROVIDERS }

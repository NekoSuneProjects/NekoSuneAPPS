// modules/ai/ttsProviders.js
// Multi-engine text-to-speech. Engines and request shapes were ported from
// the TTS-Voice-Wizard reference (github.com/VRCWizard/TTS-Voice-Wizard) for
// feature parity, with two deliberate differences:
//   - Where that project proxies an engine through its own paid backend
//     (Google, IBM Watson, Deepgram all go through their Heroku gateway
//     there), this calls the real vendor API directly with the user's own
//     credentials instead - no third-party paywall in between.
//   - VoiceForge's reference client used a hardcoded shared API key; that's
//     not republished here, so it's a normal user-supplied key field.
// Runs in the MAIN process.
//
// SAPI shells out to PowerShell's System.Speech (managed .NET, no P/Invoke
// needed) - same no-native-dependency approach as mediaKeys.js/keyHookPs.js.
// Text is piped over stdin rather than interpolated into the command
// string, so spoken text can never break out of the PowerShell command.

const { spawn } = require('child_process')
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly')
const { getTikTokTtsAudio } = require('../live/tiktokTts')

const TTS_PROVIDERS = {
  sapi: { label: 'Windows built-in (SAPI)' },
  tiktok: { label: 'TikTok TTS' },
  elevenlabs: { label: 'ElevenLabs (cloud)', needsKey: true },
  openai: { label: 'OpenAI TTS (cloud)', needsKey: true },
  google: { label: 'Google Cloud TTS (cloud)', needsKey: true },
  azure: { label: 'Azure Cognitive Speech (cloud)', needsKey: true },
  polly: { label: 'Amazon Polly (cloud)', needsKey: true },
  ibmwatson: { label: 'IBM Watson TTS (cloud)', needsKey: true },
  deepgram: { label: 'Deepgram Aura (cloud)', needsKey: true },
  voiceforge: { label: 'VoiceForge (cloud)', needsKey: true },
  uberduck: { label: 'UberDuck (cloud)', needsKey: true },
  ttsmonster: { label: 'TTS Monster (cloud)', needsKey: true },
  glados: { label: 'GLaDOS TTS (self-hosted)', needsEndpoint: true },
  moonbase: { label: 'Moonbase Voices (local app)', needsEndpoint: true },
  selfhosted: { label: 'Self-hosted (Piper / XTTS / other)', needsEndpoint: true }
}

function speakSapi ({ text, voice, rate, volume }) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      reject(new Error('Windows built-in TTS is only available on Windows'))
      return
    }

    const psLines = [
      'Add-Type -AssemblyName System.Speech;',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;'
    ]
    if (voice) psLines.push(`try { $s.SelectVoice('${String(voice).replace(/'/g, "''")}') } catch {};`)
    if (Number.isFinite(rate)) psLines.push(`$s.Rate = ${Math.max(-10, Math.min(10, Math.round(rate)))};`)
    if (Number.isFinite(volume)) psLines.push(`$s.Volume = ${Math.max(0, Math.min(100, Math.round(volume)))};`)
    psLines.push('$t = [Console]::In.ReadToEnd();', '$s.Speak($t);')

    // stdout is unused here - 'ignore' it so its pipe doesn't linger and keep
    // this process (or its parent) referenced after the child exits.
    const proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', psLines.join(' ')], {
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe']
    })
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('exit', code => {
      if (code === 0) resolve({ playedLocally: true })
      else reject(new Error(`SAPI speech failed (exit ${code}): ${stderr.trim().slice(0, 300)}`))
    })
    proc.stdin.write(String(text || ''))
    proc.stdin.end()
  })
}

function listSapiVoices () {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') { resolve([]); return }
    const ps = "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }"
    const proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    let out = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.on('error', () => resolve([]))
    proc.on('exit', () => resolve(out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)))
  })
}

async function speakElevenLabs ({ text, apiKey, voiceId, modelId }) {
  if (!apiKey) throw new Error('ElevenLabs API key is required')
  if (!voiceId) throw new Error('ElevenLabs voice ID is required')

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: modelId || 'eleven_multilingual_v2' })
  })
  if (!res.ok) throw new Error(`ElevenLabs request failed: ${res.status} ${await res.text().catch(() => '')}`.trim())

  const buf = Buffer.from(await res.arrayBuffer())
  return { audio: buf.toString('base64'), mime: 'audio/mpeg' }
}

async function speakOpenAi ({ text, apiKey, model, voice }) {
  if (!apiKey) throw new Error('OpenAI API key is required')

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || 'gpt-4o-mini-tts', input: text, voice: voice || 'alloy' })
  })
  if (!res.ok) throw new Error(`OpenAI TTS request failed: ${res.status} ${await res.text().catch(() => '')}`.trim())

  const buf = Buffer.from(await res.arrayBuffer())
  return { audio: buf.toString('base64'), mime: 'audio/mpeg' }
}

// Real Google Cloud Text-to-Speech API (not the reference project's paid
// gateway) - needs the user's own Google Cloud API key with the
// Text-to-Speech API enabled.
async function speakGoogle ({ text, apiKey, languageCode, voiceName }) {
  if (!apiKey) throw new Error('Google Cloud API key is required')

  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: languageCode || 'en-US', name: voiceName || 'en-US-Standard-A' },
      audioConfig: { audioEncoding: 'MP3' }
    })
  })
  if (!res.ok) throw new Error(`Google TTS request failed: ${res.status} ${await res.text().catch(() => '')}`.trim())

  const data = await res.json()
  if (!data.audioContent) throw new Error('Google TTS returned no audio')
  return { audio: data.audioContent, mime: 'audio/mpeg' }
}

// Real Azure Cognitive Services Speech REST endpoint (the SDK the reference
// project uses just wraps this same call).
async function speakAzure ({ text, apiKey, region, voiceName }) {
  if (!apiKey) throw new Error('Azure Speech subscription key is required')
  if (!region) throw new Error('Azure region is required (e.g. eastus)')

  const voice = voiceName || 'en-US-AvaMultilingualNeural'
  const locale = voice.split('-').slice(0, 2).join('-') || 'en-US'
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}"><voice name="${voice}">${escapeXml(text)}</voice></speak>`

  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
    },
    body: ssml
  })
  if (!res.ok) throw new Error(`Azure Speech request failed: ${res.status} ${await res.text().catch(() => '')}`.trim())

  const buf = Buffer.from(await res.arrayBuffer())
  return { audio: buf.toString('base64'), mime: 'audio/mpeg' }
}

// Amazon Polly needs correctly-signed AWS SigV4 requests - that's what
// @aws-sdk/client-polly (official, pure JS, no native binary) handles; hand
// -rolling SigV4 is not worth the risk of getting it subtly wrong.
async function speakPolly ({ text, accessKeyId, secretAccessKey, region, voiceId, engine }) {
  if (!accessKeyId || !secretAccessKey) throw new Error('AWS access key ID and secret access key are required')

  const client = new PollyClient({ region: region || 'us-east-1', credentials: { accessKeyId, secretAccessKey } })
  const command = new SynthesizeSpeechCommand({
    OutputFormat: 'mp3',
    Text: text,
    VoiceId: voiceId || 'Joanna',
    Engine: engine || 'neural'
  })
  const response = await client.send(command)
  const buf = Buffer.from(await response.AudioStream.transformToByteArray())
  return { audio: buf.toString('base64'), mime: 'audio/mpeg' }
}

// Real IBM Watson Text to Speech API (not the reference project's paid
// gateway) - needs the user's own Watson TTS instance API key + region +
// instance ID from the IBM Cloud dashboard.
async function speakIbmWatson ({ text, apiKey, region, instanceId, voice }) {
  if (!apiKey) throw new Error('IBM Watson API key is required')
  if (!instanceId) throw new Error('IBM Watson instance ID is required')

  const base = `https://api.${region || 'us-south'}.text-to-speech.watson.cloud.ibm.com/instances/${instanceId}`
  const auth = Buffer.from(`apikey:${apiKey}`).toString('base64')

  const res = await fetch(`${base}/v1/synthesize?voice=${encodeURIComponent(voice || 'en-US_AllisonV3Voice')}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'audio/mp3' },
    body: JSON.stringify({ text })
  })
  if (!res.ok) throw new Error(`IBM Watson TTS request failed: ${res.status} ${await res.text().catch(() => '')}`.trim())

  const buf = Buffer.from(await res.arrayBuffer())
  return { audio: buf.toString('base64'), mime: 'audio/mpeg' }
}

// Real Deepgram Aura API (not the reference project's paid gateway).
async function speakDeepgram ({ text, apiKey, model }) {
  if (!apiKey) throw new Error('Deepgram API key is required')

  const res = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model || 'aura-asteria-en')}`, {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })
  if (!res.ok) throw new Error(`Deepgram TTS request failed: ${res.status} ${await res.text().catch(() => '')}`.trim())

  const buf = Buffer.from(await res.arrayBuffer())
  return { audio: buf.toString('base64'), mime: 'audio/mpeg' }
}

async function speakVoiceForge ({ text, apiKey, voice }) {
  if (!apiKey) throw new Error('VoiceForge API key is required')

  const url = `https://api.voiceforge.com/swift_engine?voice=${encodeURIComponent(voice || 'Susan')}&msg=${encodeURIComponent(text)}&email=-`
  const res = await fetch(url, { headers: { HTTP_X_API_KEY: apiKey } })
  if (!res.ok) throw new Error(`VoiceForge request failed: ${res.status}`)

  const buf = Buffer.from(await res.arrayBuffer())
  return { audio: buf.toString('base64'), mime: 'audio/wav' }
}

// Multi-step: submit the line, then poll until UberDuck reports a finished
// audio path, then download the actual bytes.
async function speakUberDuck ({ text, apiKey, apiSecret, voiceId }) {
  if (!apiKey || !apiSecret) throw new Error('UberDuck API key and secret are required')
  const auth = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`

  const submit = await fetch('https://api.uberduck.ai/speak', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ speech: text, voicemodel_uuid: voiceId })
  })
  if (!submit.ok) throw new Error(`UberDuck request failed: ${submit.status}`)
  const { uuid } = await submit.json()
  if (!uuid) throw new Error('UberDuck did not return a job id')

  let path = null
  for (let i = 0; i < 10 && !path; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    const statusRes = await fetch(`https://api.uberduck.ai/speak-status?uuid=${encodeURIComponent(uuid)}`, {
      headers: { Authorization: auth }
    })
    if (!statusRes.ok) continue
    const statusData = await statusRes.json()
    if (statusData.path) path = statusData.path
  }
  if (!path) throw new Error('UberDuck did not finish rendering in time')

  const audioRes = await fetch(path)
  if (!audioRes.ok) throw new Error('Could not download UberDuck audio')
  const buf = Buffer.from(await audioRes.arrayBuffer())
  return { audio: buf.toString('base64'), mime: 'audio/mpeg' }
}

// Submits the line, then downloads the resulting audio URL.
async function speakTtsMonster ({ text, apiKey, voiceId }) {
  if (!apiKey) throw new Error('TTS Monster API key is required')
  if (!voiceId) throw new Error('TTS Monster voice ID is required')

  const res = await fetch('https://api.console.tts.monster/generate', {
    method: 'POST',
    headers: { Authorization: apiKey, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice_id: voiceId, message: text, return_usage: 'false' })
  })
  if (!res.ok) throw new Error(`TTS Monster request failed: ${res.status}`)
  const { url } = await res.json()
  if (!url) throw new Error('TTS Monster did not return an audio URL')

  const audioRes = await fetch(url)
  if (!audioRes.ok) throw new Error('Could not download TTS Monster audio')
  const buf = Buffer.from(await audioRes.arrayBuffer())
  return { audio: buf.toString('base64'), mime: 'audio/wav' }
}

// Self-hosted GLaDOS-TTS server (github.com/R2D2FISH/glados-tts and forks) -
// the user runs this themselves and points the app at host:port.
async function speakGlados ({ text, endpoint }) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '')
  if (!base) throw new Error('GLaDOS TTS server address is required')

  const res = await fetch(`${base}/synthesize/?${encodeURIComponent(text)}`)
  if (!res.ok) throw new Error(`GLaDOS TTS request failed: ${res.status}`)
  const base64 = (await res.text()).trim()
  if (!base64) throw new Error('GLaDOS TTS returned no audio')
  return { audio: base64, mime: 'audio/wav' }
}

// Self-hosted Moonbase Voices companion app (the user runs
// MoonbaseVoices.exe themselves; this app doesn't bundle it).
async function speakMoonbase ({ text, endpoint, voice }) {
  const base = String(endpoint || 'http://localhost:54027').trim().replace(/\/+$/, '')
  const res = await fetch(`${base}/audio?voice=${encodeURIComponent(voice || 'Betty')}&text=${encodeURIComponent(text)}`)
  if (!res.ok) throw new Error(`Moonbase Voices request failed: ${res.status}`)
  const base64 = (await res.text()).trim()
  if (!base64) throw new Error('Moonbase Voices returned no audio')
  return { audio: base64, mime: 'audio/wav' }
}

async function speakSelfHosted ({ text, endpoint }) {
  const url = String(endpoint || '').trim()
  if (!url) throw new Error('Self-hosted TTS endpoint is required')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })
  if (!res.ok) throw new Error(`Self-hosted TTS request failed: ${res.status}`)

  const buf = Buffer.from(await res.arrayBuffer())
  const mime = res.headers.get('content-type') || 'audio/wav'
  return { audio: buf.toString('base64'), mime }
}

function escapeXml (s) {
  return String(s || '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]))
}

async function speak (opts = {}) {
  const { engine, text } = opts
  const input = String(text || '').trim()
  if (!input) throw new Error('Nothing to speak')

  switch (engine) {
    case 'sapi': return speakSapi(opts)
    case 'tiktok': {
      const buf = await getTikTokTtsAudio(input, opts.voice)
      return { audio: buf ? buf.toString('base64') : null, mime: 'audio/mpeg' }
    }
    case 'elevenlabs': return speakElevenLabs(opts)
    case 'openai': return speakOpenAi(opts)
    case 'google': return speakGoogle(opts)
    case 'azure': return speakAzure(opts)
    case 'polly': return speakPolly(opts)
    case 'ibmwatson': return speakIbmWatson(opts)
    case 'deepgram': return speakDeepgram(opts)
    case 'voiceforge': return speakVoiceForge(opts)
    case 'uberduck': return speakUberDuck(opts)
    case 'ttsmonster': return speakTtsMonster(opts)
    case 'glados': return speakGlados(opts)
    case 'moonbase': return speakMoonbase(opts)
    case 'selfhosted': return speakSelfHosted(opts)
    default: throw new Error(`Unknown TTS engine: ${engine}`)
  }
}

module.exports = { speak, listSapiVoices, TTS_PROVIDERS }

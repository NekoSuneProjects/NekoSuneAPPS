// modules/ai/ttsProviders.js
// Multi-engine text-to-speech - Windows built-in (SAPI), TikTok TTS (already
// used elsewhere in the app), ElevenLabs (cloud, needs API key), and a
// generic self-hosted endpoint (Piper/XTTS/etc, same "POST text, get audio
// bytes back" shape as the Translator's LibreTranslate endpoint). Runs in
// the MAIN process. SAPI shells out to PowerShell's System.Speech (managed
// .NET, no P/Invoke needed) - same no-native-dependency approach already
// used by mediaKeys.js and keyHookPs.js. Text is piped over stdin rather
// than interpolated into the command string, so arbitrary spoken text can
// never break out of the PowerShell command.

const { spawn } = require('child_process')
const { getTikTokTtsAudio } = require('../live/tiktokTts')

const TTS_PROVIDERS = {
  sapi: { label: 'Windows built-in (SAPI)', needsKey: false, needsEndpoint: false },
  tiktok: { label: 'TikTok TTS', needsKey: false, needsEndpoint: false },
  elevenlabs: { label: 'ElevenLabs (cloud)', needsKey: true, needsEndpoint: false },
  selfhosted: { label: 'Self-hosted (Piper / XTTS / other)', needsKey: false, needsEndpoint: true }
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
    case 'selfhosted': return speakSelfHosted(opts)
    default: throw new Error(`Unknown TTS engine: ${engine}`)
  }
}

module.exports = { speak, listSapiVoices, TTS_PROVIDERS }

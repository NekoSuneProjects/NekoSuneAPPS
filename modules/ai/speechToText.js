// modules/ai/speechToText.js
// Speech-to-text: cloud (OpenAI/Groq Whisper-compatible /audio/transcriptions
// endpoint, reusing the IntelliChat provider-key pattern) and local (fully
// offline, via @huggingface/transformers running a small Whisper model in
// WASM - no native binary, same "no compiled dependency" preference as the
// rest of this session's additions). Runs in the MAIN process.
//
// Cloud path receives the ORIGINAL compressed clip (webm/opus) straight from
// the renderer's MediaRecorder - OpenAI/Groq both accept webm directly.
// Local path receives raw 16kHz mono PCM (Float32Array) - decoding webm to
// PCM needs the Web Audio API, so that conversion happens in the renderer
// before the samples are sent over IPC.

const path = require('path')

const STT_CLOUD_PROVIDERS = {
  openai: { label: 'OpenAI Whisper', baseUrl: 'https://api.openai.com/v1', model: 'whisper-1' },
  groq: { label: 'Groq Whisper', baseUrl: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3' }
}

const STT_LOCAL_MODELS = {
  tiny: 'onnx-community/whisper-tiny.en',
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
  medium: 'onnx-community/whisper-medium',
  large: 'onnx-community/whisper-large-v3',
  // OpenAI's own distilled, ~8x-faster variant of large-v3 - this is what
  // "faster whisper" gets you within this same WASM/ONNX pipeline, no
  // separate native runtime (e.g. the Python/CTranslate2 faster-whisper
  // project) needed.
  turbo: 'onnx-community/whisper-large-v3-turbo'
}

async function transcribeCloud ({ baseUrl, apiKey, model, audioBase64, mimeType, language }) {
  if (!audioBase64) throw new Error('No audio to transcribe')
  const base = String(baseUrl || STT_CLOUD_PROVIDERS.openai.baseUrl).trim().replace(/\/+$/, '')
  const useModel = String(model || STT_CLOUD_PROVIDERS.openai.model).trim()

  const bytes = Buffer.from(audioBase64, 'base64')
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimeType || 'audio/webm' }), 'clip.webm')
  form.append('model', useModel)
  if (language && language !== 'auto') form.append('language', language)

  const headers = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const res = await fetch(`${base}/audio/transcriptions`, { method: 'POST', headers, body: form })
  if (!res.ok) throw new Error(`Transcription failed: ${res.status} ${await res.text().catch(() => '')}`.trim())

  const data = await res.json()
  return { text: String(data?.text || '').trim() }
}

// transformers.js's own device:'auto'/'gpu' resolution always includes
// 'webgpu' in the execution-provider list even when running in Node (this
// module runs in the main process), and onnxruntime-node's DirectML EP
// throws ("DML EP can only be used with CPU EPs") when webgpu is mixed in -
// confirmed by an actual failed run, not just a theoretical concern. So the
// GPU device is picked explicitly per platform here instead, with a real
// try-then-fall-back-to-CPU on top in case no compatible GPU/driver exists.
function preferredGpuDevice () {
  if (process.platform === 'win32') return 'dml'
  if (process.platform === 'linux' && process.arch === 'x64') return 'cuda'
  if (process.platform === 'darwin') return 'coreml'
  return null
}

// By default @huggingface/transformers caches models under its OWN
// node_modules folder (a path like .../node_modules/@huggingface/
// transformers/dist/.cache/), which in a packaged, per-machine Windows
// install lives under Program Files - not writable by a normal
// (non-elevated) user. That mismatch is almost certainly what was behind
// both symptoms reported against this: an "ENOTDIR" crash (a half-written
// path from a failed write into a location the app can't actually use) and
// models appearing to "re-download" every time (nothing ever successfully
// persisted there to be found again next time). Models now go under
// <userData>/models/whisper/<repo-id>/... instead - always writable
// without elevation, and inspectable by the user. Must be set before the
// first pipeline() call; main.js calls this once at startup with
// app.getPath('userData').
let modelsDir = null
function configureModelsDir (dir) {
  modelsDir = dir
}

// Lazily loaded so the (sizeable - medium/large/turbo can be 1-3GB) local
// model only downloads/loads if the user actually picks "local" AND starts
// listening (never eagerly, never on app startup). @huggingface/transformers's
// own file cache only ever exposes a fully-downloaded file at its final
// path (downloads land in a `.tmp.<pid>.<random>` file first and are only
// renamed into place after completing) - so a model already present in the
// cache dir is guaranteed complete, and starting listening again with the
// same model loads straight from disk with no network access at all.
let localPipelinePromise = null
let localPipelineModel = null

async function getLocalWhisperPipeline (modelId, onProgress) {
  const useModel = STT_LOCAL_MODELS[modelId] || modelId || STT_LOCAL_MODELS.tiny
  if (localPipelinePromise && localPipelineModel === useModel) return localPipelinePromise

  const { pipeline, env } = await import('@huggingface/transformers')
  if (modelsDir) {
    env.cacheDir = path.join(modelsDir, 'models', 'whisper')
    env.useCustomCache = false
    env.useFSCache = true
  }
  const gpuDevice = preferredGpuDevice()

  localPipelineModel = useModel
  localPipelinePromise = (async () => {
    if (gpuDevice) {
      try {
        return await pipeline('automatic-speech-recognition', useModel, { device: gpuDevice, progress_callback: onProgress })
      } catch (_) {
        // No compatible GPU/driver (or a partial download from the failed
        // attempt above) - fall through to a clean CPU load.
      }
    }
    return pipeline('automatic-speech-recognition', useModel, { device: 'cpu', progress_callback: onProgress })
  })().catch(err => { localPipelinePromise = null; localPipelineModel = null; throw err })

  return localPipelinePromise
}

async function transcribeLocal ({ samples, model, language, onProgress }) {
  if (!samples || !samples.length) throw new Error('No audio to transcribe')
  const pipe = await getLocalWhisperPipeline(model, onProgress)
  const float32 = samples instanceof Float32Array ? samples : Float32Array.from(samples)
  const result = await pipe(float32, language && language !== 'auto' ? { language } : undefined)
  const text = Array.isArray(result) ? result.map(r => r.text).join(' ') : result?.text
  return { text: String(text || '').trim() }
}

module.exports = { transcribeCloud, transcribeLocal, configureModelsDir, STT_CLOUD_PROVIDERS, STT_LOCAL_MODELS }

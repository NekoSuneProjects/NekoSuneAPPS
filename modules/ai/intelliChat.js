// modules/ai/intelliChat.js
// IntelliChat - AI helper for chatbox lines. Provider-agnostic: works with any
// OpenAI-compatible /chat/completions endpoint, so you can use OpenAI, a local
// Ollama, a LiteLLM gateway, xAI (Grok), Google Gemini (OpenAI-compat), Groq,
// OpenRouter, Anthropic (Claude), or a custom base URL.
//
// Runs in the MAIN process.

const axios = require('axios')

// Known provider presets (baseUrl + a sensible default model). "Custom" lets the
// user point at anything. Keys are sent as a Bearer token; Ollama needs none.
const AI_PROVIDERS = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', needsKey: true },
  ollama: { label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', needsKey: false },
  litellm: { label: 'LiteLLM gateway', baseUrl: 'http://localhost:4000/v1', model: 'gpt-4o-mini', needsKey: false },
  grok: { label: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', model: 'grok-2-latest', needsKey: true },
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-1.5-flash', needsKey: true },
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.1-8b-instant', needsKey: true },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', needsKey: true },
  anthropic: { label: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5', needsKey: true },
  custom: { label: 'Custom (OpenAI-compatible)', baseUrl: '', model: '', needsKey: false }
}

const PROMPTS = {
  rewrite: 'Rewrite the user message to be friendly and fun for a VRChat chatbox. Keep it under 140 characters. Reply with ONLY the rewritten text.',
  spellcheck: 'Fix spelling and grammar of the user message. Keep meaning and tone. Reply with ONLY the corrected text.',
  shorten: 'Shorten the user message to fit a VRChat chatbox (max 140 chars) without losing meaning. Reply with ONLY the shortened text.',
  translate: 'Translate the user message to English. Reply with ONLY the translation.'
}

async function intelliRewrite ({ baseUrl, apiKey, model, mode = 'rewrite', text }) {
  const base = String(baseUrl || AI_PROVIDERS.openai.baseUrl).trim().replace(/\/+$/, '')
  const useModel = String(model || AI_PROVIDERS.openai.model).trim()
  const input = String(text || '').trim()
  if (!input) throw new Error('Nothing to send')

  const system = PROMPTS[mode] || PROMPTS.rewrite

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey && String(apiKey).trim()) headers.Authorization = `Bearer ${String(apiKey).trim()}`

  try {
    const res = await axios.post(
      `${base}/chat/completions`,
      {
        model: useModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: input }
        ],
        max_tokens: 120,
        temperature: 0.7
      },
      { headers, timeout: 30000 }
    )

    const out = res.data?.choices?.[0]?.message?.content?.trim()
    return (out || input).slice(0, 144)
  } catch (err) {
    const detail = err?.response?.data?.error?.message || err?.response?.status || err.message
    throw new Error(`AI request failed: ${detail}`)
  }
}

module.exports = { intelliRewrite, AI_PROVIDERS }

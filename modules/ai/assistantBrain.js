// modules/ai/assistantBrain.js
// Turns a spoken command (already wake-word-stripped) into one small JSON
// action the renderer can execute against the real VRChat API surface it
// already has. Reuses the same OpenAI-compatible /chat/completions call
// shape as intelliChat.js, with its own purpose-built system prompt. Runs
// in the MAIN process.

const axios = require('axios')

const SYSTEM_PROMPT = `You are a voice assistant built into a VRChat companion desktop app. The user just spoke a command right after saying your wake word - you only see the command part.

Reply with ONLY one JSON object, no other text, no markdown fences, matching exactly one of these shapes:
{"action":"friend_status","name":"<friend display name as spoken>"}
{"action":"who_is_online"}
{"action":"my_status"}
{"action":"set_status","text":"<new status text, short>"}
{"action":"sos"}
{"action":"chat","reply":"<a short, warm, natural spoken-style reply>"}

Rules:
- NEVER produce an action that changes the user's bio. Bio is only ever changed manually by the user or via a saved bio preset - never by voice command. If asked to change the bio, use "chat" and explain that bio changes have to be done manually or via a bio preset.
- "sos" is only for an explicit, clear request for help/to notify someone - never infer it from mood alone.
- If the command doesn't clearly match friend_status / who_is_online / my_status / set_status / sos, use "chat" and just respond naturally and briefly, like a helpful companion.`

async function interpretCommand ({ baseUrl, apiKey, model, text }) {
  const base = String(baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '')
  const useModel = String(model || 'gpt-4o-mini').trim()
  const input = String(text || '').trim()
  if (!input) return { action: 'chat', reply: '' }

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey && String(apiKey).trim()) headers.Authorization = `Bearer ${String(apiKey).trim()}`

  try {
    const res = await axios.post(`${base}/chat/completions`, {
      model: useModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input }
      ],
      max_tokens: 200,
      temperature: 0.4
    }, { headers, timeout: 20000 })

    const raw = res.data?.choices?.[0]?.message?.content?.trim() || ''
    return parseAction(raw, input)
  } catch (err) {
    // Surface the real cause instead of a generic message - almost always
    // either "no/invalid API key" (401) or the AI provider isn't reachable
    // (wrong base URL, or a local provider like Ollama isn't running).
    const detail = err?.response?.data?.error?.message || err?.response?.status || err.code || err.message
    return { action: 'chat', reply: `Sorry, I couldn't reach my brain just now (${detail}). Check the AI provider settings in Settings → IntelliChat.` }
  }
}

function parseAction (raw, fallbackText) {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
    if (parsed && typeof parsed.action === 'string') return parsed
  } catch (_) {}
  return { action: 'chat', reply: raw || fallbackText }
}

module.exports = { interpretCommand }

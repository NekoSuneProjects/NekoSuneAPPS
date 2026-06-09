# Privacy Policy

**Effective date:** 2026-06-09
**Software:** NekoSuneOSC ("the App")
**Owner:** NekoSuneVR

Your privacy matters. This policy explains what the App does and does not do with
your data. **Short version: NekoSuneOSC runs entirely on your own computer. We do
not operate any servers and we do not collect, transmit, or store your data.**

## 1. We collect nothing
NekoSuneOSC has no backend, no analytics, no telemetry, and no accounts. We, the
developers, never receive any information from your use of the App.

## 2. Local-only settings
Your settings — including any tokens, client IDs, API keys, usernames, presets, and
toggles — are stored **locally on your device** using the operating system's
per-user application data directory. They never leave your machine except to be
sent directly to the third-party service they belong to (see below).

## 3. Direct connections to third parties
When you enable a feature, the App talks **directly** from your computer to that
service's API using the credentials you provided:

- **VRChat** — OSC messages over local UDP (127.0.0.1).
- **Discord** — Rich Presence / voice via the local Discord client (RPC).
- **Twitch** — Helix API for follower counts (your OAuth token).
- **TikTok** — public profile / live data (via tiktok-live-connector and, for
  signing, Euler Stream).
- **Kick** — public channel data.
- **Pulsoid** — your heart-rate stream (your token).
- **AI providers** (OpenAI, Ollama, LiteLLM, Gemini, Grok, Groq, OpenRouter,
  Anthropic, or a custom endpoint) — only the chatbox text you choose to send.

Each of these services has its own privacy policy and terms, which govern the data
you exchange with them. We are not responsible for their handling of your data.

## 4. Now Playing
The "Now Playing" feature reads the currently playing media title/artist from your
Windows media session locally to display it. This information is only sent where you
direct it (your VRChat chatbox / KAT / overlay) and is never sent to us.

## 5. No selling of data
We do not sell, share, or monetize any data. We have none to sell.

## 6. Children
The App is not directed at children under the age required by the third-party
platforms you connect to.

## 7. Changes
We may update this policy; the "Effective date" above will change accordingly.

## 8. Contact
For privacy questions, contact NekoSuneVR via the project's official channels.

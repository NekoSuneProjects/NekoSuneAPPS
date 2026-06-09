# Changelog

All notable changes to **NekoSuneOSC** are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-06-09

🎉 First release of **NekoSuneOSC** — a standalone VRChat OSC companion by NekoSuneVR,
built on the proven OSCAudiolink architecture.

### Added
- **Chatbox** — manual typing to VRChat (`/chatbox/input`) plus an auto-rotating
  composer that cycles live data lines into the chatbox.
- **Status presets** — templated lines with tokens (`{time}`, `{song}`, `{cpu}`,
  `{gpu}`, `{ram}`, `{hr}`, `{down}`, `{up}`, `{ping}`, `{tiktok}`, `{twitch}`,
  `{kick}`, `{window}`).
- **AudioLink** — real-time spectrum (Low/Bass/Mid/Treble) sent over OSC, carried
  from OSCAudiolink.
- **Now Playing** — Windows media session detection with **KAT** (KillFrenzy
  AvatarText) support and optional chatbox posting.
- **Live follower counters**:
  - **TikTok LIVE** (via `tiktok-live-connector`) — total followers, session
    new-follows, viewers, likes.
  - **Twitch** (Helix API) — follower total.
  - **Kick.com** (channel JSON endpoint) — follower total + live/viewer state.
- **TikTok TTS** — community `gesserit.co` voice synthesis (with proper JSON escaping
  of the spoken text).
- **IntelliChat** — OpenAI-powered rewrite / spellcheck / shorten / translate.
- **Component stats** — CPU/GPU/RAM load & temps via `systeminformation`.
- **Network stats** — up/down throughput and ping.
- **Window activity** — active window/app title.
- **Heart rate** — live BPM from **Pulsoid** over WebSocket.
- **Discord Rich Presence** — show NekoSuneOSC on your Discord profile.
- **VR gear battery** — module scaffold (needs a native OpenVR helper; see README).
- **OBS overlay** — browser-source now-playing overlay with multiple styles.
- **Theme engine** — Midnight, Dark, Neon, Rainbow, Pink, Green, Light.
- **Cross-platform CI** — GitHub Actions builds Windows, Linux and macOS installers.

### Discord (full integration)
- **Rich Presence** + **voice detection**: current voice channel name, user count, who's
  speaking, and your mute/deafen state — shown in the app, available as a chatbox line
  (`💜 channel (n) 🔇`) and sent to VRChat as avatar OSC params. Falls back to Rich
  Presence if Discord rejects the private voice scope.

### Performance (round 2)
- **Single-instance lock** — fixes the process count ballooning (e.g. 23 Electron
  processes) when launched more than once.
- **Hardware acceleration disabled** — drops "GPU Very high" to near zero on this
  lightweight UI.
- **Now Playing is now lazy** — the PowerShell media query only runs when something
  uses it (KAT, chatbox now-playing, a {song} preset, or the Now Playing tab open).
- **Component stats**: expensive GPU/temperature WMI queries refresh every 6th tick
  (not every tick) and never overlap; network ping every 5th tick.
- Global `uncaughtException` / `unhandledRejection` guards so a flaky network/poller
  can't hard-crash the app.

### Performance (round 1)
- Canvas redraws (spectrum + OSC graph) are **skipped when their tab isn't visible**
  and the OSC graph is throttled to ~6fps — big win for an always-running app.
- OSC log is now a **capped 200-line buffer** flushed twice a second (prevents lag
  when VRChat floods incoming OSC).
- Now Playing PowerShell query polls every 8s instead of 5s.
- Removed the runtime **Tailwind CDN** (unused) — faster, offline, no MutationObserver.

### Settings persistence
- Status presets **auto-save** as you type; Stats/Network/Window toggles and the
  rotation interval persist and auto-restore on launch.

### Chatbox
- **Multi-line layout** — every source can be its **own permanent line** or join the
  single **rotating line** (cycles one item at a time), matching the stacked in-game
  chatbox look. Rotating line can sit at the top or bottom, with a live preview.
- **Heart rate session stats** — the HR line shows `bpm | avg | max | min`.

### Notes
- TikTok uses **tiktok-live-connector v2** with [Euler Stream](https://www.eulerstream.com)
  signing. Add a free API key in the TikTok card if you hit `SignatureError`.
- Network/native work runs in the Electron **main process** and is exposed to the
  renderer through preload IPC.
- VR gear battery is a documented extension point and currently reports
  "unavailable" until a native OpenVR helper is wired in.

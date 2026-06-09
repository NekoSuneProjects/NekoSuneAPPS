# NekoSuneOSC 🦊💬

A standalone **VRChat OSC companion** by **NekoSuneVR** — built on the proven
[OSCAudiolink](../OSCAudiolink) architecture, with a polished themed UI.

> Chatbox · Status · AudioLink · Now Playing (KAT) · Component & Network stats ·
> Heart rate · TikTok / Twitch / Kick follower counters · TikTok TTS · IntelliChat ·
> Discord Rich Presence · OBS overlay.

---

## ✨ Features

| Module | What it does | Needs |
| --- | --- | --- |
| 💬 **Chatbox** | Type to VRChat + auto-rotate live data lines | — |
| 📝 **Status presets** | Templated lines with `{tokens}` | — |
| 🔊 **AudioLink** | Low/Bass/Mid/Treble spectrum over OSC | audio output device |
| 🎵 **Now Playing** | Windows media + KAT + chatbox posting | Windows |
| 🎬 **TikTok followers** | Live followers / viewers / new follows | creator must be **live** |
| 🟣 **Twitch followers** | Follower total (Helix) | Client ID + OAuth token |
| 🟢 **Kick followers** | Follower total + live state | channel slug |
| 🗣 **TikTok TTS** | Voice synthesis via gesserit.co | — |
| ✨ **IntelliChat** | AI rewrite/spellcheck/shorten/translate | OpenAI API key |
| 🖥 **Component stats** | CPU/GPU/RAM load & temps | — |
| 🌐 **Network stats** | Up/down + ping | — |
| 🪟 **Window activity** | Active app/window title | — |
| ❤️ **Heart rate** | Live BPM | Pulsoid token |
| 💜 **Discord RPC** | Rich Presence | Discord App ID |
| 🔋 **VR gear battery** | HMD/controller battery | native OpenVR helper (see below) |
| 🖥 **OBS overlay** | Now-playing browser source | — |

---

## 🚀 Quick start

```bash
cd "D:/DEV/NekoSuneVRAPPS/VRChatStuff/NekoSuneOSC"
npm install
npm start
```

In VRChat, enable **OSC** (Action Menu → Options → OSC → Enabled). NekoSuneOSC sends
to `127.0.0.1:9000` and can receive on `9001` (configurable in **Settings**).

---

## 🔑 Getting tokens

- **TikTok**: enter the creator's `@username` while they are **live**. TikTok requests
  are signed through [Euler Stream](https://www.eulerstream.com); anonymous signing is
  rate-limited and can fail with a `SignatureError`, so grab a **free API key** there and
  paste it into the TikTok card if connecting fails.
- **Twitch**: create an app at the [Twitch Dev Console](https://dev.twitch.tv/console)
  for a **Client ID**, then generate a **User OAuth token** with the
  `moderator:read:followers` scope (e.g. [twitchtokengenerator.com](https://twitchtokengenerator.com)).
- **Kick**: enter your channel slug (the bit after `kick.com/`). ⚠️ Kick is behind
  Cloudflare; if polling returns `403`, a browser-based fetch fallback is needed
  (`fetchViaBrowser` hook in `modules/live/kickModule.js`).
- **Pulsoid**: create a token at [pulsoid.net keys](https://pulsoid.net/ui/keys)
  with `data:heart_rate:read`.
- **OpenAI**: an API key from [platform.openai.com](https://platform.openai.com/api-keys).
- **Discord**: an Application (Client) ID from the
  [Discord Developer Portal](https://discord.com/developers/applications).

---

## 🏗 Architecture

```
NekoSuneOSC/
├─ main.js            # Electron main process — owns all network/native modules + IPC
├─ preload.js         # IPC bridge (window.electronAPI)
├─ renderer.js        # UI logic, chatbox composer wiring
├─ index.html         # themed tabbed UI (CSS-variable theme engine)
├─ settings.js        # electron-store persistence
└─ modules/
   ├─ vrchatosc/      # OSC over dgram + KAT text protocol   (from OSCAudiolink)
   ├─ audio/          # AudioLink spectrum                    (from OSCAudiolink)
   ├─ media/          # Windows Now Playing                   (from OSCAudiolink)
   ├─ overlay/        # OBS overlay server                    (from OSCAudiolink)
   ├─ chatbox/        # chatboxComposer — merges + rotates sources
   ├─ status/         # presets + token resolver
   ├─ stats/          # componentStats + networkStats
   ├─ heartrate/      # pulsoidModule (WebSocket)
   ├─ activity/       # windowActivity
   ├─ live/           # tiktokModule, twitchModule, kickModule, tiktokTts
   ├─ ai/             # intelliChat (OpenAI)
   ├─ integrations/   # discordRpc
   └─ vr/             # vrBattery (extension point)
```

Network/native code runs in the **main process** and streams updates to the renderer
via `mainWindow.webContents.send(...)`; the renderer subscribes with
`electronAPI.on('<channel>', cb)`.

---

## 🔋 VR gear battery (extension point)

VR battery is read through the native OpenVR runtime (`openvr_api.dll`).
There is no well-maintained pure-Node OpenVR binding, so `modules/vr/vrBattery.js`
currently reports *unavailable*. To make it real, ship a small native helper
(C#/C++ using OpenVR) that prints device-battery JSON and spawn it from that module.

---

## 📦 Building installers

```bash
npm run build:win     # Windows nsis + msi
npx electron-builder --linux   # AppImage + deb
npx electron-builder --mac     # dmg + zip (run on macOS)
```

CI builds all three OSes on every push via
[`.github/workflows/build.yml`](.github/workflows/build.yml). Pushing a `vX.Y.Z` tag
also publishes a GitHub Release with the installers attached.

---

## 📜 License & policies

**Proprietary — All Rights Reserved.** © 2024–2026 NekoSuneVR. You may run the
official releases for personal use only; you may **not** modify, redistribute,
reverse engineer, or use the code/assets to train AI. See [LICENSE](LICENSE),
[TOS.md](TOS.md), [PRIVACY.md](PRIVACY.md), and [DISCLAIMER.md](DISCLAIMER.md).
Version history is in [CHANGELOG.md](CHANGELOG.md).

![NekoSuneAPPS](assets/readme-banner/nekosuneapps-cute-banner.png)

# NekoSuneAPPS 🦊💬

A standalone **VRChat OSC companion** by **NekoSuneVR** — chatbox, heart rate, now
playing, Discord, world radar & more, in one polished themed app.

> Chatbox · Status · AudioLink · Now Playing (KAT) · Component & Network stats ·
> Heart rate (Pulsoid / HypeRate) · TikTok / Twitch / Kick counters · TikTok TTS ·
> IntelliChat · Discord Rich Presence (world + Join button) · Discord Voice Bot ·
> VRChat auto-status · Radar · Weather · SpotiOSC · DiscordOSC · Soundpad ·
> Stopwatch · Calculator · Auto-AFK · OBS overlay.

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
| ✨ **IntelliChat** | AI rewrite/spellcheck/shorten/translate | OpenAI-compatible key |
| 🖥 **Component stats** | CPU/GPU/RAM load & temps | — |
| 🌐 **Network stats** | Up/down + ping | — |
| 🪟 **Window activity** | Active app/window title | — |
| ❤️ **Heart rate** | Live BPM + session history | **Pulsoid** token or **HypeRate** key |
| 💜 **Discord Rich Presence** | World + ❤️ BPM + 🎵 song, with a **Join World** button | Discord App ID |
| 🤖 **Discord Voice Bot** | Read voice state + server mute/deafen via OSC (no allowlist) | your own bot token |
| 🦊 **VRChat auto-status** | Detect 🟢/🔵/🟠/🔴 from your account | VRChat login (2FA ok) |
| 🫂 **Social suite** | Friends, groups, search, profiles, favourites, notifications, **create group instances**, **bio prefabs** | VRChat login |
| 🧰 **VRChat tools** | YouTube fix (yt-dlp), **VRCVideoCacher** install/run, cache tools | Windows |
| 📡 **Radar** | Live list of players in your instance | reads VRChat log |
| 🌦 **Weather** | Current conditions as `{weather}` | a city (Open-Meteo, no key) |
| 🎵 **SpotiOSC** | Control Spotify from VRChat avatar params | OSC receive on |
| 🎙 **DiscordOSC** | Mute/deafen from VRChat avatar params | Discord Voice Bot |
| 🔊 **Soundpad** | Trigger Leppsoft Soundpad sounds | Soundpad running |
| ⏱ **Stopwatch / 🧮 Calculator / 💤 Auto-AFK** | Handy tools, post to chatbox | — |
| 🔋 **VR gear battery** | HMD/controller battery | native OpenVR helper (see below) |
| 🖥 **OBS overlay** | Now-playing browser source | — |

---

## 🚀 Quick start

```bash
cd "D:/DEV/NekoSuneVRAPPS/VRChatStuff/NekoSuneOSC"
npm install
npm start
```

In VRChat, enable **OSC** (Action Menu → Options → OSC → Enabled). NekoSuneAPPS sends
to `127.0.0.1:9000` and can receive on `9001` (configurable in **Settings** — receive
must be **on** for KAT, SpotiOSC and DiscordOSC).

The sidebar is grouped into **VRChat**, **Tools**, and **General**.

---

## 🔑 Getting tokens & accounts

- **Pulsoid**: token at [pulsoid.net keys](https://pulsoid.net/ui/keys) with `data:heart_rate:read`.
- **HypeRate**: request an API key from HypeRate, then enter it + your `hyperate.io/<id>` device ID.
- **VRChat account** (auto-status / Radar): log in on the **VRChat** tab. Handles email &
  authenticator 2FA. Your **password is never stored** — only the session cookie, locally.
- **Discord (Rich Presence)**: an Application (Client) ID from the
  [Discord Developer Portal](https://discord.com/developers/applications). A default ID is preset.
- **Discord (Voice Bot)**: create a **bot**, copy its **token**, use the in-app **Invite link**
  to add it to **your own private server**, and enter your Discord **user ID**. It stays invisible.
- **TikTok**: enter the creator's `@username` while they are **live** (add a free
  [Euler Stream](https://www.eulerstream.com) key if you hit `SignatureError`).
- **Twitch**: Client ID from the [Twitch Dev Console](https://dev.twitch.tv/console) + a User
  OAuth token with `moderator:read:followers`.
- **Kick**: your channel slug (after `kick.com/`).
- **OpenAI / compatible**: an API key from your provider.

---

## 🎛 OSC control parameters

Enable **OSC receive** in Settings, then drive these VRChat **avatar parameters** (bool):

```
SpotiOSC   /avatar/parameters/VRCOSC/Spotify/PlayPause   (also /Next /Previous /Stop)
DiscordOSC /avatar/parameters/VRCOSC/Discord/Mute        (also /Deafen)
```

---

## 🏗 Architecture

```
NekoSuneAPPS/
├─ main.js            # Electron main — owns all network/native modules + IPC
├─ preload.js         # IPC bridge (window.electronAPI)
├─ renderer.js        # UI logic, chatbox composer wiring
├─ index.html         # themed tabbed UI (CSS-variable theme engine)
├─ settings.js        # electron-store persistence
└─ modules/
   ├─ vrchat/         # VRChat-specific
   │  ├─ osc/         # OSC + KAT, media keys (SpotiOSC)
   │  ├─ chatbox/     # chatboxComposer — merges + rotates sources
   │  ├─ status/      # presets + token resolver
   │  ├─ audio/       # AudioLink spectrum
   │  ├─ world/       # world + radar (log tailer)
   │  ├─ api/         # VRChat API (auto status)
   │  └─ vr/          # vrBattery (extension point)
   ├─ heartrate/      # pulsoidModule, hyperateModule, hrAnalytics
   ├─ weather/        # Open-Meteo
   ├─ integrations/   # discord (RPC), discordBot, soundpad, twitchOauth
   ├─ live/           # tiktok, twitch, kick, tiktokTts
   ├─ media/ stats/ activity/ ai/ overlay/
```

Network/native code runs in the **main process** and streams updates to the renderer
via `mainWindow.webContents.send(...)`; the renderer subscribes with
`electronAPI.on('<channel>', cb)`.

---

## 🔋 VR gear battery (extension point)

VR battery is read through the native OpenVR runtime (`openvr_api.dll`). There is no
well-maintained pure-Node OpenVR binding, so `modules/vrchat/vr/vrBattery.js` currently
reports *unavailable*. To make it real, ship a small native helper (C#/C++ using OpenVR)
that prints device-battery JSON and spawn it from that module.

---

## 📦 Building installers

```bash
npm run build:win              # Windows nsis + msi
npx electron-builder --linux   # AppImage + deb
npx electron-builder --mac     # dmg + zip (run on macOS)
```

CI builds all three OSes on every push via
[`.github/workflows/build.yml`](.github/workflows/build.yml). Pushing a `vX.Y.Z` tag also
publishes a GitHub Release with the installers attached. The app ships **no native
node-gyp modules**, so Windows/macOS/Linux all build without a C++/Python toolchain
(window-activity uses the OS's own CLI: PowerShell / `osascript` / `xdotool`).

---

## 📜 License & policies

**Proprietary — All Rights Reserved.** © 2024–2026 NekoSuneVR. You may run the official
releases for personal use only; you may **not** modify, redistribute, reverse engineer, or
use the code/assets to train AI. See [LICENSE](LICENSE), [TOS.md](TOS.md),
[PRIVACY.md](PRIVACY.md), and [DISCLAIMER.md](DISCLAIMER.md). Version history is in
[CHANGELOG.md](CHANGELOG.md).

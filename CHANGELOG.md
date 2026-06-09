# Changelog

All notable changes to **NekoSuneAPPS** are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-06-09

🎉 First release of **NekoSuneAPPS** — a standalone VRChat OSC companion by NekoSuneVR,
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
- **Discord Rich Presence** — show NekoSuneAPPS on your Discord profile.
- **VR gear battery** — module scaffold (needs a native OpenVR helper; see README).
- **OBS overlay** — browser-source now-playing overlay with multiple styles.
- **Theme engine** — Midnight, Dark, Neon, Rainbow, Pink, Green, Light.
- **Cross-platform CI** — GitHub Actions builds Windows, Linux and macOS installers.

### Discord (full integration)
- **Rich Presence** + **voice detection**: current voice channel name, user count, who's
  speaking, and your mute/deafen state — shown in the app, available as a chatbox line
  (`💜 channel (n) 🔇`) and sent to VRChat as avatar OSC params. Falls back to Rich
  Presence if Discord rejects the private voice scope.
- **VRChat world in Rich Presence** — the current world name is read live from VRChat's
  output log and shown on your Discord profile, with up to two clickable buttons:
  **🌐 Join World** (deep-links into your instance) and **👤 VRChat Profile**.
- **VRChat status privacy gate** — a status selector (🟢 Join Me / 🔵 Active /
  🟠 Ask Me / 🔴 Do Not Disturb). The world name and Join button are only revealed on
  **Join Me / Active**; **Ask Me / Do Not Disturb** hide your location. Changes apply to
  the live presence instantly. Your profile URL is auto-detected from the log (with an
  optional manual override).

### VRChat world tracking
- New **world tracker** that tails VRChat's rolling `output_log` to detect the current
  **world name, world ID, instance ID** and your own **user ID** — used to build the
  Discord join/world/profile links. Reacts to joining, leaving and new game sessions.

### Startup / auto-start
- New **Startup** card in Settings: **Launch on system login**, **Start minimized to
  tray**, and per-feature **auto-start on launch** for Discord, Heart rate, Component
  stats, Network stats, Window activity, Twitch and Kick — saved tokens/IDs are reused,
  so there's no need to press Connect every launch.

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

### Rebrand → NekoSuneAPPS
- App renamed from **NekoSuneOSC / NekoChatbox** to **NekoSuneAPPS** (title, tray,
  brand, installer appId `com.nekosunevr.nekosuneapps`, RPC strings).
- **Sidebar regrouped** into **VRChat / Tools / General** sections.
- **Modules reorganised** — VRChat-specific modules now live under
  `modules/vrchat/` (`osc`, `chatbox`, `status`, `audio`, `world`, `vr`); new OSC
  control modules will nest under `modules/vrchat/osc/`.

### Tools
- **Stopwatch** — live display, send-to-chatbox, optional live-updating chatbox line.
- **Calculator** — mathjs-powered expression evaluator with send-to-chatbox.
- **Auto-AFK** — idle detection via the OS idle timer; posts a customisable AFK /
  back message (tokens `{mins}`, `{time}`) to the chatbox.

### Heart rate (Pulsoid + HypeRate)
- **HypeRate.io** added as an alternative provider alongside Pulsoid (pick per the
  Provider selector; HypeRate needs an API key + device/session ID).
- **Session history** — every heart-rate session is saved (duration, avg, min, max,
  samples, provider) and listed in the Heart rate card; clearable.
- **Discord presence enrichment** — the Rich Presence now contextually shows your
  VRChat world, **❤️ live BPM**, and **🎵 now playing**, with per-item toggles. The
  presence "switches" by context: world when in VRChat, otherwise the current song.

### VRChat cluster
- **Auto status detection** — optional VRChat account login (in the new **VRChat**
  tab) reads your live status (🟢 Join Me / 🔵 Active / 🟠 Ask Me / 🔴 DND) via the
  VRChat API and auto-applies it to the Discord world-visibility gate. Handles email
  & authenticator 2FA; **password is never stored**, only the session cookie.
- **Radar** — live list + count of players currently in your instance, parsed from
  the VRChat log (`OnPlayerJoined` / `OnPlayerLeft`). Player count is exposed as the
  `{players}` chatbox token.
- **Weather** — current conditions via Open-Meteo (free, no key); pick a city + units.
  Exposed as the `{weather}` chatbox token and shown in the VRChat tab.
- **VRChat Tools** (inspired by VRCNext, all external/file-based — no game injection):
  **YouTube fix** (downloads the latest `yt-dlp.exe` into VRChat's Tools folder so world
  video players work), **cache size / clear**, and quick **open-folder** shortcuts
  (data, cache, tools, photos).

### UI — VRCNext-style layout
- **Three-column layout**: a slim **icon rail** (hover tooltips, app logo, live **clock**,
  round **Launch VRChat** button) · the content area · a **right friends panel**.
- **Right friends panel** — your profile + current instance + **friends grouped by
  Same Instance / Online** (avatars, status dots, locations) with a search box, from the
  VRChat API (auto-refresh).
- **Notifications flyout** — a 🔔 bell with an unread badge; lists VRChat notifications and
  **Accept**s friend requests inline.
- **Click a friend → tabbed profile modal** (VRCNext-style): **Info** (banner, avatar, trust
  rank, platform/18+/VRC+, status, bio + links, **badge images**, joined/last-login, age-verified,
  avatar-cloning), **Groups**, **Content** (public worlds), **Mutuals** & **Favs.** (explained
  where VRChat keeps them private). Actions: **Add Friend ↔ Unfriend** (auto-detects existing
  friendship), **Invite** (to your instance), **Request Invite**. Boop is in-game-only — explained,
  not faked.
- **Scrollbars hidden** everywhere (still scrollable) for a tidier look.

### UI overhaul — tidier, green, seasonal
- **Split the crammed mega-pages into focused pages** — the VRChat tab became
  **VRChat / Radar / Weather / OSC Control / VRChat Tools**; **Heart Rate** got its own
  page (out of Stats); **Discord** and **Overlay** split from Integrations.
- **Sidebar regrouped** into **VRChat · Social · General** with one page per feature.
- **Green is now the default theme.** The **theme switcher was removed** — the theme is
  fixed/auto-selected.
- **Auto seasonal themes** (not user-switchable): 🎃 Halloween (late Oct), 🎄 Christmas
  (Dec), 🏳️‍🌈 Pride (June), 🐰 Easter (computed), green otherwise — with a season badge
  in the top bar.

### VRChat companion (VRCNext-style, our names — all API/local, no game injection)
- **🫂 Friend Den** — your online friends and where they are (status + location), via the
  VRChat API, with optional 60s auto-refresh.
- **🔭 Event Scout** — track upcoming events across **multiple** VRChat groups; tick the
  groups to watch and their events are merged and sorted.
- **🐾 Pawprints** — local per-world **time-spent** tracking from the VRChat log.
- New sidebar entries for each; built on the existing VRChat login.

### Discord voice bot + OSC control
- **Discord Voice Bot** — the no-allowlist alternative to the private `rpc.voice.read`
  scope. You run your own bot (paste its token), invite it to **your own private
  server** (an invite link with the right perms is generated), and it stays
  **invisible/offline**. It reads your voice state (channel, user count, mute/deafen)
  and reports **call started / ended**.
- **DiscordOSC** — VRChat avatar params can **server-mute / server-deafen** you via
  the bot (`/avatar/parameters/VRCOSC/Discord/Mute` · `/Deafen`).
- **SpotiOSC** — VRChat avatar params control Spotify via global media keys
  (`/avatar/parameters/VRCOSC/Spotify/PlayPause` · `/Next` · `/Previous` · `/Stop`).
- **Soundpad** — control Leppsoft Soundpad (play by #, stop, next/prev, pause,
  random, load sound list) via its Remote Control pipe. (Tools tab.)
- New dependency: `discord.js` (run `npm install`).

### Docs & policies
- New **[FEATURES.md](FEATURES.md)** — full feature list + safety summary (no data
  collected/shared, no code injection into VRChat or any app, account/ban risk is the
  user's own and tied to following each platform's ToS).
- **README** rebranded with banner; **TOS / PRIVACY / DISCLAIMER** updated for the new
  features and a clear "no code injection / use at your own risk / not responsible for
  bans" stance. Feature requests → the GitHub Issues page.

### Build / packaging
- **Cross-platform installers fixed** — Windows (NSIS + MSI), Linux (AppImage + deb)
  and macOS (dmg + zip) now build cleanly in CI:
  - added the required author **email** / Linux **maintainer** (deb/AppImage need it),
  - switched the macOS & Linux icon to a 1024×1024 **PNG** (`.ico` isn't valid there),
  - disabled macOS code-signing/notarization in CI (no certs on the runner),
  - removed the bogus `dgram` dependency (it's a Node.js built-in).

### Notes
- TikTok uses **tiktok-live-connector v2** with [Euler Stream](https://www.eulerstream.com)
  signing. Add a free API key in the TikTok card if you hit `SignatureError`.
- Network/native work runs in the Electron **main process** and is exposed to the
  renderer through preload IPC.
- VR gear battery is a documented extension point and currently reports
  "unavailable" until a native OpenVR helper is wired in.

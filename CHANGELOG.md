# Changelog

All notable changes to **NekoSuneAPPS** are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [1.0.20] - 2026-06-14

### Changed
- **Trust ranks now mirror VRChat exactly (like the OGTrustRanks mod).** That mod
  doesn't compute ranks itself — it calls VRChat's still-present internal
  `APIUser.GetTrustRankEnum()` / `GetFriendlyDetailedNameForSocialRank()`, which keep
  producing Veteran & Legend (VRChat only hid the display). Those are driven by trust
  tags, so we map them the same way:
  `system_trust_legend` → **Legend**, `system_trust_veteran` → **Veteran**,
  `system_trust_trusted` → Trusted User, `system_trust_known` → Known User,
  `system_trust_basic` → User. Reverted the 1.0.19 join-year gating — `system_trust_veteran`
  genuinely IS the OG Veteran tier (so it's common by design), and **Legend** is reserved
  for the grandfathered legend tag, so true legends like Shadowriver show Legend.

## [1.0.19] - 2026-06-14

### Fixed
- **Almost everyone showed as "Veteran".** VRChat's `system_trust_veteran` tag is
  just its internal name for **Trusted User** — not the old Veteran rank — so mapping
  it to Veteran promoted every trusted user. Corrected the trust mapping to real rank
  names (top trust = Trusted User). Now:
  - **Legend** comes from the grandfathered legend tag (`system_legend` /
    `system_trust_legend`), so true legends (e.g. Shadowriver) show Legend.
  - **Veteran** is reserved for top-trust accounts old enough to have actually held
    it (joined ≤ 2019), so it's rare again — newer trusted users read as Trusted User.

## [1.0.18] - 2026-06-14

### Added
- **Friends' community rank from VRChat trust.** Friends now show an estimated
  NekoSuneAPPS Community Rank read straight from their VRChat trust tags — so anyone
  who earned it shows a **Veteran** (top trust, `system_trust_veteran`) or **Legend**
  badge. Veteran/Legend pills appear in the right sidebar; Trusted-and-up in the
  Friend Den; and the full estimated rank (plus a ✦ VRC+ supporter marker) in the
  profile modal. Honours the OG-tiers toggle (hidden tiers cap at Trusted User).
  Requires Community Ranks to be enabled.

## [1.0.17] - 2026-06-14

### Fixed
- **Sidebar friends location showed raw HTML** (e.g. `<span class="wn" data-world="wrl…`).
  The world-name span from `fmtLocation` was being double-escaped, so it rendered as
  literal text instead of resolving to the world name. The location now displays
  correctly again in the right friends list.

## [1.0.16] - 2026-06-14

### Fixed
- **Friends no longer all show as "offline".** The reconciled list was deriving
  online/offline from each friend's `state` field, which VRChat's friends endpoint
  doesn't reliably send. We now trust the API's online/offline buckets and tag each
  friend with a reliable `online` flag.

### Changed
- **Right sidebar friends are now classified VRCX-style** from `location`, not `state`:
  🟢 **Online** (in a world), 🌐 **Active** (on the website), ⚫ **Offline** — plus
  Same World and your favorite-friend **categories**. The Friend Den distinguishes
  Active vs Online the same way.

### Added
- **Community Ranks tab with the OG toggle.** A new "Community Ranks" tab exposes the
  **Enable Community Ranks** switch and the **Show OG tiers (Veteran & Legend)** toggle,
  a live rank card with the score breakdown, and a leaderboard.
- **Clickable names in History.** Player join/leave (including everyone seen in a
  world/lobby), friend add/remove, name changes and alerts now have clickable names —
  click to open that user's profile (resolved by VRChat search).
- **Previous display names on profiles.** The profile modal now shows a "Previously
  known as" list, reconstructed from the local name-change history.

## [1.0.15] - 2026-06-14

### Fixed
- **Friends list no longer drops people.** VRChat's two paginated friend buckets
  (online / offline) don't always add up to your real friend list. We now reconcile
  against the authoritative account friend-id list and individually re-fetch any
  stragglers (VRCX-style), so missing friends show up again. New `getAllFriends()`.
- The left **Friend Den** now shows your **complete** list (was online-only) with
  paging, online-first ordering, and an honest "online / total" count.

### Added
- **Spoken-language flag badges.** Friends' VRChat `language_*` tags are rendered as
  flag emoji 🇯🇵🇬🇧🇰🇷 in the Friend Den, the right sidebar, and the profile modal so
  you can tell at a glance which languages someone speaks. (50+ languages mapped.)
- The **right sidebar** now lists **all** friends per group (paging cap removed; the
  panel scrolls), using the same reconciled, complete friend list.
- **NekoSuneAPPS Community Ranks** (opt-in) — an independent community reputation
  system that brings back the spirit of the retired Veteran / Legend ranks. Off by
  default; toggle via `communityRanks.enabled` (and `ogMode` to show/hide the OG
  tiers). 0–1000 weighted scoring, anti-farming curves, SQLite-backed, with an
  optional REST surface. See `docs/community-ranks-spec.md`.

## [1.0.14] - 2026-06-13

### Fixed
- **Update dialog now renders Markdown.** The "Update available" release notes were
  showing raw `### Added`, `**bold**` and `` `code` `` text. Added a lightweight
  Markdown renderer (headings, bold, inline code, lists, links, dividers) so the notes
  display formatted, and raised the notes length so they're not cut off mid-section.

## [1.0.13] - 2026-06-13

### Added
- **Terrors of Nowhere works without ToNSaveManager.** A new log reader
  (`tonLogReader.js`) tails VRChat's own output log and parses ToN's lines directly —
  **save codes** (`[START]…[END]`), **round type + map** (`This round is taking place
  at …`), **terror IDs**, **deaths**, **round end**, **stuns** and **damage**. Verified
  against a real log: 16 rounds, 12 save codes, deaths/survivals/stuns all parsed.
- **Achievements auto-update from captured saves.** Every save code captured (from the
  log *or* ToNSaveManager) is auto-decoded and the unlocked achievements are marked on
  the board — so your achievements stay current with no manual steps and no
  ToNSaveManager. (ToN doesn't log achievements individually; the save code is the
  source, and we decode it.)

### Changed
- ToNSaveManager is now genuinely **optional** — the log reader is the default source;
  ToNSaveManager (when running) still adds the richest live data + lifetime stats and
  takes over while its WebSocket is connected.

## [1.0.12] - 2026-06-13

### Added
- **Custom sidebar icons.** The nav rail now uses a full set of custom icons (one per
  tab) instead of emoji — much clearer. Icons live in `assets/icons/<tab>.png` and are
  swapped in automatically; a missing file just keeps the emoji.
- **About page** — a new tab with the app version, what NekoSuneAPPS is, that it's made
  by **NekoSuneVR**, links (GitHub, repository, releases, issues), a **Check for updates**
  button, and a **Contributors** list auto-detected from the GitHub repository.

### Changed
- **Notifications reworked.** The bell badge now counts **unread only** (not every cached
  item — fixes the count staying at e.g. "16" after you'd reviewed them). The bell opens a
  **tabbed popup** — 👋 Requests · 📨 Invites · 🔔 Alerts · 📣 Groups — each tab showing its
  unread count. **✓ Mark all read** clears the badge, and opening the bell marks them read.
  Group announcements/events now appear in the Groups tab.
- **ToNSaveManager is now labelled optional.** Reading ToN directly from VRChat's log
  (so it works without ToNSaveManager's WebSocket) is on the roadmap (see TODO).
- **Richer GitHub release notes** — releases now include the changelog's Added/Changed/
  Fixed sections and a downloads list, not just the compare link.

## [1.0.11] - 2026-06-13

### Added
- **Online count by platform.** The top-bar count now reads **🌐 Total** (all platforms,
  from VRChat) plus **🖥️ Steam** (PC desktop/PCVR, from Steam's public player-count API
  for VRChat) and **🥽 Quest** (everything non-Steam = total − Steam: Quest standalone,
  Meta Store, mobile). Same method the public VRChat metrics sites use; no extra keys.

## [1.0.10] - 2026-06-13

### Changed
- **VR-friendly save copy.** Tap anywhere on a backup row to copy its code to the
  clipboard — no need to highlight text (which you can't do in VR). Removed the
  read-only code textarea and the advanced raw decode/diff tools from the Save backups
  view; importing already reads your achievements automatically.

### Fixed
- **World now shows after an app restart/update.** The right-rail world + radar are
  primed from the current VRChat log on startup, instead of only updating on the next
  world change (which left it stuck on "Not in a world").
- **Avatar falls back to a VRChat icon** in the right-rail profile when you have no
  profile picture (or it fails to load), instead of the app logo / a broken image.

## [1.0.9] - 2026-06-13

### Changed
- **Import a save → instant catch-up.** Pasting your save code and clicking **Import &
  catch up** now automatically decodes your achievements and ticks them on the board in
  one step — no manual decode/apply, and it jumps you to the achievements view with a
  plain summary ("Imported from <name> — 13/200 achievements, 10 newly added"). The
  technical decode/diff tools are tucked into clearly-labelled **Advanced (developer)**
  sections you can ignore.

## [1.0.8] - 2026-06-13

### Added
- **Update checker** — on launch the app asks the GitHub Releases API for the latest
  version and, if a newer one exists, shows an "Update available" dialog with the
  release notes and two choices: **Install update** (opens the Windows installer
  download) or **Remind me later** (dismisses; it checks again next launch).
- **Reset all ToN data** — a button in the Terrors → Player data card clears every
  board unlock (achievements/items/rounds), all terrors/maps seen, and the round
  history, behind a confirmation. Save-code backups are kept (they have their own
  Clear button). Lifetime stats live in ToNSaveManager and repopulate on connect.

## [1.0.7] - 2026-06-13

### Added
- **Windows installers + release publishing** — the app now ships as an NSIS `.exe`
  setup and an `.msi`, built in CI for Windows/macOS/Linux. Fixed the GitHub Actions
  release job (write permission, publish on any tag, resilient to a failing OS leg).

## [1.0.6] - 2026-06-13

### Changed
- **Real ToN save decoder (replaces the 1.0.5 bitfield heuristic).** The save format
  was fully reverse-engineered from the decompiled world save engine: it's a four-layer
  obfuscation onion — `_convert` (custom Base64 alphabet) → 8-char seed prefix →
  scramble via Unity's `Random` (xorshift128, `Range(0,n)=next()%n`) → bytes + checksum
  → a length-prefixed field schema. The app now **fully decodes** an imported save:
  unscrambles it, verifies the checksum, and reads the **exact** achievement unlocks
  (and the save owner's name) — deterministic, no bit-order guessing. "Decode A → Apply
  to board" now lights up your true unlocks. The earlier 1.0.5 "achievement bitfield"
  guess was a false lead (the digit-runs it read were scramble artifacts) and has been
  removed.

## [1.0.5] - 2026-06-13

### Added
- **Locked / Unlocked filter on the Terrors reference board** — a new **All ·
  ✓ Unlocked · 🔒 Locked** toggle filters every category (achievements, terrors,
  items, locations, rounds) by unlock state. Combines with the existing search
  (names + unlock hints), and the header shows a live "showing N" count while a
  filter or search is active. Active category/filter buttons are now highlighted.
- **AudioLink avatar parameter reference** — the AudioLink tab and `FEATURES.md`
  now document the exact OSC avatar parameters the app sends (Low/Bass/Mid/Treble/
  Volume/Peak floats `0.0–0.92` + `Beat` bool) and how to add them to an avatar.
- **Import a ToN save code** — paste a `[START]…[END]` code (from ToNSaveManager,
  another PC, or a friend) into the Save backups panel to store it alongside the
  auto-captured backups. Codes are validated and `[START]/[END]` + whitespace are
  stripped automatically.
- **Save decode / diff (structural)** — a new lossless decoder turns a save code
  into its exact record→field structure (values kept as strings so big bit-packed
  integers and leading zeros survive), and **diffs two saves** to list exactly which
  fields changed. The format is proprietary with no public schema, so fields are
  intentionally **left unlabeled** — diffing is the supported way to work out what
  each field means. The app does **not** guess/auto-mark board unlocks from a save.
- **Catch up from stats** — a one-click button recomputes the lifetime-stat
  milestone achievements from the latest ToNSaveManager stats snapshot.
- **Decode achievement unlocks → catch up board** — reverse-engineered the save
  format enough to read the **achievement bitfield** (200 unlocks packed into one
  big integer) out of an imported save. The Save backups panel can decode it,
  **preview** the unlocked achievements, then **Apply to board** to light up the matching
  achievements on the reference board. Only achievements that match a board entry
  are marked — nothing is guessed. The bit order is **confirmed LSB** (verified across
  two players via the reserved "placeholder" achievement slots), and the decoder
  auto-warns if a chosen order marks an unreleased achievement as unlocked. (Other
  unlock categories aren't reliably identifiable from one save — the format is
  variable-length, so use Save diff on two same-player saves to map those.)

## [1.0.4] - 2026-06-10

### Added
- **Friends' worlds with privacy** — the Friend Den, right-rail and user popup now
  show the **world name** a friend is in for joinable instances
  (Public / Friends / Friends+ / Group / Group+), the instance type, and their
  status message. **Invite-only, Invite+ and Group-members instances show
  "🔒 In private world"** and never leak the world name.
- **Self-invite & copy world URL** — for a friend in a joinable instance, the user
  popup has **➡️ Invite me here** (self-invite to their instance) and **📋 Copy
  world URL** (a `vrchat.com/home/launch?...` link). Private instances point to
  Request Invite instead. World names are cached to stay light on the API.

## [1.0.3] - 2026-06-09

### Added
- **Live achievement auto-unlock** — when the game fires an achievement (WS
  `TRACKER { event:"achievement" }`), it's marked unlocked on the board instantly
  with a toast.
- **Dated save backups** — the in-game save code (WS `SAVED` event) is captured
  automatically into a timestamped backup history (last 200). Copy any code back
  to your clipboard to paste in-game and restore. Included in export/import.
- **Auto-connect on the Terrors tab** — opening 👻 Terrors connects to
  ToNSaveManager and **keeps retrying every 5s until connected**, with a live
  status line (🟢 connected / round info / 🔴 retrying) and rolling stat,
  encounter and ✓-marker updates — no need to toggle anything on the Stats tab.
- **Built-in ToNSaveManager management** — Install / Start / Stop / Update the
  ToNSaveManager app from the Terrors tab (downloads the latest release from
  GitHub, extracts and runs it in the background — the same job as the official
  `update.bat`, built in). Optional **auto-launch on app start** so the WS source
  is always up. No more separate download/update step.
- **VR / desktop alerts** (via `@nekosuneprojects/vrnotications`) — achievement
  unlocks (and optionally new-terror encounters) pop a notification **with the
  achievement/terror art as the icon**, **auto-routed** by whether you're in VR:
  XSOverlay or OVR Toolkit overlay toast when running, otherwise a Windows desktop
  notification. Channel is selectable (Auto / XSOverlay / OVR Toolkit / Windows /
  Off) with a Test button on the Terrors tab.

## [1.0.2] - 2026-06-09

### Added
- **ToN Reference tab** (👻 Terrors) — a fully **native, in-app** board (no
  embeds / no iframes): browse **Achievements** (with unlock hints + tips + art),
  **Terrors** (with art, ✓-marked once you've encountered them), **Items**,
  **Locations** (✓-marked once visited) and **Round types**, all searchable.
- **Offline ToN reference cache** — the dataset is fetched from terror.moe
  (achievements + terror roster) and tontrack.me (locations / items / rounds),
  stored locally so the board works offline, and auto-refreshed (re-fetching
  picks up anything new the sites add). Includes a manual "Refresh" button.
- **Cached icons + locked/unlocked board** — all achievement & terror art is
  downloaded to a local icon cache. Entries render **grayed-out when locked** and
  in **full colour when unlocked**, with the "how to unlock" hint shown. Terrors &
  maps auto-unlock from live play; **click any entry to toggle** its unlocked
  state (persisted). Each category shows an `X/Y unlocked` count.
- **Offline round history** — every finished round (type, terror, map,
  survived/died, duration) is saved locally and shown as a history list.
- **Terror/map encounters** — tracks how many distinct terrors you've "bumped
  into" and maps you've seen across sessions, persisted between launches.
- **Export / Import player data** — back up or move your ToN stats, encounters
  and round history as a JSON file.
- **ToNSaveManager integration** (Terrors of Nowhere) — connects to
  ToNSaveManager's local WebSocket API (Stats tab, default port `11398`) and
  surfaces the live round (round type, terror, map, alive/opted-in status,
  players in instance) plus lifetime + per-session stats (rounds / deaths /
  survivals / win rate / damage taken / stuns / records). Auto-reconnects when
  ToNSaveManager is closed or restarted, can show its own chatbox line, and adds
  a `{ton*}` token family: `{ton}` `{tonround}` `{tonterror}` `{tonmap}`
  `{tonalive}` `{tonplayers}` `{tonrounds}` `{tondeaths}` `{tonsurvivals}`
  `{tonwinrate}` `{tondamage}` `{tonstuns}`. Requires ToNSaveManager's
  "WebSocket API" enabled.
- **ToN achievements** — a milestone achievement system derived from your ToN
  stats (15 badges across rounds played, survivals, deaths, damage taken, stuns
  and win rate). The ToN card shows a stats grid and the full achievement list
  split into **✓ Unlocked** and **🔒 Locked** (with live progress %), and pops a
  toast on the status line the moment a new one unlocks.
- **Create group instances** — pick a world (your worlds + favourites) with
  access (members / group+ / public) and region, created from the group modal.
- **VRCVideoCacher** — install/update + start/stop the local video-cache proxy
  from the VRChat Tools tab.
- **Bio prefabs** — save/load/edit/delete reusable bios in the Profile Editor.
- **Discord RP buttons without the Game SDK** — buttons now survive over the local
  IPC RPC via a richness ladder (art+buttons → buttons only → art only → text),
  instead of being permanently dropped on a single error.

### Changed
- **No native node-gyp modules** — replaced `node-window-manager` (which broke
  Windows/macOS CI builds via `extract-file-icon`) with the OS's own CLI for
  window activity (PowerShell / `osascript` / `xdotool`). Builds now need no
  C++/Python toolchain.

### Performance
- 429 rate-limit backoff is now honoured by every poller; pollers are staggered
  on launch; right-rail sections cap at 150 rows; all dynamic images are
  `loading="lazy" decoding="async"` to cut memory and prevent crashes.

## [1.0.1] - 2026-06-09

### Performance
- **Far fewer background processes** — fixed the "too many programs running" lag
  where the app spawned a constant churn of `powershell.exe` and `conhost.exe`
  ("Console Window") processes:
  - **System & Network stats** now route every CPU/GPU/RAM/temperature/network/
    ping query through a single, reused PowerShell session (via
    `systeminformation`'s persistent shell) instead of spawning a brand-new
    `powershell.exe` (+ `conhost.exe`) for *every* reading. The shell is
    ref-counted: started when the first poller turns on, released when the last
    one turns off.
  - **Window Activity** polling slowed from every 3s to every 10s (5s floor),
    cutting its PowerShell spawns by ~70%.
  - **System Stats** poll interval relaxed 3s → 5s; **Network Stats** 3s → 5s.

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

### History, auto-greeter & more tools
- **📜 History** — a real **SQLite** game-log (via `sql.js`, no native build) recording
  **player join/leave**, **friend added/removed** (diffed), and **world visits**; filterable
  timeline with clear. (New dep: `sql.js` — run `npm install`.)
- **👋 Auto-Greeter** — auto-accept friend requests (everyone or an allow-list); logs to History.
- **🎚 Param Lab** — send any OSC avatar parameter (bool/int/float).
- **📸 Photo Relay** — auto-upload new VRChat screenshots to a Discord webhook.
- **⭐ Favorites** — add/remove favorites (worlds in the world modal, friends in the profile modal).

### VRChat browser (search + detail)
- **Search** page — search **users / worlds / groups** (results are clickable cards).
- **Open by ID / URL** — paste a `usr_`/`wrld_`/`grp_` id or a vrchat.com link to open it.
- **World** and **Group** detail modals (image, author/members, description, stats, open-on-VRChat).
- Group/world cards everywhere are now clickable into those modals.
- Profile modal: real **Boop** (`POST /users/{id}/boop`), **Mutuals** (friends via `/mutuals`,
  groups via intersection), **Favs** (own worlds), **Add Friend ↔ Unfriend**, **Invite**.
- **My Groups** + **My Content** (worlds/avatars) sidebar pages.
- Friends fetch is now **paginated** (full list, not just the first 100).

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

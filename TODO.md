# NekoSuneAPPS — TODO / Roadmap

Feature-parity checklist toward **VRCX** + **VRCNext**, our own version. Sources:
[VRCX](https://github.com/vrcx-team/VRCX), [VRCNext](https://github.com/shinyflvre/VRCNext).

Legend: `[x]` done · `[~]` partial · `[ ]` todo · ⚠️ technical blocker.

## 🚨 ALWAYS: Optimise the app (it's laggy)
- [~] **Performance pass — top priority.** App feels laggy. Investigate:
  - [x] Virtualise long lists — rail sections now capped at 150 rows (+N more note); paged tabs
  - [x] Throttle/debounce re-renders; avoid full innerHTML rebuilds on every update
  - [x] Audit all `setInterval` pollers — staggered on launch (friendDiff 8s/notif 14s/groups 22s) + 429 backoff guard on every poller
  - [ ] Lazy-load tab content only when visible; pause canvas (spectrum/OSC graph) off-tab
  - [x] Reuse the API cache everywhere; add request backoff on 429 (interceptor + isRateLimited + stale-cache fallback)
  - [ ] Profile with DevTools; check GPU/CPU (hardware accel already off)
- [~] **Full friends scan** — paginated online+active+offline; verify none missing
- [x] **Name-change tracking** — logged in History (friend-diff)
- [x] **VRCX import** — best-effort import button (verify vs real VRCX.sqlite3)
- [~] **Perf** — friends panel/radar no longer rebuild every 3s; idle stopwatch fixed;
  tiered friend cache (offline 5min/online 90s), self cache, world poll 5s, SQLite write
  debounced 8s + events capped 8000, rightbar 120s; **paged lists** (Friend Den, My Groups,
  Mutuals, Blocked, Favs). (rail offline virtualisation still todo)

---

## ✅ Already done (for reference)
- [x] Friend list + right panel (Same World / In-Game / On Web / Offline, collapsible)
- [x] Friend Den, Event Scout (multi-group), Pawprints (per-world time)
- [x] Unified **Search** (users/worlds/groups) + **paste ID/URL** loader
- [x] **Profile modal**: Info (badges), Groups, Mutuals (friends+groups), Content, Favs
- [x] Social actions: Add Friend↔Unfriend, Invite, Request Invite, **Boop**, Favorite
- [x] World + Group **detail modals**; clickable cards everywhere
- [x] **History (SQLite)**: player join/leave, friend add/remove, world visits
- [x] **Auto-Greeter** (auto-accept friend requests, all/allow-list)
- [x] Discord Rich Presence (world + HR + song; buttons auto-drop over IPC)
- [x] VRChat auto-status (login + 2FA), Radar, Weather, VRChat Tools (yt-dlp/cache)
- [x] Heart rate (Pulsoid + HypeRate) + session analytics
- [x] Param Lab (OSC), Photo Relay (screenshots→Discord), Soundpad, SpotiOSC, DiscordOSC, Discord voice bot
- [x] Auto-launch / start-minimized / per-feature auto-start
- [x] Green UI, icon rail, notifications flyout, auto seasonal themes, hidden scrollbars

---

## 🔜 Next day — VRCX parity gaps

### Activity & logging
- [x] **Video/media link tracking** — video URLs parsed from the log → History
- [x] **Name-change tracking** — friend renames logged to History (name_change)
- [x] **Activity heatmap** — day×hour event heatmap on the History page
- [x] **Instance join/leave history** — enter + leave-with-duration logged to History
- [x] **GameLog** — join/leave/world (w/ duration)/friend/name-change/video/**portals**/invites/group events

### Friends & social
- [x] **VRC Notes editor** — read + write your note on a user (profile Info tab)
- [x] **Social status presets** — save/apply status + statusDescription combos (Profile Editor)
- [x] **Last-seen / time-together** — shown on the profile Info tab (from History)
- [x] **Block / mute** — toggle on profiles + a Blocked/Muted list (Settings) with Remove
- [ ] **Trust/feedback view** beyond the trust chip

### Search & data
- [x] **Local quick-search** — instant offline friend search on the Search page
- [x] **Avatar search** — via the Avatars page (provider-based)
- [ ] **Favorites backup** — export/restore favorite worlds/avatars/friends groups
- [x] **Data export/import** — settings + history to JSON

### Media
- [ ] **Screenshot metadata** — embed world/instance/players into the PNG (VRChat picture metadata), and read it back in a gallery
- [x] **Media Library** — VRChat screenshot gallery (open on click); date/world filters todo
- [ ] **Avatar/world image upload** management (without Unity) — advanced, optional

### System
- [x] **VRChat server status** — online-user count in the top bar (poll /visits)
- [x] **Configured Start** — launch companion apps (+ optional VRChat)
- [x] **Data export/import** — settings + history to JSON
- [x] **Crash recovery / auto-rejoin** — opt-in; relaunches last instance if VRChat closes
- [ ] **Custom themes** (optional — currently fixed green + seasonal by design)
- [ ] **Registry tools** — VRChat registry backup/restore (Windows registry under VRChat)
- [ ] **Multiple dashboards / customizable widgets** (VRCX-style configurable panels)

### Group alerts (requested)
- [x] **Group alerts** — polls watched groups' posts **and events** → toast + History
- [x] **Notifications** — rich (invite world+link, boop, requestInvite, group), **cached in SQLite**
  until accepted/dismissed; top-right flyout + **Notify sidebar tab**; toast on new

---

## 👻 Terrors of Nowhere

- [x] **Read ToN directly from the VRChat output log (ToNSaveManager now OPTIONAL).**
  `modules/integrations/ton/tonLogReader.js` tails the newest `output_log_*.txt` and parses
  save codes (`[START]…[END]`), round type + map (`This round is taking place at …`),
  terror IDs (`Killers have been set - …`), deaths (`You died.`), round end
  (`Verified Round End`), stuns and damage. Runs alongside the WS; drives live state when
  the WS isn't connected. Captured save codes are auto-decoded to achievements and marked
  on the board (so achievements stay current without ToNSaveManager).
- [x] ToN UI: connect card relabelled — ToNSaveManager is **optional**; the log reader is
  the default.
- [ ] **Terror names from killer IDs** — the log gives killer IDs (`Killers have been set
  - 31 0 0`), shown as `Terror #31`. Map IDs → names (ToN's terror index is fetched at
  runtime, not static; cross-reference our cached terror data or fetch the index).
- [ ] **Lifetime stats from the log** — the log only has the *current session*, so
  all-time rounds/deaths/etc. still need ToNSaveManager or a decoded save code. Session
  counters work from the log; consider deriving lifetime totals from a decoded save.
- [ ] **Catch up historical rounds/saves** from the log on first read (currently the
  initial full-log pass is suppressed to avoid flooding history; consider importing the
  session's past save codes as backups on startup).

## ℹ️ About page

- [x] About page — app info, NekoSuneVR creator, version, links, update check, contributors
  auto-detected from the GitHub API.
- [ ] **Deeper collaborator / collab-code auto-detection** — beyond GitHub contributors:
  parse `Co-Authored-By:` trailers from git history and any in-source `@author`/credit
  comment markers, and surface named collaborations on the About page.

## 🥽 Requested big features (next session)

### Avatars (own + others)
- [x] **Avatar detail** — modal with image, author, platforms, performance, wear/favourite
- [x] **Switch avatar** — Wear button (`PUT /avatars/{id}/select`)
- [x] **Delete personal avatar** — Delete with Yes/No confirm

### Worlds — create instance + invites
- [x] **Create instance** (Public / Friends+ / Friends / Invite+ / Invite) via `POST /instances`
- [x] **Self-invite** + **Invite friends** (picker) + shareable launch link in world modal

### Groups
- [x] **Invite people to a group** via friend picker
- [x] Group detail: members, roles, posts, gallery, your permissions

### Shared UI
- [x] **Friend-picker modal** (searchable, multi-select)
- [x] **Confirm (Yes/No) modal**

## 🟣 VRCNext-specific (next session)
Confirmed from the [VRCNext](https://github.com/shinyflvre/VRCNext) repo — gaps not already listed above.
- [~] **Profile editor (your own)** — status/status-text/bio + **bio prefabs** (load/edit/save/delete reusable bios) done; pronouns, bio links, pfp & banner todo
- [x] **Messenger / message-slot editor** — edit invite & response message slots (Messenger tab)
- [x] **Multi-Invite** — friend-picker multi-select invite to instance/group
- [x] **Inventory** — icons / emoji / stickers / prints (with image proxy for auth-gated images)
- [x] **Avatar browse** — configurable providers (avtrdb + **custom VRCX-style endpoints**) → wear/favourite
- [x] **Group posts** + **group image gallery** — shown in the group detail modal
- [x] **Create group instances** — POST /instances type=group + groupAccessType, with world picker (my worlds + favourites) + access/region selectors in the group modal, auto self-invite
- [x] **Media Library** — local screenshot gallery (folders/metadata filters todo)
- [x] **Configured Start** — launch companion apps (SlimeVR, VRCFaceTracking, …) + optional VRChat
- [x] **VRCVideoCacher** — install/update (official release download) + start/stop the local proxy from the VRChat Tools tab (custom URL via `vvcUrl` setting)
- [ ] **Design customization** — dashboard welcome-screen background + launcher accent colour
  (note: we intentionally ship fixed green + seasonal; make this opt-in)
- [x] **Fast-Fetch cache** — TTL cache + in-flight dedupe for user/world/group/friends
- [x] **Right panel: Favorites section** — favorited friends shown at top of the rail
- [ ] **Crash detect + auto-rejoin** (also a VRCX feature) — relaunch VRChat into last instance

## Our pending clusters (from the build plan)

### VR / heavy ⚠️ (need native or large deps — can't test in sandbox)
- [ ] **Neko HUD** (VR overlay) — ⚠️ needs native OpenVR overlay binding (same blocker as VR battery). Ship a small C#/C++ OpenVR helper exe and spawn it.
- [ ] **Playspace Shift** — ⚠️ needs native VR input (grip/stick) — same OpenVR helper.
- [ ] **VoxBoard** (voice-triggered soundboard) — needs offline speech model (VOSK ~50 MB); add as optional download.
- [x] **Avatar Sizer** — done via VRChat's *native* OSC height-scaling API (`/avatar/eyeheight` + `/avatar/eyeheightmin`/`max` + `/avatar/eyeheightscalingallowed`), which works on **any** avatar with no avatar-specific exposed parameters needed. `modules/vrchat/osc/avatarScaling.js` + global hotkeys (Settings → Tools → Avatar Scaling) via a PowerShell `WH_KEYBOARD_LL` hook (`modules/vrchat/osc/keyHookPs.js`), only running while the feature is connected or recording a key.
- [ ] **VR gear battery** — real OpenVR helper to replace the current stub (`modules/vrchat/vr/vrBattery.js`).

---

## 🧹 Polish / known limitations
- [ ] Discord RP **buttons** can't show over IPC (GameSDK only) — text only; revisit if Discord changes.
- [ ] **Favorites page** (dedicated sidebar) listing worlds/avatars/friends with inline remove (currently add/remove via modals + Favs tab).
- [ ] Friends panel: avatars for **offline** friends, group-by-favorite, online count badge.
- [x] Rate-limit guard — 429 backoff interceptor + isRateLimited(); every poller skips while rate-limited; stale-cache fallback.
- [x] Cache profile/world/group lookups (VRCX "Fast Fetch") to cut API calls.
- [ ] Verify all VRChat write-actions live (favorite tags, requestInvite slots, invite instanceId format).

---

## 🎨 Full layout overhaul (feature request)
- [ ] Rebuild the app's overall layout/theme/navigation to match the look and feel of
  [VRCNext](https://github.com/shinyflvre/VRCNext) — same *layout style*, not the same
  internal structure/feature set (ours stays different under the hood). VRChat news as the
  homepage/landing view instead of the current default Chatbox tab. Large effort, not started —
  future session.

## 🌍 Localization
- [x] **i18n foundation** — `modules/i18n/i18n.js` (main) + IPC (`i18n:languages`/`i18n:strings`)
  + renderer `t()`/`applyLanguage()` sweep (`[data-i18n]` text, `[data-i18n-ph]` placeholders,
  nav labels via `data-tab`). First-run language picker modal (shown once, if `uiLanguage`
  setting is unset) + a Settings → Language card for changing it later; switches instantly, no
  restart. Seeded with **en, ja, es, ru, pl, nl, de** (`modules/i18n/locales/*.json`, flat
  key→string maps, every non-English locale merges over `en.json` so a missing key always
  falls back to English instead of breaking).
- [ ] **Coverage is partial by design** — this pass only tags the sidebar nav, common
  buttons, and the newly-added Avatar Scaling / Translator / Live Typing / language-picker UI.
  The rest of the app (300–500+ static strings in `index.html`, 400+ dynamic
  `setText`/template-literal call sites in `renderer.js`) is still hardcoded English. Sweeping
  it incrementally (tag more `data-i18n`, wrap more dynamic strings in `t()`) is ongoing work —
  add more locales here too as requested (a handful more beyond the initial 7 were flagged as
  wanted).

## 🗣️ Speech / OCR / TTS translation (deferred phase 2)
Decisions already made (so a future session doesn't re-litigate them) — not started yet:
- [ ] **Desktop-audio speech-to-text** (translate what you hear, e.g. Russian → English) —
  **both** local Whisper (offline/free, needs a bundled model) **and** cloud (OpenAI/Groq,
  reusing the existing IntelliChat provider pattern in `modules/ai/intelliChat.js`), user-
  selectable. Desktop/loopback audio capture already exists and is reusable as-is:
  `main.js`'s `setDisplayMediaRequestHandler` + `modules/integrations/osc/recognition/shazamOscModule.js`'s
  `ensureAudio()`/`captureClip()`.
- [ ] **Bidirectional**: translate the user's own typed/spoken text back to another language,
  output via chatbox and/or TTS.
- [ ] **OCR screen-translate** (read VRChat's on-screen text, auto-translate) — Tesseract.js
  (bundled/offline), reusing the `getDisplayMedia` → canvas → `getImageData` pixel pipeline
  already built for QR scanning in `modules/integrations/osc/qr/oscQrModule.js` (swap `jsQR(...)`
  for a Tesseract call).
- [ ] **TTS output**, multiple selectable engines with API-key entry for the cloud ones:
  Windows built-in (SAPI via PowerShell `System.Speech.Synthesis` — same shell-out pattern as
  `modules/vrchat/osc/mediaKeys.js` and the new `keyHookPs.js`), TikTok TTS (already exists,
  `modules/live/tiktokTts.js`), cloud TTS (ElevenLabs/Azure/Google/etc.), and self-hosted
  engines (Piper, XTTS) via a user-supplied endpoint URL — same shape as the Translator's
  LibreTranslate endpoint field.

---

## ⚙️ Setup reminders
- Run **`npm install`** (adds `discord.js`, `sql.js`).
- VRChat-API features need login on the **VRChat** tab (cookies stored locally; password never stored).
- History DB: `nekosuneapps-history.sqlite` in the app's user-data folder.
- New this session: **Avatar Scaling**, **Translator**, **Live Typing** chatbox, and the
  **i18n foundation** (see sections above). No new npm dependencies were added — the
  global-hotkey approach was switched from a third-party key-listener package (flagged by
  antivirus) to a PowerShell-based `WH_KEYBOARD_LL` hook (`modules/vrchat/osc/keyHook.ps1` +
  `keyHookPs.js`), matching the existing shell-out pattern already used by `mediaKeys.js`.

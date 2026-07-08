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
  restart. Seeded with **102 languages** (`modules/i18n/locales/*.json`, flat key→string maps,
  every non-English locale merges over `en.json` so a missing key always falls back to English
  instead of breaking) — the initial 7 (en, ja, es, ru, pl, nl, de) plus every language
  requested afterward: ko, zh, fr, ms, no, pt, ar, bn, hi, id, or, qu, sw, ta, ur, vi, wuu, xh,
  yo, zu, af, sq, am, hy, az, eu, be, bs, bg, my, ca, ceb, ny, co, hr, cs, da, eo, et, fi, fy,
  ka, el, ha, haw, he, hmn, hu, is, it, jv, kn, kk, km, rw, rn, ky, lo, lv, lt, lb, mk, mg, ml,
  mt, mi, mr, mn, ne, ps, fa, pa, ro, sr, si, sk, sl, so, su, sv, tl, tg, tt, te, th, bo, ti, to,
  tr, tk, ug, uk, uz, cy, yi. All 102 files validated for JSON correctness and exact key parity
  against `en.json` (76 keys each). Several lower-resource languages (Quechua, Oriya, Chichewa,
  Kirundi, Wu Chinese, Xhosa, Yoruba, Zulu, Hawaiian, Hmong, and a few others) were flagged by
  the translating passes as worth a native-speaker review — functionally complete but some
  technical-UI terms are best-effort borrowings rather than fixed conventional terminology.
- [ ] **Coverage is partial by design** — this pass only tags the sidebar nav, common
  buttons, and the newly-added Avatar Scaling / Translator / Live Typing / language-picker UI.
  The rest of the app (300–500+ static strings in `index.html`, 400+ dynamic
  `setText`/template-literal call sites in `renderer.js`) is still hardcoded English. Sweeping
  it incrementally (tag more `data-i18n`, wrap more dynamic strings in `t()`) is ongoing work —
  add more locales here too as requested (a handful more beyond the initial 7 were flagged as
  wanted).

## 🗣️ Speech / OCR / TTS translation (phase 2 — built this session)
- [x] **Desktop-audio speech-to-text** — `modules/integrations/osc/stt/desktopSttModule.js`
  (renderer, reuses the `getDisplayMedia({audio:true})` capture technique from
  `shazamOscModule.js`) + `modules/ai/speechToText.js` (main). **Both** engines, user-selectable
  in the Translation tab: cloud (OpenAI/Groq Whisper-compatible `/audio/transcriptions`, sends
  the raw webm clip directly — no decode needed) and local (`@huggingface/transformers` running
  a small Whisper model fully offline in WASM, no native binary; renderer decodes the clip to
  16kHz mono PCM via `OfflineAudioContext` first, since that's the input shape the local model
  needs). Verified: both npm packages install and load cleanly, tesseract.js's worker + language
  download works in this environment. **Not verified end-to-end**: the full
  getDisplayMedia→MediaRecorder→transcribe round-trip needs a real desktop session with actual
  audio and a live API key — recommend a manual smoke test in the built app.
- [x] **Bidirectional**: transcribed text runs through the existing Translator
  (`translateWithSettings`) before being sent to chatbox and/or spoken aloud — same translate
  step Live Typing uses.
- [x] **OCR screen-translate** — `modules/integrations/osc/ocr/ocrTranslateModule.js`, same
  `getDisplayMedia` → canvas capture scaffolding as `oscQrModule.js` with `jsQR` swapped for
  Tesseract.js `recognize()`. 15 common OCR languages in the picker (English, Japanese, Spanish,
  Russian, German, French, Chinese, Korean, Arabic, Portuguese, Italian, Dutch, Polish,
  Ukrainian, Vietnamese) — Tesseract's language codes don't map 1:1 to the app's i18n codes, so
  this is a separate, smaller list.
- [x] **TTS output**, `modules/ai/ttsProviders.js`, **15 engines** selectable in the Translation
  tab, ported from [TTS-Voice-Wizard](https://github.com/VRCWizard/TTS-Voice-Wizard) for feature
  parity: Windows built-in (SAPI via PowerShell `System.Speech.Synthesis`, text piped over
  stdin — not interpolated into the command — so spoken text can't break out of the PowerShell
  command; **verified working**, detected real installed voices and played audio in this
  environment), TikTok TTS, ElevenLabs, OpenAI TTS, Google Cloud TTS, Azure Cognitive Speech,
  Amazon Polly (via `@aws-sdk/client-polly` — SigV4 request signing isn't reasonably hand-rolled
  correctly, so this is the one new npm dependency this pass added), IBM Watson TTS, Deepgram
  Aura, VoiceForge, UberDuck (multi-step: submit → poll → download), TTS Monster (submit →
  download), GLaDOS TTS (self-hosted) and Moonbase Voices (self-hosted local app), plus the
  existing self-hosted Piper/XTTS/other option. All new HTTP-based engines' request shapes were
  verified against mocked responses matching each vendor's real documented API. **Note**: where
  the reference project routes an engine through its own paid gateway (Google, IBM Watson,
  Deepgram all go through a Heroku backend there), this instead calls the real vendor API
  directly with the user's own credentials — no third-party paywall in between.
- [x] **Fixed TikTok TTS** — was hardcoded to a single community proxy (`gesserit.co`) which had
  gone down; now tries a short list of known-working worker proxies in order and checks all the
  response field names different proxies use (`data`/`audio`/`audioUrl`) instead of just one.
  Verified live — successfully generated real audio in this environment.
- [x] **Fixed: TikTok TTS had no voice picker.** The unified TTS card's TikTok engine option
  had no way to choose a voice at all (always used the hardcoded default). Added a voice select
  populated from the same list the old standalone TikTok TTS card used, then removed that old
  standalone card entirely (it was in the Live tab, moved into the Translation tab at runtime,
  and became fully redundant once the unified card covered the same feature).
- [x] **TTS output-device picker** — routes `<audio>`-based engines to any enumerated output
  device via `setSinkId`. Doesn't apply to SAPI/local engines that play through the OS directly.
- [ ] **Routing TTS into VRChat's mic input** — not solvable in pure software. Windows has no
  way to expose one app's audio *output* as another app's *microphone input* without some kind
  of virtual audio device (VB-Cable, Voicemeeter, etc.), which requires installing a driver —
  there's no way around that one step. If the user installs one themselves, the output-device
  picker above will route TTS into it, which VRChat can then pick up as a mic.
- [x] **Fixed packaged-app crash**: "Could not start screen capture — worker script... must be
  an absolute path" (OCR) and the same class of failure would've hit local Whisper too.
  `tesseract.js`/`tesseract.js-core` load a `worker_threads` script, and
  `@huggingface/transformers`'s dependencies (`onnxruntime-node`, `sharp`) load native `.node`
  binaries — neither can be loaded from inside an asar archive (Node needs a real file on disk
  for both). Added `build.asarUnpack` in `package.json` for all of these so electron-builder
  extracts them to `app.asar.unpacked/` instead; Electron then transparently resolves paths into
  the unpacked location. This only manifests in a **packaged** build, not `npm start` — couldn't
  be caught by this session's dev-mode smoke tests, only surfaced once actually installed.

## 🤖 Voice assistant (built this session)
- [x] **Wake-word assistant** — `modules/vrchat/assistant/jarvisAssistant.js` (renderer),
  `modules/ai/assistantBrain.js` (main, LLM-based command interpreter). Listens through an
  actual **microphone** (`getUserMedia`, selectable input device — same enumerateDevices()
  pattern as the AudioLink mic picker), checks each transcript for the configured wake word
  (default `nova`, user-customizable — deliberately not a common assistant name), and only
  acts on speech addressed to it. Reuses the Desktop STT card's speech-to-text engine/API-key
  settings, but captures its own separate mic audio — it does **not** listen to desktop/system
  audio (that's what the Desktop STT card itself is for, a different use case: translating what
  you hear, not commands you speak).
- [x] **Fixed: was listening to the wrong audio source entirely.** Originally used
  `getDisplayMedia` (desktop/system audio, i.e. what's playing through your speakers) for the
  wake-word loop, so it could never hear the user's own voice no matter what mic was selected
  elsewhere — that's what "not detecting right mic" / "heard but no wake word" traced back to.
  The instant-replay screen+audio capture for SOS clips is now a separate, **opt-in** capture
  (its own checkbox, only requests a screen-share prompt if enabled) instead of being the same
  stream the wake-word listener used.
- [x] **Commands**: "is `<friend>` online / which world" (reuses the friends list's existing
  `location`/`worldId`/`instanceType` fields, same ones the Friends panel already renders),
  "who's online", "what's my status", "change my status to `<text>`" (sets `statusDescription`
  **only** — the assistant can never touch the bio field, enforced both in the LLM system prompt
  and in the code path itself, verified by a unit test), and free-form conversational replies
  for anything else. Responses are sent to chatbox and spoken aloud via the TTS engine above.
- [x] **SOS — manual trigger only.** Either an explicit spoken "sos" command or the button in
  the UI; **never** auto-triggered. On trigger: invites everyone in a configured trusted-friends
  list (by display name, matched against your live friends list) to your current instance,
  **saves** the rolling instant-replay clip (last 1/5/10 min of shared desktop video+audio,
  configurable) to `Videos/NekoSuneAPPS/` (created automatically if missing), and additionally
  uploads it to a configured Discord webhook if set, so those friends can see what happened
  before they arrive. Saving locally always happens, independent of whether a webhook is
  configured, so the clip is never lost to a failed/missing upload.
- [x] **Fixed: assistant silently doing nothing.** The most common cause is the cloud STT engine
  being selected with no API key ever entered (a very likely fresh-install state) — every clip
  then failed transcription with a generic error that looked identical to "the wake word didn't
  match" from the outside. `setLive(true)` now validates config upfront and fails immediately
  with a clear, specific message instead of silently retrying forever. The status line also now
  shows the actual configured wake word, and surfaces what was transcribed even when it *doesn't*
  match the wake word, so it's obvious whether STT is hearing anything at all versus just not
  recognizing the chosen word.
- [x] **Soft emotional check-in — separate from SOS, and never triggers it.** Every transcribed
  clip (whether or not it's addressed to the assistant) is checked against a small lexical
  cue-list (`modules/vrchat/assistant/emotionCues.js`) for distress or tiredness language. This
  is honest keyword/phrase pattern-matching on the transcribed *text* — not real voice-tone or
  prosody analysis (pitch, pace, pauses), which would need raw-audio feature extraction, a much
  bigger undertaking. If a cue matches, the assistant just asks a caring check-in question
  ("are you doing okay? want me to notify someone?") — the user decides whether to actually
  trigger SOS. Never escalates on its own.
- [ ] **Not verified end-to-end** — same caveat as the Desktop STT feature above: the full
  continuous-listening loop, the friend-status/status-query/status-set VRChat API calls, and the
  instant-replay buffer's long-running recording behavior all need a real account + a live
  desktop session to smoke-test; only the pure dispatch/command logic was unit-tested here
  (mocked callbacks, no live VRChat/audio).

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

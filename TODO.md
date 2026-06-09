# NekoSuneAPPS — TODO / Roadmap

Feature-parity checklist toward **VRCX** + **VRCNext**, our own version. Sources:
[VRCX](https://github.com/vrcx-team/VRCX), [VRCNext](https://github.com/shinyflvre/VRCNext).

Legend: `[x]` done · `[~]` partial · `[ ]` todo · ⚠️ technical blocker.

## 🚨 ALWAYS: Optimise the app (it's laggy)
- [ ] **Performance pass — top priority.** App feels laggy. Investigate:
  - Virtualise long lists (friends rail 600+, history, search) — don't render all rows
  - Throttle/debounce re-renders; avoid full innerHTML rebuilds on every update
  - Audit all `setInterval` pollers (rightbar/friendDiff/status/greeter/weather/stats/world) — stagger + back off
  - Lazy-load tab content only when visible; pause canvas (spectrum/OSC graph) off-tab
  - Reuse the API cache everywhere; add request backoff on 429
  - Profile with DevTools; check GPU/CPU (hardware accel already off)
- [~] **Full friends scan** — paginated online+active+offline; verify none missing
- [x] **Name-change tracking** — logged in History (friend-diff)
- [x] **VRCX import** — best-effort import button (verify vs real VRCX.sqlite3)
- [~] **Perf** — friends panel/radar no longer rebuild every 3s; idle stopwatch fixed (list virtualisation still todo)

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
- [ ] **Video/media link tracking** — parse VRChat log for played video URLs, log to History
- [ ] **Name-change tracking** — detect & log when a friend renames (store last known name)
- [ ] **Activity heatmap** — online-time-by-day/hour visualisation
- [ ] **Instance join/leave history** for yourself (which instances you joined, duration)
- [~] **GameLog** — have join/leave/world/friend; add: invites received, portals dropped, events

### Friends & social
- [x] **VRC Notes editor** — read + write your note on a user (profile Info tab)
- [x] **Social status presets** — save/apply status + statusDescription combos (Profile Editor)
- [ ] **Last-seen / time-together** per friend on the profile (we have some via History)
- [~] **Block / mute** — Block/Mute toggle buttons on profiles (list/log of moderations still todo)
- [ ] **Trust/feedback view** beyond the trust chip

### Search & data
- [ ] **Local fuzzy quick-search** across cached friends/worlds/groups (instant, offline)
- [ ] **Avatar search** via avtrdb.com / public avatar DB (VRCNext uses avtrdb)
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
- [ ] **Crash recovery / auto-rejoin** last instance (detect VRChat crash, relaunch+join)
- [ ] **Custom themes** (optional — currently fixed green + seasonal by design)
- [ ] **Registry tools** — VRChat registry backup/restore (Windows registry under VRChat)
- [ ] **Multiple dashboards / customizable widgets** (VRCX-style configurable panels)

### Group alerts (requested)
- [x] **Group alerts** — polls watched groups' posts → toast + History `group` entry
- [~] **Alerts** — group posts done; world/event alerts still todo

---

## 🥽 Requested big features (next session)

### Avatars (own + others)
- [~] **Avatar detail** view — Content shows all avatars; full detail modal still todo
- [x] **Switch avatar** — Wear button (`PUT /avatars/{id}/select`)
- [x] **Delete personal avatar** — Delete with Yes/No confirm

### Worlds — create instance + invites
- [x] **Create instance** (Public / Friends+ / Friends / Invite+ / Invite) via `POST /instances`
- [x] **Self-invite** + **Invite friends** (picker) + shareable launch link in world modal

### Groups
- [x] **Invite people to a group** via friend picker
- [ ] Group detail: members, roles, posts, your permissions

### Shared UI
- [x] **Friend-picker modal** (searchable, multi-select)
- [x] **Confirm (Yes/No) modal**

## 🟣 VRCNext-specific (next session)
Confirmed from the [VRCNext](https://github.com/shinyflvre/VRCNext) repo — gaps not already listed above.
- [~] **Profile editor (your own)** — status/status-text/bio done; pronouns, bio links, pfp & banner todo
- [ ] **Messenger / message-slot editor** — edit the 12 invite & response message slots
  (`GET/PUT /message/{userId}/{messageType}/{slot}`) and send them
- [x] **Multi-Invite** — friend-picker multi-select invite to instance/group
- [ ] **Inventory** — view/manage Photos, Gallery, custom **icons / emojis / stickers / prints**
- [ ] **Avatar browse via avtrdb.com** (paginated public avatar search) → switch/favourite
- [ ] **Create group instances** (covered above) + **group posts** + **group image gallery**
- [x] **Media Library** — local screenshot gallery (folders/metadata filters todo)
- [x] **Configured Start** — launch companion apps (SlimeVR, VRCFaceTracking, …) + optional VRChat
- [ ] **VRCVideoCacher** — install/update + start/stop the local proxy (beyond our yt-dlp fix)
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
- [ ] **Avatar Sizer** — ⚠️ VRChat has no clean external avatar-scale hook; only works via OSC params an avatar exposes. Document limits.
- [ ] **VR gear battery** — real OpenVR helper to replace the current stub (`modules/vrchat/vr/vrBattery.js`).

---

## 🧹 Polish / known limitations
- [ ] Discord RP **buttons** can't show over IPC (GameSDK only) — text only; revisit if Discord changes.
- [ ] **Favorites page** (dedicated sidebar) listing worlds/avatars/friends with inline remove (currently add/remove via modals + Favs tab).
- [ ] Friends panel: avatars for **offline** friends, group-by-favorite, online count badge.
- [~] Rate-limit guard — caching/dedupe added; still add explicit 429 backoff.
- [x] Cache profile/world/group lookups (VRCX "Fast Fetch") to cut API calls.
- [ ] Verify all VRChat write-actions live (favorite tags, requestInvite slots, invite instanceId format).

---

## ⚙️ Setup reminders
- Run **`npm install`** (adds `discord.js`, `sql.js`).
- VRChat-API features need login on the **VRChat** tab (cookies stored locally; password never stored).
- History DB: `nekosuneapps-history.sqlite` in the app's user-data folder.

# NekoSuneAPPS — TODO / Roadmap

Feature-parity checklist toward **VRCX** + **VRCNext**, our own version. Sources:
[VRCX](https://github.com/vrcx-team/VRCX), [VRCNext](https://github.com/shinyflvre/VRCNext).

Legend: `[x]` done · `[~]` partial · `[ ]` todo · ⚠️ technical blocker.

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
- [ ] **VRC Notes editor** — read + write VRChat notes/memos on a user (`PUT /user/{id}` note)
- [ ] **Social status presets** — save status + statusDescription combos, apply with one click
- [ ] **Last-seen / time-together** per friend on the profile (we have some via History)
- [ ] **Block / mute tracking** — list & log blocked/muted users
- [ ] **Trust/feedback view** beyond the trust chip

### Search & data
- [ ] **Local fuzzy quick-search** across cached friends/worlds/groups (instant, offline)
- [ ] **Avatar search** via avtrdb.com / public avatar DB (VRCNext uses avtrdb)
- [ ] **Favorites backup** — export/restore favorite worlds/avatars/friends groups
- [ ] **Data export/import** — friends, notes, history (JSON/CSV)

### Media
- [ ] **Screenshot metadata** — embed world/instance/players into the PNG (VRChat picture metadata), and read it back in a gallery
- [ ] **Media Library** — gallery of VRChat screenshots with date/world/people filters
- [ ] **Avatar/world image upload** management (without Unity) — advanced, optional

### System
- [ ] **VRChat server status** monitor + alert (api.vrchat.cloud `/system/...` / status page)
- [ ] **Crash recovery / auto-rejoin** last instance (detect VRChat crash, relaunch+join)
- [ ] **Custom themes** (optional — currently fixed green + seasonal by design)
- [ ] **Registry tools** — VRChat registry backup/restore (Windows registry under VRChat)
- [ ] **Multiple dashboards / customizable widgets** (VRCX-style configurable panels)

### Group alerts (requested)
- [ ] **Group alerts** — notify on group announcements/posts/events for watched groups
- [ ] **Alerts** surfaced as toasts + logged to History as `alert` / `group`

---

## 🥽 Our pending clusters (from the build plan)

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
- [ ] Rate-limit guard / backoff on the VRChat API pollers (friends diff, status, rightbar).
- [ ] Cache profile/world/group lookups (VRCX "Fast Fetch") to cut API calls.
- [ ] Verify all VRChat write-actions live (favorite tags, requestInvite slots, invite instanceId format).

---

## ⚙️ Setup reminders
- Run **`npm install`** (adds `discord.js`, `sql.js`).
- VRChat-API features need login on the **VRChat** tab (cookies stored locally; password never stored).
- History DB: `nekosuneapps-history.sqlite` in the app's user-data folder.

# Sidebar icons

Drop an image here named after the tab and it **replaces the emoji automatically** on
next launch. No code changes needed — missing files just keep the emoji, so you can add
them one at a time.

- **Location:** `assets/icons/`
- **File name:** `<tab>.png` (exact names in the table below). `.svg` also works (png is tried first).
- **Size / format:** 256×256 px, **transparent background**, PNG.
- **Color:** **solid white** (or very light) flat icon. The sidebar is dark when a tab is
  idle and a purple gradient when active — a white icon reads well on both. Don't bake in
  a background or color fill.

## Master style prompt (prepend to every icon)

> Minimal flat line icon, single solid white color (#FFFFFF) on a fully transparent
> background, centered, thick rounded strokes, consistent 2px-equivalent stroke weight,
> no text, no drop shadow, no background shape, 256×256, modern UI app icon style. Subject:

Generate the full sidebar set with the SAME style sentence above so they match, only
changing the "Subject:" part below. All current sidebar tabs listed here already have
matching icon files.

## Icons (file name → subject prompt)

| File (`assets/icons/…`) | Tab | Subject prompt to append |
|---|---|---|
| `chatbox.png` | Chatbox | a speech/chat bubble |
| `nowplaying.png` | Now Playing | a music note with a small play triangle |
| `audio.png` | AudioLink | an audio equalizer / sound waveform bars |
| `heartrate.png` | Heart Rate | a heart with a pulse/heartbeat line through it |
| `vrchat.png` | VRChat | a VR headset (HMD) front view |
| `radar.png` | Radar | a radar screen with a sweep line and a blip |
| `friendden.png` | Friend Den | two friendly person silhouettes close together |
| `ranks.png` | Community Ranks | an award medal hanging from a ribbon |
| `eventscout.png` | Event Scout | a telescope |
| `pawprints.png` | Pawprints | a single cat paw print |
| `groups.png` | Groups | three person silhouettes as a group |
| `content.png` | Content | a globe / world grid |
| `avatars.png` | Avatars | a standing humanoid avatar figure |
| `avatarlocker.png` | Avatar Locker | a padlock protecting a humanoid avatar silhouette |
| `inventory.png` | Inventory | a backpack |
| `messenger.png` | Messenger | a paper envelope |
| `search.png` | Search | a magnifying glass |
| `media.png` | Media | a framed photo / picture |
| `notify.png` | Notify | a notification bell |
| `history.png` | History | a clock with a circular back-arrow (history) |
| `weather.png` | Weather | a sun partly behind a cloud |
| `oscapps.svg` | OSC Apps | a rounded electrical plug with a signal node |
| `vrctools.png` | VRChat Tools | a wrench and screwdriver crossed (toolbox) |
| `live.png` | Live | a broadcast tower emitting signal waves |
| `oauth.svg` | OAuth Accounts | a key with two small connected authorization nodes |
| `discord.png` | Discord | a rounded voice-chat bubble with a small headset (avoid the Discord logo) |
| `stats.png` | Stats | a bar chart with three rising bars |
| `tonref.png` | Terrors | a cute ghost |
| `overlay.png` | Overlay | a computer monitor / screen |
| `tools.png` | Tools | a jigsaw puzzle piece |
| `settings.png` | Settings | a gear / cog |
| `docs.png` | Docs / Setup | an open book |
| `about.png` | About | a lowercase letter "i" information mark inside a circle |
| `log.png` | OSC Log | a scroll / lined document list |

## Legacy / unused

| File (`assets/icons/...`) | Status |
|---|---|
| `osccontrol.png` | Kept as a legacy asset. The standalone OSC Control sidebar page was removed; OSC controls now live under Tools / OSC Apps. |

## Tip
Generate them as one set in a single batch with the master style prompt so the stroke
weight and proportions stay consistent. After adding files, restart the app — each icon
swaps in the moment its file is present.

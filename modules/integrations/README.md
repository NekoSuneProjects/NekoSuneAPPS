# Integration module layout

Integration code is grouped by feature so contributors do not need to search one large
flat directory.

| Folder | Purpose |
| --- | --- |
| `osc/` | Avatar OSC companion apps, clocks, QR, recognition, leashes and Laserdome |
| `ton/` | Every Terrors of Nowhere / ToNSaveManager module, including `tonOsc.js` |
| `discord/` | Discord Rich Presence, RPC and the DiscordOSC voice bot |
| `media/` | Windows/application media helpers such as Soundpad and Photo Relay |
| `maintenance/` | App updates and Windows notification integration |

When adding a multi-file integration, create a named subfolder and include a short README
describing its entry point, external services and stored credentials. Keep provider-specific
code out of unrelated feature folders.

OAuth providers now live in `modules/oauth/`; Twitch runtime features live together in
`modules/live/twitch/`.

# Heart-rate module layout

Heart-rate code is grouped by responsibility instead of provider names sharing one flat
folder.

| Folder | Purpose |
| --- | --- |
| `core/` | Provider-independent analytics and session history |
| `providers/pulsoid/` | Pulsoid WebSocket client, device OAuth and app configuration |
| `providers/hyperate/` | HypeRate realtime client |
| `devices/` | Loopback bridge for unsupported watches and external adapters |
| `devices/ble/` | BLE registry, normalized BPM relay and platform adapters |
| `osc/` | Avatar OSC output profiles and their parameter documentation |

All sources emit the same normalized reading shape. `main.js` is the single coordinator
that sends those readings to analytics, Discord presence, Pulsoid forwarding and enabled
avatar OSC profiles.

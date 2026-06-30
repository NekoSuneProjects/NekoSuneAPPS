# Terrors of Nowhere integration

Everything related to ToN and ToNSaveManager lives here:

- `tonModule.js` connects to the ToNSaveManager WebSocket and tracks live rounds.
- `tonOsc.js` publishes the tracked state to avatar parameters.
- `tonLogReader.js` reads relevant VRChat log events.
- `tonManager.js` manages the external ToNSaveManager application.
- `tonData.js` maintains reference data.
- `tonSaveCodec.js`, `tonSaveReader.js`, and `tonUnlockDecoder.js` handle save data.
- `data/achievementOrder.json` maps save indices to achievements.

Keep new ToN OSC parameters here rather than placing them in the general OSC Apps folder.

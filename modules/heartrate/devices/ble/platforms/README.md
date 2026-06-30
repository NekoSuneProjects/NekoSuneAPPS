# BLE heart-rate platform adapters

Each proprietary watch belongs in its own adapter file. Do not add device-specific UUIDs,
packet bytes, or parsing rules directly to `../index.js`; that file is only the
registry and BPM relay.

Built-in adapters:

- `standardBle.js` — Bluetooth SIG Heart Rate Service (`0x180D` / `0x2A37`).
- `goodmans.js` — Goodmans 364134 / GMANS WATCH FunDo/KCT protocol.

## Adapter contract

Export one object with these fields:

```js
module.exports = {
  id: 'vendor-name',                 // unique stable setting/log identifier
  displayName: 'Vendor Watch',
  protocol: 'vendor-name',
  serviceUuid: 'service UUID',
  notifyCharacteristicUuid: 'notification UUID',
  writeCharacteristicUuid: 'optional write UUID',
  optionalServices: ['service UUID'],
  matchesDevice ({ name, serviceUuid }) { return false },
  parseMeasurement (dataView) { return 0 } // valid BPM or 0
}
```

An adapter may also provide `startHeartRateCommand` for the generic connector to write
after subscribing. More complicated platforms can export additional command builders and
constants used by their specialized connection lifecycle. Keep those details inside the
adapter rather than expanding the registry.

## Registering another platform

1. Create a new file beside this README.
2. Implement the contract above.
3. Add it to this folder's `index.js` platform list. The relay core does not need editing.
4. Add its service UUID to Web Bluetooth requests by using
   `getBleHeartRateOptionalServices()`; do not hardcode another list in the renderer.
5. Route notifications through `createBleHeartRateRelay()` so every platform produces
   the same `{ bpm, platformId, receivedAt }` reading.

The relay deliberately knows nothing about Pulsoid, OSC, or the UI. Its only job is to
normalize device-specific BLE notifications into BPM readings for the existing heart-rate
pipeline.

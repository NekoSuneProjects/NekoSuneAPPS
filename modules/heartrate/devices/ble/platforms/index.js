'use strict' // Registry of built-in BLE heart-rate protocol adapters.

module.exports = [
  require('./standardBle'),
  require('./goodmans')
]

// preload.js
const { ipcRenderer } = require('electron')

// contextIsolation is off (matches OSCAudiolink), so expose directly on window.
window.electronAPI = {
  // generic
  getSetting: (key, def) => ipcRenderer.invoke('getSetting', key, def),
  saveSetting: (key, value) => ipcRenderer.invoke('saveSetting', key, value),
  getOscPort: () => ipcRenderer.invoke('getOscPort'),
  updateOscPort: port => ipcRenderer.send('updateOscPort', port),

  // now playing / overlay
  getNowPlaying: () => ipcRenderer.invoke('getNowPlaying'),
  getOverlayState: () => ipcRenderer.invoke('getOverlayState'),
  updateOverlaySettings: s => ipcRenderer.invoke('updateOverlaySettings', s),

  // component + network stats
  statsStart: ms => ipcRenderer.invoke('stats:start', ms),
  statsStop: () => ipcRenderer.invoke('stats:stop'),
  netStart: opts => ipcRenderer.invoke('net:start', opts),
  netStop: () => ipcRenderer.invoke('net:stop'),

  // heart rate
  hrStart: token => ipcRenderer.invoke('hr:start', token),
  hrStop: () => ipcRenderer.invoke('hr:stop'),

  // window activity
  windowStart: () => ipcRenderer.invoke('window:start'),
  windowStop: () => ipcRenderer.invoke('window:stop'),

  // tiktok
  tiktokConnect: (user, signApiKey) => ipcRenderer.invoke('tiktok:connect', { username: user, signApiKey }),
  tiktokDisconnect: () => ipcRenderer.invoke('tiktok:disconnect'),
  tiktokFollowersStart: user => ipcRenderer.invoke('tiktok:followers:start', user),
  tiktokFollowersStop: () => ipcRenderer.invoke('tiktok:followers:stop'),
  tiktokVoices: () => ipcRenderer.invoke('tiktok:voices'),
  tiktokTts: (text, voice) => ipcRenderer.invoke('tiktok:tts', { text, voice }),

  // twitch
  twitchStart: cfg => ipcRenderer.invoke('twitch:start', cfg),
  twitchStop: () => ipcRenderer.invoke('twitch:stop'),

  // kick
  kickStart: slug => ipcRenderer.invoke('kick:start', slug),
  kickStop: () => ipcRenderer.invoke('kick:stop'),

  // twitch oauth
  twitchOauth: (clientId, clientSecret, scopes) => ipcRenderer.invoke('twitch:oauth', { clientId, clientSecret, scopes }),
  twitchRedirect: () => ipcRenderer.invoke('twitch:redirect'),

  // ai
  aiRewrite: opts => ipcRenderer.invoke('ai:rewrite', opts),
  aiProviders: () => ipcRenderer.invoke('ai:providers'),

  // discord
  discordStart: cfg => ipcRenderer.invoke('discord:start', cfg),
  discordStop: () => ipcRenderer.invoke('discord:stop'),
  discordActivity: a => ipcRenderer.invoke('discord:activity', a),

  // vr
  vrStart: () => ipcRenderer.invoke('vr:start'),
  vrStop: () => ipcRenderer.invoke('vr:stop'),

  // event subscription (main -> renderer)
  on: (channel, cb) => ipcRenderer.on(channel, (_e, payload) => cb(payload)),

  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
}

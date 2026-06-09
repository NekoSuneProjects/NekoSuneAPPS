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

  // heart rate (cfg: { provider, token, apiKey, deviceId })
  hrStart: cfg => ipcRenderer.invoke('hr:start', cfg),
  hrStop: () => ipcRenderer.invoke('hr:stop'),
  hrSessions: () => ipcRenderer.invoke('hr:sessions'),
  hrClearSessions: () => ipcRenderer.invoke('hr:clearSessions'),

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
  discordVrc: ctx => ipcRenderer.invoke('discord:vrc', ctx),
  discordLive: ctx => ipcRenderer.invoke('discord:live', ctx),

  // vrchat world
  vrcGet: () => ipcRenderer.invoke('vrc:get'),

  // vrchat account (auto status)
  vrchatLogin: (username, password) => ipcRenderer.invoke('vrchat:login', { username, password }),
  vrchatVerify2fa: (code, method) => ipcRenderer.invoke('vrchat:verify2fa', { code, method }),
  vrchatStatus: () => ipcRenderer.invoke('vrchat:status'),
  vrchatIsLoggedIn: () => ipcRenderer.invoke('vrchat:isLoggedIn'),
  vrchatLogout: () => ipcRenderer.invoke('vrchat:logout'),
  vrchatAutoStatus: on => ipcRenderer.invoke('vrchat:autostatus', on),
  vrchatFriends: () => ipcRenderer.invoke('vrchat:friends'),
  vrchatGroups: () => ipcRenderer.invoke('vrchat:groups'),
  vrchatGroupEvents: groupId => ipcRenderer.invoke('vrchat:groupEvents', groupId),
  vrchatNotifications: () => ipcRenderer.invoke('vrchat:notifications'),
  vrchatAcceptFriend: id => ipcRenderer.invoke('vrchat:acceptFriend', id),
  vrchatUser: id => ipcRenderer.invoke('vrchat:user', id),
  vrchatFriendRequest: id => ipcRenderer.invoke('vrchat:friendRequest', id),
  vrchatRequestInvite: (id, slot) => ipcRenderer.invoke('vrchat:requestInvite', { id, slot }),
  vrchatUnfriend: id => ipcRenderer.invoke('vrchat:unfriend', id),
  vrchatInvite: (id, instanceId, slot) => ipcRenderer.invoke('vrchat:invite', { id, instanceId, slot }),
  vrchatUserGroups: id => ipcRenderer.invoke('vrchat:userGroups', id),
  vrchatUserWorlds: id => ipcRenderer.invoke('vrchat:userWorlds', id),
  vrchatMutuals: id => ipcRenderer.invoke('vrchat:mutuals', id),
  vrchatFavWorlds: () => ipcRenderer.invoke('vrchat:favWorlds'),
  vrchatBoop: (id, emojiId) => ipcRenderer.invoke('vrchat:boop', { id, emojiId }),
  vrchatMyAvatars: () => ipcRenderer.invoke('vrchat:myAvatars'),
  pawprintsList: () => ipcRenderer.invoke('pawprints:list'),
  pawprintsClear: () => ipcRenderer.invoke('pawprints:clear'),
  launchVRChat: () => ipcRenderer.invoke('app:launchVRChat'),

  // weather
  weatherStart: opts => ipcRenderer.invoke('weather:start', opts),
  weatherStop: () => ipcRenderer.invoke('weather:stop'),
  weatherGet: () => ipcRenderer.invoke('weather:get'),

  // discord bot (voice + DiscordOSC)
  botStart: cfg => ipcRenderer.invoke('bot:start', cfg),
  botStop: () => ipcRenderer.invoke('bot:stop'),
  botSetMute: m => ipcRenderer.invoke('bot:setMute', m),
  botSetDeaf: d => ipcRenderer.invoke('bot:setDeaf', d),
  botInvite: appId => ipcRenderer.invoke('bot:invite', appId),

  // soundpad
  soundpadCmd: (action, index) => ipcRenderer.invoke('soundpad:cmd', { action, index }),
  soundpadList: () => ipcRenderer.invoke('soundpad:list'),

  // media keys (SpotiOSC)
  mediaKey: action => ipcRenderer.invoke('media:key', action),

  // vrchat maintenance tools
  vrcToolsYtDlp: () => ipcRenderer.invoke('vrctools:ytdlp'),
  vrcToolsCacheSize: () => ipcRenderer.invoke('vrctools:cacheSize'),
  vrcToolsClearCache: () => ipcRenderer.invoke('vrctools:clearCache'),
  vrcToolsOpenFolder: which => ipcRenderer.invoke('vrctools:openFolder', which),

  // startup / auto-launch
  setLaunchOnLogin: enabled => ipcRenderer.invoke('app:setLaunchOnLogin', enabled),
  getLaunchOnLogin: () => ipcRenderer.invoke('app:getLaunchOnLogin'),

  // auto-afk
  afkStart: opts => ipcRenderer.invoke('afk:start', opts),
  afkStop: () => ipcRenderer.invoke('afk:stop'),

  // vr
  vrStart: () => ipcRenderer.invoke('vr:start'),
  vrStop: () => ipcRenderer.invoke('vr:stop'),

  // event subscription (main -> renderer)
  on: (channel, cb) => ipcRenderer.on(channel, (_e, payload) => cb(payload)),

  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
}

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
  vrchatFavGroups: type => ipcRenderer.invoke('vrchat:favGroups', type),
  vrchatBoop: (id, emojiId) => ipcRenderer.invoke('vrchat:boop', { id, emojiId }),
  vrchatMyAvatars: () => ipcRenderer.invoke('vrchat:myAvatars'),
  vrchatMyWorlds: () => ipcRenderer.invoke('vrchat:myWorlds'),
  vrchatAddFav: (type, id) => ipcRenderer.invoke('vrchat:addFav', { type, id }),
  vrchatRemoveFav: id => ipcRenderer.invoke('vrchat:removeFav', id),
  vrchatSearchUsers: q => ipcRenderer.invoke('vrchat:searchUsers', q),
  vrchatSearchWorlds: q => ipcRenderer.invoke('vrchat:searchWorlds', q),
  vrchatSearchGroups: q => ipcRenderer.invoke('vrchat:searchGroups', q),
  vrchatWorld: id => ipcRenderer.invoke('vrchat:world', id),
  vrchatGroup: id => ipcRenderer.invoke('vrchat:group', id),
  vrchatUpdateProfile: fields => ipcRenderer.invoke('vrchat:updateProfile', fields),
  vrchatSelectAvatar: id => ipcRenderer.invoke('vrchat:selectAvatar', id),
  vrchatDeleteAvatar: id => ipcRenderer.invoke('vrchat:deleteAvatar', id),
  vrchatCreateInstance: (worldId, access, region) => ipcRenderer.invoke('vrchat:createInstance', { worldId, access, region }),
  vrchatInviteSelf: location => ipcRenderer.invoke('vrchat:inviteSelf', location),
  vrchatCreateGroupInstance: (worldId, groupId, access, region) => ipcRenderer.invoke('vrchat:createGroupInstance', { worldId, groupId, access, region }),
  vrchatGroupInvite: (groupId, userId) => ipcRenderer.invoke('vrchat:groupInvite', { groupId, userId }),
  vrchatSetNote: (userId, note) => ipcRenderer.invoke('vrchat:setNote', { userId, note }),
  vrchatModerate: (userId, type) => ipcRenderer.invoke('vrchat:moderate', { userId, type }),
  vrchatUnmoderate: (userId, type) => ipcRenderer.invoke('vrchat:unmoderate', { userId, type }),
  vrchatFavFriendIds: () => ipcRenderer.invoke('vrchat:favFriendIds'),
  vrchatMessages: type => ipcRenderer.invoke('vrchat:messages', type),
  vrchatUpdateMessage: (type, slot, message) => ipcRenderer.invoke('vrchat:updateMessage', { type, slot, message }),
  vrchatGroupGalleries: id => ipcRenderer.invoke('vrchat:groupGalleries', id),
  vrchatGroupGalleryImages: (groupId, galleryId) => ipcRenderer.invoke('vrchat:groupGalleryImages', { groupId, galleryId }),
  vrchatGroupPosts: id => ipcRenderer.invoke('vrchat:groupPosts', id),
  vrchatAvatar: id => ipcRenderer.invoke('vrchat:avatar', id),
  vrchatGroupMembers: id => ipcRenderer.invoke('vrchat:groupMembers', id),
  vrchatGroupRoles: id => ipcRenderer.invoke('vrchat:groupRoles', id),
  vrchatModerations: () => ipcRenderer.invoke('vrchat:moderations'),
  vrchatInventory: tag => ipcRenderer.invoke('vrchat:inventory', tag),
  vrchatPrints: () => ipcRenderer.invoke('vrchat:prints'),
  vrchatImage: url => ipcRenderer.invoke('vrchat:image', url),
  avatarsSearch: (url, query, page) => ipcRenderer.invoke('avatars:search', { url, query, page }),
  avatarsDefaultProviders: () => ipcRenderer.invoke('avatars:defaultProviders'),
  setAutoRejoin: on => ipcRenderer.invoke('app:setAutoRejoin', on),
  pawprintsList: () => ipcRenderer.invoke('pawprints:list'),
  pawprintsClear: () => ipcRenderer.invoke('pawprints:clear'),

  // history / game-log
  historyList: opts => ipcRenderer.invoke('history:list', opts),
  historyClear: () => ipcRenderer.invoke('history:clear'),
  historyLog: ev => ipcRenderer.invoke('history:log', ev),
  historyImportVrcx: p => ipcRenderer.invoke('history:importVrcx', p),

  // notifications (cached)
  notifList: () => ipcRenderer.invoke('notif:list'),
  notifDismiss: id => ipcRenderer.invoke('notif:dismiss', id),
  notifAccept: id => ipcRenderer.invoke('notif:accept', id),
  notifClear: () => ipcRenderer.invoke('notif:clear'),

  // auto-greeter
  greeterSet: cfg => ipcRenderer.invoke('greeter:set', cfg),

  // photo relay
  photoRelaySet: cfg => ipcRenderer.invoke('photoRelay:set', cfg),
  launchVRChat: () => ipcRenderer.invoke('app:launchVRChat'),
  mediaPhotos: () => ipcRenderer.invoke('media:photos'),
  mediaOpen: p => ipcRenderer.invoke('media:open', p),
  vrchatOnline: () => ipcRenderer.invoke('vrchat:online'),
  appsLaunch: (paths, withVrchat) => ipcRenderer.invoke('apps:launch', { paths, withVrchat }),
  dataExport: () => ipcRenderer.invoke('data:export'),
  dataImport: () => ipcRenderer.invoke('data:import'),

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
  vvcInstall: () => ipcRenderer.invoke('vrctools:vvcInstall'),
  vvcStart: () => ipcRenderer.invoke('vrctools:vvcStart'),
  vvcStop: () => ipcRenderer.invoke('vrctools:vvcStop'),
  vvcStatus: () => ipcRenderer.invoke('vrctools:vvcStatus'),

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

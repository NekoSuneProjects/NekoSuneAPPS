const { app, BrowserWindow, ipcMain, Tray, Menu, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const settings = require('./settings')

const { getNowPlaying } = require('./modules/media/nowPlaying')
const {
  setMediaProvider,
  updateOverlaySettings,
  getOverlayState
} = require('./modules/overlay/overlayServer')

const { startComponentStats, stopComponentStats } = require('./modules/stats/componentStats')
const { startNetworkStats, stopNetworkStats } = require('./modules/stats/networkStats')
const { startPulsoid, stopPulsoid } = require('./modules/heartrate/pulsoidModule')
const { startHyperate, stopHyperate } = require('./modules/heartrate/hyperateModule')
const hrAnalytics = require('./modules/heartrate/hrAnalytics')
const { startWindowActivity, stopWindowActivity } = require('./modules/activity/windowActivity')
const { startAfk, stopAfk } = require('./modules/activity/afkModule')
const { connectTikTok, disconnectTikTok, startTikTokFollowers, stopTikTokFollowers } = require('./modules/live/tiktokModule')
const { startTwitch, stopTwitch } = require('./modules/live/twitchModule')
const { startKick, stopKick } = require('./modules/live/kickModule')
const { getTikTokTtsAudio, TIKTOK_VOICES } = require('./modules/live/tiktokTts')
const { intelliRewrite, AI_PROVIDERS } = require('./modules/ai/intelliChat')
const { loginTwitch, TWITCH_REDIRECT } = require('./modules/integrations/twitchOauth')
const { startDiscord, stopDiscord, updateActivity, setVrcContext } = require('./modules/integrations/discord')
const { startVrcWorld, stopVrcWorld, getVrcWorld } = require('./modules/vrchat/world/vrchatWorld')
const { startVrBattery, stopVrBattery } = require('./modules/vrchat/vr/vrBattery')
const vrchatApi = require('./modules/vrchat/api/vrchatApi')
const { startWeather, stopWeather, getWeather } = require('./modules/weather/weatherModule')
const { startBot, stopBot, setMute: botSetMute, setDeaf: botSetDeaf, inviteUrl } = require('./modules/integrations/discordBot')
const soundpad = require('./modules/integrations/soundpadModule')
const { pressMediaKey } = require('./modules/vrchat/osc/mediaKeys')
const vrcTools = require('./modules/vrchat/tools/vrcTools')
const pawprints = require('./modules/vrchat/tools/pawprints')
const gamelog = require('./modules/history/gamelog')
const photoRelay = require('./modules/integrations/photoRelay')
const avatarDb = require('./modules/vrchat/avatars/avatarDb')
const crashGuard = require('./modules/vrchat/tools/crashGuard')
const { startTon, stopTon, getTonState } = require('./modules/integrations/tonModule')
const tonData = require('./modules/integrations/tonData')

// Keep a stray error in any poller/network module from hard-crashing the app.
process.on('uncaughtException', err => console.error('[uncaughtException]', err))
process.on('unhandledRejection', err => console.error('[unhandledRejection]', err))

// The UI is lightweight; GPU compositing just wastes power. This drops the
// "GPU Very high" usage to near zero. Must be called before app is ready.
app.disableHardwareAcceleration()

let mainWindow
let tray

// Only ever allow ONE instance — prevents the process count ballooning if the
// app (or its installer/shortcut) is launched more than once.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus() }
  })
}

// Forward a module event into the renderer over a named channel.
function push (channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function createTray () {
  tray = new Tray(path.join(__dirname, 'assets/icon.ico'))
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show NekoSuneAPPS', click: () => mainWindow.show() },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setToolTip('NekoSuneAPPS')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => mainWindow.show())
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0b14',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets/icon.ico'),
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    }
  })

  mainWindow.loadFile('index.html')

  // Honor "Start minimized to tray": only reveal the window if not opted in.
  const startMinimized = !!settings.get('autostart', {}).autoMinimized
  mainWindow.once('ready-to-show', () => { if (!startMinimized) mainWindow.show() })

  mainWindow.on('minimize', event => {
    event.preventDefault()
    mainWindow.hide()
  })
  mainWindow.on('restore', () => mainWindow.show())

  createTray()
}

async function configureOverlayServer () {
  setMediaProvider(getNowPlaying)
  try {
    await updateOverlaySettings({
      enabled: settings.get('overlayEnabled', true),
      port: settings.get('overlayPort', 39530),
      style: settings.get('overlayStyle', 'default')
    })
  } catch (error) {
    console.error('Overlay server failed:', error)
  }
}

app.whenReady().then(async () => {
  await configureOverlayServer()
  createWindow()
  // Track the current VRChat world from its log; feed it to the renderer and
  // (when connected) into the Discord presence.
  gamelog.init(app.getPath('userData')).catch(err => console.warn('gamelog init:', err.message))
  tonData.init(app.getPath('userData')) // load/refresh the offline ToN reference cache
  startVrcWorld(w => {
    push('vrc:world', w)
    setVrcContext({ worldName: w.inWorld ? w.worldName : '', joinUrl: w.joinUrl, worldUrl: w.worldUrl, profileUrl: w.profileUrl })
    pawprints.setWorld(w.inWorld ? w.worldName : '')
    logWorldDiff(w)
    if (w.lastVideo && w.lastVideo !== lastVideoLogged) { lastVideoLogged = w.lastVideo; gamelog.log('video', '🎬 Video', w.lastVideo, w.worldName) }
    if (w.portalSeq && w.portalSeq !== lastPortalSeq) { lastPortalSeq = w.portalSeq; gamelog.log('portal', w.lastPortal || 'Someone', 'dropped a portal', w.worldName) }
  })
  crashGuard.start({ enabled: settings.get('autoRejoin', false), getLocation: () => { const w = getVrcWorld(); return (w.inWorld && w.worldId && w.instanceId) ? `${w.worldId}:${w.instanceId}` : '' } })
  setInterval(() => pawprints.tickCommit(), 60000) // persist ongoing world time
  // Stagger the pollers so they don't all hit the API at once on launch.
  setTimeout(startFriendDiff, 8000)
  setTimeout(startNotifPoll, 14000)
  setTimeout(startGroupAlerts, 22000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  stopComponentStats(); stopNetworkStats(); stopPulsoid(); stopHyperate(); stopWindowActivity(); stopTon()
  disconnectTikTok(); stopTwitch(); stopKick(); stopDiscord(); stopVrBattery(); stopVrcWorld(); stopAfk()
  stopWeather(); stopVrcStatusPoll(); stopBot(); pawprints.tickCommit(); stopFriendDiff(); stopGreeter(); gamelog.close(); photoRelay.stop(); stopGroupAlerts(); stopNotifPoll(); crashGuard.stop(); vrcTools.stopVideoCacher()
})

/* ------------------------------------------------------------------ */
/* Generic settings + now playing (carried from OSCAudiolink)          */
/* ------------------------------------------------------------------ */
ipcMain.handle('getSetting', (e, key, def) => settings.get(key, def))
ipcMain.handle('saveSetting', (e, key, value) => { settings.set(key, value); return value })
ipcMain.handle('getOscPort', () => settings.get('oscPort', 9000))
ipcMain.on('updateOscPort', (e, port) => settings.set('oscPort', port))
ipcMain.handle('saveOscPort', (e, port) => { settings.set('oscPort', port); return port })
ipcMain.handle('getNowPlaying', () => getNowPlaying())
ipcMain.handle('getOverlayState', () => getOverlayState())
ipcMain.handle('updateOverlaySettings', (e, s) => updateOverlaySettings(s))

/* ------------------------------------------------------------------ */
/* Component stats                                                     */
/* ------------------------------------------------------------------ */
ipcMain.handle('stats:start', (e, intervalMs) => {
  startComponentStats(s => push('stats:update', s), intervalMs)
  return true
})
ipcMain.handle('stats:stop', () => { stopComponentStats(); return true })

/* Network stats */
ipcMain.handle('net:start', (e, opts) => {
  startNetworkStats(s => push('net:update', s), opts || {})
  return true
})
ipcMain.handle('net:stop', () => { stopNetworkStats(); return true })

/* ------------------------------------------------------------------ */
/* Heart rate (Pulsoid + HypeRate) with session analytics             */
/* ------------------------------------------------------------------ */
let hrProvider = 'pulsoid'

// Wrap the provider listener so every reading also feeds analytics + Discord.
function onHr (s) {
  push('hr:update', s)
  hrAnalytics.record(s.bpm)
  if (s.online && s.bpm) setVrcContext({ hrBpm: s.bpm })
  else setVrcContext({ hrBpm: 0 })
}

function stopHr () {
  stopPulsoid(); stopHyperate()
  const summary = hrAnalytics.end()
  if (summary) push('hr:sessions', hrAnalytics.list())
  setVrcContext({ hrBpm: 0 })
}

// cfg: { provider:'pulsoid'|'hyperate', token, apiKey, deviceId }
ipcMain.handle('hr:start', (e, cfg) => {
  cfg = cfg || {}
  stopHr()
  hrProvider = cfg.provider === 'hyperate' ? 'hyperate' : 'pulsoid'
  hrAnalytics.begin(hrProvider)
  if (hrProvider === 'hyperate') startHyperate(cfg.apiKey, cfg.deviceId, onHr)
  else startPulsoid(cfg.token, onHr)
  return true
})
ipcMain.handle('hr:stop', () => { stopHr(); return true })
ipcMain.handle('hr:sessions', () => hrAnalytics.list())
ipcMain.handle('hr:clearSessions', () => { hrAnalytics.clear(); return true })

/* ------------------------------------------------------------------ */
/* Window activity                                                     */
/* ------------------------------------------------------------------ */
ipcMain.handle('window:start', () => {
  startWindowActivity(s => push('window:update', s))
  return true
})
ipcMain.handle('window:stop', () => { stopWindowActivity(); return true })

/* ------------------------------------------------------------------ */
/* ToNSaveManager (Terrors of Nowhere tracker)                         */
/* ------------------------------------------------------------------ */
// Encountered terrors / maps — the "how many you've bumped into" tally, persisted.
const tonSeenTerrors = new Set(settings.get('tonSeenTerrors', []))
const tonSeenMaps = new Set(settings.get('tonSeenMaps', []))
let tonSeenSaveTimer = null
function tonRecordSeen (s) {
  let changed = false
  if (s.roundActive && s.terror && s.terror !== '???' && !tonSeenTerrors.has(s.terror)) { tonSeenTerrors.add(s.terror); changed = true }
  if (s.map && !tonSeenMaps.has(s.map)) { tonSeenMaps.add(s.map); changed = true }
  if (changed) {
    clearTimeout(tonSeenSaveTimer)
    tonSeenSaveTimer = setTimeout(() => {
      settings.set('tonSeenTerrors', [...tonSeenTerrors]); settings.set('tonSeenMaps', [...tonSeenMaps])
    }, 3000)
  }
}
function onTonUpdate (s) { tonRecordSeen(s); push('ton:update', s) }

ipcMain.handle('ton:start', (e, opts) => {
  startTon(onTonUpdate, {
    ...(opts || {}),
    // Persist each finished round to the offline history (sql.js gamelog) and push live.
    onRound: rec => {
      gamelog.log('ton_round', rec.roundType || 'Round',
        JSON.stringify({ terror: rec.terror, map: rec.map, result: rec.result, dur: rec.durationSec }), rec.map || '')
      push('ton:round', rec)
    }
  })
  return true
})
ipcMain.handle('ton:stop', () => { stopTon(); return true })
ipcMain.handle('ton:get', () => getTonState())
ipcMain.handle('ton:history', (e, limit) => gamelog.list({ type: 'ton_round', limit: limit || 200 }).map(r => {
  let d = {}; try { d = JSON.parse(r.detail || '{}') } catch (_) {}
  return { ts: r.ts, roundType: r.name, terror: d.terror || '', map: d.map || r.world || '', result: d.result || '', durationSec: d.dur || 0 }
}))

// Offline ToN reference cache (achievements + terrors, scraped from terror.moe).
ipcMain.handle('ton:data', () => tonData.get())
ipcMain.handle('ton:dataRefresh', async () => {
  const c = await tonData.refresh()
  return { achievements: c.achievements.length, terrors: c.terrors.length, fetchedAt: c.fetchedAt }
})
ipcMain.handle('ton:seen', () => ({ terrors: [...tonSeenTerrors], maps: [...tonSeenMaps] }))
ipcMain.handle('app:openExternal', (e, url) => { if (/^https?:\/\//i.test(url || '')) shell.openExternal(url); return true })

// Manually-marked unlocks (ToN's API has no per-achievement feed). Terrors/maps
// also auto-unlock from live encounters (tonSeen*); the rest are user-toggled.
const tonUnlockAch = new Set(settings.get('tonUnlockAch', []))
const tonUnlockItems = new Set(settings.get('tonUnlockItems', []))
const tonUnlockRounds = new Set(settings.get('tonUnlockRounds', []))
const tonSetFor = cat => ({ achievements: tonUnlockAch, items: tonUnlockItems, rounds: tonUnlockRounds, terrors: tonSeenTerrors, locations: tonSeenMaps }[cat])
const tonKeyFor = cat => ({ achievements: 'tonUnlockAch', items: 'tonUnlockItems', rounds: 'tonUnlockRounds', terrors: 'tonSeenTerrors', locations: 'tonSeenMaps' }[cat])
ipcMain.handle('ton:unlocks', () => ({
  achievements: [...tonUnlockAch], items: [...tonUnlockItems], rounds: [...tonUnlockRounds],
  terrors: [...tonSeenTerrors], locations: [...tonSeenMaps]
}))
ipcMain.handle('ton:toggleUnlock', (e, { category, key } = {}) => {
  const set = tonSetFor(category); if (!set || !key) return false
  if (set.has(key)) set.delete(key); else set.add(key)
  settings.set(tonKeyFor(category), [...set])
  return set.has(key)
})

// Export / import the player's ToN data (stats + encounters + round history).
ipcMain.handle('ton:export', async () => {
  const r = await dialog.showSaveDialog({ defaultPath: 'ton-player-data.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (r.canceled || !r.filePath) return { ok: false, error: 'cancelled' }
  try {
    const payload = {
      app: 'NekoSuneAPPS', kind: 'ton-player-data', version: 1, exportedAt: Date.now(),
      stats: getTonState(),
      seenTerrors: [...tonSeenTerrors],
      seenMaps: [...tonSeenMaps],
      history: gamelog.list({ type: 'ton_round', limit: 5000 })
    }
    fs.writeFileSync(r.filePath, JSON.stringify(payload, null, 2))
    return { ok: true, path: r.filePath }
  } catch (err) { return { ok: false, error: err.message } }
})
ipcMain.handle('ton:import', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (r.canceled || !r.filePaths[0]) return { ok: false, error: 'cancelled' }
  try {
    const data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'))
    if (Array.isArray(data.seenTerrors)) data.seenTerrors.forEach(t => tonSeenTerrors.add(t))
    if (Array.isArray(data.seenMaps)) data.seenMaps.forEach(m => tonSeenMaps.add(m))
    settings.set('tonSeenTerrors', [...tonSeenTerrors]); settings.set('tonSeenMaps', [...tonSeenMaps])
    // Merge round history (skip exact duplicates by timestamp+type).
    if (Array.isArray(data.history)) {
      const existing = new Set(gamelog.list({ type: 'ton_round', limit: 5000 }).map(e => e.ts))
      data.history.forEach(h => { if (h && h.ts && !existing.has(h.ts)) gamelog.log('ton_round', h.name || 'Round', h.detail || '{}', h.world || '') })
    }
    return { ok: true, terrors: tonSeenTerrors.size, maps: tonSeenMaps.size }
  } catch (err) { return { ok: false, error: err.message } }
})

/* ------------------------------------------------------------------ */
/* TikTok live (followers)                                             */
/* ------------------------------------------------------------------ */
ipcMain.handle('tiktok:connect', (e, payload) => {
  const username = typeof payload === 'string' ? payload : payload?.username
  const signApiKey = typeof payload === 'object' ? payload?.signApiKey : ''
  connectTikTok(username, s => push('tiktok:update', s), signApiKey)
  return true
})
ipcMain.handle('tiktok:disconnect', () => { disconnectTikTok(); return true })

/* TikTok followers without being live (reads public profile) */
ipcMain.handle('tiktok:followers:start', (e, username) => {
  startTikTokFollowers(username, s => push('tiktok:followers', s))
  return true
})
ipcMain.handle('tiktok:followers:stop', () => { stopTikTokFollowers(); return true })

/* TikTok TTS */
ipcMain.handle('tiktok:voices', () => TIKTOK_VOICES)
ipcMain.handle('tiktok:tts', async (e, { text, voice }) => {
  const buf = await getTikTokTtsAudio(text, voice)
  return buf ? buf.toString('base64') : null
})

/* ------------------------------------------------------------------ */
/* Twitch (followers)                                                  */
/* ------------------------------------------------------------------ */
ipcMain.handle('twitch:start', (e, cfg) => {
  startTwitch(cfg, s => push('twitch:update', s))
  return true
})
ipcMain.handle('twitch:stop', () => { stopTwitch(); return true })

/* ------------------------------------------------------------------ */
/* Kick.com (followers)                                                */
/* ------------------------------------------------------------------ */
ipcMain.handle('kick:start', (e, slug) => {
  startKick(slug, s => push('kick:update', s))
  return true
})
ipcMain.handle('kick:stop', () => { stopKick(); return true })

/* ------------------------------------------------------------------ */
/* IntelliChat (multi-provider)                                        */
/* ------------------------------------------------------------------ */
ipcMain.handle('ai:rewrite', (e, opts) => intelliRewrite(opts))
ipcMain.handle('ai:providers', () => AI_PROVIDERS)

/* ------------------------------------------------------------------ */
/* Twitch OAuth2 login                                                 */
/* ------------------------------------------------------------------ */
ipcMain.handle('twitch:redirect', () => TWITCH_REDIRECT)
ipcMain.handle('twitch:oauth', async (e, { clientId, clientSecret, scopes }) => {
  try {
    const tokens = await loginTwitch(clientId, clientSecret, scopes)
    return { ok: true, ...tokens }
  } catch (err) { return { ok: false, error: err.message } }
})

/* ------------------------------------------------------------------ */
/* Discord RPC                                                         */
/* ------------------------------------------------------------------ */
ipcMain.handle('discord:start', async (e, cfg) => {
  const oscPort = settings.get('oscPort', 9000)
  const r = await startDiscord({ ...(cfg || {}), oscPort }, s => push('discord:update', s))
  // Seed the presence with the world we've already detected.
  const w = getVrcWorld()
  setVrcContext({ worldName: w.inWorld ? w.worldName : '', joinUrl: w.joinUrl, worldUrl: w.worldUrl, profileUrl: w.profileUrl })
  return r
})
ipcMain.handle('discord:stop', async () => { await stopDiscord(); return true })
ipcMain.handle('discord:activity', (e, activity) => { updateActivity(activity); return true })
// Live VRChat status / world-visibility changes from the Discord card.
ipcMain.handle('discord:vrc', (e, ctx) => { setVrcContext(ctx || {}); return true })
ipcMain.handle('discord:live', (e, ctx) => { setVrcContext(ctx || {}); return true }) // { nowPlaying, hrBpm }
ipcMain.handle('vrc:get', () => getVrcWorld())

/* ------------------------------------------------------------------ */
/* VRChat account — auto status detection                              */
/* ------------------------------------------------------------------ */
let vrcStatusTimer = null
async function applyVrcStatus () {
  if (vrchatApi.isRateLimited()) return
  const r = await vrchatApi.fetchUser()
  if (r.ok && r.user) {
    push('vrchat:account', { ok: true, displayName: r.user.displayName, status: r.user.status, statusDescription: r.user.statusDescription })
    setVrcContext({ vrcStatus: vrchatApi.mapStatus(r.user.status) })
  } else {
    push('vrchat:account', { ok: false, needs2fa: r.needs2fa, error: r.error })
  }
}
function startVrcStatusPoll () { stopVrcStatusPoll(); applyVrcStatus(); vrcStatusTimer = setInterval(applyVrcStatus, 60000) }
function stopVrcStatusPoll () { if (vrcStatusTimer) { clearInterval(vrcStatusTimer); vrcStatusTimer = null } }

ipcMain.handle('vrchat:login', (e, { username, password }) => vrchatApi.login(username, password))
ipcMain.handle('vrchat:verify2fa', (e, { code, method }) => vrchatApi.verify2fa(code, method))
ipcMain.handle('vrchat:status', () => vrchatApi.fetchUser())
ipcMain.handle('vrchat:isLoggedIn', () => vrchatApi.isLoggedIn())
ipcMain.handle('vrchat:logout', () => { vrchatApi.logout(); stopVrcStatusPoll(); return true })
ipcMain.handle('vrchat:autostatus', (e, on) => { if (on) startVrcStatusPoll(); else stopVrcStatusPoll(); return true })

/* Friend Den / Event Scout / Pawprints / Auto-Greeter (VRChat API) */
ipcMain.handle('vrchat:friends', () => vrchatApi.getFriends())
ipcMain.handle('vrchat:groups', () => vrchatApi.getMyGroups())
ipcMain.handle('vrchat:groupEvents', (e, groupId) => vrchatApi.getGroupEvents(groupId))
ipcMain.handle('vrchat:notifications', () => vrchatApi.getNotifications())
ipcMain.handle('vrchat:acceptFriend', (e, id) => vrchatApi.acceptFriendRequest(id))
ipcMain.handle('vrchat:user', (e, id) => vrchatApi.getUser(id))
ipcMain.handle('vrchat:friendRequest', (e, id) => vrchatApi.sendFriendRequest(id))
ipcMain.handle('vrchat:requestInvite', (e, { id, slot } = {}) => vrchatApi.requestInvite(id, slot))
ipcMain.handle('vrchat:unfriend', (e, id) => vrchatApi.unfriend(id))
ipcMain.handle('vrchat:invite', (e, { id, instanceId, slot } = {}) => vrchatApi.inviteUser(id, instanceId, slot))
ipcMain.handle('vrchat:userGroups', (e, id) => vrchatApi.getUserGroups(id))
ipcMain.handle('vrchat:userWorlds', (e, id) => vrchatApi.getUserWorlds(id))
ipcMain.handle('vrchat:mutuals', (e, id) => vrchatApi.getMutualFriends(id))
ipcMain.handle('vrchat:favWorlds', () => vrchatApi.getFavoriteWorlds())
ipcMain.handle('vrchat:favGroups', (e, type) => vrchatApi.getFavoriteGroups(type))
ipcMain.handle('vrchat:boop', (e, { id, emojiId } = {}) => vrchatApi.sendBoop(id, emojiId))
ipcMain.handle('vrchat:myAvatars', () => vrchatApi.getMyAvatars())
ipcMain.handle('vrchat:myWorlds', () => vrchatApi.getMyWorlds())
ipcMain.handle('vrchat:addFav', (e, { type, id } = {}) => vrchatApi.addFavorite(type, id))
ipcMain.handle('vrchat:removeFav', (e, id) => vrchatApi.removeFavorite(id))
ipcMain.handle('vrchat:searchUsers', (e, q) => vrchatApi.searchUsers(q))
ipcMain.handle('vrchat:searchWorlds', (e, q) => vrchatApi.searchWorlds(q))
ipcMain.handle('vrchat:searchGroups', (e, q) => vrchatApi.searchGroups(q))
ipcMain.handle('vrchat:world', (e, id) => vrchatApi.getWorld(id))
ipcMain.handle('vrchat:group', (e, id) => vrchatApi.getGroup(id))
ipcMain.handle('vrchat:updateProfile', (e, fields) => vrchatApi.updateProfile(fields || {}))
ipcMain.handle('vrchat:selectAvatar', (e, id) => vrchatApi.selectAvatar(id))
ipcMain.handle('vrchat:deleteAvatar', (e, id) => vrchatApi.deleteAvatar(id))
ipcMain.handle('vrchat:createInstance', (e, { worldId, access, region } = {}) => vrchatApi.createInstance(worldId, access, region))
ipcMain.handle('vrchat:inviteSelf', (e, location) => vrchatApi.inviteSelf(location))
ipcMain.handle('vrchat:createGroupInstance', (e, { worldId, groupId, access, region } = {}) => vrchatApi.createGroupInstance(worldId, groupId, access, region))
ipcMain.handle('vrchat:groupInvite', (e, { groupId, userId } = {}) => vrchatApi.groupInvite(groupId, userId))
ipcMain.handle('vrchat:setNote', (e, { userId, note } = {}) => vrchatApi.setNote(userId, note))
ipcMain.handle('vrchat:moderate', (e, { userId, type } = {}) => vrchatApi.moderate(userId, type))
ipcMain.handle('vrchat:unmoderate', (e, { userId, type } = {}) => vrchatApi.unmoderate(userId, type))
ipcMain.handle('vrchat:favFriendIds', () => vrchatApi.getFavoriteFriendIds())
ipcMain.handle('vrchat:messages', (e, type) => vrchatApi.getMessages(type))
ipcMain.handle('vrchat:updateMessage', (e, { type, slot, message } = {}) => vrchatApi.updateMessage(type, slot, message))
ipcMain.handle('vrchat:groupGalleries', (e, id) => vrchatApi.getGroupGalleries(id))
ipcMain.handle('vrchat:groupGalleryImages', (e, { groupId, galleryId } = {}) => vrchatApi.getGroupGalleryImages(groupId, galleryId))
ipcMain.handle('vrchat:groupPosts', (e, id) => vrchatApi.getGroupPosts(id))
ipcMain.handle('vrchat:avatar', (e, id) => vrchatApi.getAvatar(id))
ipcMain.handle('vrchat:groupMembers', (e, id) => vrchatApi.getGroupMembers(id))
ipcMain.handle('vrchat:groupRoles', (e, id) => vrchatApi.getGroupRoles(id))
ipcMain.handle('vrchat:moderations', () => vrchatApi.getModerations())
ipcMain.handle('vrchat:inventory', (e, tag) => vrchatApi.getInventory(tag))
ipcMain.handle('vrchat:prints', () => vrchatApi.getPrints())
ipcMain.handle('vrchat:image', (e, url) => vrchatApi.imageData(url))
ipcMain.handle('avatars:search', (e, { url, query, page } = {}) => avatarDb.search(url, query, page))
ipcMain.handle('avatars:defaultProviders', () => avatarDb.DEFAULT_PROVIDERS)
ipcMain.handle('app:setAutoRejoin', (e, on) => { crashGuard.setEnabled(!!on); settings.set('autoRejoin', !!on); return true })
ipcMain.handle('pawprints:list', () => pawprints.list())
ipcMain.handle('pawprints:clear', () => { pawprints.clear(); return true })

/* ------------------------------------------------------------------ */
/* History / game-log (SQLite via sql.js)                              */
/* ------------------------------------------------------------------ */
let lastPlayers = new Set()
let playersPrimed = false
let lastWorldLogged = ''
let lastVideoLogged = ''
let lastPortalSeq = 0
let worldEnteredAt = 0
function logWorldDiff (w) {
  if (!w) return
  if (!w.inWorld) {
    if (lastWorldLogged && worldEnteredAt) { gamelog.log('world', lastWorldLogged, `Left after ${Math.round((Date.now() - worldEnteredAt) / 60000)}m`, lastWorldLogged) }
    lastPlayers = new Set(); playersPrimed = false; lastWorldLogged = ''; worldEnteredAt = 0; return
  }
  if (w.worldName && w.worldName !== lastWorldLogged) {
    if (lastWorldLogged && worldEnteredAt) gamelog.log('world', lastWorldLogged, `Left after ${Math.round((Date.now() - worldEnteredAt) / 60000)}m`, lastWorldLogged)
    lastWorldLogged = w.worldName; worldEnteredAt = Date.now()
    gamelog.log('world', w.worldName, 'Entered instance', w.worldName)
  }
  const cur = new Set(w.players || [])
  if (!playersPrimed) { lastPlayers = cur; playersPrimed = true; return }
  for (const p of cur) if (!lastPlayers.has(p)) gamelog.log('join', p, 'joined', w.worldName)
  for (const p of lastPlayers) if (!cur.has(p)) gamelog.log('leave', p, 'left', w.worldName)
  lastPlayers = cur
}

let lastFriends = null // Map(id -> displayName)
let friendDiffTimer = null
async function pollFriendDiff () {
  if (!vrchatApi.isLoggedIn() || vrchatApi.isRateLimited()) return
  const [on, off] = await Promise.all([vrchatApi.getFriends(false), vrchatApi.getFriends(true)])
  if (!on.ok && !off.ok) return
  const map = new Map()
  for (const f of [...(on.friends || []), ...(off.friends || [])]) map.set(f.id, f.displayName)
  if (lastFriends === null) { lastFriends = map; return } // baseline
  for (const [id, name] of map) {
    if (!lastFriends.has(id)) gamelog.log('friend_add', name, 'New friend', '')
    else if (lastFriends.get(id) !== name) gamelog.log('name_change', name, `was "${lastFriends.get(id)}"`, '')
  }
  for (const [id, name] of lastFriends) if (!map.has(id)) gamelog.log('friend_remove', name, 'No longer friends', '')
  lastFriends = map
}
function startFriendDiff () { stopFriendDiff(); pollFriendDiff(); friendDiffTimer = setInterval(pollFriendDiff, 120000) }
function stopFriendDiff () { if (friendDiffTimer) { clearInterval(friendDiffTimer); friendDiffTimer = null } }

ipcMain.handle('history:list', (e, opts) => gamelog.list(opts || {}))
ipcMain.handle('history:clear', () => { gamelog.clear(); return true })
ipcMain.handle('history:log', (e, { type, name, detail, world } = {}) => { gamelog.log(type, name, detail, world); return true })
ipcMain.handle('history:importVrcx', (e, customPath) => {
  const p = customPath || path.join(app.getPath('appData'), 'VRCX', 'VRCX.sqlite3')
  return gamelog.importVrcx(p)
})

/* ------------------------------------------------------------------ */
/* Auto-Greeter — auto-accept friend requests                          */
/* ------------------------------------------------------------------ */
let greeterTimer = null
let greeterCfg = { enabled: false, mode: 'all', allow: [] }
async function pollGreeter () {
  if (!greeterCfg.enabled || !vrchatApi.isLoggedIn()) return
  const r = await vrchatApi.getNotifications()
  if (!r.ok) return
  for (const n of r.notifications) {
    if (n.type !== 'friendRequest') continue
    const who = String(n.senderUsername || '').toLowerCase()
    const allowed = greeterCfg.mode === 'all' || greeterCfg.allow.some(a => a && (who.includes(a) || n.senderUserId === a))
    if (!allowed) continue
    const res = await vrchatApi.acceptFriendRequest(n.id)
    if (res.ok) { gamelog.log('friend_add', n.senderUsername || 'someone', 'Auto-accepted request', ''); push('greeter:accepted', { name: n.senderUsername || 'someone' }) }
  }
}
function stopGreeter () { if (greeterTimer) { clearInterval(greeterTimer); greeterTimer = null } }
ipcMain.handle('greeter:set', (e, cfg = {}) => {
  greeterCfg = {
    enabled: !!cfg.enabled,
    mode: cfg.mode === 'list' ? 'list' : 'all',
    allow: (cfg.allow || []).map(s => String(s).toLowerCase().trim()).filter(Boolean)
  }
  stopGreeter()
  if (greeterCfg.enabled) { pollGreeter(); greeterTimer = setInterval(pollGreeter, 60000) }
  return true
})
ipcMain.handle('app:launchVRChat', () => { shell.openExternal('steam://rungameid/438100'); return true })

/* ------------------------------------------------------------------ */
/* Media library / server status / configured start / data + alerts    */
/* ------------------------------------------------------------------ */
ipcMain.handle('media:photos', () => { try { return { ok: true, photos: vrcTools.listPhotos(300) } } catch (e) { return { ok: false, error: e.message } } })
ipcMain.handle('media:open', (e, p) => { shell.openPath(p); return true })

ipcMain.handle('vrchat:online', () => vrchatApi.getOnlineCount())

// Configured Start — launch companion apps (and optionally VRChat).
ipcMain.handle('apps:launch', (e, { paths, withVrchat } = {}) => {
  let launched = 0
  for (const p of (paths || [])) {
    if (!p) continue
    try { spawn(p, [], { detached: true, stdio: 'ignore' }).unref(); launched++ } catch (err) { console.warn('launch failed:', p, err.message) }
  }
  if (withVrchat) shell.openExternal('steam://rungameid/438100')
  return { ok: true, launched }
})

// Data export / import (settings + history) via file dialogs.
ipcMain.handle('data:export', async () => {
  const r = await dialog.showSaveDialog({ defaultPath: 'nekosuneapps-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (r.canceled || !r.filePath) return { ok: false, error: 'cancelled' }
  try {
    fs.writeFileSync(r.filePath, JSON.stringify({ settings: settings.all(), history: gamelog.list({ limit: 5000 }) }, null, 2))
    return { ok: true, path: r.filePath }
  } catch (err) { return { ok: false, error: err.message } }
})
ipcMain.handle('data:import', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (r.canceled || !r.filePaths[0]) return { ok: false, error: 'cancelled' }
  try {
    const data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'))
    if (data.settings) settings.importAll(data.settings)
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
})

// Group alerts — poll watched groups' posts AND events, log new ones + toast.
let alertTimer = null
const lastPostByGroup = {}
const lastEventByGroup = {}
async function pollGroupAlerts () {
  if (!vrchatApi.isLoggedIn() || vrchatApi.isRateLimited()) return
  const groups = settings.get('eventGroups', [])
  for (const gid of groups) {
    const r = await vrchatApi.getGroupPosts(gid)
    if (r.ok && r.posts.length) {
      const newest = r.posts[0]
      if (lastPostByGroup[gid] && lastPostByGroup[gid] !== newest.id) {
        gamelog.log('group', newest.title || 'Group post', newest.text || '', gid)
        push('alert:group', { groupId: gid, title: '📣 ' + (newest.title || 'Group post'), text: newest.text })
      }
      lastPostByGroup[gid] = newest.id
    }
    const ev = await vrchatApi.getGroupEvents(gid)
    if (ev.ok && ev.events.length) {
      const ne = ev.events[0]
      if (lastEventByGroup[gid] && lastEventByGroup[gid] !== ne.id) {
        gamelog.log('group', ne.title || 'Group event', 'New event', gid)
        push('alert:group', { groupId: gid, title: '📅 New event: ' + (ne.title || ''), text: ne.description || '' })
      }
      lastEventByGroup[gid] = ne.id
    }
  }
}
function startGroupAlerts () { stopGroupAlerts(); pollGroupAlerts(); alertTimer = setInterval(pollGroupAlerts, 300000) }
function stopGroupAlerts () { if (alertTimer) { clearInterval(alertTimer); alertTimer = null } }
ipcMain.handle('alerts:groupsRefresh', () => { startGroupAlerts(); return true })

// Notifications — poll, parse, cache in SQLite (persist until dismissed), toast new.
let notifTimer = null
function parseNotif (n) {
  let det = n.details
  if (typeof det === 'string') { try { det = JSON.parse(det) } catch (_) { det = {} } }
  det = det || {}
  let link = ''
  if (det.worldId) link = `https://vrchat.com/home/launch?worldId=${det.worldId}` + (det.instanceId ? `&instanceId=${encodeURIComponent(det.instanceId)}` : '')
  return { id: n.id, ts: Date.parse(n.created_at) || Date.now(), type: n.type || 'notification', sender: n.senderUsername || det.senderUsername || '', message: n.message || det.inviteMessage || '', world: det.worldName || '', link }
}
function notifText (p) {
  switch (p.type) {
    case 'friendRequest': return 'sent a friend request'
    case 'invite': return 'invited you' + (p.world ? ' to ' + p.world : '')
    case 'requestInvite': return 'requested an invite'
    case 'requestInviteResponse': return 'responded to your invite request'
    case 'inviteResponse': return 'responded to your invite'
    case 'boop': return 'booped you 👉'
    default: return p.message || p.type
  }
}
async function pollNotifications () {
  if (!vrchatApi.isLoggedIn() || vrchatApi.isRateLimited()) return
  const r = await vrchatApi.getNotifications()
  if (!r.ok) return
  for (const n of r.notifications) {
    const p = parseNotif(n)
    if (gamelog.upsertNotif(p)) { push('notif:new', p); gamelog.log('alert', p.sender || p.type, notifText(p), p.world) }
  }
  push('notif:update')
}
function startNotifPoll () { stopNotifPoll(); pollNotifications(); notifTimer = setInterval(pollNotifications, 60000) }
function stopNotifPoll () { if (notifTimer) { clearInterval(notifTimer); notifTimer = null } }
ipcMain.handle('notif:list', () => gamelog.listNotifs())
ipcMain.handle('notif:dismiss', async (e, id) => { await vrchatApi.hideNotification(id); gamelog.removeNotif(id); return true })
ipcMain.handle('notif:accept', async (e, id) => { const r = await vrchatApi.acceptFriendRequest(id); if (r.ok) gamelog.removeNotif(id); return r })
ipcMain.handle('notif:clear', () => { gamelog.clearNotifs(); return true })

/* ------------------------------------------------------------------ */
/* Weather                                                             */
/* ------------------------------------------------------------------ */
ipcMain.handle('weather:start', (e, opts) => { startWeather(opts || {}, s => push('weather:update', s)); return true })
ipcMain.handle('weather:stop', () => { stopWeather(); return true })
ipcMain.handle('weather:get', () => getWeather())

/* ------------------------------------------------------------------ */
/* Discord BOT (voice state + DiscordOSC mute/deafen)                  */
/* ------------------------------------------------------------------ */
ipcMain.handle('bot:start', (e, cfg) => startBot(cfg || {}, s => push('bot:update', s)))
ipcMain.handle('bot:stop', async () => { await stopBot(); return true })
ipcMain.handle('bot:setMute', (e, m) => botSetMute(m))
ipcMain.handle('bot:setDeaf', (e, d) => botSetDeaf(d))
ipcMain.handle('bot:invite', (e, appId) => inviteUrl(appId))

/* ------------------------------------------------------------------ */
/* Soundpad                                                            */
/* ------------------------------------------------------------------ */
ipcMain.handle('soundpad:cmd', async (e, { action, index } = {}) => {
  try {
    switch (action) {
      case 'play': await soundpad.playSound(index); break
      case 'stop': await soundpad.stopSound(); break
      case 'next': await soundpad.nextSound(); break
      case 'previous': await soundpad.previousSound(); break
      case 'random': await soundpad.randomSound(); break
      case 'pause': await soundpad.togglePause(); break
      default: return { ok: false, error: 'Unknown action' }
    }
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
})
ipcMain.handle('soundpad:list', async () => {
  try { return { ok: true, list: await soundpad.getSoundList() } } catch (err) { return { ok: false, error: err.message } }
})

/* ------------------------------------------------------------------ */
/* Media keys (SpotiOSC)                                               */
/* ------------------------------------------------------------------ */
ipcMain.handle('media:key', (e, action) => pressMediaKey(action).then(() => ({ ok: true })).catch(err => ({ ok: false, error: err.message })))

// Photo Relay (VRChat screenshots -> Discord webhook)
ipcMain.handle('photoRelay:set', (e, cfg) => { photoRelay.start(cfg || {}, s => push('photoRelay:event', s)); return true })

/* ------------------------------------------------------------------ */
/* VRChat maintenance tools (external/file-based — no game injection)  */
/* ------------------------------------------------------------------ */
ipcMain.handle('vrctools:ytdlp', () => vrcTools.updateYtDlp())
ipcMain.handle('vrctools:cacheSize', () => vrcTools.cacheSize())
ipcMain.handle('vrctools:clearCache', () => vrcTools.clearCache())
ipcMain.handle('vrctools:openFolder', (e, which) => {
  const p = vrcTools.folderPath(which)
  if (p) shell.openPath(p)
  return p
})
ipcMain.handle('vrctools:vvcInstall', () => vrcTools.installVideoCacher(settings.get('vvcUrl', '')))
ipcMain.handle('vrctools:vvcStart', () => vrcTools.startVideoCacher())
ipcMain.handle('vrctools:vvcStop', () => vrcTools.stopVideoCacher())
ipcMain.handle('vrctools:vvcStatus', () => vrcTools.videoCacherStatus())

/* ------------------------------------------------------------------ */
/* Startup / auto-launch                                               */
/* ------------------------------------------------------------------ */
ipcMain.handle('app:setLaunchOnLogin', (e, enabled) => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, args: [] })
  } catch (err) { console.warn('setLoginItemSettings failed:', err.message) }
  return true
})
ipcMain.handle('app:getLaunchOnLogin', () => {
  try { return app.getLoginItemSettings().openAtLogin } catch (_) { return false }
})

/* ------------------------------------------------------------------ */
/* VR gear battery                                                     */
/* ------------------------------------------------------------------ */
ipcMain.handle('vr:start', () => {
  startVrBattery(s => push('vr:update', s))
  return true
})
ipcMain.handle('vr:stop', () => { stopVrBattery(); return true })

/* ------------------------------------------------------------------ */
/* Auto-AFK                                                            */
/* ------------------------------------------------------------------ */
ipcMain.handle('afk:start', (e, opts) => { startAfk(opts || {}, s => push('afk:update', s)); return true })
ipcMain.handle('afk:stop', () => { stopAfk(); return true })

const { app, BrowserWindow, ipcMain, Tray, Menu, shell } = require('electron')
const path = require('path')
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
  startVrcWorld(w => {
    push('vrc:world', w)
    setVrcContext({ worldName: w.inWorld ? w.worldName : '', joinUrl: w.joinUrl, worldUrl: w.worldUrl, profileUrl: w.profileUrl })
    pawprints.setWorld(w.inWorld ? w.worldName : '')
  })
  setInterval(() => pawprints.tickCommit(), 60000) // persist ongoing world time
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  stopComponentStats(); stopNetworkStats(); stopPulsoid(); stopHyperate(); stopWindowActivity()
  disconnectTikTok(); stopTwitch(); stopKick(); stopDiscord(); stopVrBattery(); stopVrcWorld(); stopAfk()
  stopWeather(); stopVrcStatusPoll(); stopBot(); pawprints.tickCommit()
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
  const r = await vrchatApi.fetchUser()
  if (r.ok && r.user) {
    push('vrchat:account', { ok: true, displayName: r.user.displayName, status: r.user.status, statusDescription: r.user.statusDescription })
    setVrcContext({ vrcStatus: vrchatApi.mapStatus(r.user.status) })
  } else {
    push('vrchat:account', { ok: false, needs2fa: r.needs2fa, error: r.error })
  }
}
function startVrcStatusPoll () { stopVrcStatusPoll(); applyVrcStatus(); vrcStatusTimer = setInterval(applyVrcStatus, 90000) }
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
ipcMain.handle('vrchat:boop', (e, { id, emojiId } = {}) => vrchatApi.sendBoop(id, emojiId))
ipcMain.handle('vrchat:myAvatars', () => vrchatApi.getMyAvatars())
ipcMain.handle('pawprints:list', () => pawprints.list())
ipcMain.handle('pawprints:clear', () => { pawprints.clear(); return true })
ipcMain.handle('app:launchVRChat', () => { shell.openExternal('steam://rungameid/438100'); return true })

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

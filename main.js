const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron')
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
const { startWindowActivity, stopWindowActivity } = require('./modules/activity/windowActivity')
const { connectTikTok, disconnectTikTok, startTikTokFollowers, stopTikTokFollowers } = require('./modules/live/tiktokModule')
const { startTwitch, stopTwitch } = require('./modules/live/twitchModule')
const { startKick, stopKick } = require('./modules/live/kickModule')
const { getTikTokTtsAudio, TIKTOK_VOICES } = require('./modules/live/tiktokTts')
const { intelliRewrite, AI_PROVIDERS } = require('./modules/ai/intelliChat')
const { loginTwitch, TWITCH_REDIRECT } = require('./modules/integrations/twitchOauth')
const { startDiscord, stopDiscord, updateActivity } = require('./modules/integrations/discord')
const { startVrBattery, stopVrBattery } = require('./modules/vr/vrBattery')

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
    { label: 'Show NekoSuneOSC', click: () => mainWindow.show() },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setToolTip('NekoSuneOSC')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => mainWindow.show())
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#0b0b14',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    }
  })

  mainWindow.loadFile('index.html')

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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  stopComponentStats(); stopNetworkStats(); stopPulsoid(); stopWindowActivity()
  disconnectTikTok(); stopTwitch(); stopKick(); stopDiscord(); stopVrBattery()
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
/* Heart rate (Pulsoid)                                                */
/* ------------------------------------------------------------------ */
ipcMain.handle('hr:start', (e, token) => {
  startPulsoid(token, s => push('hr:update', s))
  return true
})
ipcMain.handle('hr:stop', () => { stopPulsoid(); return true })

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
  return startDiscord({ ...(cfg || {}), oscPort }, s => push('discord:update', s))
})
ipcMain.handle('discord:stop', async () => { await stopDiscord(); return true })
ipcMain.handle('discord:activity', (e, activity) => { updateActivity(activity); return true })

/* ------------------------------------------------------------------ */
/* VR gear battery                                                     */
/* ------------------------------------------------------------------ */
ipcMain.handle('vr:start', () => {
  startVrBattery(s => push('vr:update', s))
  return true
})
ipcMain.handle('vr:stop', () => { stopVrBattery(); return true })

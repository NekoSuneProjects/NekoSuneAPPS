// updater/main.js
// Standalone update helper, packaged separately (updater.exe on Windows,
// its own binary on Mac/Linux) so it lives outside the main app's own files
// - it has to, since it's the thing replacing them. Spawned by the main app
// right before it quits (see modules/integrations/maintenance/updater.js),
// waits for that process to fully exit, downloads the new release asset
// with visible progress in its own window, installs it (msiexec on
// Windows, an .app bundle swap on Mac, an in-place file replace for a
// Linux AppImage), then relaunches the app.
//
// Only the Windows path (msiexec) has been run against a real install in
// this project's dev environment. The Mac/Linux paths are implemented from
// documented, standard platform behavior but have NOT been verified against
// a real machine of either OS - flagged honestly rather than claimed tested.

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const https = require('https')
const { spawn, execFile } = require('child_process')

function parseArgs (argv) {
  const out = {}
  for (const arg of argv) {
    const m = arg.match(/^--([a-zA-Z]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

// electron's own argv[0] is the exe path when packaged; --foo=bar args follow.
const args = parseArgs(process.argv.slice(app.isPackaged ? 1 : 2))
const { url, exe: exePath, name: fileName = 'NekoSuneAPPS-Update.msi', version = '', pid } = args

let mainWindow = null

function send (channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function waitForPidExit (targetPid, timeoutMs = 30000) {
  if (!targetPid) return Promise.resolve()
  const pidNum = parseInt(targetPid, 10)
  // pid 0 has special meaning to process.kill (the current process group,
  // which never "exits" while we're alive) - and isn't a real caller PID
  // anyway, so treat it the same as "nothing to wait for".
  if (!Number.isFinite(pidNum) || pidNum <= 0) return Promise.resolve()
  const start = Date.now()
  return new Promise(resolve => {
    const check = () => {
      let alive = true
      try { process.kill(pidNum, 0) } catch (_) { alive = false }
      if (!alive || Date.now() - start > timeoutMs) return resolve()
      setTimeout(check, 300)
    }
    check()
  })
}

function download (fromUrl, toPath, onProgress) {
  return new Promise((resolve, reject) => {
    const request = (u, redirectsLeft) => {
      https.get(u, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects'))
          res.resume()
          return request(res.headers.location, redirectsLeft - 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`))
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const writer = fs.createWriteStream(toPath)
        res.on('data', chunk => { received += chunk.length; onProgress({ received, total }) })
        res.pipe(writer)
        writer.on('finish', () => writer.close(resolve))
        writer.on('error', reject)
        res.on('error', reject)
      }).on('error', reject)
    }
    request(fromUrl, 5)
  })
}

function runFile (cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    execFile(cmd, cmdArgs, err => { if (err) reject(err); else resolve() })
  })
}

// Walks up from a Mac executable path (.../NekoSuneAPPS.app/Contents/MacOS/
// NekoSuneAPPS) to find the enclosing .app bundle directory.
function findAppBundle (fromPath) {
  let dir = path.dirname(fromPath)
  while (dir && dir !== path.dirname(dir)) {
    if (dir.toLowerCase().endsWith('.app')) return dir
    dir = path.dirname(dir)
  }
  return null
}

// Installs the downloaded release asset in place, per platform, and
// reports back whether it's safe to auto-relaunch the app afterward.
// Windows is the only path exercised against a real install so far (see
// file header).
async function applyInstaller (downloadedPath, targetExePath) {
  if (process.platform === 'win32') {
    await runFile('msiexec.exe', ['/i', downloadedPath, '/passive', '/norestart'])
    return { relaunch: true }
  }

  if (process.platform === 'darwin') {
    // Release ships a .zip of the built NekoSuneAPPS.app - extract with
    // `ditto` (macOS built-in, preserves resource forks/permissions
    // correctly unlike a generic unzip) and swap it in for the existing
    // bundle.
    const appBundle = findAppBundle(targetExePath)
    if (!appBundle) throw new Error('Could not locate the installed .app bundle to replace')
    const extractDir = path.join(os.tmpdir(), `nekosune-update-${Date.now()}`)
    fs.mkdirSync(extractDir, { recursive: true })
    await runFile('ditto', ['-x', '-k', downloadedPath, extractDir])
    const extracted = fs.readdirSync(extractDir).find(f => f.toLowerCase().endsWith('.app'))
    if (!extracted) throw new Error('Downloaded update did not contain an .app bundle')
    await runFile('rm', ['-rf', appBundle])
    await runFile('mv', [path.join(extractDir, extracted), appBundle])
    return { relaunch: true }
  }

  if (process.platform === 'linux') {
    // AppImage self-updates by just replacing the file in place - no
    // installer, no root needed.
    if (/\.appimage$/i.test(downloadedPath)) {
      fs.copyFileSync(downloadedPath, targetExePath)
      fs.chmodSync(targetExePath, 0o755)
      return { relaunch: true }
    }
    // .deb needs root, which this helper can't safely do unattended - hand
    // it to the desktop's own package-install UI instead of failing, and
    // don't try to auto-relaunch since installation isn't complete yet.
    await runFile('xdg-open', [downloadedPath])
    return { relaunch: false, message: 'Finish the install in the window that just opened, then start NekoSuneAPPS again.' }
  }

  throw new Error(`Unsupported platform: ${process.platform}`)
}

async function run () {
  if (!url || !exePath) {
    send('status', { phase: 'error', message: 'Missing required update parameters.' })
    setTimeout(() => app.quit(), 4000)
    return
  }

  await waitForPidExit(pid)
  // Small grace period for file handles to fully release even after exit.
  await new Promise(resolve => setTimeout(resolve, 500))

  // The download's own destination just needs to be SOME writable folder -
  // it doesn't need to be inside the install location (unlike the actual
  // install step below). Falls back to temp if the app's own folder needs
  // elevation to write to (e.g. a per-machine Windows install).
  let destDir = path.dirname(exePath)
  try {
    fs.accessSync(destDir, fs.constants.W_OK)
  } catch (_) {
    destDir = app.getPath('temp')
  }
  const downloadPath = path.join(destDir, fileName)

  try {
    send('status', { phase: 'downloading', version })
    await download(url, downloadPath, progress => send('progress', progress))

    send('status', { phase: 'installing', version })
    const result = await applyInstaller(downloadPath, exePath)

    try { fs.unlinkSync(downloadPath) } catch (_) {}

    send('status', { phase: 'done', version, message: result.message })
    await new Promise(resolve => setTimeout(resolve, result.relaunch ? 1200 : 4000))

    if (result.relaunch && fs.existsSync(exePath)) {
      spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref()
    }
    app.quit()
  } catch (err) {
    send('status', { phase: 'error', message: err.message })
  }
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 280,
    backgroundColor: '#0b0b14',
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'NekoSuneAPPS Updater',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  })
  mainWindow.setMenuBarVisibility(false)
  mainWindow.loadFile('index.html')
  mainWindow.webContents.once('did-finish-load', () => {
    send('status', { phase: 'starting', version })
    run()
  })
})

app.on('window-all-closed', () => app.quit())
ipcMain.handle('updater:retryQuit', () => app.quit())

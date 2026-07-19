// modules/vrchat/launcher/quickLaunch.js
// VRChat Quick Launch — spawn multiple simultaneous VRChat game processes,
// each with its own local "profile" (VRChat's `--profile=N` CLI flag, real
// but undocumented, gives each index its own local settings/login state, so
// N processes can each be signed into a different account at once) and its
// own per-profile launch options. MAIN process, Windows-only: the registry
// key and start_protected_game.exe layout below are Windows/Steam specifics
// and multi-account simultaneous launching isn't a workflow VRChat's other
// platforms support the same way.

const { exec, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

// The "vrchat" URI protocol handler is registered by VRChat's own installer
// regardless of how it was installed (Steam, itch, standalone) and points
// straight at the install folder - reading it is far simpler and more
// reliable than hunting through Steam's libraryfolders.vdf across every
// possible library drive. See modules/vrchat/tools/crashGuard.js for the
// same registry key read the other direction (protocol launch/rejoin).
function queryProtocolHandlerCommand () {
  return new Promise(resolve => {
    exec('reg query "HKCR\\vrchat\\shell\\open\\command" /ve', (err, stdout) => {
      if (err) return resolve(null)
      resolve(stdout)
    })
  })
}

// Pulls the quoted exe path out of a `reg query /ve` result, which looks
// like:  (Default)    REG_SZ    "C:\...\VRChat\launch.exe" "%1"
function parseRegExePath (stdout) {
  const m = /REG_SZ\s+"([^"]+)"/i.exec(stdout || '')
  return m ? m[1] : null
}

// Auto-detects the actual game binary to launch. The registered protocol
// handler sometimes points at a small "launch.exe" wrapper rather than the
// real game binary, so prefer start_protected_game.exe alongside it (same
// exe Steam itself invokes) and only fall back to the registered exe as-is.
async function detectExePath () {
  if (process.platform !== 'win32') return null
  const registered = parseRegExePath(await queryProtocolHandlerCommand())
  if (!registered) return null
  const dir = path.dirname(registered)
  const candidate = path.join(dir, 'start_protected_game.exe')
  if (fs.existsSync(candidate)) return candidate
  if (fs.existsSync(registered)) return registered
  return null
}

// Builds the argv for one profile's launch. Everything here is pushed as a
// discrete array entry (never shell-concatenated) so spawn (shell:false by
// default) can never interpret free-text custom params as shell syntax.
function buildArgs (profile, instanceUri) {
  const args = [`--profile=${Number(profile.id) || 0}`]
  if (!profile.vr) args.push('--no-vr')
  if (profile.debugGui) args.push('--enable-debug-gui')
  if (profile.sdkLog) args.push('--enable-sdk-log-levels')
  if (profile.udonLog) args.push('--enable-udon-debug-logging')
  const fps = parseInt(profile.maxFps, 10)
  if (Number.isFinite(fps) && fps > 0) args.push(`--fps=${fps}`)
  if (profile.customArgs) {
    String(profile.customArgs).split(/\s+/).filter(Boolean).forEach(tok => args.push(tok))
  }
  if (instanceUri) args.push(instanceUri)
  return args
}

function launch (exePath, profile, instanceUri) {
  if (!exePath || !fs.existsSync(exePath)) {
    throw new Error('VRChat executable not found — set the path in Quick Launch first.')
  }
  const args = buildArgs(profile, instanceUri)
  const child = spawn(exePath, args, { detached: true, stdio: 'ignore', cwd: path.dirname(exePath) })
  child.unref()
  return { pid: child.pid, args }
}

// Launches each selected profile in turn with a short stagger - starting
// several game clients in the same instant thrashes disk/GPU init far worse
// than a couple of seconds' delay between them costs in wall-clock time.
async function launchAll (exePath, profiles, resolveInstanceUri) {
  const results = []
  for (const profile of profiles) {
    try {
      const uri = typeof resolveInstanceUri === 'function' ? await resolveInstanceUri(profile) : resolveInstanceUri
      const r = launch(exePath, profile, uri)
      results.push({ id: profile.id, ok: true, ...r })
    } catch (err) {
      results.push({ id: profile.id, ok: false, error: err.message })
    }
    if (profile !== profiles[profiles.length - 1]) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
  return results
}

module.exports = { detectExePath, buildArgs, launch, launchAll }

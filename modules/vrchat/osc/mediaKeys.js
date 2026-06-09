// modules/vrchat/osc/mediaKeys.js
// SpotiOSC backend: sends global Windows media keys so VRChat OSC can control
// Spotify (and any media app that listens to media keys) — play/pause, next,
// previous, stop. No extra native dependency: we invoke keybd_event via a tiny
// PowerShell P/Invoke. Runs in the MAIN process (Windows only).

const { execFile } = require('child_process')

// Virtual-key codes for the media keys.
const VK = {
  playpause: 0xB3,
  next: 0xB0,
  previous: 0xB1,
  stop: 0xB2,
  volumeup: 0xAF,
  volumedown: 0xAE,
  mute: 0xAD
}

// Press + release the given media key. Returns a promise.
function pressMediaKey (action) {
  const vk = VK[String(action || '').toLowerCase()]
  if (!vk) return Promise.reject(new Error('Unknown media key: ' + action))
  if (process.platform !== 'win32') return Promise.reject(new Error('Media keys are Windows-only'))
  const hex = '0x' + vk.toString(16)
  const ps = [
    "Add-Type -Name NkMk -Namespace Nk -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte b, byte s, uint f, System.UIntPtr e);';",
    `[Nk.NkMk]::keybd_event(${hex},0,0,[System.UIntPtr]::Zero);`, // key down
    `[Nk.NkMk]::keybd_event(${hex},0,2,[System.UIntPtr]::Zero);` // key up (KEYEVENTF_KEYUP=2)
  ].join(' ')
  return new Promise((resolve, reject) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], err => {
      err ? reject(err) : resolve(true)
    })
  })
}

module.exports = { pressMediaKey }

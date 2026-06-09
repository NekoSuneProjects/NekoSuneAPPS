// modules/integrations/soundpadModule.js
// Controls Leppsoft Soundpad via its Remote Control named pipe
// (\\.\pipe\sp_remote_control). Soundpad must be running with remote control
// enabled. Each command opens the pipe, sends the request, reads one reply.
// Ported from MagicChatbox's Soundpad integration. Runs in the MAIN process.

const net = require('net')

const PIPE = '\\\\.\\pipe\\sp_remote_control'

// Send a single Soundpad remote command (e.g. "DoPlaySound(1)") and resolve its
// reply text. Rejects if Soundpad isn't running / pipe unavailable.
function command (cmd) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PIPE)
    let data = ''
    let done = false
    const finish = (err, val) => {
      if (done) return
      done = true
      try { sock.destroy() } catch (_) {}
      err ? reject(err) : resolve(val)
    }
    sock.setTimeout(3000)
    sock.on('connect', () => sock.write(cmd))
    sock.on('data', chunk => { data += chunk.toString('utf8'); finish(null, data.trim()) })
    sock.on('timeout', () => finish(null, data.trim())) // some commands send no reply
    sock.on('error', err => finish(new Error('Soundpad not running? ' + err.message)))
    sock.on('close', () => finish(null, data.trim()))
  })
}

const playSound = index => command(`DoPlaySound(${parseInt(index, 10) || 1})`)
const stopSound = () => command('DoStopSound()')
const nextSound = () => command('DoPlayNextSound()')
const previousSound = () => command('DoPlayPreviousSound()')
const randomSound = () => command('DoPlayRandomSound()')
const togglePause = () => command('DoTogglePause()')

// Returns [{ index, title }] parsed from Soundpad's GetSoundlist() XML.
async function getSoundList () {
  const xml = await command('GetSoundlist()')
  const list = []
  const re = /<Sound\b[^>]*\bindex="(\d+)"[^>]*\btitle="([^"]*)"/g
  let m
  while ((m = re.exec(xml)) !== null) list.push({ index: Number(m[1]), title: m[2] })
  return list
}

async function isAvailable () {
  try { await command('IsAlive()'); return true } catch (_) { return false }
}

module.exports = { command, playSound, stopSound, nextSound, previousSound, randomSound, togglePause, getSoundList, isAvailable }

// updater/renderer.js
const $ = id => document.getElementById(id)

function mb (bytes) {
  return (bytes / 1e6).toFixed(1)
}

window.updaterAPI.onProgress(({ received, total }) => {
  const pct = total ? Math.min(100, Math.round((received / total) * 100)) : 0
  const bar = $('bar')
  bar.classList.remove('indeterminate')
  bar.style.width = `${pct}%`
  $('detail').textContent = total ? `${mb(received)} MB / ${mb(total)} MB` : `${mb(received)} MB`
})

window.updaterAPI.onStatus(({ phase, version, message: statusMessage }) => {
  const bar = $('bar')
  const sub = $('subtitle')
  const status = $('status')
  const logo = $('logo')

  if (phase === 'starting') {
    sub.textContent = version ? `Getting ready to update to v${version}…` : 'Getting ready to update…'
    status.textContent = 'Starting…'
  } else if (phase === 'downloading') {
    sub.textContent = version ? `Downloading v${version}…` : 'Downloading update…'
    status.textContent = 'Downloading'
  } else if (phase === 'installing') {
    sub.textContent = 'Installing…'
    status.textContent = 'Installing — this window will close automatically when done'
    bar.classList.add('indeterminate')
    logo.classList.add('spin')
    $('detail').textContent = ''
  } else if (phase === 'done') {
    sub.textContent = 'Done!'
    status.textContent = statusMessage || 'Reopening NekoSuneAPPS…'
    bar.classList.remove('indeterminate')
    bar.style.width = '100%'
    logo.classList.remove('spin')
    document.body.classList.add('done')
  } else if (phase === 'error') {
    sub.textContent = 'Update failed'
    status.textContent = statusMessage || 'Something went wrong.'
    status.classList.add('error')
    bar.classList.remove('indeterminate')
    logo.classList.remove('spin')
  }
})

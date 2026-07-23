// updater/renderer.js
const $ = id => document.getElementById(id)

function mb (bytes) { return (bytes / 1e6).toFixed(1) }

// ── Step list helpers ─────────────────────────────────────────────────────────

function setStepState (id, state, label) {
  const el = $(`step-${id}`)
  if (!el) return
  el.dataset.state = state
  if (label) el.querySelector('.step-lbl').textContent = label
}

function stepDone   (id, label) { setStepState(id, 'done', label) }
function stepActive (id, label) { setStepState(id, 'active', label) }
function stepError  (id, label) { setStepState(id, 'error', label) }

// Mark the first currently-active step as errored (called on phase:error).
function markActiveStepError () {
  for (const id of ['wait', 'download', 'uninstall', 'install', 'relaunch']) {
    const el = $(`step-${id}`)
    if (el && el.dataset.state === 'active') { el.dataset.state = 'error'; return }
  }
  // If nothing was active, mark the last non-pending step
  for (const id of ['relaunch', 'install', 'uninstall', 'download', 'wait']) {
    const el = $(`step-${id}`)
    if (el && el.dataset.state !== 'pending') { el.dataset.state = 'error'; return }
  }
}

// ── Progress bar ──────────────────────────────────────────────────────────────

window.updaterAPI.onProgress(({ received, total }) => {
  const pct = total ? Math.min(100, Math.round((received / total) * 100)) : 0
  const bar = $('bar')
  bar.classList.remove('indeterminate')
  bar.style.width = `${pct}%`
  $('detail').textContent = total
    ? `${mb(received)} MB / ${mb(total)} MB`
    : `${mb(received)} MB downloaded`
})

// ── Status handler ────────────────────────────────────────────────────────────

let lastDownloadPath = null

window.updaterAPI.onStatus(({ phase, version, message: statusMsg, canRetry, downloadPath, step, label }) => {
  const bar      = $('bar')
  const sub      = $('subtitle')
  const status   = $('status')
  const logo     = $('logo')
  const actions  = $('errorActions')

  if (phase !== 'error') {
    actions.classList.remove('show')
    status.classList.remove('error-txt')
    status.textContent = ''
  }

  if (phase === 'starting') {
    sub.textContent = version ? `Getting ready to update to v${version}…` : 'Getting ready to update…'
    stepActive('wait')

  } else if (phase === 'downloading') {
    sub.textContent = version ? `Downloading v${version}…` : 'Downloading update…'
    stepDone('wait')
    stepActive('download')

  } else if (phase === 'installing') {
    // The download is done — bar stays indeterminate until sub-steps report in
    stepDone('download')
    bar.classList.add('indeterminate')
    logo.classList.add('spin')
    $('detail').textContent = ''

  } else if (phase === 'step') {
    // Granular install sub-steps sent by applyInstaller
    if (step === 'uninstall') {
      sub.textContent = label || 'Removing old version…'
      stepActive('uninstall', label)
    } else if (step === 'install') {
      sub.textContent = label || 'Installing new version…'
      stepDone('uninstall')
      stepActive('install', label)
    }

  } else if (phase === 'done') {
    sub.textContent = statusMsg || 'Done!'
    bar.classList.remove('indeterminate')
    bar.style.width = '100%'
    logo.classList.remove('spin')
    document.body.classList.add('done')
    // Complete all remaining steps
    for (const id of ['wait', 'download', 'uninstall', 'install', 'relaunch']) {
      const el = $(`step-${id}`)
      if (el && el.dataset.state !== 'error') el.dataset.state = 'done'
    }

  } else if (phase === 'error') {
    sub.textContent = 'Update failed'
    status.textContent = statusMsg || 'Something went wrong.'
    status.classList.add('error-txt')
    bar.classList.remove('indeterminate')
    logo.classList.remove('spin')
    markActiveStepError()
    lastDownloadPath = downloadPath || null
    $('retryBtn').style.display      = canRetry ? '' : 'none'
    $('openFolderBtn').style.display = lastDownloadPath ? '' : 'none'
    if (canRetry || lastDownloadPath) actions.classList.add('show')
  }
})

// ── Action buttons ────────────────────────────────────────────────────────────

$('retryBtn').addEventListener('click', () => {
  // Reset errored step back to active so the user sees it re-trying
  for (const id of ['wait', 'download', 'uninstall', 'install', 'relaunch']) {
    const el = $(`step-${id}`)
    if (el && el.dataset.state === 'error') { el.dataset.state = 'active'; break }
  }
  $('errorActions').classList.remove('show')
  $('status').classList.remove('error-txt')
  $('status').textContent = ''
  window.updaterAPI.retryInstall()
})

$('openFolderBtn').addEventListener('click', () => {
  if (lastDownloadPath) window.updaterAPI.openDownloadFolder(lastDownloadPath)
})

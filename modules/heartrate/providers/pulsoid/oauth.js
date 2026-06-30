// Pulsoid OAuth Device Authorization flow. This is Pulsoid's recommended flow
// for desktop apps and does not need a redirect URI or client secret.

const https = require('https')
const config = require('./pulsoid.config.json')

const DEVICE_AUTH_URL = new URL('https://pulsoid.net/oauth2/device_authorization')
const TOKEN_URL = new URL('https://pulsoid.net/oauth2/token')
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'

function validateConfig () {
  if (!/^[0-9a-f-]{36}$/i.test(String(config.clientId || ''))) {
    throw new Error('Pulsoid clientId is missing or invalid in providers/pulsoid/pulsoid.config.json')
  }
  if (!Array.isArray(config.scopes) || !config.scopes.length) {
    throw new Error('Pulsoid scopes are missing in providers/pulsoid/pulsoid.config.json')
  }
}

function postForm (url, fields) {
  const body = new URLSearchParams(fields).toString()
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 10000
    }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        let data = {}
        try { data = JSON.parse(raw) } catch (_) { data = { error_description: raw || `HTTP ${res.statusCode}` } }
        resolve({ status: res.statusCode, data })
      })
    })
    req.on('timeout', () => req.destroy(new Error('Pulsoid authorization timed out')))
    req.on('error', reject)
    req.end(body)
  })
}

function wait (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function beginDeviceAuthorization () {
  validateConfig()
  const scopes = [...config.scopes]
  const response = await postForm(DEVICE_AUTH_URL, { client_id: config.clientId, scope: scopes.join(',') })
  const data = response.data || {}
  if (response.status < 200 || response.status >= 300 || !data.device_code) {
    throw new Error(data.error_description || data.error || `Pulsoid device authorization returned HTTP ${response.status}`)
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri_complete || data.verification_uri,
    expiresIn: Math.max(1, Number(data.expires_in) || 600),
    interval: Math.max(1, Number(data.interval) || 3),
    authorizedScopes: scopes
  }
}

async function waitForDeviceToken (session) {
  const deadline = Date.now() + session.expiresIn * 1000
  while (Date.now() < deadline) {
    await wait(session.interval * 1000)
    const response = await postForm(TOKEN_URL, {
      grant_type: DEVICE_GRANT,
      device_code: session.deviceCode,
      client_id: config.clientId
    })
    const data = response.data || {}
    if (response.status >= 200 && response.status < 300 && data.access_token) {
      return {
        accessToken: data.access_token,
        tokenType: data.token_type || 'bearer',
        expiresIn: data.expires_in,
        authorizedScopes: session.authorizedScopes
      }
    }
    if (data.error === 'authorization_pending') continue
    throw new Error(data.error_description || data.error || `Pulsoid token request returned HTTP ${response.status}`)
  }
  throw new Error('Pulsoid authorization expired before it was approved')
}

function publicConfig () {
  validateConfig()
  return { clientId: config.clientId, scopes: [...config.scopes] }
}

module.exports = { beginDeviceAuthorization, waitForDeviceToken, publicConfig }

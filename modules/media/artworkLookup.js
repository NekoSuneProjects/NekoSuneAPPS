const https = require('https')

const cache = new Map()
const cacheTtlMs = 30 * 60 * 1000
const requestTimeoutMs = 3500

function normalizeKeyPart (value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function getCacheKey (media) {
  return [media.artist, media.title, media.album]
    .map(normalizeKeyPart)
    .join('|')
}

function isCloseMatch (candidate, media) {
  const candidateTitle = normalizeKeyPart(candidate.title)
  const candidateArtist = normalizeKeyPart(candidate.artist)
  const title = normalizeKeyPart(media.title)
  const artist = normalizeKeyPart(media.artist)

  if (!title || !artist || !candidateTitle || !candidateArtist) return false

  return (
    candidateTitle.includes(title) ||
    title.includes(candidateTitle)
  ) && (
    candidateArtist.includes(artist) ||
    artist.includes(candidateArtist)
  )
}

function getJson (url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'OSCAudiolink/1.0'
      }
    }, response => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume()
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }

      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => {
        body += chunk
      })
      response.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (error) {
          reject(error)
        }
      })
    })

    request.setTimeout(requestTimeoutMs, () => {
      request.destroy(new Error('Artwork lookup timed out'))
    })
    request.on('error', reject)
  })
}

function getBestItunesArtworkUrl (result) {
  const image = result.artworkUrl100 || result.artworkUrl60 || result.artworkUrl30 || ''
  return image.replace(/\d+x\d+bb\.(jpg|png)$/i, '600x600bb.$1')
}

async function lookupItunesArtwork (media) {
  const term = [media.artist, media.title, media.album].filter(Boolean).join(' ')
  if (!term) return null

  const url = `https://itunes.apple.com/search?${new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: '10'
  }).toString()}`

  const data = await getJson(url)
  const result = (data.results || []).find(item => isCloseMatch({
    title: item.trackName,
    artist: item.artistName
  }, media)) || data.results?.[0]

  const image = result ? getBestItunesArtworkUrl(result) : ''
  if (!image) return null

  return {
    image,
    source: 'iTunes Search',
    album: result.collectionName || ''
  }
}

async function lookupDeezerArtwork (media) {
  const queryParts = []
  if (media.artist) queryParts.push(`artist:"${media.artist}"`)
  if (media.title) queryParts.push(`track:"${media.title}"`)
  if (media.album) queryParts.push(`album:"${media.album}"`)
  const query = queryParts.length > 0 ? queryParts.join(' ') : [media.artist, media.title].filter(Boolean).join(' ')
  if (!query) return null

  const url = `https://api.deezer.com/search/track?${new URLSearchParams({
    q: query,
    limit: '10'
  }).toString()}`

  const data = await getJson(url)
  const result = (data.data || []).find(item => isCloseMatch({
    title: item.title,
    artist: item.artist?.name
  }, media)) || data.data?.[0]

  const image = result?.album?.cover_xl || result?.album?.cover_big || result?.artist?.picture_xl || ''
  if (!image) return null

  return {
    image,
    source: 'Deezer Search',
    album: result.album?.title || ''
  }
}

async function lookupArtwork (media) {
  if (!media || !media.title || !media.artist) return null

  const cacheKey = getCacheKey(media)
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < cacheTtlMs) {
    return cached.result
  }

  const lookups = [
    lookupDeezerArtwork,
    lookupItunesArtwork
  ]

  for (const lookup of lookups) {
    try {
      const result = await lookup(media)
      if (result?.image) {
        cache.set(cacheKey, { cachedAt: Date.now(), result })
        return result
      }
    } catch {
      // Try the next provider.
    }
  }

  cache.set(cacheKey, { cachedAt: Date.now(), result: null })
  return null
}

module.exports = {
  lookupArtwork
}

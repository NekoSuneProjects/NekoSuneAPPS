const { execFile } = require('child_process')
const { lookupArtwork } = require('./artworkLookup')

const cacheTtlMs = 3000
const transientMissGraceMs = 12000
const transientMissLimit = 3
let cachedResult = null
let cachedAt = 0
let inFlight = null
let stableMedia = null
let stableMediaKey = ''
let stableMediaSeenAt = 0
let transientMisses = 0

const MEDIA_SESSION_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  '$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {',
  "  $_.Name -eq 'AsTask' -and",
  '  $_.GetParameters().Count -eq 1 -and',
  "  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'",
  '})[0]',
  'function Await-WinRt($operation, $resultType) {',
  '  $asTask = $asTaskGeneric.MakeGenericMethod($resultType)',
  '  $task = $asTask.Invoke($null, @($operation))',
  '  $task.Wait() | Out-Null',
  '  return $task.Result',
  '}',
  '[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null',
  '[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null',
  '[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null',
  '[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null',
  '$manager = Await-WinRt ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])',
  '$session = $manager.GetCurrentSession()',
  'foreach ($candidate in $manager.GetSessions()) {',
  '  $playback = $candidate.GetPlaybackInfo()',
  "  if ($playback.PlaybackStatus.ToString() -eq 'Playing') {",
  '    $session = $candidate',
  '    break',
  '  }',
  '}',
  'if ($null -eq $session) {',
  '  @{ found = $false } | ConvertTo-Json -Compress',
  '  exit 0',
  '}',
  '$props = Await-WinRt ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])',
  '$playback = $session.GetPlaybackInfo()',
  '$timeline = $session.GetTimelineProperties()',
  '$image = ""',
  '$imageMime = ""',
  'if ($null -ne $props.Thumbnail) {',
  '  try {',
  '    $stream = Await-WinRt ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])',
  '    if ($stream.Size -gt 0 -and $stream.Size -lt 5242880) {',
  '      $reader = [Windows.Storage.Streams.DataReader]::new($stream)',
  '      Await-WinRt ($reader.LoadAsync([uint32]$stream.Size)) ([uint32]) | Out-Null',
  '      $bytes = New-Object byte[] ([int]$stream.Size)',
  '      $reader.ReadBytes($bytes)',
  '      $imageMime = $stream.ContentType',
  '      if ([string]::IsNullOrWhiteSpace($imageMime)) { $imageMime = "image/jpeg" }',
  '      $image = "data:" + $imageMime + ";base64," + [Convert]::ToBase64String($bytes)',
  '      $reader.Dispose()',
  '    }',
  '    $stream.Dispose()',
  '  } catch {}',
  '}',
  '@{',
  '  found = $true',
  '  sourceAppId = $session.SourceAppUserModelId',
  '  status = $playback.PlaybackStatus.ToString()',
  '  title = $props.Title',
  '  artist = $props.Artist',
  '  album = $props.AlbumTitle',
  '  durationMs = [int64]([Math]::Max($timeline.EndTime.TotalMilliseconds - $timeline.StartTime.TotalMilliseconds, 0))',
  '  progressMs = [int64]([Math]::Max($timeline.Position.TotalMilliseconds - $timeline.StartTime.TotalMilliseconds, 0))',
  '  image = $image',
  '  imageMime = $imageMime',
  '  fetchedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()',
  '} | ConvertTo-Json -Compress'
].join('\n')

function normalizeSourceName (sourceAppId) {
  if (!sourceAppId) return ''

  const source = sourceAppId.toLowerCase()
  if (source.includes('spotify')) return 'Spotify'
  if (source.includes('itunes')) return 'iTunes'
  if (source.includes('apple')) return 'Apple Music'
  if (source.includes('vlc')) return 'VLC'
  if (source.includes('chrome')) return 'Chrome'
  if (source.includes('msedge')) return 'Edge'
  if (source.includes('firefox')) return 'Firefox'
  if (source.includes('wmplayer')) return 'Windows Media Player'

  return sourceAppId.replace(/\.exe$/i, '')
}

function normalizeKeyPart (value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function getMediaKey (media) {
  if (!media?.found || !media.title) return ''

  return [
    media.sourceAppId || media.source,
    media.artist,
    media.title,
    media.album
  ].map(normalizeKeyPart).join('|')
}

function cloneMedia (media, extra = {}) {
  return {
    ...media,
    ...extra
  }
}

function clearStableMedia () {
  stableMedia = null
  stableMediaKey = ''
  stableMediaSeenAt = 0
}

function getTransientCachedMedia (miss) {
  if (!stableMedia) return null

  const now = Date.now()
  const insideGrace = now - stableMediaSeenAt < transientMissGraceMs
  if (!insideGrace && transientMisses >= transientMissLimit) {
    return null
  }

  return cloneMedia(stableMedia, {
    cached: true,
    stale: true,
    cacheReason: miss?.error ? 'detector-error' : 'transient-miss',
    lastError: miss?.error || ''
  })
}

async function normalizeMedia (media) {
  const durationMs = Number(media.durationMs) || 0
  const progressMs = Math.max(0, Math.min(Number(media.progressMs) || 0, durationMs || Number.MAX_SAFE_INTEGER))
  const normalized = {
    found: Boolean(media.found),
    source: normalizeSourceName(media.sourceAppId),
    sourceAppId: media.sourceAppId || '',
    status: media.status || '',
    title: media.title || '',
    artist: media.artist || '',
    album: media.album || '',
    durationMs,
    progressMs,
    image: media.image || '',
    imageMime: media.imageMime || '',
    imageSource: media.image ? 'Windows media session' : '',
    fetchedAt: Number(media.fetchedAt) || Date.now()
  }

  const mediaKey = getMediaKey(normalized)
  const sameStableMedia = mediaKey && mediaKey === stableMediaKey

  if (sameStableMedia && stableMedia?.image && !normalized.image) {
    normalized.image = stableMedia.image
    normalized.imageMime = stableMedia.imageMime || normalized.imageMime
    normalized.imageSource = stableMedia.imageSource || normalized.imageSource
  }

  if (normalized.found && !normalized.image) {
    const artwork = await lookupArtwork(normalized)
    if (artwork?.image) {
      normalized.image = artwork.image
      normalized.imageSource = artwork.source
      if (!normalized.album && artwork.album) {
        normalized.album = artwork.album
      }
    }
  }

  return normalized
}

async function resolveNowPlayingResult (media) {
  const normalized = await normalizeMedia(media)
  const mediaKey = getMediaKey(normalized)

  if (!mediaKey) {
    if (normalized.found && normalized.status && normalized.status !== 'Playing') {
      transientMisses = 0
      clearStableMedia()
      return cloneMedia(normalized, { found: false })
    }

    transientMisses += 1
    const cachedMedia = getTransientCachedMedia(normalized)
    return cachedMedia || normalized
  }

  transientMisses = 0
  stableMediaKey = mediaKey
  stableMediaSeenAt = Date.now()
  stableMedia = cloneMedia(normalized, {
    cached: false,
    stale: false,
    cacheReason: ''
  })

  return stableMedia
}

function getNowPlaying () {
  if (process.platform !== 'win32') {
    return Promise.resolve({
      found: false,
      unavailable: true,
      error: 'Windows media sessions are only available on Windows.'
    })
  }

  const now = Date.now()
  if (cachedResult && now - cachedAt < cacheTtlMs) {
    return Promise.resolve(cachedResult)
  }

  if (inFlight) {
    return inFlight
  }

  inFlight = new Promise(resolve => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', MEDIA_SESSION_SCRIPT],
      {
        timeout: 5000,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
      },
      async (error, stdout) => {
        if (error) {
          cachedResult = await resolveNowPlayingResult({
            found: false,
            error: error.message
          })
          cachedAt = Date.now()
          inFlight = null
          resolve(cachedResult)
          return
        }

        try {
          cachedResult = await resolveNowPlayingResult(JSON.parse(stdout.trim() || '{}'))
        } catch (parseError) {
          cachedResult = await resolveNowPlayingResult({
            found: false,
            error: parseError.message
          })
        }

        cachedAt = Date.now()
        inFlight = null
        resolve(cachedResult)
      }
    )
  })

  return inFlight
}

module.exports = {
  getNowPlaying
}

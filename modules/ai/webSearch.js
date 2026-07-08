// modules/ai/webSearch.js
// Web search for the voice assistant, two selectable providers:
//   - searxng: a self-hosted SearXNG instance's JSON API (real web search
//     results; SearXNG must have `formats: [json]` enabled in settings.yml).
//   - duckduckgo: DuckDuckGo's public "Instant Answer" API. This is NOT a
//     full web search API - no API key needed, but it only returns an
//     abstract/infobox-style answer and related topics, and returns nothing
//     at all for a large fraction of ordinary queries. It's offered as a
//     no-setup fallback, not a like-for-like replacement for SearXNG.
// Runs in the MAIN process.

const axios = require('axios')

async function searchSearxng (query, endpoint) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '')
  if (!base) throw new Error('No SearXNG endpoint configured')

  const res = await axios.get(`${base}/search`, {
    params: { q: query, format: 'json' },
    timeout: 15000
  })

  const results = Array.isArray(res.data?.results) ? res.data.results : []
  return results.slice(0, 5).map(r => ({
    title: r.title || '',
    url: r.url || '',
    content: r.content || ''
  }))
}

async function searchDuckDuckGo (query) {
  const res = await axios.get('https://api.duckduckgo.com/', {
    params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
    timeout: 15000
  })

  const data = res.data || {}
  const results = []

  if (data.AbstractText) {
    results.push({ title: data.Heading || query, url: data.AbstractURL || '', content: data.AbstractText })
  }

  const flattenTopics = (topics) => {
    for (const t of topics || []) {
      if (results.length >= 5) return
      if (t.Text) results.push({ title: t.Text.split(' - ')[0] || '', url: t.FirstURL || '', content: t.Text })
      else if (Array.isArray(t.Topics)) flattenTopics(t.Topics)
    }
  }
  flattenTopics(data.RelatedTopics)

  return results.slice(0, 5)
}

async function searchWeb (query, opts = {}) {
  const q = String(query || '').trim()
  if (!q) return []

  // Back-compat: opts used to just be the SearXNG endpoint string.
  const { provider, endpoint } = typeof opts === 'string' ? { provider: 'searxng', endpoint: opts } : opts

  if (provider === 'duckduckgo') return searchDuckDuckGo(q)
  return searchSearxng(q, endpoint)
}

module.exports = { searchWeb }

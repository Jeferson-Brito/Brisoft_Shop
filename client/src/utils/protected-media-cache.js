import http from '@/api/http'
import { getMediaSource, getProtectedMediaPath, isLargeMedia } from '@/utils/media-message'

const MAX_CACHED_MEDIA = 500
const mediaCache = new Map()
const RETRY_DELAYS_MS = [0, 700, 1500, 3000]

function wait(ms) {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve()
}

function shouldRetry(error) {
  const status = Number(error?.response?.status || 0)
  return !status || [404, 408, 425, 429, 500, 502, 503, 504].includes(status)
}

async function requestMedia(apiPath) {
  let lastError
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    await wait(RETRY_DELAYS_MS[attempt])
    const separator = apiPath.includes('?') ? '&' : '?'
    const refreshedPath = `${apiPath}${separator}media_cache=3&attempt=${attempt + 1}`
    try {
      return await http.get(refreshedPath, {
        responseType: 'blob',
        timeout: 45000,
        headers: { 'Cache-Control': 'no-cache' }
      })
    } catch (error) {
      lastError = error
      if (!shouldRetry(error) || attempt === RETRY_DELAYS_MS.length - 1) throw error
    }
  }
  throw lastError
}

function trimCache() {
  if (mediaCache.size <= MAX_CACHED_MEDIA) return
  const entries = [...mediaCache.entries()].filter(([, entry]) => entry.settled).sort((a, b) => a[1].lastUsed - b[1].lastUsed)
  const excess = Math.min(entries.length, mediaCache.size - MAX_CACHED_MEDIA)
  // Não revoga a Blob URL aqui: ela pode continuar sendo exibida por uma
  // mensagem já renderizada. O navegador libera todas ao sair da aplicação.
  for (const [key, entry] of entries.slice(0, excess)) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl)
    mediaCache.delete(key)
  }
}

export async function loadProtectedMedia(source) {
  const apiPath = getProtectedMediaPath(source)
  if (!apiPath) throw new Error('Endereço de mídia protegido inválido.')

  // A mesma mídia pode estar salva como URL absoluta em mensagens antigas e
  // como caminho relativo nas novas. A chave normalizada evita novo download.
  const existing = mediaCache.get(apiPath)
  if (existing) {
    existing.lastUsed = Date.now()
    return existing.promise
  }

  const entry = { lastUsed: Date.now(), objectUrl: null, promise: null, settled: false }
  entry.promise = requestMedia(apiPath)
    .then(response => {
      entry.objectUrl = URL.createObjectURL(response.data)
      entry.settled = true
      trimCache()
      return entry.objectUrl
    })
    .catch(error => {
      mediaCache.delete(apiPath)
      throw error
    })
  mediaCache.set(apiPath, entry)
  trimCache()
  return entry.promise
}

export function clearProtectedMediaCache() {
  for (const entry of mediaCache.values()) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl)
  }
  mediaCache.clear()
}

export async function fetchMediaInfo(source) {
  const apiPath = getProtectedMediaPath(source)
  if (!apiPath) return null
  try {
    const res = await http.get(`${apiPath}/info`, { timeout: 10000 })
    return res.data?.success ? res.data : null
  } catch {
    return null
  }
}

export async function preloadTicketMedia(messages = [], concurrency = 3) {
  const sources = [...new Set(
    messages
      .filter(msg => !isLargeMedia(msg, getMediaSource(msg)))
      .map(getMediaSource)
      .filter(source => getProtectedMediaPath(source))
  )]
  let cursor = 0
  async function worker() {
    while (cursor < sources.length) {
      const source = sources[cursor++]
      await loadProtectedMedia(source).catch(() => null)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, worker))
  return sources.length
}

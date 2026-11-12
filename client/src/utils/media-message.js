export function getMediaSource(message = {}) {
  if (message.media_url) return message.media_url
  if (message.mediaUrl) return message.mediaUrl
  const match = String(message.text || '').match(/\|\|(\/(?:api\/)?media\/[^\s]+)/)
  return match?.[1] || null
}

export function getProtectedMediaPath(source, origin = '') {
  const raw = String(source || '').trim()
  if (!raw) return null
  try {
    const base = origin || (typeof window !== 'undefined' ? window.location.origin : 'https://brisoft.local')
    const url = new URL(raw, base)
    const match = url.pathname.match(/^\/(?:api\/)?media\/([a-zA-Z0-9._-]+)$/)
    if (!match) return null
    return `/media/${encodeURIComponent(match[1])}`
  } catch {
    return null
  }
}

export function cleanMediaDisplayText(value, hasMediaSource = false) {
  const text = String(value || '').replace(/\|\|\/(?:api\/)?media\/[^\s]+/g, '').trim()
  if (!hasMediaSource) return text
  const automaticMarker = /^(?:📷|🎙️|🎵|🎥|🖼️|📄)?\s*\[(?:Imagem|Mensagem de Voz|Áudio|Vídeo|Figurinha|Documento(?::[^\]]+)?|Mídia\/Arquivo)\]$/i
  return automaticMarker.test(text) ? '' : text
}

export function getDocumentDisplayName(message = {}, source = '') {
  const textMatch = String(message.text || '').match(/\[Documento:\s*([^\]]+)\]/i)
  if (textMatch?.[1]) return textMatch[1]
  const fileName = String(source || '').split('/').pop()?.split('?')[0]
  if (!fileName) return 'Baixar documento'
  try { return decodeURIComponent(fileName).replace(/^doc_\d+_/, '') } catch { return fileName }
}

export const LARGE_MEDIA_THRESHOLD_BYTES = 5 * 1024 * 1024

export function formatFileSize(bytes) {
  const size = Number(bytes) || 0
  if (size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)))
  const formatted = (size / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)
  return `${formatted} ${units[i]}`
}

export function isAudioMedia(message = {}, source = '') {
  if (message.type === 'audio') return true
  const s = String(source || message.media_url || message.mediaUrl || '').toLowerCase()
  return s.endsWith('.ogg') || s.endsWith('.mp3') || s.endsWith('.m4a') || s.endsWith('.wav')
}

export function isVisualMedia(message = {}, source = '') {
  if (isAudioMedia(message, source)) return false
  const t = String(message.type || '').toLowerCase()
  if (t === 'image' || t === 'video' || t === 'sticker') return true
  const s = String(source || message.media_url || message.mediaUrl || '').toLowerCase()
  return /\.(?:jpe?g|png|webp|mp4|webm|mov)$/i.test(s)
}

export function isLargeMedia(message = {}, source = '') {
  // Áudio não pode ter limite de MB
  if (isAudioMedia(message, source)) return false
  if (!isVisualMedia(message, source)) return false
  const size = Number(message.media_size ?? message.file_size ?? 0)
  return size > LARGE_MEDIA_THRESHOLD_BYTES
}

export function getMediaDownloadName(message = {}, source = '') {
  if (message.file_name) return message.file_name
  const raw = String(source || message.media_url || message.mediaUrl || '').split('/').pop()?.split('?')[0]
  if (!raw) return 'arquivo'
  try {
    return decodeURIComponent(raw).replace(/^(?:img|video|audio|doc|sticker)_\d+_[a-zA-Z0-9_-]+(?:\.|$)/, '') || raw
  } catch {
    return raw
  }
}

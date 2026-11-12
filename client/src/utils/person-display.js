const LOWERCASE_CONNECTORS = new Set(['da', 'das', 'de', 'do', 'dos', 'e'])

export function normalizePersonName(value) {
  const clean = String(value || '').trim().replace(/\s+/g, ' ')
  if (!clean) return ''
  const letters = clean.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '')
  if (!letters || letters !== letters.toLocaleUpperCase('pt-BR')) return clean
  return clean.split(' ').map((word, index) => {
    const lower = word.toLocaleLowerCase('pt-BR')
    if (index > 0 && LOWERCASE_CONNECTORS.has(lower)) return lower
    if (/^[A-Z]{1,3}\d+$/.test(word)) return word
    return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1)
  }).join(' ')
}

export function splitPersonLabel(value) {
  const clean = String(value || '').trim().replace(/\s+/g, ' ')
  const separator = clean.search(/\s[-–—]\s/)
  if (separator < 0) return { name: normalizePersonName(clean), role: '' }
  const match = clean.match(/\s[-–—]\s/)
  return {
    name: normalizePersonName(clean.slice(0, separator)),
    role: clean.slice(separator + match[0].length).trim()
  }
}

export function getInitials(name) {
  if (!name) return 'U'
  const parts = String(name).trim().split(/\s+/)
  if (!parts[0]) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}


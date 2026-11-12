let sharedContext = null

export function sharedAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  if (!sharedContext || sharedContext.state === 'closed') sharedContext = new AudioContextClass()
  if (sharedContext.state === 'suspended') sharedContext.resume().catch(() => {})
  return sharedContext
}

export function closeSharedAudioContext() {
  if (!sharedContext) return
  const current = sharedContext
  sharedContext = null
  current.close().catch(() => {})
}

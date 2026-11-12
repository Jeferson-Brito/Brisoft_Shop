function buildAudioPayload(fileBuffer, mimeType, voiceNote = false) {
  const normalizedMimeType = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const canSendAsVoiceNote = voiceNote && normalizedMimeType === 'audio/ogg';
  return {
    audio: fileBuffer,
    mimetype: canSendAsVoiceNote ? 'audio/ogg; codecs=opus' : (normalizedMimeType || 'audio/mpeg'),
    ptt: canSendAsVoiceNote
  };
}

module.exports = { buildAudioPayload };

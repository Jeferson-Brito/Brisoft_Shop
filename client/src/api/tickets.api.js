import http from './http'

export const ticketsApi = {
  list:        ()                    => http.get('/tickets'),
  get:         (ticketId)            => http.get(`/tickets/${ticketId}`),
  collaborators: (ticketId)          => http.get(`/tickets/${ticketId}/collaborators`),
  addCollaborator: (ticketId, userId) => http.post(`/tickets/${ticketId}/collaborators`, { userId }),
  removeCollaborator: (ticketId, userId) => http.delete(`/tickets/${ticketId}/collaborators/${userId}`),
  history:     ()                    => http.get('/tickets/history'),
  getClientHistory: (ticketId, params = {}) => http.get(`/tickets/${ticketId}/client-history`, { params }),
  assume:        (ticketId)                        => http.post('/tickets/assume',           { ticketId }),
  transfer:      (ticketId, transferData)          => http.post('/tickets/transfer',         { ticketId, ...transferData }),
  close:         (ticketId, payload = {})          => http.post('/tickets/close',            { ticketId, ...payload }),
  updateContact: (ticketId, contactData)           => http.put(`/tickets/${ticketId}/contact`, contactData),
  startConversation: (contactId, departmentId)     => http.post('/tickets/start-conversation', { contactId, departmentId }),
  sendMessage:   (ticketId, text, replyToMessageId = null) => http.post('/tickets/send-message', { ticketId, text, replyToMessageId }),
  editMessage:   (ticketId, messageId, text)       => http.patch(`/tickets/${ticketId}/messages/${messageId}`, { text }),
  deleteMessage: (ticketId, messageId)             => http.delete(`/tickets/${ticketId}/messages/${messageId}`),
  sendMedia:     (ticketId, file, metadata = {}, requestOptions = {}) => http.post(`/tickets/${ticketId}/media`, file, {
    timeout: 300000,
    onUploadProgress: requestOptions.onUploadProgress,
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(metadata.fileName || file?.name || 'arquivo'),
      'X-File-Type': metadata.mimeType || file?.type || 'application/octet-stream',
      'X-Media-Type': metadata.mediaType || '',
      'X-Voice-Note': metadata.voiceNote === true ? 'true' : 'false',
      'X-Media-Caption': encodeURIComponent(metadata.caption || '')
    }
  }),
  markAsRead:    (ticketId)                        => http.post('/tickets/read',             { ticketId }),
  kpis:          ()                                => http.get('/dashboard/kpis'),
  performance:   (params = {})                     => http.get('/performance', { params }),
  wallboard:     (params = {})                     => http.get('/wallboard', { params }),
  saveWallboardConfig: (departmentId, config)      => http.put('/wallboard/config', { departmentId, config })
}

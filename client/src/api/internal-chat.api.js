import http from './http'

export const internalChatApi = {
  listConversations: () => http.get('/internal-chat/conversations'),
  listTeamMembers: () => http.get('/internal-chat/members'),
  getMessages: (conversationId) => http.get(`/internal-chat/conversations/${conversationId}/messages`),
  sendMessage: (conversationId, payload) => http.post(`/internal-chat/conversations/${conversationId}/messages`, payload),
  sendMedia: (conversationId, file, metadata = {}) => http.post(
    `/internal-chat/conversations/${conversationId}/media`,
    file,
    {
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-file-name': encodeURIComponent(metadata.fileName || file.name || 'arquivo'),
        'x-file-type': file.type || 'application/octet-stream',
        'x-media-type': metadata.mediaType || 'document',
        'x-media-caption': encodeURIComponent(metadata.caption || ''),
        'x-reply-to-id': metadata.replyToId || ''
      }
    }
  ),
  startDirectChat: (targetUserId) => http.post(`/internal-chat/direct/${targetUserId}`),
  createChannel: (payload) => http.post('/internal-chat/channels', payload),
  updateChannel: (conversationId, payload) => http.put(`/internal-chat/channels/${conversationId}`, payload),
  deleteChannel: (conversationId) => http.delete(`/internal-chat/channels/${conversationId}`),
  leaveChannel: (conversationId) => http.post(`/internal-chat/channels/${conversationId}/leave`),
  toggleSubOwner: (conversationId, targetUserId) => http.post(`/internal-chat/channels/${conversationId}/sub-owner/${targetUserId}`),
  getConversationDetails: (conversationId) => http.get(`/internal-chat/conversations/${conversationId}/details`),
  markAsRead: (conversationId) => http.post(`/internal-chat/conversations/${conversationId}/read`),
  toggleReaction: (messageId, emoji) => http.post(`/internal-chat/messages/${messageId}/reactions`, { emoji }),
  togglePinMessage: (messageId) => http.post(`/internal-chat/messages/${messageId}/pin`),
  editMessage: (messageId, text) => http.put(`/internal-chat/messages/${messageId}`, { text }),
  deleteMessage: (messageId) => http.delete(`/internal-chat/messages/${messageId}`)
}


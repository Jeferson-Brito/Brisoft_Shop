import http from './http'

export const quickMessagesApi = {
  list: () => http.get('/quick-messages'),
  create: data => http.post('/quick-messages', data),
  update: (id, data) => http.put(`/quick-messages/${id}`, data),
  remove: id => http.delete(`/quick-messages/${id}`)
}

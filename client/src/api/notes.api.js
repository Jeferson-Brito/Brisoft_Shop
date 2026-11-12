import http from './http'

export const notesApi = {
  list: (userId = '') => http.get('/notes', { params: userId ? { user_id: userId } : {} }),
  save: (data) => http.post('/notes', data),
  remove: (id) => http.delete(`/notes/${id}`)
}

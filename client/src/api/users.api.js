import http from './http'

export const usersApi = {
  list:   ()           => http.get('/users'),
  create: (data)       => http.post('/users', data),
  update: (id, data)   => http.put(`/users/${id}`, data),
  remove: (id, version) => http.delete(`/users/${id}`, {data:{version}})
}
